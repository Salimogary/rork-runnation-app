import { z } from "zod";
import { publicProcedure } from "../../../create-context";

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
      newMember: z.string().min(1),
      requestType: z.enum(["membership", "start_club", "event_organizer"]).default("membership"),
      proposedClubName: z.string().nullable().optional(),
      proposedCountry: z.string().nullable().optional(),
      proposedDescription: z.string().nullable().optional(),
      clubMemberships: z.array(z.object({
        club: z.string().min(1),
        clubId: z.string().uuid(),
      })).optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { data: existingRows, error: existingError } = await ctx.supabase
      .from("club_membership_request")
      .select("registration_id, request_type, status")
      .eq("registration_id", input.registrationId)
      .order("created_at", { ascending: true })
      .limit(1);

    if (existingError) {
      throw new Error(existingError.message || "Could not check existing club request.");
    }
    const existing = existingRows?.[0] ?? null;

    const membershipInputs = input.clubMemberships?.length
      ? input.clubMemberships
      : input.clubId && input.club
        ? [{ club: input.club, clubId: input.clubId }]
        : [];
    const selectedClubById = new Map<string, any>();

    if ((input.requestType === "membership" || !input.requestType) && membershipInputs.length > 0) {
      const [{ data: registration }, { data: selectedClubs, error: clubError }, { data: userGoals }, { data: countries }] = await Promise.all([
        ctx.supabase.from("registrations").select("dob, country, has_disability, does_indoor_workouts, has_smart_watch").eq("registration_id", input.registrationId).maybeSingle(),
        ctx.supabase
          .from("clubs")
          .select("club_id, country, special_club_code, is_special_club")
          .in("club_id", membershipInputs.map((membership) => membership.clubId)),
        ctx.supabase
          .from("user_goals")
          .select("goal")
          .eq("registration_id", input.registrationId),
        ctx.supabase.from("countries").select("iso_alpha2, name"),
      ]);
      if (clubError || !selectedClubs || selectedClubs.length !== membershipInputs.length) {
        throw new Error(clubError?.message || "Selected club was not found.");
      }
      const registrationWithGoals = {
        ...registration,
        has_general_health_goal: (userGoals ?? []).some((row: any) =>
          String(row.goal || "").trim().toLowerCase().includes("health")
        ),
      };
      selectedClubs.forEach((club: any) => selectedClubById.set(club.club_id, club));
      const countryAliases = buildCountryAliases(countries);
      selectedClubs.forEach((club) => assertClubAllowedForProfile(club, registrationWithGoals, countryAliases));
      const normalCount = selectedClubs.filter((club: any) => !club.special_club_code && !club.is_special_club).length;
      const specialCodes = selectedClubs
        .filter((club: any) => club.special_club_code || club.is_special_club)
        .map((club: any) => String(club.special_club_code || club.club_id));
      if (normalCount > 1 || new Set(specialCodes).size !== specialCodes.length) {
        throw new Error("Please choose at most one normal club and one of each special club.");
      }
    }

    if (CREATOR_REQUEST_TYPES.has(input.requestType)) {
      if (existing && CREATOR_REQUEST_TYPES.has(existing.request_type) && ["pending", "approved"].includes(existing.status ?? "pending")) {
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

    if ((input.requestType === "membership" || !input.requestType) && input.clubMemberships) {
      const { error: deleteError } = await ctx.supabase
        .from("club_membership_request")
        .delete()
        .eq("registration_id", input.registrationId)
        .eq("request_type", "membership");
      if (deleteError) {
        throw new Error(deleteError.message || "Failed to update club membership");
      }

      if (membershipInputs.length > 0) {
        const { error: insertError } = await ctx.supabase.from("club_membership_request").insert(
          membershipInputs.map((membership) => ({
            registration_id: input.registrationId,
            club: membership.club,
            club_id: membership.clubId,
            new_member: input.newMember,
            request_type: "membership",
            status: isSpecialClub(selectedClubById.get(membership.clubId)) ? "approved" : "pending",
          }))
        );
        if (insertError) {
          throw new Error(insertError.message || "Failed to save club membership");
        }
      }
    } else if (existing) {
      const { error } = await ctx.supabase
        .from("club_membership_request")
        .update({
          club: input.club,
          club_id: input.clubId ?? null,
          new_member: input.newMember,
          request_type: input.requestType,
          status:
            input.requestType === "membership" && isSpecialClub(selectedClubById.get(input.clubId ?? ""))
              ? "approved"
              : "pending",
          proposed_club_name: input.proposedClubName?.trim() || null,
          proposed_country: input.proposedCountry?.trim() || null,
          proposed_description: input.proposedDescription?.trim() || null,
          ...(CREATOR_REQUEST_TYPES.has(input.requestType)
            ? {
                status: "pending",
                reviewed_by: null,
                reviewed_at: null,
              }
            : {}),
        })
        .eq("registration_id", input.registrationId);
      if (error) {
        throw new Error(error.message || "Failed to update club membership");
      }
    } else {
      const { error } = await ctx.supabase
        .from("club_membership_request")
        .insert({
          registration_id: input.registrationId,
          club: input.club,
          club_id: input.clubId ?? null,
          new_member: input.newMember,
          request_type: input.requestType,
          status:
            input.requestType === "membership" && isSpecialClub(selectedClubById.get(input.clubId ?? ""))
              ? "approved"
              : "pending",
          proposed_club_name: input.proposedClubName?.trim() || null,
          proposed_country: input.proposedCountry?.trim() || null,
          proposed_description: input.proposedDescription?.trim() || null,
        });
      if (error) {
        throw new Error(error.message || "Failed to save club membership");
      }
    }

    return { success: true };
  });
