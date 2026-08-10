import { Platform, useWindowDimensions } from "react-native";

export function useIsWatchDisplay() {
  const { width, height } = useWindowDimensions();
  const shortest = Math.min(width, height);
  const longest = Math.max(width, height);

  if (Platform.OS === "android") {
    return shortest <= 390 && longest <= 480;
  }

  if (Platform.OS === "web") {
    return shortest <= 420 && longest <= 520;
  }

  return false;
}
