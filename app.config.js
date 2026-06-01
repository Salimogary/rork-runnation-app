const appJson = require("./app.json");

const androidMapsApiKey =
  process.env.GOOGLE_MAPS_ANDROID_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ||
  "";

const expoConfig = {
  ...appJson.expo,
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
