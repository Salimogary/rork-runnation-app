import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppRatingSentiment = "love" | "good" | "needs_improvement";

export interface AppRatingPromptState {
  lastPromptedAt?: string;
  lastSubmittedAt?: string;
  lastSentiment?: AppRatingSentiment;
}

const APP_RATING_PROMPT_PREFIX = "runnation_app_rating_prompt";
export const APP_RATING_PROMPT_COOLDOWN_DAYS = 183;

export function getAppRatingPromptStorageKey(registrationId: string): string {
  return `${APP_RATING_PROMPT_PREFIX}_${registrationId}`;
}

export async function getAppRatingPromptState(registrationId: string): Promise<AppRatingPromptState> {
  try {
    const stored = await AsyncStorage.getItem(getAppRatingPromptStorageKey(registrationId));
    if (!stored) return {};
    return JSON.parse(stored) as AppRatingPromptState;
  } catch (error) {
    console.warn("[App Rating] Could not read prompt state:", error);
    return {};
  }
}

export async function setAppRatingPromptState(
  registrationId: string,
  nextState: AppRatingPromptState
): Promise<void> {
  try {
    const current = await getAppRatingPromptState(registrationId);
    await AsyncStorage.setItem(
      getAppRatingPromptStorageKey(registrationId),
      JSON.stringify({ ...current, ...nextState })
    );
  } catch (error) {
    console.warn("[App Rating] Could not save prompt state:", error);
  }
}

export function isWithinAppRatingCooldown(value?: string | null): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp < APP_RATING_PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}
