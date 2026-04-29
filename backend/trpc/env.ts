type RuntimeEnv = "development" | "test" | "production";

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required backend environment variable: ${name}`);
  }
  return value;
}

function readOptionalNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid numeric backend environment variable: ${name}`);
  }
  return value;
}

function readRuntimeEnv(): RuntimeEnv {
  const value = (process.env.NODE_ENV || "development").trim();
  if (value === "production" || value === "test" || value === "development") {
    return value;
  }
  return "development";
}

function readCorsOrigins(runtimeEnv: RuntimeEnv): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();

  if (!raw) {
    if (runtimeEnv === "production") {
      throw new Error("CORS_ORIGINS must be set in production.");
    }
    return ["http://localhost:8081", "http://localhost:19006", "runnation://auth/callback"];
  }

  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.includes("*")) {
    throw new Error("CORS_ORIGINS must not contain '*' because this backend uses privileged credentials.");
  }

  if (origins.length === 0) {
    throw new Error("CORS_ORIGINS must include at least one origin.");
  }

  return origins;
}

const runtimeEnv = readRuntimeEnv();

export const env = {
  nodeEnv: runtimeEnv,
  isProduction: runtimeEnv === "production",
  supabaseUrl: readRequiredEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  corsOrigins: readCorsOrigins(runtimeEnv),
  trustProxy: process.env.TRUST_PROXY === "true",
  port: readOptionalNumber("PORT", 3000),
  rateLimitWindowMs: readOptionalNumber("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  rateLimitGeneralMax: readOptionalNumber("RATE_LIMIT_GENERAL_MAX", 300),
  rateLimitSensitiveMax: readOptionalNumber("RATE_LIMIT_SENSITIVE_MAX", 25),
  inputMaxStringLength: readOptionalNumber("INPUT_MAX_STRING_LENGTH", 10000),
};
