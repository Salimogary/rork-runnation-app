import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

const CREATOR_REQUEST_TYPES = new Set(["start_club", "event_organizer"]);

function getAgeFromDob(value: string | null | undefined): number | null {
  const dob = value ? new Date(value) : null;
  if (!dob || Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age;
}

function buildCountryAliases(countries: any[] | null | undefined): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const country of countries ?? []) {
    const code = String(country.iso_alpha2 || "").trim().toLowerCase();
    const name = String(country.name || "").trim().toLowerCase();
    const canonical = code || name;
    if (!canonical) continue;
    if (code) aliases.set(code, canonical);
    if (name) aliases.set(name, canonical);
  }
  return aliases;
}

function normalizeCountry(value: string | null | undefined, aliases: Map<string, string>): string {
  const raw = String(value || "").trim().toLowerCase();
  return aliases.get(raw) ?? raw;
}

function assertClubAllowedForProfile(club: any, registration: any, countryAliases: Map<string, string>) {
  const age = getAgeFromDob(registration?.dob);
  const code = String(club?.special_club_code || "");
  if (code === "junior_runners" && !(age !== null && age >= 8 && age <= 15)) {
    throw new Error("Junior Runners is only available for ages 8 to 15.");
  }
  if (code === "golden_age_runners" && !(age !== null && age >= 60)) {
    throw new Error("Golden Age Runners is only available for runners aged 60 and above.");
  }
  if (code === "treadmill_runners" && registration?.does_indoor_workouts !== true) {
    throw new Error("Treadmill Runners is only available if you do indoor workouts.");
  }
  if (code === "para_runners" && registration?.has_disability !== true) {
    throw new Error("Para Runners is only available if you have indicated a disability.");
  }
  if (code === "smartfit_club" && !(registration?.has_smart_watch === true && registration?.has_general_health_goal === true)) {
    throw new Error("SmartFit Club is available when you use a smart watch and have selected General Health as a goal.");
  }
  if (!code && age !== null && age >= 8 && age <= 15) {
    throw new Error("Runners aged 8 to 15 can only join Junior Runners.");
  }
  if (!code && normalizeCountry(club?.country, countryAliases) !== normalizeCountry(registration?.country, countryAliases)) {
    throw new Error("Please choose a club from your profile country.");
  }
}

function isSpecialClub(club: any): boolean {
  return club?.is_special_club === true || Boolean(club?.special_club_code);
}

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      club: z.string().nullable(),
      clubId: z.string().uuid().nullable().optional(),
      newMember: z.enum(["Yes", "No"]),
      requestType: z.enum(["membership", "start_club", "event_organizer"]).default("membership"),
      proposedClubName: z.string().nullable().optional(),
      proposedCountry: z.string().nullable().optional(),
      proposedDescription: z.string().nullable().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    let selectedMembershipClub: any = null;

    if ((input.requestType === "membership" || !input.requestType) && input.clubId) {
      const [{ data: registration }, { data: selectedClub, error: clubError }, { data: userGoals }, { data: countries }] = await Promise.all([
        ctx.supabase.from("registrations").select("dob, country, has_disability, does_indoor_workouts, has_smart_watch").eq("registration_id", input.registrationId).maybeSingle(),
        ctx.supabase
          .from("clubs")
          .select("club_id, country, special_club_code, is_special_club")
          .eq("club_id", input.clubId)
          .maybeSingle(),
        ctx.supabase
          .from("user_goals")
          .select("goal")
          .eq("registration_id", input.registrationId),
        ctx.supabase.from("countries").select("iso_alpha2, name"),
      ]);
      if (clubError || !selectedClub) {
        throw new Error(clubError?.message || "Selected club was not found.");
      }
      assertClubAllowedForProfile(
        selectedClub,
        {
          ...registration,
          has_general_health_goal: (userGoals ?? []).some((row: any) =>
            String(row.goal || "").trim().toLowerCase().includes("health")
          ),
        },
        buildCountryAliases(countries)
      );
      selectedMembershipClub = selectedClub;
    }

    if (CREATOR_REQUEST_TYPES.has(input.requestType)) {
      const { data: existingRequest, error: existingRequestError } = await ctx.supabase
        .from("club_membership_request")
        .select("registration_id, request_type, status")
        .eq("registration_id", input.registrationId)
        .in("request_type", ["start_club", "event_organizer"])
        .in("status", ["pending", "approved"])
        .limit(1);

      if (existingRequestError) {
        throw new Error(existingRequestError.message || "Could not check existing creation requests.");
      }
      if ((existingRequest ?? []).length > 0) {
        throw new Error("You already have a club or event organizer request in progress. You can create another only after the current one is rejected or deleted.");
      }

      if (input.requestType === "event_organizer") {
        const { data: existingOrganizer, error: organizerError } = await ctx.supabase
          .from("event_organizers")
          .select("organizer_id")
          .eq("registration_id", input.registrationId)
          .eq("is_active", true)
          .limit(1);

        if (organizerError) {
          throw new Error(organizerError.message || "Could not check existing organizer profile.");
        }
        if ((existingOrganizer ?? []).length > 0) {
          throw new Error("You already have an active event organizer profile.");
        }
      }
    }

    const { error } = await ctx.supabase.from("club_membership_request").insert({
      registration_id: input.registrationId,
      club: input.club,
      club_id: input.clubId ?? null,
      new_member: input.newMember,
      request_type: input.requestType,
      status:
        input.requestType === "membership" && isSpecialClub(selectedMembershipClub)
          ? "approved"
          : "pending",
      proposed_club_name: input.proposedClubName?.trim() || null,
      proposed_country: input.proposedCountry?.trim() || null,
      proposed_description: input.proposedDescription?.trim() || null,
    });

    if (error) {
      throw new Error(error.message || "Failed to save club membership request");
    }

    return { success: true };
  });
