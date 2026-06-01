import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";
import { resolvePrivateActivityUploadUrl } from "../../../storage";

function normalizeClubName(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

async function getTreadmillClubMemberships(ctx: any, registrationIds: string[]) {
  if (registrationIds.length === 0) return new Set<string>();

  const { data: treadmillClubs, error: clubsError } = await ctx.supabase
    .from("clubs")
    .select("club_id, club_name")
    .eq("special_club_code", "treadmill_runners");

  if (clubsError) {
    console.warn("[Admin] Could not load treadmill club reference:", clubsError.message);
    return new Set<string>();
  }

  const treadmillClubIds = new Set((treadmillClubs || []).map((club: any) => club.club_id).filter(Boolean));
  const treadmillClubNames = new Set((treadmillClubs || []).map((club: any) => normalizeClubName(club.club_name)).filter(Boolean));
  if (treadmillClubIds.size === 0 && treadmillClubNames.size === 0) return new Set<string>();

  const { data: memberships, error: membershipsError } = await ctx.supabase
    .from("club_membership_request")
    .select("registration_id, club_id, club, status, request_type")
    .eq("request_type", "membership")
    .eq("status", "approved")
    .in("registration_id", registrationIds);

  if (membershipsError) {
    console.warn("[Admin] Could not load treadmill club memberships:", membershipsError.message);
    return new Set<string>();
  }

  return new Set(
    (memberships || [])
      .filter((membership: any) => {
        const clubId = membership.club_id;
        const clubName = normalizeClubName(membership.club);
        return (clubId && treadmillClubIds.has(clubId)) || (clubName && treadmillClubNames.has(clubName));
      })
      .map((membership: any) => membership.registration_id)
      .filter(Boolean)
  );
}

export default publicProcedure.query(async ({ ctx }) => {
  const actor = await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryCoordinator: true,
    allowClubCoordinator: true,
    allowSpecialClubCoordinator: true,
  });
  const isTreadmillCoordinator = actor.roles.some((role) => role.roleName === "treadmill_runners_club_coordinator");
  if (
    actor.isSpecialClubCoordinator &&
    !isTreadmillCoordinator &&
    !actor.isSuperAdmin &&
    !actor.isCountryCoordinator &&
    !actor.isClubCoordinator
  ) {
    throw new Error("Only the Treadmill Runners Club coordinator can review treadmill approvals.");
  }

  const { data, error } = await ctx.supabase
    .from("pending_activities")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to fetch pending activities");
  }

  const registrationIds = [...new Set((data || []).map((activity: any) => activity.registration_id).filter(Boolean))];
  const { data: registrations, error: registrationsError } = registrationIds.length
    ? await ctx.supabase
        .from("registrations")
        .select("registration_id, first_name, other_names, username")
        .in("registration_id", registrationIds)
    : { data: [], error: null };

  if (registrationsError) {
    console.warn("[Admin] Could not enrich pending activities with registrations:", registrationsError.message);
  }

  const registrationMap = new Map(
    (registrations || []).map((registration: any) => [registration.registration_id, registration])
  );
  const treadmillMemberIds = await getTreadmillClubMemberships(ctx, registrationIds);

  const enrichedActivities = (data || []).map((activity: any) => {
      const registration = registrationMap.get(activity.registration_id);
      const fullName = [registration?.first_name, registration?.other_names].filter(Boolean).join(" ").trim();
      const isTreadmillClubMember = treadmillMemberIds.has(activity.registration_id);
      return {
        ...activity,
        runnerName: fullName || registration?.username || activity.registration_id,
        username: registration?.username || null,
        isTreadmillClubMember,
        treadmillClubMember: isTreadmillClubMember ? "Y" : "N",
      };
    });

  const visibleActivities =
    actor.isSuperAdmin || actor.isCountryCoordinator
      ? enrichedActivities
      : isTreadmillCoordinator
        ? enrichedActivities.filter((activity: any) => activity.isTreadmillClubMember)
        : [];

  return await Promise.all(
    visibleActivities.map(async (activity: any) => ({
      ...activity,
      photoUrl: await resolvePrivateActivityUploadUrl(ctx.supabase, activity.photo_path),
    }))
  );
});


