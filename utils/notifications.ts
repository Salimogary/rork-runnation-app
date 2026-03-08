import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  LAST_BADGE_COUNT: 'notif_last_badge_count',
  LAST_PROFILE_PERCENT: 'notif_last_profile_percent',
  LAST_FITNESS_PROGRESS: 'notif_last_fitness_progress',
  LAST_WEIGHT_PROGRESS: 'notif_last_weight_progress',
  NOTIFICATIONS_ENABLED: 'notif_enabled',
};

export async function setupNotifications(): Promise<boolean> {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (Platform.OS === 'web') {
      console.log('[Notifications] Web platform — skipping permission request');
      return false;
    }

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
    });
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
