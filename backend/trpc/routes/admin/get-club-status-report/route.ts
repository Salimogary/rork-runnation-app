import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

const SPECIAL_CLUB_CODE_BY_COORDINATOR_ROLE: Record<string, string> = {
  junior_runners_club_coordinator: "junior_runners",
  golden_age_runners_club_coordinator: "golden_age_runners",
  treadmill_runners_club_coordinator: "treadmill_runners",
  para_runners_club_coordinator: "para_runners",
  smartfit_club_coordinator: "smartfit_club",
};

function normalizeClubName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function memberName(registration: any): string {
  return [registration?.first_name, registration?.other_names].filter(Boolean).join(" ").trim() || registration?.username || "Unknown";
}

function runNationTier(registration: any, subscription: any): string {
  const columnValue = Number(registration?.subscription ?? 0);
  if (columnValue === 3) return "Active";
  if (columnValue === 2) return "Expired";
  if (columnValue === 1) return "Trial";
  const status = String(subscription?.status || "").trim();
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "";
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
    allowSpecialClubCoordinator: true,
  });

  const clubScopes = actor.roles
    .filter((role) => role.roleName === "club_coordinator" && role.clubId)
    .map((role) => role.clubId as string);
  const specialClubCodes = actor.roles
    .map((role) => SPECIAL_CLUB_CODE_BY_COORDINATOR_ROLE[role.roleName])
    .filter(Boolean);
  const countryCodes = actor.roles
    .filter((role) => (role.roleName === "country_admin" || role.roleName === "country_coordinator") && role.countryCode)
    .map((role) => role.countryCode as string);

  let clubsQuery = ctx.supabase
    .from("clubs")
    .select("club_id, club_name, country, coordinator_id, is_special_club, special_club_code, created_at")
    .order("club_name", { ascending: true });

  if (!actor.isSuperAdmin) {
    if (clubScopes.length > 0 && specialClubCodes.length > 0) {
      clubsQuery = clubsQuery.or(`club_id.in.(${clubScopes.join(",")}),special_club_code.in.(${specialClubCodes.join(",")})`);
    } else if (clubScopes.length > 0) {
      clubsQuery = clubsQuery.in("club_id", clubScopes);
    } else if (specialClubCodes.length > 0) {
      clubsQuery = clubsQuery.in("special_club_code", specialClubCodes);
    } else if (countryCodes.length > 0) {
      clubsQuery = clubsQuery.in("country", countryCodes);
    } else {
      return { clubs: [], rows: [] };
    }
  }

  const { data: clubs, error: clubsError } = await clubsQuery;
  if (clubsError) {
    throw new Error(clubsError.message || "Could not load report clubs.");
  }

  const visibleClubs = clubs ?? [];
  const clubIds = visibleClubs.map((club: any) => club.club_id).filter(Boolean);
  const coordinatorIds = visibleClubs.map((club: any) => club.coordinator_id).filter(Boolean);
  const clubById = new Map(visibleClubs.map((club: any) => [club.club_id, club]));
  const clubByName = new Map(visibleClubs.map((club: any) => [normalizeClubName(club.club_name), club]));
  const memberPairs: { clubId: string; registrationId: string }[] = [];
  const approvedMemberPairs: { clubId: string; registrationId: string }[] = [];

  if (coordinatorIds.length > 0) {
    const { data: legacyMembers, error: legacyError } = await ctx.supabase
      .from("club_members")
      .select("registration_id, coordinator_id")
      .in("coordinator_id", coordinatorIds);
    if (legacyError) throw new Error(legacyError.message || "Could not load club members.");
    for (const row of legacyMembers ?? []) {
      const club = visibleClubs.find((item: any) => item.coordinator_id === row.coordinator_id);
      if (club?.club_id && row.registration_id) {
        memberPairs.push({ clubId: club.club_id, registrationId: row.registration_id });
        approvedMemberPairs.push({ clubId: club.club_id, registrationId: row.registration_id });
      }
    }
  }

  const { data: membershipRequests, error: requestError } = await ctx.supabase
    .from("club_membership_request")
    .select("registration_id, club_id, club, status, request_type, new_member, created_at")
    .eq("request_type", "membership")
    .neq("status", "rejected");
  if (requestError) throw new Error(requestError.message || "Could not load club memberships.");

  for (const request of membershipRequests ?? []) {
    if ((request.request_type ?? "membership") !== "membership") continue;
    const club = request.club_id ? clubById.get(request.club_id) : clubByName.get(normalizeClubName(request.club));
    const isSpecialClub = club?.is_special_club === true || Boolean(club?.special_club_code);
    if (!isSpecialClub && request.status !== "approved") continue;
    if (club?.club_id && request.registration_id) {
      memberPairs.push({ clubId: club.club_id, registrationId: request.registration_id });
      if (request.status === "approved") {
        approvedMemberPairs.push({ clubId: club.club_id, registrationId: request.registration_id });
      }
    }
  }

  const uniquePairs = [...new Map(memberPairs.map((pair) => [`${pair.clubId}:${pair.registrationId}`, pair])).values()];
  const uniqueApprovedPairs = [...new Map(approvedMemberPairs.map((pair) => [`${pair.clubId}:${pair.registrationId}`, pair])).values()];
  const approvedMemberCountByClubId = new Map<string, number>();
  for (const pair of uniqueApprovedPairs) {
    approvedMemberCountByClubId.set(pair.clubId, (approvedMemberCountByClubId.get(pair.clubId) ?? 0) + 1);
  }
  const newMemberCountByClubId = new Map<string, number>();
  for (const request of membershipRequests ?? []) {
    if (request.status !== "approved" || request.new_member !== "Yes") continue;
    const club = request.club_id ? clubById.get(request.club_id) : clubByName.get(normalizeClubName(request.club));
    if (!club?.club_id) continue;
    newMemberCountByClubId.set(club.club_id, (newMemberCountByClubId.get(club.club_id) ?? 0) + 1);
  }
  const clubSummaries = visibleClubs.map((club: any) => {
    const ageDays = daysSince(club.created_at);
    const memberCount = approvedMemberCountByClubId.get(club.club_id) ?? 0;
    const inactiveReason = getInactiveReason(ageDays, memberCount);
    return {
      clubId: club.club_id,
      clubName: club.club_name,
      country: club.country,
      launchedAt: club.created_at,
      ageDays,
      memberCount,
      newMemberCount: newMemberCountByClubId.get(club.club_id) ?? 0,
      inactiveFlag: Boolean(inactiveReason),
      inactiveReason,
    };
  });
  const registrationIds = [...new Set(uniquePairs.map((pair) => pair.registrationId))];
  if (registrationIds.length === 0) {
    return {
      clubs: visibleClubs.map((club: any) => ({ clubId: club.club_id, clubName: club.club_name })),
      clubSummaries,
      rows: [],
    };
  }

  const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    registrationsResult,
    activitiesResult,
    subscriptionsResult,
    profilesResult,
    paymentItemsResult,
    paymentRecordsResult,
    allMembershipsResult,
  ] = await Promise.all([
    ctx.supabase
      .from("registrations")
      .select("registration_id, first_name, other_names, username, sex, city_town_district, created_at, subscription")
      .in("registration_id", registrationIds),
    ctx.supabase
      .from("activities")
      .select("registration_id, activity_id")
      .in("registration_id", registrationIds)
      .gte("activity_date", sinceIso),
    ctx.supabase
      .from("subscriptions")
      .select("registration_id, status")
      .in("registration_id", registrationIds),
    ctx.supabase
      .from("profiles")
      .select("profile_id, registration_id")
      .in("registration_id", registrationIds),
    clubIds.length > 0
      ? ctx.supabase
          .from("club_payment_items")
          .select("payment_id, club_id, is_active")
          .in("club_id", clubIds)
      : Promise.resolve({ data: [], error: null }),
    ctx.supabase
      .from("club_payment_records")
      .select("payment_id, registration_id, status")
      .in("registration_id", registrationIds),
    ctx.supabase
      .from("club_membership_request")
      .select("registration_id, club_id, club, status, request_type")
      .eq("request_type", "membership")
      .neq("status", "rejected")
      .in("registration_id", registrationIds),
  ]);

  if (registrationsResult.error) throw new Error(registrationsResult.error.message || "Could not load member profiles.");
  if (activitiesResult.error) throw new Error(activitiesResult.error.message || "Could not load member runs.");
  if (subscriptionsResult.error) throw new Error(subscriptionsResult.error.message || "Could not load subscriptions.");
  if (profilesResult.error) throw new Error(profilesResult.error.message || "Could not load service role profiles.");
  if (paymentItemsResult.error) throw new Error(paymentItemsResult.error.message || "Could not load club subscriptions.");
  if (paymentRecordsResult.error) throw new Error(paymentRecordsResult.error.message || "Could not load club subscription records.");
  if (allMembershipsResult.error) throw new Error(allMembershipsResult.error.message || "Could not load other memberships.");

  const registrationMap = new Map((registrationsResult.data ?? []).map((row: any) => [row.registration_id, row]));
  const subscriptionMap = new Map((subscriptionsResult.data ?? []).map((row: any) => [row.registration_id, row]));
  const profileMap = new Map((profilesResult.data ?? []).map((row: any) => [row.registration_id, row.profile_id]));
  const runsByRegistration = new Map<string, number>();
  for (const activity of activitiesResult.data ?? []) {
    runsByRegistration.set(activity.registration_id, (runsByRegistration.get(activity.registration_id) ?? 0) + 1);
  }

  const activePaymentIdsByClub = new Map<string, Set<string>>();
  for (const item of paymentItemsResult.data ?? []) {
    if (item.is_active === false) continue;
    const set = activePaymentIdsByClub.get(item.club_id) ?? new Set<string>();
    set.add(item.payment_id);
    activePaymentIdsByClub.set(item.club_id, set);
  }

  const paidPaymentKeys = new Set(
    (paymentRecordsResult.data ?? [])
      .filter((record: any) => ["paid", "waived"].includes(String(record.status || "").toLowerCase()))
      .map((record: any) => `${record.payment_id}:${record.registration_id}`)
  );

  const { data: roleRows, error: roleError } = profileMap.size > 0
    ? await ctx.supabase
        .from("user_role_assignments")
        .select("user_id, is_active")
        .in("user_id", [...profileMap.values()])
        .eq("is_active", true)
    : { data: [], error: null };
  if (roleError) throw new Error(roleError.message || "Could not load service role assignments.");

  const serviceRoleProfileIds = new Set((roleRows ?? []).map((row: any) => row.user_id));
  const allMembershipsByRegistration = new Map<string, Set<string>>();
  for (const request of allMembershipsResult.data ?? []) {
    if ((request.request_type ?? "membership") !== "membership") continue;
    const visibleClub = request.club_id ? clubById.get(request.club_id) : clubByName.get(normalizeClubName(request.club));
    const isSpecialClub = visibleClub?.is_special_club === true || Boolean(visibleClub?.special_club_code);
    if (!isSpecialClub && request.status !== "approved") continue;
    const club = request.club_id ? request.club_id : normalizeClubName(request.club);
    if (!club || !request.registration_id) continue;
    const set = allMembershipsByRegistration.get(request.registration_id) ?? new Set<string>();
    set.add(club);
    allMembershipsByRegistration.set(request.registration_id, set);
  }

  const rows = uniquePairs.map((pair) => {
    const club = clubById.get(pair.clubId);
    const registration = registrationMap.get(pair.registrationId);
    const activePaymentIds = activePaymentIdsByClub.get(pair.clubId) ?? new Set<string>();
    const hasClubSubscriptionFee = activePaymentIds.size > 0;
    const subscriptionPaid = hasClubSubscriptionFee
      ? [...activePaymentIds].some((paymentId) => paidPaymentKeys.has(`${paymentId}:${pair.registrationId}`))
      : null;
    const memberships = allMembershipsByRegistration.get(pair.registrationId) ?? new Set<string>();
    const hasOtherMembership = [...memberships].some((clubKey) => clubKey !== pair.clubId && clubKey !== normalizeClubName(club?.club_name));
    const profileId = profileMap.get(pair.registrationId);
    return {
      clubId: pair.clubId,
      clubName: club?.club_name ?? "Club",
      registrationId: pair.registrationId,
      name: memberName(registration),
      sex: registration?.sex ?? "",
      town: registration?.city_town_district ?? "",
      signUpDate: registration?.created_at ?? "",
      subscription: subscriptionPaid === null ? "" : subscriptionPaid ? "Y" : "N",
      runNationTier: runNationTier(registration, subscriptionMap.get(pair.registrationId)),
      runsLast30Days: runsByRegistration.get(pair.registrationId) ?? 0,
      hasServiceRole: profileId && serviceRoleProfileIds.has(profileId) ? "Y" : "N",
      otherClubMembership: hasOtherMembership ? "Y" : "N",
    };
  });

  return {
    clubs: visibleClubs.map((club: any) => ({ clubId: club.club_id, clubName: club.club_name })),
    clubSummaries,
    rows,
  };
});

