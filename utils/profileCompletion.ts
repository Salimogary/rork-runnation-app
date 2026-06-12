import { supabase } from "@/lib/supabase";
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
    enrollmentResult,
  ] = await Promise.all([
    supabase
      .from("registrations")
      .select("first_name, other_names, username, sex, city_town_district, country, dob, contacts(email)")
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
    supabase.from("event_enrollments").select("event_enrollment_id").eq("registration_id", registrationId).limit(1),
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
      (weightTargetResult.data?.length || 0) > 0,
    hasEventEnrollment: (enrollmentResult.data?.length || 0) > 0,
    hasAtLeastOneBadge: getEarnedBadgeCount(totalDistance, eligibleActivities.length) > 0,
  };
}
