import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import createContextHook from '@nkzw/create-context-hook';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getEarnedBadgeCount } from '@/utils/badges';
import { calculateProfileCompletion } from '@/utils/profileCompletion';
import type { ProfileCompletionInputs } from '@/utils/profileCompletion';
import {
  setupNotifications,
  checkAndNotifyBadges,
  checkAndNotifyProfileCompletion,
  checkAndNotifyGoalProgress,
  checkAndNotifyTrialExpiry,
} from '@/utils/notifications';

const convertKmhToMinPerKm = (kmh: number): number => {
  if (kmh <= 0) return 0;
  return 60 / kmh;
};

export const [NotificationProvider, useNotifications] = createContextHook(() => {
  const { user } = useAuth();
  const { trialDaysRemaining, subscriptionStatus } = useSubscription();
  const setupDone = useRef(false);

  useEffect(() => {
    if (!setupDone.current) {
      setupDone.current = true;
      void setupNotifications();
    }
  }, []);

  const { data: badgeData } = useQuery({
    queryKey: ['notif_badges', user?.id],
    queryFn: async () => {
      if (!user?.id) return { earnedCount: 0, totalDistance: 0, totalActivities: 0 };
      const { data, error } = await supabase
        .from('activities')
        .select('Distance_km, Exercise_Type')
        .eq('RegistrationID', user.id);
      if (error) {
        console.error('[NotifContext] Badge data error:', error);
        return { earnedCount: 0, totalDistance: 0, totalActivities: 0 };
      }
      const validTypes = ['Run', 'Walk', 'Treadmill', 'Tredmill'];
      const filtered = (data || []).filter((a: any) => validTypes.includes(a.Exercise_Type || ''));
      const totalDistance = filtered.reduce((sum: number, a: any) => sum + (a.Distance_km || 0), 0);
      const totalActivities = filtered.length;
      return { totalDistance, totalActivities };
    },
    enabled: !!user?.id,
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const { data: completionData } = useQuery({
    queryKey: ['notif_completion', user?.id],
    queryFn: async (): Promise<ProfileCompletionInputs> => {
      if (!user?.id) {
        return {
          allFieldsFilled: false, hasProfilePhoto: false, hasGoal: false,
          hasClub: false, hasFiveActivities: false, hasSubscription: false,
          hasTargets: false, hasEventEnrollment: false, hasVerifiedEmail: false,
          hasAtLeastOneBadge: false,
        };
      }
      const [
        profileRes, photoRes, goalsRes, clubRes, activitiesRes,
        subscriptionRes, fitnessGoalRes, weightTargetRes, enrollmentRes,
      ] = await Promise.all([
        supabase.from('registrations')
          .select('"First Name", "Other Names", "Username", "Email", "Sex", "Residence", "Country", "Date of Birth", "email_verified"')
          .eq('RegistrationID', user.id).maybeSingle(),
        supabase.from('user_photos').select('file_path')
          .eq('registration_id', user.id).eq('is_profile_photo', true).maybeSingle(),
        supabase.from('user_goals').select('user_goals_id')
          .eq('registration_id', user.id).limit(1),
        supabase.from('club_membership_request').select('club')
          .eq('registration_id', user.id).maybeSingle(),
        supabase.from('activities').select('Distance_km, Exercise_Type')
          .eq('RegistrationID', user.id),
        supabase.from('subscriptions').select('status, expires_at')
          .eq('registration_id', user.id).maybeSingle(),
        supabase.from('fitness_goal').select('id')
          .eq('registration_id', user.id).limit(1),
        supabase.from('weight_target_goal').select('id')
          .eq('registration_id', user.id).limit(1),
        supabase.from('event_enrollments').select('EnrollmentID')
          .eq('RegistrationID', user.id).limit(1),
      ]);

      const p = profileRes.data as any;
      const allFieldsFilled = !!(p && p['First Name'] && p['Other Names'] && p.Username && p.Email && p.Sex && p.Residence && p.Country && p['Date of Birth']);
      const hasProfilePhoto = !!photoRes.data?.file_path;
      const hasGoal = (goalsRes.data?.length ?? 0) > 0;
      const hasClub = !!(clubRes.data?.club && clubRes.data.club !== '');
      const validTypes = ['Run', 'Walk', 'Treadmill', 'Tredmill'];
      const filtered = (activitiesRes.data || []).filter((a: any) => validTypes.includes(a.Exercise_Type || ''));
      const hasFiveActivities = filtered.length >= 5;
      const totalDist = filtered.reduce((s: number, a: any) => s + (a.Distance_km || 0), 0);
      const hasAtLeastOneBadge = getEarnedBadgeCount(totalDist, filtered.length) > 0;
      const sub = subscriptionRes.data as any;
      let hasSubscription = false;
      if (sub && sub.status === 'active') {
        hasSubscription = sub.expires_at ? new Date(sub.expires_at) > new Date() : true;
      }
      const hasTargets = (fitnessGoalRes.data?.length ?? 0) > 0 || (weightTargetRes.data?.length ?? 0) > 0;
      const hasEventEnrollment = (enrollmentRes.data?.length ?? 0) > 0;
      const hasVerifiedEmail = p?.email_verified === true;

      return {
        allFieldsFilled, hasProfilePhoto, hasGoal, hasClub, hasFiveActivities,
        hasSubscription, hasTargets, hasEventEnrollment, hasVerifiedEmail, hasAtLeastOneBadge,
      };
    },
    enabled: !!user?.id,
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const { data: goalProgressData } = useQuery({
    queryKey: ['notif_goal_progress', user?.id],
    queryFn: async () => {
      if (!user?.id) return { fitnessProgress: 0, weightProgress: 0 };

      let fitnessProgress = 0;
      const { data: fitnessGoal } = await supabase
        .from('fitness_goal')
        .select('*')
        .eq('registration_id', user.id)
        .maybeSingle();

      if (fitnessGoal) {
        const { data: recentActivities } = await supabase
          .from('activities')
          .select('Pace_km_h')
          .eq('RegistrationID', user.id)
          .order('Activity_Date', { ascending: false })
          .limit(5);

        const valid = (recentActivities || []).filter((a: any) => a.Pace_km_h > 0);
        if (valid.length > 0) {
          const avgPaceKmh = valid.reduce((sum: number, a: any) => sum + a.Pace_km_h, 0) / valid.length;
          const avgMinPerKm = convertKmhToMinPerKm(avgPaceKmh);
          const targetMinPerKm = convertKmhToMinPerKm(fitnessGoal.target_pace_kmh);
          fitnessProgress = targetMinPerKm > 0
            ? Math.min(100, Math.max(0, (targetMinPerKm / avgMinPerKm) * 100))
            : 0;
        }
      }

      let weightProgress = 0;
      const { data: weightTarget } = await supabase
        .from('weight_target_goal')
        .select('*')
        .eq('registration_id', user.id)
        .maybeSingle();

      if (weightTarget) {
        const { data: profile } = await supabase
          .from('registrations')
          .select('"Weight Current"')
          .eq('RegistrationID', user.id)
          .maybeSingle();

        const { data: latestEntry } = await supabase
          .from('weight_goal')
          .select('weight')
          .eq('registration_id', user.id)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle();

        const startWeight = (profile as any)?.['Weight Current'] || 0;
        const currentWeight = latestEntry?.weight || startWeight;
        const targetWeight = weightTarget.target_weight;

        if (startWeight > 0 && targetWeight > 0 && startWeight !== targetWeight) {
          const totalChange = Math.abs(startWeight - targetWeight);
          const currentChange = Math.abs(startWeight - currentWeight);
          const isRightDirection = startWeight > targetWeight
            ? currentWeight <= startWeight
            : currentWeight >= startWeight;
          weightProgress = isRightDirection
            ? Math.min(100, Math.max(0, (currentChange / totalChange) * 100))
            : 0;
        }
      }

      return { fitnessProgress, weightProgress };
    },
    enabled: !!user?.id,
    staleTime: 60000,
    refetchInterval: 120000,
  });

  useEffect(() => {
    if (!user?.id || !badgeData || Platform.OS === 'web') return;
    const completionPct = completionData ? calculateProfileCompletion(completionData).percentage : 0;
    const earnedCount = getEarnedBadgeCount(badgeData.totalDistance, badgeData.totalActivities, completionPct);
    void checkAndNotifyBadges(user.id, earnedCount);
  }, [user?.id, badgeData, completionData]);

  useEffect(() => {
    if (!user?.id || !completionData || Platform.OS === 'web') return;
    const completion = calculateProfileCompletion(completionData);
    void checkAndNotifyProfileCompletion(user.id, completion.percentage);
  }, [user?.id, completionData]);

  useEffect(() => {
    if (!user?.id || !goalProgressData || Platform.OS === 'web') return;

    if (goalProgressData.fitnessProgress > 0) {
      void checkAndNotifyGoalProgress(
        user.id, 'fitness', goalProgressData.fitnessProgress, 'pace'
      );
    }
    if (goalProgressData.weightProgress > 0) {
      void checkAndNotifyGoalProgress(
        user.id, 'weight', goalProgressData.weightProgress, 'weight'
      );
    }
  }, [user?.id, goalProgressData]);

  useEffect(() => {
    if (!user?.id || Platform.OS === 'web') return;
    void checkAndNotifyTrialExpiry(user.id, trialDaysRemaining, subscriptionStatus);
  }, [user?.id, trialDaysRemaining, subscriptionStatus]);

  const refreshNotificationData = useCallback(() => {
    console.log('[NotifContext] Manual refresh triggered');
  }, []);

  return useMemo(() => ({ refreshNotificationData }), [refreshNotificationData]);
});
