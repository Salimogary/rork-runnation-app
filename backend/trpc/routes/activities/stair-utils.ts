import crypto from "crypto";

export type StairCheckpointType = "bottom" | "middle" | "top";
export type StairScanStatus = "pending" | "verified" | "accepted" | "partially_verified" | "manual_review" | "rejected";

export function createCheckpointToken(): string {
  return `rn-stairs-${crypto.randomBytes(24).toString("base64url")}`;
}

export function normalizeCheckpointToken(rawToken: string): string {
  const trimmed = rawToken.trim();
  const marker = "rn-stairs-";
  const markerIndex = trimmed.indexOf(marker);
  return markerIndex >= 0 ? trimmed.slice(markerIndex) : trimmed;
}

export function hashCheckpointToken(rawToken: string): string {
  return crypto.createHash("sha256").update(normalizeCheckpointToken(rawToken)).digest("hex");
}

export function qrPayloadForToken(token: string): string {
  return `runnation://stairs/checkpoint?token=${encodeURIComponent(token)}`;
}

export function secondsBetween(start: string | Date, end: string | Date): number {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

export function summarizeSegmentVerification(input: {
  durationSeconds: number;
  minimumDurationSeconds: number;
  maximumDurationSeconds: number;
  movementActiveSeconds?: number | null;
  sensorDataCoverage?: number | null;
}): { status: StairScanStatus; reason: string | null; movementRatio: number; coverage: number } {
  const movementActiveSeconds = Math.max(0, Math.floor(input.movementActiveSeconds ?? input.durationSeconds));
  const movementRatio = input.durationSeconds > 0 ? Math.min(1, movementActiveSeconds / input.durationSeconds) : 0;
  const coverage = Math.max(0, Math.min(1, Number(input.sensorDataCoverage ?? 1)));

  if (input.durationSeconds < input.minimumDurationSeconds) {
    return { status: "rejected", reason: "DURATION_TOO_SHORT", movementRatio, coverage };
  }
  if (input.durationSeconds > input.maximumDurationSeconds) {
    return { status: "manual_review", reason: "DURATION_TOO_LONG", movementRatio, coverage };
  }
  if (coverage < 0.5) {
    return { status: "manual_review", reason: "INSUFFICIENT_SENSOR_DATA", movementRatio, coverage };
  }
  if (movementRatio < 0.35) {
    return { status: "manual_review", reason: "INSUFFICIENT_MOVEMENT", movementRatio, coverage };
  }

  return { status: "accepted", reason: null, movementRatio, coverage };
}
