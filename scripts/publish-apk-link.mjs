import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");

  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnvFile(path.resolve(".env"));
loadEnvFile(path.resolve("backend", ".env"));

function getArg(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return String(process.argv[index + 1] || "").trim();
  return "";
}

function requireValue(value, label) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const apkUrl = requireValue(getArg("url"), "--url");
const buildNumber = Number(requireValue(getArg("build"), "--build"));
const supabaseUrl = requireValue(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
  "SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL"
);
const serviceRoleKey = requireValue(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");

if (!isHttpUrl(apkUrl)) {
  throw new Error(`--url must be a valid http(s) URL. Received: ${apkUrl}`);
}

if (!Number.isInteger(buildNumber) || buildNumber <= 0) {
  throw new Error(`--build must be a positive integer. Received: ${buildNumber}`);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function upsertSetting(key, value, description) {
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      {
        key,
        value: String(value),
        description,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

  if (error) {
    throw new Error(`Could not update ${key}: ${error.message}`);
  }
}

await upsertSetting("android_apk_url", apkUrl, "Current RunNation Android APK share link.");
await upsertSetting(
  "android_apk_build_number",
  buildNumber,
  "Latest Android APK build number. Increase this when publishing a newer APK for testers."
);

console.log(`Published Android APK build ${buildNumber}`);
console.log(apkUrl);
