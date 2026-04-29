import Constants from "expo-constants";
import { Platform } from "react-native";

export const getBaseUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    return envUrl;
  }

  if (Platform.OS === "web") {
    return window.location.origin;
  }

  if (__DEV__) {
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
  }

  const productionUrl = process.env.EXPO_PUBLIC_API_URL_PROD;
  if (!productionUrl) {
    throw new Error("Missing EXPO_PUBLIC_API_URL_PROD for production builds.");
  }

  return productionUrl;
};
