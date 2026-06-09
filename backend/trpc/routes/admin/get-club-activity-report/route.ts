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

const inputSchema = z.object({
  clubId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function durationMinutes(activity: any): number {
  const startParts = String(activity.start_time || "").split(":").map(Number);
  const endParts = String(activity.end_time || "").split(":").map(Number);
  if (startParts.length < 2 || endParts.length < 2 || startParts.some(Number.isNaN) || endParts.some(Number.isNaN)) {
    return 0;
  }

  const start = startParts[0] * 60 + startParts[1] + (startParts[2] || 0) / 60;
  const end = endParts[0] * 60 + endParts[1] + (endParts[2] || 0) / 60;
  let minutes = end - start;
  if (minutes < 0) minutes += 24 * 60;
  return Math.max(0, minutes - Number(activity.pause_duration_seconds || 0) / 60);
}

export default publicProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
      allowSpecialClubCoordinator: true,
    });

    const start = new Date(`${input.startDate}T00:00:00.000Z`);
    const end = new Date(`${input.endDate}T23:59:59.999Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new Error("Please enter a valid date range.");
    }
    if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new Error("Please select a date range of one year or less.");
    }

    const { data: club, error: clubError } = await ctx.supabase
      .from("clubs")
      .select("club_id, club_name, country, coordinator_id, is_special_club, special_club_code")
      .eq("club_id", input.clubId)
      .maybeSingle();
    if (clubError || !club) {
      throw new Error(clubError?.message || "Club not found.");
    }

    const clubScopes = actor.roles
      .filter((role) => role.roleName === "club_coordinator" && role.clubId)
      .map((role) => role.clubId as string);
    const countryScopes = actor.roles
      .filter((role) => role.roleName === "country_coordinator" && role.countryCode)
      .map((role) => String(role.countryCode).toUpperCase());
    const specialClubScopes = actor.roles
      .map((role) => SPECIAL_CLUB_CODE_BY_COORDINATOR_ROLE[role.roleName])
      .filter(Boolean);

    const canView =
      actor.isSuperAdmin ||
      clubScopes.includes(club.club_id) ||
      (club.country && countryScopes.includes(String(club.country).toUpperCase())) ||
      (club.special_club_code && specialClubScopes.includes(club.special_club_code));
    if (!canView) {
      throw new Error("You can only download activity for clubs inside your admin scope.");
    }

    const [membershipResult, legacyResult] = await Promise.all([
      ctx.supabase
        .from("club_membership_request")
        .select("registration_id, status")
        .eq("club_id", club.club_id)
        .eq("request_type", "membership")
        .neq("status", "rejected"),
      club.coordinator_id
        ? ctx.supabase
            .from("club_members")
            .select("registration_id")
            .eq("coordinator_id", club.coordinator_id)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (membershipResult.error) {
      throw new Error(membershipResult.error.message || "Could not load club members.");
    }
    if (legacyResult.error) {
      throw new Error(legacyResult.error.message || "Could not load legacy club members.");
    }

    const isSpecialClub = club.is_special_club === true || Boolean(club.special_club_code);
    const registrationIds = [
      ...new Set([
        ...(membershipResult.data ?? [])
          .filter((row: any) => isSpecialClub || row.status === "approved")
          .map((row: any) => row.registration_id),
        ...(legacyResult.data ?? []).map((row: any) => row.registration_id),
      ].filter(Boolean)),
    ] as string[];

    if (registrationIds.length === 0) {
      return { clubId: club.club_id, clubName: club.club_name, rows: [] };
    }

    const { data: registrations, error: registrationsError } = await ctx.supabase
      .from("registrations")
      .select("registration_id, first_name, other_names, username, sex, country, city_town_district")
      .in("registration_id", registrationIds);

    if (registrationsError) {
      throw new Error(registrationsError.message || "Could not load member profiles.");
    }

    const activities: any[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await ctx.supabase
        .from("activities")
        .select("activity_id, registration_id, activity_date, exercise_type, distance_km, start_time, end_time, pause_duration_seconds, pace_min_per_km")
        .in("registration_id", registrationIds)
        .gte("activity_date", input.startDate)
        .lte("activity_date", input.endDate)
        .order("activity_date", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        throw new Error(error.message || "Could not load club activity.");
      }
      const page = data ?? [];
      activities.push(...page);
      if (page.length < pageSize) break;
    }

    const registrationMap = new Map(
      (registrations ?? []).map((registration: any) => [registration.registration_id, registration])
    );
    const rows = activities.map((activity: any) => {
      const registration = registrationMap.get(activity.registration_id);
      const distanceKm = Number(activity.distance_km || 0);
      const minutes = durationMinutes(activity);
      return {
        activityId: activity.activity_id,
        registrationId: activity.registration_id,
        memberName:
          [registration?.first_name, registration?.other_names].filter(Boolean).join(" ").trim() ||
          registration?.username ||
          "Runner",
        sex: registration?.sex || "",
        country: registration?.country || "",
        town: registration?.city_town_district || "",
        activityDate: activity.activity_date,
        exerciseType: activity.exercise_type || "",
        distanceKm,
        durationMinutes: minutes,
        paceMinPerKm:
          Number(activity.pace_min_per_km || 0) || (distanceKm > 0 ? minutes / distanceKm : 0),
        startTime: activity.start_time || "",
        endTime: activity.end_time || "",
        pauseSeconds: Number(activity.pause_duration_seconds || 0),
      };
    });

    return {
      clubId: club.club_id,
      clubName: club.club_name,
      rows,
    };
  });
