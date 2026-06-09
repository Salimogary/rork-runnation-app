import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";

export const QUERY_CACHE_STORAGE_KEY = "runnation_query_cache_v1";
let activeQueryClient: QueryClient | null = null;

export function registerActiveQueryClient(queryClient: QueryClient | null): void {
  activeQueryClient = queryClient;
}

export async function clearPersistedQueryCache(): Promise<void> {
  activeQueryClient?.clear();
  try {
    await AsyncStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
  } catch (error) {
    console.warn("[QueryCache] Could not clear persisted cache:", error);
  }
}
