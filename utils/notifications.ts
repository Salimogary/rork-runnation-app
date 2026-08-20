import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  LAST_BADGE_COUNT: 'notif_last_badge_count',
  LAST_PROFILE_PERCENT: 'notif_last_profile_percent',
  LAST_FITNESS_PROGRESS: 'notif_last_fitness_progress',
  LAST_WEIGHT_PROGRESS: 'notif_last_weight_progress',
  LAST_ACTIVITY_MILESTONES: 'notif_last_activity_milestones',
  LAST_WEIGHT_LOG_REMINDER: 'notif_last_weight_log_reminder',
  SUBSCRIPTION_NOTIFIED_MILESTONES: 'notif_subscription_milestones',
  PENDING_SUBSCRIPTION_REMINDER: 'notif_pending_subscription_reminder',
  SCHEDULED_REMINDERS: 'notif_scheduled_reminders',
  NOTIFICATIONS_ENABLED: 'notif_enabled',
  TRIAL_NOTIFIED_MILESTONES: 'notif_trial_milestones',
  MORNING_DIGEST_DATE: 'notif_morning_digest_date',
  APP_UPDATE_NOTIFIED_BUILD: 'notif_app_update_build',
};

export type MorningNotificationItem = {
  type: 'incomplete_profile' | 'app_update' | 'new_event' | 'goals_not_set' | 'event_reminder';
  message: string;
};

type RegisteredEventReminder = {
  eventId: string;
  eventName: string;
  startsAt: string | null;
  endsAt: string | null;
  eventType: string | null;
  recurrenceFrequency?: string | null;
  recurrenceWeekday?: number | null;
  recurrenceWeekdays?: number[] | string | null;
  recurrenceMonthlyMode?: string | null;
  recurrenceMonthDay?: number | null;
  recurrenceWeekOfMonth?: number | null;
  registrationStatus?: string | null;
};

type ReminderScheduleMap = Record<string, string>;

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

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateOnlyKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseWeekdays(value: RegisteredEventReminder['recurrenceWeekdays'], fallback?: number | null): number[] {
  if (Array.isArray(value)) {
    return value.map((day) => Number(day)).filter((day) => day >= 0 && day <= 6);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((day) => Number(day)).filter((day) => day >= 0 && day <= 6);
      }
    } catch {
      return value
        .split(',')
        .map((day) => Number(day.trim()))
        .filter((day) => day >= 0 && day <= 6);
    }
  }
  return typeof fallback === 'number' && fallback >= 0 && fallback <= 6 ? [fallback] : [];
}

function isNthWeekdayOfMonth(date: Date, weekOfMonth: number | null | undefined): boolean {
  if (!weekOfMonth || weekOfMonth < 1) return true;
  const dayOfMonth = date.getDate();
  const ordinal = Math.ceil(dayOfMonth / 7);
  return ordinal === weekOfMonth;
}

function eventOccursOnDate(event: RegisteredEventReminder, date: Date): boolean {
  const start = parseDate(event.startsAt);
  const end = parseDate(event.endsAt) ?? start;
  if (!start) return false;

  const targetDay = startOfDay(date);
  const startDay = startOfDay(start);
  const endDay = startOfDay(end ?? start);
  const eventType = String(event.eventType || '').toLowerCase();

  if (eventType === 'multiday') {
    return targetDay >= startDay && targetDay <= endDay;
  }

  if (eventType !== 'recurring') {
    return toDateOnlyKey(targetDay) === toDateOnlyKey(startDay);
  }

  if (targetDay < startDay || targetDay > endDay) return false;

  const frequency = String(event.recurrenceFrequency || 'weekly').toLowerCase();
  if (frequency === 'monthly') {
    if (event.recurrenceMonthlyMode === 'weekday') {
      const weekdays = parseWeekdays(event.recurrenceWeekdays, event.recurrenceWeekday);
      const matchesWeekday = weekdays.length === 0 || weekdays.includes(targetDay.getDay());
      return matchesWeekday && isNthWeekdayOfMonth(targetDay, event.recurrenceWeekOfMonth);
    }
    const monthDay = event.recurrenceMonthDay || startDay.getDate();
    return targetDay.getDate() === monthDay;
  }

  const weekdays = parseWeekdays(event.recurrenceWeekdays, event.recurrenceWeekday ?? startDay.getDay());
  return weekdays.includes(targetDay.getDay());
}

function getNextEventOccurrences(events: RegisteredEventReminder[], daysAhead = 30): Array<{ event: RegisteredEventReminder; date: Date }> {
  const today = startOfDay(new Date());
  const occurrences: Array<{ event: RegisteredEventReminder; date: Date }> = [];
  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const date = addDays(today, offset);
    for (const event of events) {
      if (event.registrationStatus === 'pending') continue;
      if (eventOccursOnDate(event, date)) {
        occurrences.push({ event, date });
      }
    }
  }
  return occurrences;
}

async function scheduleLocalNotification(
  title: string,
  body: string,
  triggerDate: Date,
  data?: Record<string, unknown>
): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;

  const enabled = await getNotificationsEnabled();
  if (!enabled) return null;

  if (triggerDate.getTime() <= Date.now()) return null;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data ?? {},
      sound: 'default',
    },
    trigger: triggerDate,
  } as any);
  return id;
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

export async function registerDevicePushToken(registrationId: string): Promise<boolean> {
  try {
    if (Platform.OS === "web" || !registrationId) return false;
    const Notifications = await getNotificationsModule();
    if (!Notifications) return false;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;
    if (!projectId) {
      console.error("[Notifications] Missing EAS project ID for push token registration");
      return false;
    }

    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== "granted") return false;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) return false;

    const { supabase } = await import("@/lib/supabase");
    const { error } = await supabase
      .from("device_push_tokens")
      .upsert({
        push_token: token,
        registration_id: registrationId,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      }, { onConflict: "push_token" });

    if (error) {
      console.error("[Notifications] Push token registration error:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Notifications] Push token registration failed:", error);
    return false;
  }
}

export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      console.log('[Notifications] Web — skipping local notification:', title);
      return false;
    }

    const Notifications = await getNotificationsModule();
    if (!Notifications) {
      console.log("[Notifications] Expo Go Android — skipping local notification:", title);
      return false;
    }

    const enabled = await getNotificationsEnabled();
    if (!enabled) {
      console.log('[Notifications] Notifications disabled, skipping:', title);
      return false;
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
    return true;
  } catch (error) {
    console.error('[Notifications] Send error:', error);
    return false;
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

export async function sendMorningDigestOnce(
  userId: string,
  items: MorningNotificationItem[]
): Promise<void> {
  if (items.length === 0) return;
  const now = new Date();
  if (now.getHours() < 5 || now.getHours() >= 12) return;

  const dateKey = toDateOnlyKey(now);
  const storageKey = `${STORAGE_KEYS.MORNING_DIGEST_DATE}_${userId}`;
  if (await AsyncStorage.getItem(storageKey) === dateKey) return;

  const visibleItems = items.slice(0, 3);
  const extraCount = items.length - visibleItems.length;
  const body = `${visibleItems.map((item) => item.message).join(' ')}${extraCount > 0 ? ` Plus ${extraCount} more update${extraCount === 1 ? '' : 's'} in the app.` : ''}`;
  await sendLocalNotification(
    'RunNation morning update',
    body,
    { type: 'morning_digest', categories: items.map((item) => item.type) }
  );
  await AsyncStorage.setItem(storageKey, dateKey);
}

export async function sendAppUpdateNotificationOnce(
  userId: string,
  availableBuild: number,
  installedBuild: number,
  updateUrl?: string | null
): Promise<void> {
  try {
    if (!Number.isFinite(availableBuild) || availableBuild <= installedBuild) return;
    const storageKey = `${STORAGE_KEYS.APP_UPDATE_NOTIFIED_BUILD}_${userId}`;
    const buildKey = String(availableBuild);
    if (await AsyncStorage.getItem(storageKey) === buildKey) return;

    const sent = await sendLocalNotification(
      `RunNation version code ${availableBuild} is available`,
      "Open Settings > App Update to update from the Play Store.",
      { type: "app_update", availableBuild, installedBuild, updateUrl: updateUrl ?? null }
    );
    if (sent) {
      await AsyncStorage.setItem(storageKey, buildKey);
    }
  } catch (error) {
    console.error("[Notifications] App update notification error:", error);
  }
}

export async function checkAndNotifyWorkoutMilestones(
  userId: string,
  totalDistanceKm: number,
  totalActivities: number,
  badgeCount: number,
  previousDistanceKm: number,
  previousActivities: number,
  previousBadgeCount: number
): Promise<void> {
  const key = `${STORAGE_KEYS.LAST_ACTIVITY_MILESTONES}_${userId}`;
  const badgeKey = `${STORAGE_KEYS.LAST_BADGE_COUNT}_${userId}`;
  const [storedMilestones, storedBadgeCount] = await Promise.all([
    AsyncStorage.getItem(key),
    AsyncStorage.getItem(badgeKey),
  ]);
  const notified = new Set<string>(storedMilestones ? JSON.parse(storedMilestones) : []);
  const lastStoredBadgeCount = storedBadgeCount ? Number(storedBadgeCount) : previousBadgeCount;
  const distanceMilestones = [5, 10, 21, 42, 100, 250, 500, 1000, 2500, 5000];
  const activityMilestones = [5, 10, 25, 50, 100, 250, 500, 1000];
  const distanceHit = distanceMilestones.find((value) => previousDistanceKm < value && totalDistanceKm >= value && !notified.has(`distance:${value}`));
  const activityHit = activityMilestones.find((value) => previousActivities < value && totalActivities >= value && !notified.has(`activities:${value}`));
  const newBadges = Math.max(0, badgeCount - Math.max(previousBadgeCount, lastStoredBadgeCount));

  const messages = [
    newBadges > 0 ? `${newBadges} new badge${newBadges === 1 ? '' : 's'} earned.` : null,
    distanceHit ? `${distanceHit.toLocaleString()} km milestone reached.` : null,
    activityHit ? `${activityHit.toLocaleString()} workouts completed.` : null,
  ].filter(Boolean);

  if (messages.length > 0) {
    await sendLocalNotification('Workout milestone achieved', messages.join(' '), {
      type: 'workout_milestone',
      badgeCount,
      distanceMilestone: distanceHit ?? null,
      activityMilestone: activityHit ?? null,
    });
  }
  if (distanceHit) notified.add(`distance:${distanceHit}`);
  if (activityHit) notified.add(`activities:${activityHit}`);
  await Promise.all([
    AsyncStorage.setItem(key, JSON.stringify(Array.from(notified))),
    AsyncStorage.setItem(badgeKey, String(badgeCount)),
  ]);
}

export async function scheduleRegisteredEventReminders(
  userId: string,
  events: RegisteredEventReminder[],
  reminderHour = 6,
  reminderMinute = 30
): Promise<void> {
  try {
    if (Platform.OS === 'web') return;

    const Notifications = await getNotificationsModule();
    if (!Notifications) return;

    const enabled = await getNotificationsEnabled();
    if (!enabled) return;

    const storageKey = `${STORAGE_KEYS.SCHEDULED_REMINDERS}_${userId}`;
    const stored = await AsyncStorage.getItem(storageKey);
    const scheduled: ReminderScheduleMap = stored ? JSON.parse(stored) : {};
    const nextScheduled: ReminderScheduleMap = {};
    const wantedKeys = new Set<string>();
    const occurrences = getNextEventOccurrences(events, 30);

    for (const { event, date } of occurrences) {
      const dateKey = toDateOnlyKey(date);
      const reminderKey = `event:${event.eventId}:${dateKey}`;
      wantedKeys.add(reminderKey);

      if (scheduled[reminderKey]) {
        nextScheduled[reminderKey] = scheduled[reminderKey];
        continue;
      }

      const triggerDate = new Date(date);
      triggerDate.setHours(reminderHour, reminderMinute, 0, 0);
      if (triggerDate.getTime() <= Date.now()) continue;

      const notificationId = await scheduleLocalNotification(
        'RunNation event today',
        `${event.eventName || 'Your event'} is today. Get ready and record your activity.`,
        triggerDate,
        { type: 'event_reminder', eventId: event.eventId, occurrenceDate: dateKey }
      );

      if (notificationId) {
        nextScheduled[reminderKey] = notificationId;
      }
    }

    for (const [key, notificationId] of Object.entries(scheduled)) {
      if (!key.startsWith('event:') || wantedKeys.has(key)) continue;
      try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
      } catch (error) {
        console.warn('[Notifications] Could not cancel stale event reminder:', error);
      }
    }

    await AsyncStorage.setItem(storageKey, JSON.stringify(nextScheduled));
  } catch (error) {
    console.error('[Notifications] Event reminder scheduling error:', error);
  }
}

export async function checkAndNotifyWeightLogReminder(
  userId: string,
  hasWeightGoal: boolean,
  latestWeightEntryDate?: string | null
): Promise<void> {
  try {
    if (!hasWeightGoal) return;

    const now = new Date();
    const lastEntry = parseDate(latestWeightEntryDate);
    const daysSinceEntry = lastEntry
      ? Math.floor((startOfDay(now).getTime() - startOfDay(lastEntry).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (daysSinceEntry < 7) return;

    const key = `${STORAGE_KEYS.LAST_WEIGHT_LOG_REMINDER}_${userId}`;
    const stored = await AsyncStorage.getItem(key);
    const lastReminder = parseDate(stored);
    const daysSinceReminder = lastReminder
      ? Math.floor((startOfDay(now).getTime() - startOfDay(lastReminder).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (daysSinceReminder < 7) return;

    await sendLocalNotification(
      'Weekly weight check-in',
      'Log your current weight to keep your weight goal progress accurate.',
      { type: 'weight_log_reminder' }
    );
    await AsyncStorage.setItem(key, now.toISOString());
  } catch (error) {
    console.error('[Notifications] Weight log reminder error:', error);
  }
}

export async function checkAndNotifyActivityMilestones(
  userId: string,
  totalDistanceKm: number,
  totalActivities: number
): Promise<void> {
  try {
    const key = `${STORAGE_KEYS.LAST_ACTIVITY_MILESTONES}_${userId}`;
    const stored = await AsyncStorage.getItem(key);
    const notified = stored ? JSON.parse(stored) as string[] : [];
    const notifiedSet = new Set(notified);

    const distanceMilestones = [5, 10, 21, 42, 100, 250, 500, 1000, 2500, 5000];
    const activityMilestones = [5, 10, 25, 50, 100, 250, 500, 1000];
    const distanceHit = distanceMilestones.find((value) => totalDistanceKm >= value && !notifiedSet.has(`distance:${value}`));
    const activityHit = activityMilestones.find((value) => totalActivities >= value && !notifiedSet.has(`activities:${value}`));

    if (distanceHit) {
      await sendLocalNotification(
        'RunNation milestone reached',
        `You have completed ${distanceHit.toLocaleString()} km on RunNation. Keep building the streak.`,
        { type: 'activity_milestone', milestoneType: 'distance', value: distanceHit }
      );
      notifiedSet.add(`distance:${distanceHit}`);
    }

    if (activityHit) {
      await sendLocalNotification(
        'Activity milestone reached',
        `You have recorded ${activityHit.toLocaleString()} activities on RunNation. Nice consistency.`,
        { type: 'activity_milestone', milestoneType: 'activities', value: activityHit }
      );
      notifiedSet.add(`activities:${activityHit}`);
    }

    await AsyncStorage.setItem(key, JSON.stringify(Array.from(notifiedSet)));
  } catch (error) {
    console.error('[Notifications] Activity milestone check error:', error);
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

export async function checkAndNotifySubscriptionReminders(
  userId: string,
  subscriptionStatus: string,
  expiresAt?: string | null
): Promise<void> {
  try {
    if (subscriptionStatus === 'pending') {
      const key = `${STORAGE_KEYS.PENDING_SUBSCRIPTION_REMINDER}_${userId}`;
      const todayKey = toDateOnlyKey(new Date());
      const stored = await AsyncStorage.getItem(key);
      if (stored !== todayKey) {
        await sendLocalNotification(
          'Subscription payment pending',
          'Your subscription request is still pending. Refresh your status or complete payment to unlock full access.',
          { type: 'subscription_pending' }
        );
        await AsyncStorage.setItem(key, todayKey);
      }
      return;
    }

    if (subscriptionStatus !== 'active' || !expiresAt) return;

    const expires = parseDate(expiresAt);
    if (!expires) return;

    const daysRemaining = Math.ceil((startOfDay(expires).getTime() - startOfDay(new Date()).getTime()) / (1000 * 60 * 60 * 24));
    const milestones = [30, 14, 7, 1, 0];
    const key = `${STORAGE_KEYS.SUBSCRIPTION_NOTIFIED_MILESTONES}_${userId}`;
    const stored = await AsyncStorage.getItem(key);
    const notified: string[] = stored ? JSON.parse(stored) : [];

    for (const milestone of milestones) {
      const marker = `${expiresAt}:${milestone}`;
      if (daysRemaining <= milestone && daysRemaining >= 0 && !notified.includes(marker)) {
        await sendLocalNotification(
          milestone === 0 ? 'Subscription expires today' : 'Subscription renewal reminder',
          milestone === 0
            ? 'Your RunNation subscription expires today. Renew to keep full access.'
            : `Your RunNation subscription expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`,
          { type: 'subscription_expiry', daysRemaining }
        );
        notified.push(marker);
        break;
      }
    }

    await AsyncStorage.setItem(key, JSON.stringify(notified));
  } catch (error) {
    console.error('[Notifications] Subscription reminder error:', error);
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
