import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { v4 as uuidv4 } from "uuid";

import { getServerClient } from "@/lib/server-client";

const CRASH_LOG_FILE = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}runnation-crash-log.jsonl`;
const MAX_LOCAL_REPORTS = 100;
const SYNC_BATCH_SIZE = 20;

type CrashReport = {
  reportId: string;
  registrationId: string | null;
  occurredAt: string;
  errorName: string;
  message: string;
  stack: string | null;
  componentStack: string | null;
  fatal: boolean;
  platform: string;
  osVersion: string;
  appVersion: string;
  buildNumber: string;
  source: string;
};

let currentRegistrationId: string | null = null;
let initialized = false;
let syncInProgress = false;
let logOperation = Promise.resolve();

function withLogLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = logOperation.then(operation, operation);
  logOperation = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function cleanText(value: unknown, maxLength: number): string | null {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : null;
}

async function readReports(): Promise<CrashReport[]> {
  try {
    const file = await FileSystem.getInfoAsync(CRASH_LOG_FILE);
    if (!file.exists) return [];
    const contents = await FileSystem.readAsStringAsync(CRASH_LOG_FILE);
    return contents
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CrashReport)
      .slice(-MAX_LOCAL_REPORTS);
  } catch (error) {
    console.warn("[CrashReporter] Could not read local crash log:", error);
    return [];
  }
}

async function writeReports(reports: CrashReport[]): Promise<void> {
  const contents = reports.slice(-MAX_LOCAL_REPORTS).map((report) => JSON.stringify(report)).join("\n");
  await FileSystem.writeAsStringAsync(CRASH_LOG_FILE, contents ? `${contents}\n` : "");
}

export function setCrashReporterRegistrationId(registrationId: string | null | undefined): void {
  currentRegistrationId = registrationId || null;
}

export async function recordCrash(
  error: unknown,
  options: {
    fatal?: boolean;
    source?: string;
    componentStack?: string | null;
  } = {}
): Promise<void> {
  try {
    const normalizedError = error instanceof Error ? error : new Error(String(error || "Unknown error"));
    const report: CrashReport = {
      reportId: uuidv4(),
      registrationId: currentRegistrationId,
      occurredAt: new Date().toISOString(),
      errorName: cleanText(normalizedError.name, 120) || "Error",
      message: cleanText(normalizedError.message, 2000) || "Unknown error",
      stack: cleanText(normalizedError.stack, 12000),
      componentStack: cleanText(options.componentStack, 12000),
      fatal: options.fatal === true,
      platform: Platform.OS,
      osVersion: cleanText(Platform.Version, 120) || "unknown",
      appVersion: Constants.expoConfig?.version || "unknown",
      buildNumber:
        String(Constants.nativeBuildVersion || Constants.expoConfig?.android?.versionCode || "unknown"),
      source: cleanText(options.source, 120) || "javascript",
    };
    await withLogLock(async () => {
      const reports = await readReports();
      await writeReports([...reports, report]);
    });
    void syncCrashReports();
  } catch (writeError) {
    console.warn("[CrashReporter] Could not persist crash:", writeError);
  }
}

export async function syncCrashReports(): Promise<number> {
  if (syncInProgress) return 0;
  syncInProgress = true;
  try {
    const batch = await withLogLock(async () => {
      const reports = await readReports();
      return reports.slice(0, SYNC_BATCH_SIZE);
    });
    if (batch.length === 0) return 0;

    await getServerClient().support.submitCrashReports.mutate({ reports: batch });
    const acceptedIds = new Set(batch.map((report) => report.reportId));
    await withLogLock(async () => {
      const currentReports = await readReports();
      await writeReports(currentReports.filter((report) => !acceptedIds.has(report.reportId)));
    });
    return batch.length;
  } catch (error) {
    console.warn("[CrashReporter] Crash reports remain stored locally:", error);
    return 0;
  } finally {
    syncInProgress = false;
  }
}

export function initializeCrashReporter(): () => void {
  if (initialized) return () => {};
  initialized = true;

  const errorUtils = (globalThis as any).ErrorUtils;
  const previousHandler = errorUtils?.getGlobalHandler?.();
  if (errorUtils?.setGlobalHandler) {
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      void recordCrash(error, { fatal: isFatal === true, source: "global_error_handler" });
      previousHandler?.(error, isFatal);
    });
  }

  const webRejectionHandler = (event: PromiseRejectionEvent) => {
    void recordCrash(event.reason, { fatal: false, source: "unhandled_promise_rejection" });
  };
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.addEventListener("unhandledrejection", webRejectionHandler);
  }

  void syncCrashReports();
  const appStateSubscription = AppState.addEventListener("change", (state) => {
    if (state === "active") void syncCrashReports();
  });

  return () => {
    appStateSubscription.remove();
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.removeEventListener("unhandledrejection", webRejectionHandler);
    }
    if (errorUtils?.setGlobalHandler && previousHandler) {
      errorUtils.setGlobalHandler(previousHandler);
    }
    initialized = false;
  };
}
