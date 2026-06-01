import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

const SPECIAL_CLUB_CODE_BY_COORDINATOR_ROLE: Record<string, string> = {
  junior_runners_club_coordinator: "junior_runners",
  golden_age_runners_club_coordinator: "golden_age_runners",
  treadmill_runners_club_coordinator: "treadmill_runners",
  para_runners_club_coordinator: "para_runners",
  smartfit_club_coordinator: "smartfit_club",
};

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatPace(distanceKm?: number | null, seconds?: number | null): string {
  if (!distanceKm || distanceKm <= 0 || !seconds || seconds <= 0) return "";
  const minutesPerKm = seconds / 60 / distanceKm;
  const mins = Math.floor(minutesPerKm);
  const secs = Math.round((minutesPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/km`;
}

export default publicProcedure
  .input(z.object({ eventId: z.string().min(1) }))
  .query(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
      allowSpecialClubCoordinator: true,
      allowEventOrganizer: true,
    });

    const { data: event, error: eventError } = await ctx.supabase
      .from("events")
      .select("*")
      .eq("event_id", input.eventId)
      .maybeSingle();
    if (eventError || !event) {
      throw new Error(eventError?.message || "Event not found.");
    }

    const organizerScopes = actor.roles
      .filter((role) => role.roleName === "event_organizer" && role.organizerId)
      .map((role) => role.organizerId as string);
    const clubScopes = actor.roles
      .filter((role) => role.roleName === "club_coordinator" && role.clubId)
      .map((role) => role.clubId as string);
    const specialClubCodes = actor.roles
      .map((role) => SPECIAL_CLUB_CODE_BY_COORDINATOR_ROLE[role.roleName])
      .filter(Boolean);
    const countryCodes = actor.roles
      .filter((role) => (role.roleName === "country_admin" || role.roleName === "country_coordinator") && role.countryCode)
      .map((role) => role.countryCode as string);

    let scopedClubNames: string[] = [];
    if (clubScopes.length > 0 || specialClubCodes.length > 0) {
      let clubsQuery = ctx.supabase.from("clubs").select("club_name, club_id, special_club_code");
      if (clubScopes.length > 0 && specialClubCodes.length > 0) {
        clubsQuery = clubsQuery.or(`club_id.in.(${clubScopes.join(",")}),special_club_code.in.(${specialClubCodes.join(",")})`);
      } else if (clubScopes.length > 0) {
        clubsQuery = clubsQuery.in("club_id", clubScopes);
      } else {
        clubsQuery = clubsQuery.in("special_club_code", specialClubCodes);
      }
      const { data: clubs, error: clubsError } = await clubsQuery;
      if (clubsError) throw new Error(clubsError.message || "Could not verify event club scope.");
      scopedClubNames = (clubs ?? []).map((club: any) => String(club.club_name || "").trim()).filter(Boolean);
    }

    const countryValue = String(event.country_code || event.country || "").toUpperCase();
    const canView =
      actor.isSuperAdmin ||
      (countryCodes.length > 0 && countryValue && countryCodes.includes(countryValue)) ||
      (event.organizer && organizerScopes.includes(event.organizer)) ||
      (event.club && scopedClubNames.includes(String(event.club).trim()));

    if (!canView) {
      throw new Error("You can only download reports for events inside your admin scope.");
    }

    const { data: participants, error } = await ctx.supabase
      .from("events_participants")
      .select(`
        event_participant_id,
        event_id,
        registration_id,
        registration_date,
        distance_km,
        time_seconds,
        registrations!events_participants_registration_id_fkey(first_name, other_names, username, sex, city_town_district)
      `)
      .eq("event_id", input.eventId);

    if (error) {
      throw new Error(error.message || "Could not load event results.");
    }

    const rows = (participants ?? [])
      .map((participant: any) => {
        const registration = participant.registrations ?? {};
        const distance = Number(participant.distance_km ?? 0);
        const seconds = Number(participant.time_seconds ?? 0);
        return {
          participantId: participant.event_participant_id,
          registrationId: participant.registration_id,
          name: [registration.first_name, registration.other_names].filter(Boolean).join(" ").trim() || registration.username || "Unknown",
          sex: registration.sex ?? "",
          town: registration.city_town_district ?? "",
          registrationDate: participant.registration_date ?? "",
          distanceKm: distance,
          time: formatDuration(seconds),
          pace: formatPace(distance, seconds),
        };
      })
      .sort((a: any, b: any) => {
        if (b.distanceKm !== a.distanceKm) return b.distanceKm - a.distanceKm;
        return String(a.time || "99:99:99").localeCompare(String(b.time || "99:99:99"));
      })
      .map((row: any, index: number) => ({ rank: index + 1, ...row }));

    return {
      eventId: event.event_id,
      eventName: event.event_name,
      rows,
    };
  });

