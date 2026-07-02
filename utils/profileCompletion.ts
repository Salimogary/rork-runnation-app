import { supabase } from "@/lib/supabase";
import { getAppRatingPromptState } from "@/utils/appRatingPrompt";
import { getEarnedBadgeCount } from "@/utils/badges";

export interface CompletionItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface ProfileCompletionData {
  percentage: number;
  items: CompletionItem[];
  completedCount: number;
  totalCount: number;
}

export interface ProfileCompletionInputs {
  allFieldsFilled: boolean;
  hasProfilePhoto: boolean;
  hasGoal: boolean;
  hasClub: boolean;
  hasFiveActivities: boolean;
  hasSubscription: boolean;
  hasTargets: boolean;
  hasEventEnrollment: boolean;
  hasAtLeastOneBadge: boolean;
  hasEarnedMedal: boolean;
  hasRatedApp: boolean;
  requiresAdminTerms?: boolean;
  hasAcceptedAdminTerms?: boolean;
}

export function calculateProfileCompletion(inputs: ProfileCompletionInputs): ProfileCompletionData {
  const items: CompletionItem[] = [
    { id: "bio", label: "All fields filled (Bio)", completed: inputs.allFieldsFilled },
    { id: "photo", label: "Profile photo", completed: inputs.hasProfilePhoto },
    { id: "goal", label: "At least 1 goal set", completed: inputs.hasGoal },
    { id: "club", label: "Has a club", completed: inputs.hasClub },
    { id: "activities", label: "5 activities (run, walk or treadmill)", completed: inputs.hasFiveActivities },
    { id: "subscription", label: "Has subscription", completed: inputs.hasSubscription },
    { id: "targets", label: "Loaded targets for at least 1 goal", completed: inputs.hasTargets },
    { id: "event", label: "Enrolled for at least 1 event", completed: inputs.hasEventEnrollment },
    { id: "badge", label: "At least one badge", completed: inputs.hasAtLeastOneBadge },
    { id: "earned_medal", label: "Earn at least one Medal", completed: inputs.hasEarnedMedal },
    { id: "rate_app", label: "Rate app", completed: inputs.hasRatedApp },
  ];

  if (inputs.requiresAdminTerms) {
    items.push({
      id: "admin_terms",
      label: "Accepted admin terms",
      completed: !!inputs.hasAcceptedAdminTerms,
    });
  }

  const completedCount = items.filter((i) => i.completed).length;
  const totalCount = items.length;
  const percentage = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return { percentage, items, completedCount, totalCount };
}

const getDateOnly = (value?: string | null): string => String(value || "").slice(0, 10);

const addDaysIso = (value: string, days: number): string => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const getMedalEarnedDate = (event: any): string => getDateOnly(event?.medal_date_end) || getDateOnly(event?.ends_at) || getDateOnly(event?.medal_date_start) || getDateOnly(event?.starts_at);

async function hasEarnedMedalAfterRegistration(registrationId: string, registrationDate?: string | null): Promise<boolean> {
  const registeredOn = getDateOnly(registrationDate);
  const { data: participants, error: participantsError } = await supabase
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

  if (participantsError) {
    console.warn("[ProfileCompletion] Could not load medal participants:", participantsError);
    return false;
  }

  const medalRows = (participants || []).filter((row: any) => {
    const event = Array.isArray(row.events) ? row.events[0] : row.events;
    if (event?.has_medal !== true) return false;
    const earnedDate = getMedalEarnedDate(event);
    return !registeredOn || !earnedDate || earnedDate >= registeredOn;
  });
  if (medalRows.length === 0) return false;

  const earliest = medalRows
    .map((row: any) => getDateOnly((Array.isArray(row.events) ? row.events[0] : row.events)?.medal_date_start) || getDateOnly((Array.isArray(row.events) ? row.events[0] : row.events)?.starts_at))
    .filter(Boolean)
    .sort()[0];
  const latest = medalRows
    .map((row: any) => getMedalEarnedDate(Array.isArray(row.events) ? row.events[0] : row.events))
    .filter(Boolean)
    .sort()
    .pop();

  const { data: activities, error: activitiesError } = earliest && latest
    ? await supabase
      .from("activities")
      .select("activity_date, distance_km")
      .eq("registration_id", registrationId)
      .gte("activity_date", earliest)
      .lte("activity_date", latest)
    : { data: [], error: null };

  if (activitiesError) {
    console.warn("[ProfileCompletion] Could not load medal activities:", activitiesError);
  }

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

export async function fetchProfileCompletionInputs(
  registrationId: string,
  hasFreeAdminAccess = false
): Promise<ProfileCompletionInputs> {
  const [
    profileResult,
    photoResult,
    goalsResult,
    clubResult,
    activitiesResult,
    subscriptionResult,
    fitnessTargetResult,
    weightTargetResult,
    dailyRunTargetResult,
    habitTargetResult,
    healthTargetResult,
    enrollmentResult,
    earnedMedalResult,
    appRatingResult,
    localRatingState,
  ] = await Promise.all([
    supabase
      .from("registrations")
      .select("first_name, other_names, username, sex, city_town_district, country, dob, created_at, contacts(email)")
      .eq("registration_id", registrationId)
      .maybeSingle(),
    supabase
      .from("user_photos")
      .select("file_path")
      .eq("registration_id", registrationId)
      .eq("is_profile_photo", true)
      .maybeSingle(),
    supabase.from("user_goals").select("user_goals_id").eq("registration_id", registrationId).limit(1),
    supabase.from("club_membership_request").select("club").eq("registration_id", registrationId),
    supabase.from("activities").select("distance_km, exercise_type").eq("registration_id", registrationId),
    supabase.from("subscriptions").select("status, expires_at").eq("registration_id", registrationId).maybeSingle(),
    supabase.from("fitness_goal").select("fitness_goal_id").eq("registration_id", registrationId).limit(1),
    supabase.from("weight_target_goal").select("weight_target_goal_id").eq("registration_id", registrationId).limit(1),
    supabase.from("daily_run_goal").select("daily_run_goal_id").eq("registration_id", registrationId).limit(1),
    supabase.from("habit_declarations").select("declaration_id").eq("registration_id", registrationId).eq("is_active", true).limit(1),
    supabase.from("health_goal").select("health_id").eq("registration_id", registrationId).limit(1),
    supabase.from("event_enrollments").select("event_enrollment_id").eq("registration_id", registrationId).limit(1),
    supabase
      .from("registrations")
      .select("created_at")
      .eq("registration_id", registrationId)
      .maybeSingle()
      .then((result) => hasEarnedMedalAfterRegistration(registrationId, result.data?.created_at)),
    supabase.from("app_ratings").select("rating_id").eq("registration_id", registrationId).limit(1),
    getAppRatingPromptState(registrationId),
  ]);

  const profile = profileResult.data as any;
  const contactEmail = profile?.contacts?.[0]?.email ?? profile?.contacts?.email;
  const validActivityTypes = ["Run", "Walk", "Treadmill", "Tredmill"];
  const eligibleActivities = (activitiesResult.data || []).filter((activity: any) =>
    validActivityTypes.includes(activity.exercise_type || "")
  );
  const totalDistance = eligibleActivities.reduce(
    (sum: number, activity: any) => sum + (Number(activity.distance_km) || 0),
    0
  );
  const subscription = subscriptionResult.data;
  const hasPaidSubscription =
    subscription?.status === "active" &&
    (!subscription.expires_at || new Date(subscription.expires_at) > new Date());

  return {
    allFieldsFilled: Boolean(
      profile?.first_name &&
      profile?.other_names &&
      profile?.username &&
      contactEmail &&
      profile?.sex &&
      profile?.city_town_district &&
      profile?.country &&
      profile?.dob
    ),
    hasProfilePhoto: Boolean(photoResult.data?.file_path),
    hasGoal: (goalsResult.data?.length || 0) > 0,
    hasClub: (clubResult.data || []).some((row: any) => Boolean(row.club)),
    hasFiveActivities: eligibleActivities.length >= 5,
    hasSubscription: hasFreeAdminAccess || hasPaidSubscription,
    hasTargets:
      (fitnessTargetResult.data?.length || 0) > 0 ||
      (weightTargetResult.data?.length || 0) > 0 ||
      (dailyRunTargetResult.data?.length || 0) > 0 ||
      (habitTargetResult.data?.length || 0) > 0 ||
      (healthTargetResult.data?.length || 0) > 0,
    hasEventEnrollment: (enrollmentResult.data?.length || 0) > 0,
    hasAtLeastOneBadge: getEarnedBadgeCount(totalDistance, eligibleActivities.length) > 0,
    hasEarnedMedal: earnedMedalResult,
    hasRatedApp: (appRatingResult.data?.length || 0) > 0 || Boolean(localRatingState.lastSubmittedAt),
  };
}
