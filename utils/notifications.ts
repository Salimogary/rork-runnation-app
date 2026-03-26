import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  LAST_BADGE_COUNT: 'notif_last_badge_count',
  LAST_PROFILE_PERCENT: 'notif_last_profile_percent',
  LAST_FITNESS_PROGRESS: 'notif_last_fitness_progress',
  LAST_WEIGHT_PROGRESS: 'notif_last_weight_progress',
  NOTIFICATIONS_ENABLED: 'notif_enabled',
  TRIAL_NOTIFIED_MILESTONES: 'notif_trial_milestones',
};

function isExpoGoAndroid(): boolean {
  return Platform.OS === "android" && Constants.appOwnership === "expo";
}

async function getNotificationsModule() {
  // Expo Go on Android (SDK 53+) throws when importing expo-notifications due to
  // removed remote push support. Skip notifications entirely in that case.
  if (isExpoGoAndroid()) return null;
  const mod = await import("expo-notifications");
  return mod;
}

export async function setupNotifications(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      console.log('[Notifications] Web platform — skipping notification setup');
      return false;
    }

    const Notifications = await getNotificationsModule();
    if (!Notifications) {
      console.log("[Notifications] Expo Go Android — skipping notification setup");
      return false;
    }

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Notifications] Permission not granted');
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'RunNation',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF6B35',
      });
    }

    console.log('[Notifications] Setup complete');
    return true;
  } catch (error) {
    console.error('[Notifications] Setup error:', error);
    return false;
  }
}

export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      console.log('[Notifications] Web — skipping local notification:', title);
      return;
    }

    const Notifications = await getNotificationsModule();
    if (!Notifications) {
      console.log("[Notifications] Expo Go Android — skipping local notification:", title);
      return;
    }

    const enabled = await getNotificationsEnabled();
    if (!enabled) {
      console.log('[Notifications] Notifications disabled, skipping:', title);
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data ?? {},
        sound: 'default',
      },
      trigger: null,
    } as any);
    console.log('[Notifications] Sent:', title);
  } catch (error) {
    console.error('[Notifications] Send error:', error);
  }
}

export async function checkAndNotifyBadges(
  userId: string,
  currentBadgeCount: number
): Promise<void> {
  try {
    const key = `${STORAGE_KEYS.LAST_BADGE_COUNT}_${userId}`;
    const stored = await AsyncStorage.getItem(key);
    const previousCount = stored ? parseInt(stored, 10) : 0;

    if (currentBadgeCount > previousCount && previousCount > 0) {
      const newBadges = currentBadgeCount - previousCount;
      await sendLocalNotification(
        '🏅 New Badge Earned!',
        newBadges === 1
          ? 'Congratulations! You just earned a new badge. Keep pushing!'
          : `Amazing! You earned ${newBadges} new badges. You're on fire!`,
        { type: 'badge', count: newBadges }
      );
    }

    await AsyncStorage.setItem(key, currentBadgeCount.toString());
  } catch (error) {
    console.error('[Notifications] Badge check error:', error);
  }
}

export async function checkAndNotifyProfileCompletion(
  userId: string,
  currentPercentage: number
): Promise<void> {
  try {
    const key = `${STORAGE_KEYS.LAST_PROFILE_PERCENT}_${userId}`;
    const stored = await AsyncStorage.getItem(key);
    const previousPercent = stored ? parseInt(stored, 10) : 0;

    if (currentPercentage > previousPercent && previousPercent > 0) {
      const increase = currentPercentage - previousPercent;

      if (currentPercentage === 100) {
        await sendLocalNotification(
          '🎉 Profile 100% Complete!',
          'Your profile is fully complete. You\'re a true RunNation member!',
          { type: 'profile_completion', percentage: 100 }
        );
      } else {
        await sendLocalNotification(
          '📈 Profile Completion Up!',
          `Your profile is now ${currentPercentage}% complete (+${increase}%). Keep going!`,
          { type: 'profile_completion', percentage: currentPercentage }
        );
      }
    }

    await AsyncStorage.setItem(key, currentPercentage.toString());
  } catch (error) {
    console.error('[Notifications] Profile completion check error:', error);
  }
}

export async function checkAndNotifyGoalProgress(
  userId: string,
  goalType: 'fitness' | 'weight',
  currentProgress: number,
  goalLabel: string
): Promise<void> {
  try {
    const baseKey = goalType === 'fitness'
      ? STORAGE_KEYS.LAST_FITNESS_PROGRESS
      : STORAGE_KEYS.LAST_WEIGHT_PROGRESS;
    const key = `${baseKey}_${userId}`;
    const stored = await AsyncStorage.getItem(key);
    const previousProgress = stored ? parseFloat(stored) : 0;

    if (currentProgress > previousProgress && previousProgress > 0) {
      const milestones = [25, 50, 75, 90, 100];
      const crossedMilestone = milestones.find(
        (m) => currentProgress >= m && previousProgress < m
      );

      if (crossedMilestone) {
        if (crossedMilestone >= 100) {
          await sendLocalNotification(
            '🎯 Goal Achieved!',
            `You've reached your ${goalLabel} goal! Time to set a new target!`,
            { type: 'goal_progress', goalType, progress: currentProgress }
          );
        } else {
          await sendLocalNotification(
            '🚀 Goal Progress!',
            `You're ${crossedMilestone}% of the way to your ${goalLabel} goal. Keep it up!`,
            { type: 'goal_progress', goalType, progress: currentProgress }
          );
        }
      } else if (currentProgress - previousProgress >= 10) {
        await sendLocalNotification(
          '💪 Making Progress!',
          `You're now ${Math.round(currentProgress)}% towards your ${goalLabel} goal.`,
          { type: 'goal_progress', goalType, progress: currentProgress }
        );
      }
    }

    await AsyncStorage.setItem(key, currentProgress.toString());
  } catch (error) {
    console.error('[Notifications] Goal progress check error:', error);
  }
}

const TRIAL_DURATION_DAYS = 90;
const TRIAL_NOTIFICATION_DAYS = [30, 60, 80, 85, 90];

export async function checkAndNotifyTrialExpiry(
  userId: string,
  trialDaysRemaining: number,
  subscriptionStatus: string
): Promise<void> {
  try {
    if (subscriptionStatus !== 'trial') {
      console.log('[Notifications] Not on trial, skipping trial notifications');
      return;
    }

    const key = `${STORAGE_KEYS.TRIAL_NOTIFIED_MILESTONES}_${userId}`;
    const stored = await AsyncStorage.getItem(key);
    const notifiedMilestones: number[] = stored ? JSON.parse(stored) : [];

    const daysUsed = TRIAL_DURATION_DAYS - trialDaysRemaining;

    for (const milestone of TRIAL_NOTIFICATION_DAYS) {
      if (daysUsed >= milestone && !notifiedMilestones.includes(milestone)) {
        const daysLeft = TRIAL_DURATION_DAYS - milestone;

        if (milestone === 90) {
          await sendLocalNotification(
            '⏰ Free Plan Expired',
            'Your 90-day Free Plan has ended. Subscribe now to continue enjoying RunNation!',
            { type: 'trial_expiry', milestone, daysLeft: 0 }
          );
        } else if (milestone === 85) {
          await sendLocalNotification(
            '⚠️ Only 5 Days Left!',
            `Your Free Plan expires in ${daysLeft} days. Subscribe now to keep your progress!`,
            { type: 'trial_expiry', milestone, daysLeft }
          );
        } else if (milestone === 80) {
          await sendLocalNotification(
            '🔔 Free Plan Ending Soon',
            `You have ${daysLeft} days left on your Free Plan. Don't lose access — subscribe today!`,
            { type: 'trial_expiry', milestone, daysLeft }
          );
        } else if (milestone === 60) {
          await sendLocalNotification(
            '📅 60 Days on RunNation!',
            `You've been with us for 60 days! ${daysLeft} days left on your Free Plan. Consider upgrading.`,
            { type: 'trial_expiry', milestone, daysLeft }
          );
        } else if (milestone === 30) {
          await sendLocalNotification(
            '🏃 30 Days In!',
            `You've been running with us for 30 days! ${daysLeft} days remain on your Free Plan.`,
            { type: 'trial_expiry', milestone, daysLeft }
          );
        }

        notifiedMilestones.push(milestone);
        console.log(`[Notifications] Trial milestone ${milestone} notified, ${daysLeft} days left`);
      }
    }

    await AsyncStorage.setItem(key, JSON.stringify(notifiedMilestones));
  } catch (error) {
    console.error('[Notifications] Trial expiry check error:', error);
  }
}

export async function getNotificationsEnabled(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED);
    return stored !== 'false';
  } catch {
    return true;
  }
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, enabled ? 'true' : 'false');
}
