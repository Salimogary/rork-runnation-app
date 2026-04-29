import AsyncStorage from "@react-native-async-storage/async-storage";

const ACTIVITY_VOICE_ASSISTANT_KEY = "activity_voice_assistant_enabled";

export const getActivityVoiceAssistantEnabled = async (): Promise<boolean> => {
  const stored = await AsyncStorage.getItem(ACTIVITY_VOICE_ASSISTANT_KEY);
  return stored !== "false";
};

export const setActivityVoiceAssistantEnabled = async (enabled: boolean): Promise<void> => {
  await AsyncStorage.setItem(ACTIVITY_VOICE_ASSISTANT_KEY, enabled ? "true" : "false");
};
