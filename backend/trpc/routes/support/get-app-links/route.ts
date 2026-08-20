import { publicProcedure } from "../../../create-context";

const FALLBACK_ANDROID_APK_URL = "https://drive.google.com/file/d/1bAThGh2w8YR69wHKdmJwGtC5HAZfySkB/view?usp=drive_link";
const SETTINGS_KEYS = ["android_apk_url", "android_apk_build_number", "ios_app_url", "ios_build_number"] as const;

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
    .select("key, value, updated_at")
    .in("key", SETTINGS_KEYS);

  if (error) {
    console.warn("[AppLinks] Could not load app settings:", error.message);
  }

  const rows = Array.isArray(data) ? data : [];
  const settings = new Map(rows.map((row: any) => [String(row.key), row.value]));
  const updatedAt = new Map(rows.map((row: any) => [String(row.key), row.updated_at || null]));
  const androidApkUrl = cleanUrl(settings.get("android_apk_url")) || FALLBACK_ANDROID_APK_URL;
  const androidBuildNumber = Number(settings.get("android_apk_build_number")) || null;
  const iosAppUrl = cleanUrl(settings.get("ios_app_url"));
  const iosBuildNumber = Number(settings.get("ios_build_number")) || null;

  return {
    androidApkUrl,
    androidBuildNumber,
    androidUpdatedAt: updatedAt.get("android_apk_url") || null,
    iosAppUrl,
    iosBuildNumber,
    iosUpdatedAt: updatedAt.get("ios_app_url") || null,
    iosComingSoon: !iosAppUrl,
  };
});
