import AsyncStorage from "@react-native-async-storage/async-storage";

const WORKOUT_AUTO_PAUSE_ENABLED_KEY = "workout_auto_pause_enabled";

export async function getWorkoutAutoPauseEnabled(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(WORKOUT_AUTO_PAUSE_ENABLED_KEY);
  return stored !== "false";
}

export async function setWorkoutAutoPauseEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(WORKOUT_AUTO_PAUSE_ENABLED_KEY, String(enabled));
}

