import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

function roleName(row: any): string | null {
  const source = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  return source?.role_name ?? null;
}

function daysSince(value: string | null | undefined): number {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

function getInactiveReason(ageDays: number, memberCount: number): string | null {
  if (ageDays >= 180 && memberCount < 10) return "180 days since launch with fewer than 10 members.";
  if (ageDays >= 90 && memberCount < 6) return "90 days since launch with fewer than 6 members.";
  if (ageDays >= 30 && memberCount === 0) return "30 days since launch with no enrolment.";
  return null;
}

export default publicProcedure.query(async ({ ctx }) => {
  const actor = await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryAdmin: true,
    allowCountryCoordinator: true,
    allowClubCoordinator: true,
  });

  const coordinatorClubIds = actor.roles
    .filter((role) => role.roleName === "club_coordinator" && role.clubId)
    .map((role) => role.clubId as string);
  const countryCodes = actor.roles
    .filter((role) => (role.roleName === "country_admin" || role.roleName === "country_coordinator") && role.countryCode)
    .map((role) => role.countryCode as string);

  let clubsQuery = ctx.supabase
    .from("clubs")
    .select("club_id, club_name, country, location, created_at, created_by_user_id, is_active")
    .eq("is_active", true)
    .order("club_name", { ascending: true });

  if (!actor.isSuperAdmin) {
    if (coordinatorClubIds.length > 0) {
      clubsQuery = clubsQuery.in("club_id", coordinatorClubIds);
    } else if (countryCodes.length > 0) {
      clubsQuery = clubsQuery.in("country", countryCodes);
    } else {
      return { clubs: [], deletionRequests: [] };
    }
  }

  const { data: clubs, error: clubsError } = await clubsQuery;
  if (clubsError) {
    throw new Error(clubsError.message || "Could not load clubs.");
  }

  const clubIds = (clubs || []).map((club: any) => club.club_id).filter(Boolean);
  const { data: memberships, error: membershipError } = clubIds.length > 0
    ? await ctx.supabase
        .from("club_membership_request")
        .select("club_id")
        .in("club_id", clubIds)
        .eq("status", "approved")
    : { data: [], error: null };

  if (membershipError) {
    throw new Error(membershipError.message || "Could not count club members.");
  }

  const memberCountByClubId = new Map<string, number>();
  (memberships || []).forEach((row: any) => {
    if (!row.club_id) return;
    memberCountByClubId.set(row.club_id, (memberCountByClubId.get(row.club_id) || 0) + 1);
  });

  let requestsQuery = ctx.supabase
    .from("club_deletion_requests")
    .select("request_id, club_id, requested_by, reason, status, eligible_at, actioned_by, actioned_at, created_at, clubs(club_name, country)")
    .order("created_at", { ascending: false });

  if (!actor.isSuperAdmin && clubIds.length > 0) {
    requestsQuery = requestsQuery.in("club_id", clubIds);
  } else if (!actor.isSuperAdmin) {
    return { clubs: [], deletionRequests: [] };
  }

  const { data: deletionRequests, error: requestsError } = await requestsQuery;
  if (requestsError) {
    throw new Error(requestsError.message || "Could not load club deletion requests.");
  }

  const userIds = [
    ...new Set((deletionRequests || []).flatMap((request: any) => [request.requested_by, request.actioned_by]).filter(Boolean)),
  ];
  const { data: profiles } = userIds.length > 0
    ? await ctx.supabase
        .from("profiles")
        .select("profile_id, username, display_name")
        .in("profile_id", userIds)
    : { data: [] };
  const profileById = new Map((profiles || []).map((profile: any) => [profile.profile_id, profile]));

  return {
    clubs: (clubs || []).map((club: any) => {
      const memberCount = memberCountByClubId.get(club.club_id) || 0;
      const inactiveReason = getInactiveReason(daysSince(club.created_at), memberCount);
      return {
        clubId: club.club_id,
        clubName: club.club_name,
        country: club.country,
        location: club.location,
        memberCount,
        inactiveFlag: Boolean(inactiveReason),
        inactiveReason,
        canRequestDeletion:
          actor.isSuperAdmin ||
          (!!inactiveReason && countryCodes.includes(club.country)) ||
          coordinatorClubIds.includes(club.club_id) ||
          (!!club.created_by_user_id && club.created_by_user_id === actor.authUserId),
      };
    }),
    deletionRequests: (deletionRequests || []).map((request: any) => {
      const club = Array.isArray(request.clubs) ? request.clubs[0] : request.clubs;
      const requestedBy = profileById.get(request.requested_by);
      const actionedBy = request.actioned_by ? profileById.get(request.actioned_by) : null;
      return {
        requestId: request.request_id,
        clubId: request.club_id,
        clubName: club?.club_name || "Unknown club",
        country: club?.country || null,
        requestedBy: requestedBy?.display_name || requestedBy?.username || request.requested_by,
        reason: request.reason,
        status: request.status,
        eligibleAt: request.eligible_at,
        actionedBy: actionedBy?.display_name || actionedBy?.username || null,
        actionedAt: request.actioned_at,
        createdAt: request.created_at,
      };
    }),
  };
});

