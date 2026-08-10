import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { getServerClient } from "@/lib/server-client";

const OFFLINE_WORKOUT_QUEUE_KEY = "runnation_offline_workout_queue_v1";

export type OfflineWorkoutActivity = {
  activity_id: string;
  registration_id: string;
  activity_date: string;
  exercise_type: string;
  distance_km: number;
  steps_count?: number | null;
  pause_duration_seconds: number;
  start_time: string;
  end_time: string;
  pace_min_per_km: number;
};

export type OfflineWorkoutEventResult = {
  eventId: string;
  registrationId: string;
  distanceKm: number;
  timeSeconds: number;
};

export type OfflineWorkoutSnapshot = {
  startTimeIso: string;
  durationSeconds: number;
  pauseDurationSeconds: number;
  distanceKm: number;
  coordinates: { latitude: number; longitude: number }[];
};

export type OfflineWorkoutQueueItem = {
  queueId: string;
  createdAt: string;
  activity: OfflineWorkoutActivity;
  eventResults: OfflineWorkoutEventResult[];
  snapshot: OfflineWorkoutSnapshot;
};

async function readQueue(): Promise<OfflineWorkoutQueueItem[]> {
  try {
    const stored = await AsyncStorage.getItem(OFFLINE_WORKOUT_QUEUE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[Offline Workout] Could not read sync queue:", error);
    return [];
  }
}

async function writeQueue(items: OfflineWorkoutQueueItem[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_WORKOUT_QUEUE_KEY, JSON.stringify(items));
}

export async function enqueueOfflineWorkout(item: OfflineWorkoutQueueItem): Promise<number> {
  const queue = await readQueue();
  const nextQueue = [
    ...queue.filter((queued) => queued.activity.activity_id !== item.activity.activity_id),
    item,
  ];
  await writeQueue(nextQueue);
  return nextQueue.length;
}

export async function getOfflineWorkoutQueueCount(): Promise<number> {
  return (await readQueue()).length;
}

async function syncActivity(activity: OfflineWorkoutActivity): Promise<void> {
  const { error } = await supabase
    .from("activities")
    .upsert(activity, { onConflict: "activity_id" });

  if (error) throw error;
}

async function syncEventResults(results: OfflineWorkoutEventResult[]): Promise<void> {
  for (const result of results) {
    await getServerClient().activities.completeEventRun.mutate(result);
  }
}

export async function syncOfflineWorkouts(): Promise<{
  synced: number;
  pending: number;
  lastError: string | null;
}> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return { synced: 0, pending: 0, lastError: null };
  }

  const remaining: OfflineWorkoutQueueItem[] = [];
  let synced = 0;
  let lastError: string | null = null;

  for (const item of queue) {
    try {
      await syncActivity(item.activity);
      await syncEventResults(item.eventResults);
      synced += 1;
    } catch (error) {
      remaining.push(item);
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  await writeQueue(remaining);
  return { synced, pending: remaining.length, lastError };
}
