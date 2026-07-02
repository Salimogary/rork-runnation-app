import { ADMIN_TERMS_VERSION } from "../../../admin-terms";
import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

const DISTANCE_MILESTONES = [10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const ACTIVITY_INTERVAL = 10;
const MAX_ACTIVITY_BADGES = 100;
const ADMIN_ROLE_NAMES = [
  "super_admin",
  "global_admin",
  "country_admin",
  "country_coordinator",
  "club_coordinator",
  "junior_runners_club_coordinator",
  "golden_age_runners_club_coordinator",
  "treadmill_runners_club_coordinator",
  "para_runners_club_coordinator",
  "smartfit_club_coordinator",
  "event_organizer",
  "magazine_editor",
  "chat_room_administrator",
  "magazine_columnist_fitness_coach",
  "magazine_columnist_sports_journalist",
  "magazine_columnist_motivation_speaker",
  "shop_manager",
];
const FREE_ADMIN_SUBSCRIPTION_ROLE_NAMES = new Set(ADMIN_ROLE_NAMES);

function normalizeClubName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isMissingSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("does not exist") || message.includes("schema cache") || message.includes("relation");
}

function getEarnedBadgeCount(totalDistanceKm: number, totalActivities: number): number {
  const distanceEarned = DISTANCE_MILESTONES.filter((km) => totalDistanceKm >= km).length;
  let activityEarned = 0;
  for (let i = ACTIVITY_INTERVAL; i <= MAX_ACTIVITY_BADGES; i += ACTIVITY_INTERVAL) {
    if (totalActivities >= i) activityEarned++;
    else break;
  }
  return distanceEarned + activityEarned;
}

function getDateOnly(value?: string | null): string {
  return String(value || "").slice(0, 10);
}

function addDaysIso(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getMedalEarnedDate(event: any): string {
  return getDateOnly(event?.medal_date_end) || getDateOnly(event?.ends_at) || getDateOnly(event?.medal_date_start) || getDateOnly(event?.starts_at);
}

async function hasEarnedMedalAfterRegistration(ctx: { supabase: any }, registrationId: string, registrationDate?: string | null): Promise<boolean> {
  const registeredOn = getDateOnly(registrationDate);
  const { data: participants, error: participantsError } = await ctx.supabase
    .from("events_participants")
    .select(`
      event_id,
      distance_km,
      events!events_participants_event_id_fkey(
        event_id,
        starts_at,
        ends_at,
        has_medal,
        medal_min_daily_distance,
        medal_min_cumulative_distance,
        medal_date_start,
        medal_date_end
      )
    `)
    .eq("registration_id", registrationId);

  if (participantsError) return false;

  const medalRows = (participants || []).filter((row: any) => {
    const event = Array.isArray(row.events) ? row.events[0] : row.events;
    if (event?.has_medal !== true) return false;
    const earnedDate = getMedalEarnedDate(event);
    return !registeredOn || !earnedDate || earnedDate >= registeredOn;
  });
  if (medalRows.length === 0) return false;

  const earliest = medalRows
    .map((row: any) => {
      const event = Array.isArray(row.events) ? row.events[0] : row.events;
      return getDateOnly(event?.medal_date_start) || getDateOnly(event?.starts_at);
    })
    .filter(Boolean)
    .sort()[0];
  const latest = medalRows
    .map((row: any) => getMedalEarnedDate(Array.isArray(row.events) ? row.events[0] : row.events))
    .filter(Boolean)
    .sort()
    .pop();

  const { data: activities } = earliest && latest
    ? await ctx.supabase
      .from("activities")
      .select("activity_date, distance_km")
      .eq("registration_id", registrationId)
      .gte("activity_date", earliest)
      .lte("activity_date", latest)
    : { data: [] };

  const distanceByDate = new Map<string, number>();
  (activities || []).forEach((activity: any) => {
    const date = getDateOnly(activity.activity_date);
    if (!date) return;
    distanceByDate.set(date, (distanceByDate.get(date) || 0) + (Number(activity.distance_km) || 0));
  });

  return medalRows.some((row: any) => {
    const event = Array.isArray(row.events) ? row.events[0] : row.events;
    const medalStart = getDateOnly(event?.medal_date_start) || getDateOnly(event?.starts_at);
    const medalEnd = getMedalEarnedDate(event);
    const participantDistance = Number(row.distance_km) || 0;
    const minDailyDistance = Number(event?.medal_min_daily_distance) || 0;
    const minCumulativeDistance = Number(event?.medal_min_cumulative_distance) || 0;

    if (!minDailyDistance && !minCumulativeDistance) return participantDistance > 0;
    if (!medalStart || !medalEnd) return participantDistance > 0 && (!minDailyDistance || participantDistance >= minDailyDistance);

    let totalDistance = participantDistance;
    let dailyQualified = true;
    let cursor = medalStart;
    while (cursor <= medalEnd) {
      const dayDistance = distanceByDate.get(cursor) || 0;
      totalDistance += dayDistance;
      if (minDailyDistance > 0 && dayDistance < minDailyDistance) dailyQualified = false;
      cursor = addDaysIso(cursor, 1);
    }
    return dailyQualified && (minCumulativeDistance <= 0 || totalDistance >= minCumulativeDistance);
  });
}

async function resolveRegistrationId(ctx: { supabase: any; authUserId: string | null }, registrationId: string): Promise<string> {
  if (!ctx.authUserId || registrationId !== ctx.authUserId) {
    return registrationId;
  }

  const { data: profile, error } = await ctx.supabase
    .from("profiles")
    .select("registration_id")
    .eq("profile_id", ctx.authUserId)
    .maybeSingle();

  if (error && !isMissingSchemaError(error)) {
    throw new Error(error.message || "Could not resolve your profile.");
  }

  return profile?.registration_id || registrationId;
}

export default publicProcedure
  .input(z.object({ registrationId: z.string().min(1) }))
  .query(async ({ input, ctx }) => {
    const registrationId = await resolveRegistrationId(ctx, input.registrationId);
    await requireRegistrationOwner(ctx, registrationId);

    let socialAuthVerified = false;
    if (ctx.authUserId) {
      const { data: authUserResult } = await ctx.supabase.auth.admin.getUserById(ctx.authUserId);
      const authUser = authUserResult?.user;
      const provider =
        authUser?.app_metadata?.provider ||
        authUser?.identities?.[0]?.provider ||
        null;

      socialAuthVerified = provider === "google" || provider === "apple";
    }

    const [
      regRes,
      contactRes,
      photoRes,
      activitiesRes,
      goalsRes,
      userGoalsRes,
      clubsRes,
      clubMembershipRes,
      subscriptionRes,
      fitnessGoalRes,
      weightTargetRes,
      dailyRunGoalRes,
      habitDeclarationRes,
      healthGoalRes,
      enrollmentRes,
      appRatingRes,
      profileRes,
    ] = await Promise.all([
      ctx.supabase.from("registrations").select("*").eq("registration_id", registrationId).maybeSingle(),
      ctx.supabase.from("contacts").select("email, country_code, phone, full_phone").eq("registration_id", registrationId).maybeSingle(),
      ctx.supabase.from("user_photos").select("file_path").eq("registration_id", registrationId).eq("is_profile_photo", true).maybeSingle(),
      ctx.supabase.from("activities").select("distance_km, exercise_type").eq("registration_id", registrationId),
      ctx.supabase.from("goals").select("goal_id, goal").order("goal_id", { ascending: true }),
      ctx.supabase.from("user_goals").select("*").eq("registration_id", registrationId),
      ctx.supabase.from("clubs").select("club_id, club_name, country, location, description, presence_towns, is_special_club, special_club_code, age_min, age_max").order("club_name", { ascending: true }),
      ctx.supabase
        .from("club_membership_request")
        .select("*")
        .eq("registration_id", registrationId)
        .order("created_at", { ascending: true }),
      ctx.supabase.from("subscriptions").select("status, expires_at").eq("registration_id", registrationId).maybeSingle(),
      ctx.supabase.from("fitness_goal").select("fitness_goal_id").eq("registration_id", registrationId).limit(1),
      ctx.supabase.from("weight_target_goal").select("weight_target_goal_id").eq("registration_id", registrationId).limit(1),
      ctx.supabase.from("daily_run_goal").select("daily_run_goal_id").eq("registration_id", registrationId).limit(1),
      ctx.supabase.from("habit_declarations").select("declaration_id").eq("registration_id", registrationId).eq("is_active", true).limit(1),
      ctx.supabase.from("health_goal").select("health_id").eq("registration_id", registrationId).limit(1),
      ctx.supabase.from("event_enrollments").select("event_enrollment_id").eq("registration_id", registrationId).limit(1),
      ctx.supabase.from("app_ratings").select("rating_id").eq("registration_id", registrationId).limit(1),
      ctx.supabase.from("profiles").select("profile_id").eq("registration_id", registrationId).maybeSingle(),
    ]);

    if (regRes.error || !regRes.data) {
      throw new Error(regRes.error?.message || "No profile found for this user");
    }

    const profile = {
      ...regRes.data,
      email: contactRes.data?.email || regRes.data.email,
      country_code: contactRes.data?.country_code ?? null,
      phone:
        contactRes.data?.full_phone
          ? String(contactRes.data.full_phone)
          : contactRes.data?.phone
            ? String(contactRes.data.phone)
            : null,
      email_verified: regRes.data.email_verified === true || socialAuthVerified,
    };

    const validTypes = ["Run", "Walk", "Cycle", "Treadmill", "Tredmill"];
    const filteredActivities = (activitiesRes.data || []).filter((a: any) =>
      validTypes.includes(a.exercise_type || "")
    );
    const totalDistance = filteredActivities.reduce((sum: number, a: any) => sum + (a.distance_km || 0), 0);
    const totalActivities = filteredActivities.length;

    const p: any = regRes.data;
    const allFieldsFilled = !!(
      p &&
      p.first_name &&
      p.other_names &&
      p.username &&
      (contactRes.data?.email || p.email) &&
      p.sex &&
      p.city_town_district &&
      p.country &&
      p.dob
    );
    const hasProfilePhoto = !!photoRes.data?.file_path;
    const hasGoal = (userGoalsRes.data?.length ?? 0) > 0;
    const clubById = new Map((clubsRes.data ?? []).map((club: any) => [club.club_id, club]));
    const clubByName = new Map((clubsRes.data ?? []).map((club: any) => [normalizeClubName(club.club_name), club]));
    const clubMembershipRows = (clubMembershipRes.data || []).filter((membership: any) => {
      if ((membership.status ?? "pending") === "rejected") return false;
      const club = membership.club_id
        ? clubById.get(membership.club_id)
        : clubByName.get(normalizeClubName(membership.club));
      const isSpecialClub = club?.is_special_club === true || Boolean(club?.special_club_code);
      return isSpecialClub || membership.status === "approved";
    });
    const primaryClubMembership = clubMembershipRows[0] || null;
    const hasClub = clubMembershipRows.some((membership: any) => membership?.club && membership.club !== "");
    const membershipClubIds = [
      ...new Set(
        clubMembershipRows
          .map((membership: any) => {
            const club = membership.club_id
              ? clubById.get(membership.club_id)
              : clubByName.get(normalizeClubName(membership.club));
            return club?.club_id ?? null;
          })
          .filter(Boolean)
      ),
    ];
    let clubWhatsappLinks: any[] = [];

    if (membershipClubIds.length > 0) {
      const { data: whatsappRows, error: whatsappError } = await ctx.supabase
        .from("club_whatsap_link")
        .select("link_id, club_id, club_name, link")
        .in("club_id", membershipClubIds);

      if (whatsappError && !isMissingSchemaError(whatsappError)) {
        throw new Error(whatsappError.message || "Could not load club WhatsApp links.");
      }

      clubWhatsappLinks = (whatsappRows ?? []).map((row: any) => ({
        linkId: row.link_id,
        clubId: row.club_id,
        clubName: row.club_name,
        link: row.link,
      }));
    }
    const hasFiveActivities = totalActivities >= 5;
    const hasAtLeastOneBadge = getEarnedBadgeCount(totalDistance, totalActivities) > 0;
    const sub = subscriptionRes.data;
    const hasPaidSubscription = !!(
      sub &&
      sub.status === "active" &&
      (!sub.expires_at || new Date(sub.expires_at) > new Date())
    );
    const hasTargets =
      (fitnessGoalRes.data?.length ?? 0) > 0 ||
      (weightTargetRes.data?.length ?? 0) > 0 ||
      (dailyRunGoalRes.data?.length ?? 0) > 0 ||
      (habitDeclarationRes.data?.length ?? 0) > 0 ||
      (healthGoalRes.data?.length ?? 0) > 0;
    const hasEventEnrollment = (enrollmentRes.data?.length ?? 0) > 0;
    const hasEarnedMedal = await hasEarnedMedalAfterRegistration(ctx, registrationId, regRes.data.created_at);
    const hasRatedApp = (appRatingRes.data?.length ?? 0) > 0;
    let requiresAdminTerms = false;
    let hasAcceptedAdminTerms = false;
    let hasFreeAdminSubscription = false;

    if (profileRes.data?.profile_id) {
      const { data: roleRows } = await ctx.supabase
        .from("roles")
        .select("role_id, role_name")
        .in("role_name", ADMIN_ROLE_NAMES);
      const roleNameById = new Map((roleRows ?? []).map((role: any) => [String(role.role_id), String(role.role_name || "")]));
      const roleIds = (roleRows ?? []).map((role: any) => role.role_id);
      const [{ data: roleAssignments }, { data: termsAcceptance }] = await Promise.all([
        ctx.supabase
          .from("user_role_assignments")
          .select("assignment_id, role_id")
          .eq("user_id", profileRes.data.profile_id)
          .eq("is_active", true)
          .in("role_id", roleIds.length > 0 ? roleIds : [-1]),
        ctx.supabase
          .from("admin_terms_acceptances")
          .select("acceptance_id")
          .eq("user_id", profileRes.data.profile_id)
          .eq("terms_version", ADMIN_TERMS_VERSION)
          .maybeSingle(),
      ]);

      requiresAdminTerms = (roleAssignments?.length ?? 0) > 0;
      hasAcceptedAdminTerms = !!termsAcceptance;
      hasFreeAdminSubscription = (roleAssignments ?? []).some((assignment: any) =>
        FREE_ADMIN_SUBSCRIPTION_ROLE_NAMES.has(roleNameById.get(String(assignment.role_id)) || "")
      );
    }
    const hasSubscription = hasFreeAdminSubscription || hasPaidSubscription;

    return {
      profile,
      profilePhoto: photoRes.data?.file_path || null,
      activityStats: { totalDistance, totalActivities },
      goals: goalsRes.data || [],
      userGoals: userGoalsRes.data || [],
      clubs: clubsRes.data || [],
      clubMembership: primaryClubMembership,
      clubMemberships: clubMembershipRows,
      clubWhatsappLinks,
      completionInputs: {
        allFieldsFilled,
        hasProfilePhoto,
        hasGoal,
        hasClub,
        hasFiveActivities,
        hasSubscription,
        hasTargets,
        hasEventEnrollment,
        hasAtLeastOneBadge,
        hasEarnedMedal,
        hasRatedApp,
        requiresAdminTerms,
        hasAcceptedAdminTerms,
      },
    };
  });
