const appJson = require("./app.json");

const androidMapsApiKey =
  process.env.GOOGLE_MAPS_ANDROID_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ||
  "";

const expoConfig = {
  ...appJson.expo,
  extra: {
    ...(appJson.expo.extra || {}),
    eas: {
      ...(appJson.expo.extra?.eas || {}),
      projectId: "1d655aca-1c74-48a0-94a3-ca51f41ab4f4",
    },
  },
};

if (androidMapsApiKey) {
  expoConfig.android = {
    ...expoConfig.android,
    config: {
      ...(expoConfig.android?.config || {}),
      googleMaps: {
        apiKey: androidMapsApiKey,
      },
    },
  };
}

module.exports = expoConfig;
