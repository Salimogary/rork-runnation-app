import type { NextFunction, Request, Response } from "express";
import { env } from "./trpc/env";

const WINDOW_MS = env.rateLimitWindowMs;
const GENERAL_LIMIT = env.rateLimitGeneralMax;
const SENSITIVE_LIMIT = env.rateLimitSensitiveMax;
const MAX_STRING_LENGTH = env.inputMaxStringLength;

const skippedSanitizeKeys = new Set([
  "attachmentBase64",
  "evidenceImageBase64",
  "fileContent",
  "imageBase64",
  "magazinePhotoBase64",
  "newPassword",
  "password",
  "photoBase64",
  "pin",
  "posterBase64",
  "refreshToken",
  "screenshotBase64",
  "token",
]);

const sensitiveProcedureMarkers = [
  "admin.requestPasswordReset",
  "admin.resetPassword",
  "auth.createAuthUser",
  "auth.login",
  "auth.register",
  "feedback.submitSuggestion",
  "feedback.submitRating",
  "activities.submitExternalActivity",
  "activities.submitTreadmillActivity",
  "admin.addEvent",
  "admin.createClubProfile",
  "admin.createMagazineNewsArticle",
  "admin.createRoleRequest",
  "admin.enrollEvent",
  "admin.requestClubDeletion",
  "admin.requestRoleResignation",
  "admin.updateEvent",
  "admin.updateMagazineEntry",
  "magazine.submitArticle",
  "magazine.submitPictorial",
  "profile.leaveClubMembership",
  "profile.saveClubMembership",
  "profile.sendEmailVerification",
  "profile.uploadPhoto",
  "serviceTeam.requestRole",
  "social.addComment",
  "social.createPost",
  "social.reportContent",
  "support.submitDonation",
  "family.addMember",
  "profile.verifyEmailCode",
  "profile.verifyPin",
];

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function getRateLimitKey(req: Request): { key: string; limit: number } {
  const url = req.originalUrl || req.url;
  const isSensitive = sensitiveProcedureMarkers.some((marker) => url.includes(marker));
  const auth = req.headers.authorization;
  const principal = typeof auth === "string" && auth.startsWith("Bearer ")
    ? auth.slice(0, 28)
    : getClientIp(req);

  return {
    key: `${isSensitive ? "sensitive" : "general"}:${principal}`,
    limit: isSensitive ? SENSITIVE_LIMIT : GENERAL_LIMIT,
  };
}

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const { key, limit } = getRateLimitKey(req);
  const existing = rateBuckets.get(key);
  const bucket = existing && existing.resetAt > now
    ? existing
    : { count: 0, resetAt: now + WINDOW_MS };

  bucket.count += 1;
  rateBuckets.set(key, bucket);

  if (bucket.count > limit) {
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({
      error: "Too many requests. Please wait a moment and try again.",
    });
  }

  if (rateBuckets.size > 5000) {
    for (const [bucketKey, value] of rateBuckets.entries()) {
      if (value.resetAt <= now) rateBuckets.delete(bucketKey);
    }
  }

  next();
}

function sanitizeString(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, MAX_STRING_LENGTH);
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    if (key && skippedSanitizeKeys.has(key)) return value;
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      output[entryKey] = sanitizeValue(entryValue, entryKey);
    }
    return output;
  }

  return value;
}

export function sanitizeJsonBody(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  next();
}

export function getAllowedCorsOrigins(): string[] {
  return env.corsOrigins;
}
