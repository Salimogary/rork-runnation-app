import { publicProcedure } from "../../../create-context";

const FALLBACK_ANDROID_APK_URL = "https://expo.dev/artifacts/eas/27LbCHM76M74izfEPYt1pN.apk";
const SETTINGS_KEYS = ["android_apk_url", "ios_app_url"] as const;

function cleanUrl(value: unknown): string | null {
  const text = String(value || "").trim();
  if (!text) return null;

  try {
    const url = new URL(text);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

export default publicProcedure.query(async ({ ctx }) => {
  const { data, error } = await ctx.supabase
    .from("app_settings")
    .select("key, value")
    .in("key", SETTINGS_KEYS);

  if (error) {
    console.warn("[AppLinks] Could not load app settings:", error.message);
  }

  const rows = Array.isArray(data) ? data : [];
  const settings = new Map(rows.map((row: any) => [String(row.key), row.value]));
  const androidApkUrl = cleanUrl(settings.get("android_apk_url")) || FALLBACK_ANDROID_APK_URL;
  const iosAppUrl = cleanUrl(settings.get("ios_app_url"));

  return {
    androidApkUrl,
    iosAppUrl,
    iosComingSoon: !iosAppUrl,
  };
});
