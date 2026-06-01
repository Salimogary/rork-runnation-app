import Constants from "expo-constants";
import { Platform } from "react-native";

function isLoopbackUrl(value: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value);
}

export const getBaseUrl = () => {
  if (!__DEV__) {
    const productionUrl = process.env.EXPO_PUBLIC_API_URL_PROD;
    if (!productionUrl) {
      throw new Error("Missing EXPO_PUBLIC_API_URL_PROD for production builds.");
    }

    return productionUrl;
  }

  const envUrl = process.env.EXPO_PUBLIC_API_URL;

  if (Platform.OS === "web") {
    if (envUrl) {
      return envUrl;
    }

    return window.location.origin;
  }

  if (envUrl && !isLoopbackUrl(envUrl)) {
    return envUrl;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.manifest2?.extra?.expoClient?.hostUri;

  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:3000`;
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:3000";
  }

  return "http://localhost:3000";
};
