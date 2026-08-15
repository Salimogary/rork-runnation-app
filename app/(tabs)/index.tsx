import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Platform, Modal, TextInput, Alert, Image, AppState, AppStateStatus, AccessibilityInfo, Share, Animated, Easing } from "react-native";
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Play, Pause, Square, Footprints, Dumbbell, Upload, X, Timer, Gauge, Watch, Smartphone, ChevronRight, Heart, Activity, Droplets, Flame, Stethoscope, Bike, ArrowLeft, Share2, Save, Check, Camera, Building2, QrCode, Printer, Search, Filter, Plus, Download } from "lucide-react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as ImagePicker from "expo-image-picker";
import * as Speech from "expo-speech";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Accelerometer } from "expo-sensors";
import MapView, { Circle, Polyline } from "react-native-maps";
import Svg, { Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import colors from "@/constants/colors";
import { WORLD_COUNTRIES } from "@/constants/countries";
import { formatCountryName } from "@/constants/country-utils";
import WatchRunExperience from "@/components/WatchRunExperience";
import { useIsWatchDisplay } from "@/utils/useWatchDisplay";
import { getServerClient } from "@/lib/server-client";
import { trpc } from "@/lib/trpc";
import { getActivityVoiceAssistantEnabled } from "@/utils/activityVoice";
import { getWorkoutAutoPauseEnabled } from "@/utils/workoutPreferences";
import { getEarnedBadgeCount } from "@/utils/badges";
import { checkAndNotifyWorkoutMilestones } from "@/utils/notifications";
import {
  enqueueOfflineWorkout,
  getOfflineWorkoutQueueCount,
  syncOfflineWorkouts,
} from "@/utils/offlineWorkoutQueue";
import MyWorkouts from "@/components/MyWorkouts";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type RunState = "idle" | "running" | "paused" | "finished";
type ExerciseType = "Walk" | "Run" | "Cycle" | "Treadmill" | "Stairs" | null;
type WorkoutTab = "record" | "event" | "sources";
type StairScanMode = "short" | "full";

type ActiveStairSession = {
  sessionId: string;
  lapId?: string | null;
  buildingName?: string | null;
  routeName?: string | null;
  routeId?: string | null;
  nextCheckpoint?: string | null;
  completedAscents: number;
  verifiedSteps: number;
  startedAt: Date;
  lastMessage: string;
};

function StaircaseIcon({ size = 28, color = "#FFFFFF" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 20h16" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M5 17h4v-4h4V9h4V5h2" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6 5h5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M8.5 5v8" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}

interface RegisteredEventRun {
  eventId: string;
  eventIds?: string[];
  eventName: string;
  startsAt: string | null;
  endsAt: string | null;
  eventType?: string | null;
  recurrenceFrequency?: string | null;
  recurrenceWeekday?: number | null;
  sharedCountMessage?: string | null;
  distanceKm?: number | null;
  timeSeconds?: number | null;
}

interface RunnerProfile {
  name: string;
  town: string;
  country: string;
  countryFlag: string;
  club: string;
  photoUrl: string | null;
}

interface WorkoutLocationDetails {
  locality: string;
  country: string;
  countryCode: string;
  countryFlag: string;
}

type MergeWorkoutBase = {
  activityId: string;
  activityDate: string;
  exerciseType: Exclude<ExerciseType, null>;
  distanceKm: number;
  durationSeconds: number;
  pauseDurationSeconds: number;
  startTime: string;
  endTime: string;
  startedAt: string;
  endedAt: string;
};

type ImportanceLevel = "VERY HIGH" | "HIGH" | "MEDIUM" | "LOW";

interface SmartWatchField {
  key: string;
  label: string;
  placeholder: string;
  importance: ImportanceLevel;
  keyboardType: "numeric" | "default";
  icon: React.ReactNode;
}

const toRad = (value: number): number => {
  return (value * Math.PI) / 180;
};

const calculateDistance = (coord1: Coordinates, coord2: Coordinates): number => {
  const R = 6371;
  const dLat = toRad(coord2.latitude - coord1.latitude);
  const dLon = toRad(coord2.longitude - coord1.longitude);
  const lat1 = toRad(coord1.latitude);
  const lat2 = toRad(coord2.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const GPS_ACCURACY_THRESHOLD = 100;
const MAX_SPEED_KMH_RUN = 45;
const MAX_SPEED_KMH_WALK = 15;
const MAX_SPEED_KMH_CYCLE = 70;
const MIN_DISTANCE_BETWEEN_POINTS = 0.002;
const MIN_DISTANCE_ACTIVITY = 0.5;
const MIN_DISTANCE_WALK = MIN_DISTANCE_ACTIVITY;
const MIN_DISTANCE_RUN = MIN_DISTANCE_ACTIVITY;
const MIN_ACTIVITY_DURATION_MINUTES = 5;
const ABNORMAL_SPEED_MIN_DISTANCE_KM = 1;
const ABNORMAL_SPEED_KM_PER_MINUTE = 2.3;
const KM_VOICE_ANNOUNCEMENT_INTERVAL = 1;
const AUTO_PAUSE_STATIONARY_SECONDS = 60;
const AUTO_PAUSE_ACCURACY_THRESHOLD = 50;
const AUTO_PAUSE_MAX_SPEED_KMH = 1.2;
const AUTO_RESUME_MIN_SPEED_KMH = 1.5;
const AUTO_RESUME_MIN_DISTANCE_KM = 0.004;
const FINISH_LONG_PRESS_MS = 900;
const BACKGROUND_LOCATION_TASK = "runnation-background-location";
const ACTIVE_WORKOUT_SESSION_KEY = "runnation_active_workout_session";
const REGISTERED_EVENTS_CACHE_PREFIX = "runnation_registered_events";
const MAX_ROUTE_POINTS = 5000;
const FOREGROUND_LOCATION_INTERVAL_MS = 3000;
const FOREGROUND_LOCATION_DISTANCE_METERS = 3;
const BACKGROUND_LOCATION_INTERVAL_MS = 5000;
const BACKGROUND_LOCATION_DISTANCE_METERS = 5;
const WORKOUT_COUNTDOWN_MS = 3200;
const RUNNATION_ANDROID_APK_LINK = "https://expo.dev/artifacts/eas/27LbCHM76M74izfEPYt1pN.apk";

type BackgroundLocationPayload = {
  locations?: Location.LocationObject[];
};

type PersistedWorkoutStatus = "pending" | "running" | "paused" | "finished";

type PersistedWorkoutSession = {
  id: string;
  registrationId?: string;
  status: PersistedWorkoutStatus;
  exerciseType: Exclude<ExerciseType, null>;
  eventRun: RegisteredEventRun | null;
  startTimeIso: string;
  startTimestamp: number;
  runningStartTimestamp: number | null;
  elapsedBeforePause: number;
  pauseStartTimestamp: number | null;
  totalPauseDuration: number;
  pauseDurationSeconds: number;
  autoPaused: boolean;
  autoPauseEnabled?: boolean;
  stationaryStartTimestamp?: number | null;
  autoPauseAnchorPoint?: LocationPoint | null;
  distance: number;
  coords: Coordinates[];
  lastValidPoint: LocationPoint | null;
  lastProcessedLocationTimestamp: number | null;
  filteredPointCount: number;
  mergeBase?: MergeWorkoutBase | null;
  updatedAt: number;
};

let backgroundLocationHandler: ((location: Location.LocationObject) => Promise<void>) | null = null;
let pendingPersistedWorkoutSession: PersistedWorkoutSession | null = null;
let persistedWorkoutWritePromise: Promise<void> | null = null;

function startPersistedWorkoutWrite(): Promise<void> {
  if (persistedWorkoutWritePromise) {
    return persistedWorkoutWritePromise;
  }

  persistedWorkoutWritePromise = (async () => {
    while (pendingPersistedWorkoutSession) {
      const session = pendingPersistedWorkoutSession;
      pendingPersistedWorkoutSession = null;
      try {
        await AsyncStorage.setItem(ACTIVE_WORKOUT_SESSION_KEY, JSON.stringify(session));
      } catch (error) {
        console.warn("[Workout Persistence] Could not persist active workout:", error);
      }
    }
  })().finally(() => {
    persistedWorkoutWritePromise = null;
    if (pendingPersistedWorkoutSession) {
      void startPersistedWorkoutWrite();
    }
  });

  return persistedWorkoutWritePromise;
}

async function getPersistedWorkoutSession(): Promise<PersistedWorkoutSession | null> {
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_WORKOUT_SESSION_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as PersistedWorkoutSession;
  } catch (error) {
    console.warn("[Workout Persistence] Could not read active workout:", error);
    return null;
  }
}

async function setPersistedWorkoutSession(session: PersistedWorkoutSession): Promise<void> {
  pendingPersistedWorkoutSession = {
    ...session,
    coords: session.coords.slice(-MAX_ROUTE_POINTS),
    updatedAt: Date.now(),
  };
  await startPersistedWorkoutWrite();
}

async function clearPersistedWorkoutSession(): Promise<void> {
  try {
    pendingPersistedWorkoutSession = null;
    if (persistedWorkoutWritePromise) {
      await persistedWorkoutWritePromise;
    }
    await AsyncStorage.removeItem(ACTIVE_WORKOUT_SESSION_KEY);
  } catch (error) {
    console.warn("[Workout Persistence] Could not clear active workout:", error);
  }
}

function maxSpeedForExercise(exerciseT: ExerciseType): number {
  if (exerciseT === "Walk") return MAX_SPEED_KMH_WALK;
  if (exerciseT === "Cycle") return MAX_SPEED_KMH_CYCLE;
  return MAX_SPEED_KMH_RUN;
}

function isAbnormallyFastWalkOrRun(
  exerciseT: ExerciseType,
  distanceKm: number,
  durationSeconds: number
): boolean {
  if (exerciseT !== "Walk" && exerciseT !== "Run") return false;
  if (distanceKm <= ABNORMAL_SPEED_MIN_DISTANCE_KM || durationSeconds <= 0) return false;
  return distanceKm / (durationSeconds / 60) > ABNORMAL_SPEED_KM_PER_MINUTE;
}

function isValidPersistedPoint(session: PersistedWorkoutSession, point: LocationPoint): boolean {
  if (point.accuracy !== null && point.accuracy > GPS_ACCURACY_THRESHOLD) return false;
  if (!session.lastValidPoint) return true;

  const dist = calculateDistance(
    { latitude: session.lastValidPoint.latitude, longitude: session.lastValidPoint.longitude },
    { latitude: point.latitude, longitude: point.longitude }
  );
  if (dist < MIN_DISTANCE_BETWEEN_POINTS) return false;

  const timeDiffHours = (point.timestamp - session.lastValidPoint.timestamp) / (1000 * 3600);
  if (timeDiffHours > 0) {
    const speedKmh = dist / timeDiffHours;
    return speedKmh <= maxSpeedForExercise(session.exerciseType);
  }

  return true;
}

async function processPersistedBackgroundLocation(location: Location.LocationObject): Promise<void> {
  const session = await getPersistedWorkoutSession();
  if (!session || (session.status === "paused" && !session.autoPaused) || session.status === "finished") return;
  if (
    session.lastProcessedLocationTimestamp !== null &&
    location.timestamp <= session.lastProcessedLocationTimestamp
  ) {
    return;
  }

  if (session.status === "pending" && location.timestamp < session.startTimestamp) {
    session.lastProcessedLocationTimestamp = location.timestamp;
    await setPersistedWorkoutSession(session);
    return;
  }

  const point: LocationPoint = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    timestamp: location.timestamp,
  };

  if (point.accuracy !== null && point.accuracy > GPS_ACCURACY_THRESHOLD) {
    session.filteredPointCount += 1;
    session.lastProcessedLocationTimestamp = location.timestamp;
    await setPersistedWorkoutSession(session);
    return;
  }

  if (point.accuracy !== null && point.accuracy > AUTO_PAUSE_ACCURACY_THRESHOLD) {
    session.lastProcessedLocationTimestamp = location.timestamp;
    await setPersistedWorkoutSession(session);
    return;
  }

  const movementAnchor = session.autoPauseAnchorPoint ?? session.lastValidPoint;
  const movementDistanceKm = movementAnchor
    ? calculateDistance(
        { latitude: movementAnchor.latitude, longitude: movementAnchor.longitude },
        { latitude: point.latitude, longitude: point.longitude }
      )
    : 0;
  const movementHours = movementAnchor
    ? (point.timestamp - movementAnchor.timestamp) / (1000 * 3600)
    : 0;
  const calculatedSpeedKmh = movementHours > 0 ? movementDistanceKm / movementHours : null;
  const nativeSpeedKmh =
    typeof location.coords.speed === "number" && location.coords.speed >= 0
      ? location.coords.speed * 3.6
      : null;
  const isMoving =
    nativeSpeedKmh !== null
      ? nativeSpeedKmh >= AUTO_RESUME_MIN_SPEED_KMH
      : movementDistanceKm >= AUTO_RESUME_MIN_DISTANCE_KM ||
        (calculatedSpeedKmh !== null && calculatedSpeedKmh >= AUTO_RESUME_MIN_SPEED_KMH);
  session.autoPauseAnchorPoint = point;

  if (isMoving) {
    session.stationaryStartTimestamp = null;
    if (session.autoPaused) {
      if (session.pauseStartTimestamp !== null) {
        session.totalPauseDuration += Math.max(0, point.timestamp - session.pauseStartTimestamp);
      }
      session.pauseStartTimestamp = null;
      session.runningStartTimestamp = point.timestamp;
      session.autoPaused = false;
      session.status = "running";
      session.lastValidPoint = point;
      session.lastProcessedLocationTimestamp = location.timestamp;
      session.coords = [...session.coords, { latitude: point.latitude, longitude: point.longitude }].slice(-MAX_ROUTE_POINTS);
      await setPersistedWorkoutSession(session);
      return;
    }
  } else if (session.autoPaused) {
    session.lastProcessedLocationTimestamp = location.timestamp;
    await setPersistedWorkoutSession(session);
    return;
  } else {
    if (session.stationaryStartTimestamp === null || session.stationaryStartTimestamp === undefined) {
      session.stationaryStartTimestamp = point.timestamp;
      session.lastProcessedLocationTimestamp = location.timestamp;
      await setPersistedWorkoutSession(session);
      return;
    }

    const stationarySeconds = (point.timestamp - session.stationaryStartTimestamp) / 1000;
    if (stationarySeconds >= AUTO_PAUSE_STATIONARY_SECONDS && session.runningStartTimestamp !== null) {
      const pauseStartedAt = Math.min(point.timestamp, session.stationaryStartTimestamp);
      session.elapsedBeforePause += Math.max(
        0,
        Math.floor((pauseStartedAt - session.runningStartTimestamp) / 1000)
      );
      session.pauseDurationSeconds = Math.floor(session.totalPauseDuration / 1000);
      session.runningStartTimestamp = null;
      session.pauseStartTimestamp = pauseStartedAt;
      session.autoPaused = true;
      session.status = "paused";
      session.lastProcessedLocationTimestamp = location.timestamp;
      await setPersistedWorkoutSession(session);
      return;
    }

    session.lastProcessedLocationTimestamp = location.timestamp;
    await setPersistedWorkoutSession(session);
    return;
  }

  if (session.autoPaused) {
    session.lastProcessedLocationTimestamp = location.timestamp;
    await setPersistedWorkoutSession(session);
    return;
  }

  if (!isValidPersistedPoint(session, point)) {
    session.filteredPointCount += 1;
    session.lastProcessedLocationTimestamp = location.timestamp;
    await setPersistedWorkoutSession(session);
    return;
  }

  const coord = { latitude: point.latitude, longitude: point.longitude };
  if (session.lastValidPoint) {
    session.distance += calculateDistance(
      { latitude: session.lastValidPoint.latitude, longitude: session.lastValidPoint.longitude },
      coord
    );
  }

  session.status = "running";
  session.lastValidPoint = point;
  session.lastProcessedLocationTimestamp = location.timestamp;
  session.coords = [...session.coords, coord].slice(-MAX_ROUTE_POINTS);
  await setPersistedWorkoutSession(session);
}

if (Platform.OS !== "web" && !TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask<BackgroundLocationPayload>(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.warn("[Background Location] Task error:", error.message);
      return;
    }

    const locations = data?.locations ?? [];
    for (const location of locations) {
      if (backgroundLocationHandler) {
        await backgroundLocationHandler(location);
      } else {
        await processPersistedBackgroundLocation(location);
      }
    }
  });
}

function timeStringToSeconds(value?: string | null): number {
  const parts = String(value || "00:00:00").split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) return 0;
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

function activityDurationSeconds(startTime?: string | null, endTime?: string | null, pauseDurationSeconds = 0): number {
  const start = timeStringToSeconds(startTime);
  let end = timeStringToSeconds(endTime);
  if (end < start) end += 24 * 60 * 60;
  return Math.max(0, end - start - Math.max(0, pauseDurationSeconds));
}

function combineActivityDateTime(activityDate: string, timeValue: string) {
  const date = new Date(`${String(activityDate).slice(0, 10)}T${timeValue || "00:00:00"}`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function localDateOnly(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const countryFlagFromCountry = (country: string | null | undefined): string => {
  if (!country) return "";

  const trimmed = country.trim();
  const matchedCode =
    trimmed.length === 2
      ? trimmed.toUpperCase()
      : WORLD_COUNTRIES.find((item) => item.name.toLowerCase() === trimmed.toLowerCase())?.iso_alpha2?.toUpperCase();

  if (!matchedCode || matchedCode.length !== 2) return "";

  return matchedCode
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
};

const IMPORTANCE_COLORS: Record<ImportanceLevel, string> = {
  "VERY HIGH": "#DC2626",
  "HIGH": "#EA580C",
  "MEDIUM": "#D97706",
  "LOW": "#6B7280",
};

const SMART_WATCH_FIELDS: SmartWatchField[] = [
  { key: "heart_rate", label: "Heart Rate", placeholder: "e.g., 72 bpm", importance: "HIGH", keyboardType: "numeric", icon: <Heart size={16} color="#EA580C" /> },
  { key: "steps", label: "Steps", placeholder: "e.g., 8500", importance: "MEDIUM", keyboardType: "numeric", icon: <Footprints size={16} color="#D97706" /> },
  { key: "distance_km", label: "Distance (km)", placeholder: "e.g., 5.2", importance: "HIGH", keyboardType: "numeric", icon: <Activity size={16} color="#EA580C" /> },
  { key: "spo2", label: "SpO2 (%)", placeholder: "e.g., 98", importance: "HIGH", keyboardType: "numeric", icon: <Droplets size={16} color="#EA580C" /> },
  { key: "calories", label: "Calories", placeholder: "e.g., 350 kcal", importance: "LOW", keyboardType: "numeric", icon: <Flame size={16} color="#6B7280" /> },
  { key: "blood_pressure", label: "Blood Pressure", placeholder: "e.g., 120/80", importance: "VERY HIGH", keyboardType: "default", icon: <Stethoscope size={16} color="#DC2626" /> },
];

function PhoneExerciseScreen() {
  const router = useRouter();
  const { user, registrationId } = useAuth();
  const insets = useSafeAreaInsets();
  const trpcUtils = trpc.useUtils();
  const effectiveRegistrationId = registrationId || user?.id || "";
  const { colors: themeColors } = useTheme();

  const [runState, setRunState] = useState<RunState>("idle");
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [pauseDurationSeconds, setPauseDurationSeconds] = useState(0);
  const [pace, setPace] = useState(0);
  const [coords, setCoords] = useState<Coordinates[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [exerciseType, setExerciseType] = useState<ExerciseType>(null);
  const [activeWorkoutTab, setActiveWorkoutTab] = useState<WorkoutTab>("record");
  const [showMyWorkouts, setShowMyWorkouts] = useState(false);
  const [countdownValue, setCountdownValue] = useState<string | null>(null);
  const [isCountdownActive, setIsCountdownActive] = useState(false);
  const [activityVoiceAssistantEnabled, setActivityVoiceAssistantEnabled] = useState(true);
  const [showRunDetailsModal, setShowRunDetailsModal] = useState(false);
  const [activitySaved, setActivitySaved] = useState(false);
  const [runnerProfile, setRunnerProfile] = useState<RunnerProfile | null>(null);
  const [canUseCycleWorkout, setCanUseCycleWorkout] = useState(false);
  const [cycleWorkoutOnly, setCycleWorkoutOnly] = useState(false);
  const [workoutLocation, setWorkoutLocation] = useState<WorkoutLocationDetails | null>(null);
  const [runCardTheme, setRunCardTheme] = useState<"light" | "dark">("dark");
  const [showTreadmillModal, setShowTreadmillModal] = useState(false);
  const [treadmillDistance, setTreadmillDistance] = useState("");
  const [treadmillTime, setTreadmillTime] = useState("");
  const [treadmillImage, setTreadmillImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingWorkoutSyncCount, setPendingWorkoutSyncCount] = useState(0);
  const [isSyncingWorkouts, setIsSyncingWorkouts] = useState(false);
  const [stairsStepsInput, setStairsStepsInput] = useState("");
  const [showStairScannerModal, setShowStairScannerModal] = useState(false);
  const [stairScanMode, setStairScanMode] = useState<StairScanMode>("full");
  const [activeStairSession, setActiveStairSession] = useState<ActiveStairSession | null>(null);
  const [isScanningStairQr, setIsScanningStairQr] = useState(false);
  const [manualStairQrToken, setManualStairQrToken] = useState("");
  const [stairSessionSeconds, setStairSessionSeconds] = useState(0);
  const [stairLandingSection, setStairLandingSection] = useState<"menu" | "start" | "setup" | "instructions">("menu");
  const [stairBuildingSearch, setStairBuildingSearch] = useState("");
  const [selectedStairRoute, setSelectedStairRoute] = useState<any | null>(null);
  const [stairCameraEnabled, setStairCameraEnabled] = useState(false);
  const [showStairRouteFilters, setShowStairRouteFilters] = useState(false);
  const [stairFilterCountry, setStairFilterCountry] = useState("");
  const [stairFilterCity, setStairFilterCity] = useState("");
  const [stairFilterAccess, setStairFilterAccess] = useState<"all" | "public" | "residential">("all");
  const [stairFilterFloorTier, setStairFilterFloorTier] = useState<"all" | "low" | "mid" | "high">("all");
  const [showStairSetupForm, setShowStairSetupForm] = useState(false);
  const [isRegisteringStairRoute, setIsRegisteringStairRoute] = useState(false);
  const [generatedStairStickers, setGeneratedStairStickers] = useState<any[]>([]);
  const [generatedStairRouteId, setGeneratedStairRouteId] = useState<string | null>(null);
  const [stairSetupForm, setStairSetupForm] = useState({
    buildingName: "",
    city: "",
    countryCode: "",
    addressDescription: "",
    accessType: "public" as "public" | "private" | "club" | "corporate" | "residential" | "other",
    qrCustodianName: "",
    qrCustodianPhone: "",
    qrCustodianEmail: "",
    routeName: "",
    stairwellName: "",
    floorSegments: "",
    stepsGroundToFirst: "",
    minimumDurationSeconds: "20",
    maximumDurationSeconds: "7200",
  });
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const stairSensorSessionStart = useRef<number | null>(null);
  const stairSensorLastSample = useRef<{ magnitude: number; timestamp: number } | null>(null);
  const stairSensorSamples = useRef(0);
  const stairSensorActiveSamples = useRef(0);
  const stairScanAutoCloseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showSmartWatchModal, setShowSmartWatchModal] = useState(false);
  const [smartWatchValues, setSmartWatchValues] = useState<Record<string, string>>({
    heart_rate: "",
    steps: "",
    distance_km: "",
    spo2: "",
    calories: "",
    blood_pressure: "",
  });
  const [smartWatchActivityForm, setSmartWatchActivityForm] = useState({
    activityDate: "",
    startTime: "",
    duration: "",
  });
  const [smartWatchEvidenceImage, setSmartWatchEvidenceImage] = useState<string | null>(null);
  const [isSubmittingSmartWatch, setIsSubmittingSmartWatch] = useState(false);

  const [showOtherSportsModal, setShowOtherSportsModal] = useState(false);
  const [showEventRunModal, setShowEventRunModal] = useState(false);
  const [selectedEventRun, setSelectedEventRun] = useState<RegisteredEventRun | null>(null);
  const [otherSportsForm, setOtherSportsForm] = useState({
    sportsApp: "",
    activityDate: "",
    exerciseType: "Run" as "Run" | "Walk" | "Cycle" | "Treadmill" | "Stairs",
    startTime: "",
    duration: "",
    distanceKm: "",
    stepsCount: "",
  });
  const [otherSportsEvidenceImage, setOtherSportsEvidenceImage] = useState<string | null>(null);
  const [isSubmittingOtherSports, setIsSubmittingOtherSports] = useState(false);
  const [cachedRegisteredEvents, setCachedRegisteredEvents] = useState<RegisteredEventRun[]>([]);
  const { data: remoteRegisteredEvents = [], refetch: refetchRegisteredEvents } = trpc.events.getRegisteredEvents.useQuery(
    { registrationId: effectiveRegistrationId },
    {
      enabled: !!effectiveRegistrationId,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnReconnect: true,
    }
  );
  const registeredEvents = remoteRegisteredEvents.length > 0
    ? remoteRegisteredEvents
    : cachedRegisteredEvents;
  const { data: stairRoutes = [], refetch: refetchStairRoutes } = trpc.activities.getStairRoutes.useQuery(
    { registrationId: effectiveRegistrationId || null },
    {
    enabled: showStairScannerModal,
    staleTime: 60000,
    }
  );
  const myStairWorkoutSpots = useMemo(
    () => stairRoutes.filter((route: any) => Number(route.mySessionCount || 0) > 0).slice(0, 6),
    [stairRoutes]
  );
  const filteredStairRoutes = useMemo(() => {
    const query = stairBuildingSearch.trim().toLowerCase();
    return stairRoutes.filter((route: any) => {
      const searchText = [
      route.building?.buildingName,
      route.building?.city,
      route.building?.countryCode,
      route.routeName,
      route.stairwellName,
      route.building?.addressDescription,
      ].filter(Boolean).join(" ").toLowerCase();
      const floorSegments = Number(route.floorSegments || 0);
      const matchesQuery = !query || searchText.includes(query);
      const matchesCountry = !stairFilterCountry.trim() || String(route.building?.countryCode || "").toLowerCase().includes(stairFilterCountry.trim().toLowerCase());
      const matchesCity = !stairFilterCity.trim() || String(route.building?.city || "").toLowerCase().includes(stairFilterCity.trim().toLowerCase());
      const accessType = String(route.building?.accessType || "");
      const matchesAccess =
        stairFilterAccess === "all"
          ? true
          : stairFilterAccess === "public"
            ? accessType === "public"
            : accessType === "residential";
      const matchesTier =
        stairFilterFloorTier === "all"
          ? true
          : stairFilterFloorTier === "low"
            ? floorSegments <= 5
            : stairFilterFloorTier === "mid"
              ? floorSegments >= 6 && floorSegments <= 10
              : floorSegments > 10;
      return matchesQuery && matchesCountry && matchesCity && matchesAccess && matchesTier;
    }).slice(0, 10);
  }, [stairBuildingSearch, stairFilterAccess, stairFilterCity, stairFilterCountry, stairFilterFloorTier, stairRoutes]);

  useEffect(() => {
    if (!showStairScannerModal) {
      return;
    }

    stairSensorSessionStart.current = Date.now();
    stairSensorLastSample.current = null;
    stairSensorSamples.current = 0;
    stairSensorActiveSamples.current = 0;

    Accelerometer.setUpdateInterval(500);
    const subscription = Accelerometer.addListener((sample) => {
      const timestamp = Date.now();
      const magnitude = Math.sqrt(sample.x * sample.x + sample.y * sample.y + sample.z * sample.z);
      const previous = stairSensorLastSample.current;
      stairSensorSamples.current += 1;
      if (previous && Math.abs(magnitude - previous.magnitude) >= 0.11) {
        stairSensorActiveSamples.current += 1;
      }
      stairSensorLastSample.current = { magnitude, timestamp };
    });

    return () => {
      subscription.remove();
    };
  }, [showStairScannerModal]);

  useEffect(() => {
    if (!showStairScannerModal || !stairCameraEnabled || activeStairSession) {
      return;
    }

    if (stairScanAutoCloseTimeout.current) {
      clearTimeout(stairScanAutoCloseTimeout.current);
    }

    stairScanAutoCloseTimeout.current = setTimeout(() => {
      setStairCameraEnabled(false);
      setStairLandingSection("menu");
      setManualStairQrToken("");
      Alert.alert("QR Scan Closed", "No stair QR code was scanned within 30 seconds.");
    }, 30000);

    return () => {
      if (stairScanAutoCloseTimeout.current) {
        clearTimeout(stairScanAutoCloseTimeout.current);
        stairScanAutoCloseTimeout.current = null;
      }
    };
  }, [activeStairSession, showStairScannerModal, stairCameraEnabled]);

  useEffect(() => {
    if (!activeStairSession) {
      setStairSessionSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setStairSessionSeconds(Math.max(0, Math.floor((Date.now() - activeStairSession.startedAt.getTime()) / 1000)));
    }, 1000);

    return () => clearInterval(interval);
  }, [activeStairSession]);

  useEffect(() => {
    if (!effectiveRegistrationId) {
      setCachedRegisteredEvents([]);
      return;
    }

    let active = true;
    const cacheKey = `${REGISTERED_EVENTS_CACHE_PREFIX}_${effectiveRegistrationId}`;

    void AsyncStorage.getItem(cacheKey)
      .then((stored) => {
        if (!active || !stored) return;
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCachedRegisteredEvents(parsed as RegisteredEventRun[]);
        }
      })
      .catch((error) => {
        console.warn("[Workout] Could not restore cached registered events:", error);
      });

    return () => {
      active = false;
    };
  }, [effectiveRegistrationId]);

  useEffect(() => {
    if (!effectiveRegistrationId || remoteRegisteredEvents.length === 0) return;

    setCachedRegisteredEvents(remoteRegisteredEvents as RegisteredEventRun[]);
    void AsyncStorage.setItem(
      `${REGISTERED_EVENTS_CACHE_PREFIX}_${effectiveRegistrationId}`,
      JSON.stringify(remoteRegisteredEvents)
    ).catch((error) => {
      console.warn("[Workout] Could not cache registered events:", error);
    });
  }, [effectiveRegistrationId, remoteRegisteredEvents]);

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const workoutSyncInProgress = useRef(false);
  const activeWorkoutSessionId = useRef<string | null>(null);
  const workoutOwnerRegistrationId = useRef<string | null>(null);
  const elapsedBeforePause = useRef<number>(0);
  const runningStartTimestamp = useRef<number | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastValidPoint = useRef<LocationPoint | null>(null);
  const isResuming = useRef<boolean>(false);
  const totalPauseDuration = useRef<number>(0);
  const pauseStartTimestamp = useRef<number | null>(null);
  const filteredPointCount = useRef<number>(0);
  const lastProcessedLocationTimestamp = useRef<number | null>(null);
  const countdownTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastAnnouncedKilometer = useRef<number>(0);
  const stationaryStartTimestamp = useRef<number | null>(null);
  const autoPaused = useRef<boolean>(false);
  const autoPauseAnchorPoint = useRef<LocationPoint | null>(null);
  const autoPauseEnabled = useRef<boolean>(true);
  const finishHoldProgress = useRef(new Animated.Value(0)).current;
  const runStateRef = useRef<RunState>("idle");
  const distanceRef = useRef(0);
  const durationRef = useRef(0);
  const pauseDurationSecondsRef = useRef(0);
  const coordsRef = useRef<Coordinates[]>([]);
  const exerciseTypeRef = useRef<ExerciseType>(null);
  const selectedEventRunRef = useRef<RegisteredEventRun | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const mergeWorkoutBaseRef = useRef<MergeWorkoutBase | null>(null);
  const androidBottomInset = Platform.OS === "android" ? Math.max(insets.bottom, 48) : insets.bottom;
  const workoutBottomPadding = runState === "finished" ? androidBottomInset + 48 : androidBottomInset + 24;
  const runDetailsActionsBottomPadding = Math.max(insets.bottom, Platform.OS === "android" ? 8 : 12) + 8;
  const hasAbnormalWorkoutSpeed = isAbnormallyFastWalkOrRun(exerciseType, distance, duration);
  const finishHoldWidth = finishHoldProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
  const finishHoldShineOpacity = finishHoldProgress.interpolate({
    inputRange: [0, 0.25, 1],
    outputRange: [0, 0.45, 0.18],
  });

  useEffect(() => {
    runStateRef.current = runState;
  }, [runState]);

  useEffect(() => {
    void getWorkoutAutoPauseEnabled().then((enabled) => {
      autoPauseEnabled.current = enabled;
      if (!enabled) {
        stationaryStartTimestamp.current = null;
        autoPauseAnchorPoint.current = null;
      }
    });
  }, []);

  useEffect(() => {
    distanceRef.current = distance;
  }, [distance]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    pauseDurationSecondsRef.current = pauseDurationSeconds;
  }, [pauseDurationSeconds]);

  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  useEffect(() => {
    exerciseTypeRef.current = exerciseType;
  }, [exerciseType]);

  useEffect(() => {
    selectedEventRunRef.current = selectedEventRun;
  }, [selectedEventRun]);

  useEffect(() => {
    startTimeRef.current = startTime;
  }, [startTime]);

  const updateDuration = useCallback(() => {
    if (runningStartTimestamp.current !== null) {
      const now = Date.now();
      const currentSegment = Math.max(0, Math.floor((now - runningStartTimestamp.current) / 1000));
      const nextDuration = elapsedBeforePause.current + currentSegment;
      durationRef.current = nextDuration;
      setDuration(nextDuration);
    }
  }, []);

  const persistActiveWorkoutSession = useCallback(async (statusOverride?: PersistedWorkoutStatus) => {
    const sessionId = activeWorkoutSessionId.current;
    const currentExerciseType = exerciseTypeRef.current;
    const currentStartTime = startTimeRef.current;

    if (!sessionId || !currentExerciseType || !currentStartTime) {
      return;
    }

    const status =
      statusOverride ??
      (runStateRef.current === "idle" ? "finished" : runStateRef.current === "finished" ? "finished" : runStateRef.current);

    await setPersistedWorkoutSession({
      id: sessionId,
      registrationId: workoutOwnerRegistrationId.current ?? (effectiveRegistrationId || undefined),
      status,
      exerciseType: currentExerciseType,
      eventRun: selectedEventRunRef.current,
      startTimeIso: currentStartTime.toISOString(),
      startTimestamp: currentStartTime.getTime(),
      runningStartTimestamp: runningStartTimestamp.current,
      elapsedBeforePause: elapsedBeforePause.current,
      pauseStartTimestamp: pauseStartTimestamp.current,
      totalPauseDuration: totalPauseDuration.current,
      pauseDurationSeconds: pauseDurationSecondsRef.current,
      autoPaused: autoPaused.current,
      autoPauseEnabled: autoPauseEnabled.current,
      stationaryStartTimestamp: stationaryStartTimestamp.current,
      autoPauseAnchorPoint: autoPauseAnchorPoint.current,
      distance: distanceRef.current,
      coords: coordsRef.current.slice(-MAX_ROUTE_POINTS),
      lastValidPoint: lastValidPoint.current,
      lastProcessedLocationTimestamp: lastProcessedLocationTimestamp.current,
      filteredPointCount: filteredPointCount.current,
      mergeBase: mergeWorkoutBaseRef.current,
      updatedAt: Date.now(),
    });
  }, [effectiveRegistrationId]);

  const syncQueuedWorkouts = useCallback(async (showResult = false) => {
    if (workoutSyncInProgress.current) return;
    workoutSyncInProgress.current = true;
    setIsSyncingWorkouts(true);
    try {
      const result = await syncOfflineWorkouts();
      setPendingWorkoutSyncCount(result.pending);
      if (showResult) {
        if (result.pending === 0) {
          Alert.alert("Sync Complete", "All locally saved workouts are now synced.");
        } else {
          Alert.alert("Still Offline", `${result.pending} workout${result.pending === 1 ? "" : "s"} remain safely saved on this device.`);
        }
      }
    } finally {
      workoutSyncInProgress.current = false;
      setIsSyncingWorkouts(false);
    }
  }, []);

  useEffect(() => {
    void getOfflineWorkoutQueueCount().then(setPendingWorkoutSyncCount);
    void syncQueuedWorkouts();

    const interval = setInterval(() => {
      void syncQueuedWorkouts();
    }, 30000);
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void syncQueuedWorkouts();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [syncQueuedWorkouts]);

  useEffect(() => {
    void requestLocationPermission();
    void getActivityVoiceAssistantEnabled().then(setActivityVoiceAssistantEnabled);

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[Timer] App came to foreground, recalculating duration');
        updateDuration();
      } else if (nextAppState.match(/inactive|background/)) {
        if (runStateRef.current === "running" || runStateRef.current === "paused") {
          void persistActiveWorkoutSession(runStateRef.current);
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
      countdownTimeouts.current.forEach(clearTimeout);
      countdownTimeouts.current = [];
      Speech.stop();
    };
  }, [persistActiveWorkoutSession, updateDuration]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        void getActivityVoiceAssistantEnabled().then(setActivityVoiceAssistantEnabled);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!effectiveRegistrationId) {
      return;
    }

    void refetchRegisteredEvents();
  }, [effectiveRegistrationId, refetchRegisteredEvents]);

  const resolveWorkoutStartLocation = useCallback(async (coord: Coordinates) => {
    if (Platform.OS === "web") {
      return;
    }

    try {
      const [address] = await Location.reverseGeocodeAsync({
        latitude: coord.latitude,
        longitude: coord.longitude,
      });

      if (!address) {
        return;
      }

      const countryCode = String(address.isoCountryCode || "").trim().toUpperCase();
      const country = formatCountryName(countryCode || address.country || "") || address.country || "";
      const locality = [
        address.city,
        address.district,
        address.subregion,
        address.region,
      ]
        .map((part) => String(part || "").trim())
        .filter(Boolean)
        .filter((part, index, list) => list.findIndex((item) => item.toLowerCase() === part.toLowerCase()) === index)
        .slice(0, 2)
        .join(", ");

      setWorkoutLocation({
        locality,
        country,
        countryCode,
        countryFlag: countryFlagFromCountry(countryCode || country),
      });
    } catch (error) {
      console.warn("[Workout Location] Could not reverse geocode start point:", error);
    }
  }, []);

  useEffect(() => {
    const startCoord = coords[0];
    if (!startCoord || workoutLocation) {
      return;
    }

    void resolveWorkoutStartLocation(startCoord);
  }, [coords, resolveWorkoutStartLocation, workoutLocation]);

  useEffect(() => {
    if (!user?.id) {
      setRunnerProfile(null);
      setCanUseCycleWorkout(false);
      setCycleWorkoutOnly(false);
      return;
    }

    const loadRunnerProfile = async () => {
      try {
        const [{ data: registration }, { data: profilePhoto }, { data: latestPhoto }, { data: membership }] = await Promise.all([
          supabase
            .from("registrations")
            .select("first_name, other_names, username, city_town_district, country")
            .eq("registration_id", user.id)
            .maybeSingle(),
          supabase
            .from("user_photos")
            .select("file_path")
            .eq("registration_id", user.id)
            .eq("is_profile_photo", true)
            .maybeSingle(),
          supabase
            .from("user_photos")
            .select("file_path")
            .eq("registration_id", user.id)
            .order("is_profile_photo", { ascending: false })
            .order("file_name", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("club_members")
            .select("coordinator_id")
            .eq("registration_id", user.id)
            .maybeSingle(),
        ]);

        const name =
          [registration?.first_name, registration?.other_names].filter(Boolean).join(" ").trim() ||
          registration?.username ||
          user.username ||
          "RunNation Runner";
        const country = formatCountryName(registration?.country) || registration?.country || "";
        let club = "";

        if (membership?.coordinator_id) {
          const { data: clubData } = await supabase
            .from("clubs")
            .select("club_name")
            .eq("coordinator_id", membership.coordinator_id)
            .maybeSingle();
          club = clubData?.club_name || "";
        }

        setRunnerProfile({
          name,
          town: registration?.city_town_district || "",
          country,
          countryFlag: countryFlagFromCountry(registration?.country || country),
          club,
          photoUrl: profilePhoto?.file_path || latestPhoto?.file_path || null,
        });

        const { data: paraWorkoutProfile } = await supabase
          .from("registrations")
          .select("para_uses_equipment, para_equipment_type")
          .eq("registration_id", user.id)
          .maybeSingle();
        setCanUseCycleWorkout(
          paraWorkoutProfile?.para_uses_equipment === true &&
          ["wheelchair", "handcycle"].includes(String(paraWorkoutProfile?.para_equipment_type || ""))
        );
        setCycleWorkoutOnly(
          paraWorkoutProfile?.para_uses_equipment === true &&
          ["wheelchair", "handcycle"].includes(String(paraWorkoutProfile?.para_equipment_type || ""))
        );
      } catch (error) {
        console.error("[Run Details] Failed to load runner profile:", error);
        setCanUseCycleWorkout(false);
        setCycleWorkoutOnly(false);
        setRunnerProfile({
          name: user.username || "RunNation Runner",
          town: "",
          country: "",
          countryFlag: "",
          club: "",
          photoUrl: null,
        });
      }
    };

    void loadRunnerProfile();
  }, [user?.id, user?.username]);

  useEffect(() => {
    setOtherSportsForm((prev) => {
      const exerciseType = cycleWorkoutOnly ? "Cycle" : prev.exerciseType === "Cycle" && !canUseCycleWorkout ? "Run" : prev.exerciseType;
      return prev.exerciseType === exerciseType ? prev : { ...prev, exerciseType };
    });
  }, [canUseCycleWorkout, cycleWorkoutOnly]);

  const speakActivityMessage = useCallback((message: string) => {
    if (!activityVoiceAssistantEnabled) {
      return;
    }

    AccessibilityInfo.announceForAccessibility(message);

    if (Platform.OS === "web") {
      const webGlobal = globalThis as any;
      const SpeechUtterance = webGlobal.SpeechSynthesisUtterance;
      if (webGlobal.speechSynthesis && SpeechUtterance) {
        webGlobal.speechSynthesis.cancel();
        webGlobal.speechSynthesis.speak(new SpeechUtterance(message));
      }
      return;
    }

    Speech.stop();
    Speech.speak(message, {
      rate: 0.95,
      pitch: 1,
    });
  }, [activityVoiceAssistantEnabled]);

  const formatDurationForVoice = useCallback((seconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;
    if (hours > 0) {
      return `${hours} hour${hours === 1 ? "" : "s"}, ${minutes} minute${minutes === 1 ? "" : "s"}`;
    }
    if (minutes > 0) {
      return `${minutes} minute${minutes === 1 ? "" : "s"}, ${secs} second${secs === 1 ? "" : "s"}`;
    }
    return `${secs} second${secs === 1 ? "" : "s"}`;
  }, []);

  const formatPaceForVoice = useCallback((durationSeconds: number, distanceKm: number): string => {
    if (durationSeconds <= 0 || distanceKm <= 0) {
      return "pace not available";
    }
    const paceSeconds = Math.round(durationSeconds / distanceKm);
    const minutes = Math.floor(paceSeconds / 60);
    const seconds = paceSeconds % 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"} ${seconds} second${seconds === 1 ? "" : "s"} per kilometre`;
  }, []);

  const speakGoalReportAfterActivity = useCallback(async ({
    registrationId: ownerRegistrationId,
    activityId,
    activityDate,
    startTime,
    endTime,
    distanceKm,
    durationSeconds,
    eventIds,
  }: {
    registrationId: string;
    activityId: string;
    activityDate: string;
    startTime: string;
    endTime: string;
    distanceKm: number;
    durationSeconds: number;
    eventIds: string[];
  }) => {
    const offlineMessage = "Iâ€™m unable to access your latest stats right now, so I canâ€™t give you a goal report summary.";
    const dateOnlyLocal = (value?: string | null) => String(value || "").slice(0, 10);
    const timeToMinutes = (value?: string | null): number | null => {
      const parts = String(value || "").split(":").map(Number);
      if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) return null;
      return parts[0] * 60 + parts[1];
    };
    const isJunior = (dob?: string | null): boolean => {
      if (!dob) return false;
      const birthDate = new Date(dob);
      if (Number.isNaN(birthDate.getTime())) return false;
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
      return age <= 15;
    };
    const isParaEquipmentUser = (registration: any): boolean =>
      registration?.has_disability === true && registration?.para_uses_equipment === true;
    const activityDurationMinutes = (activity: any): number => {
      const start = timeToMinutes(activity.start_time);
      let end = timeToMinutes(activity.end_time);
      if (start === null || end === null) return 0;
      if (end < start) end += 24 * 60;
      const pauseMinutes = (Number(activity.pause_duration_seconds) || 0) / 60;
      return Math.max(0, end - start - pauseMinutes);
    };
    const normalizeGoalKey = (goal: string): string | null => {
      const value = goal.toLowerCase();
      if (value.includes("keep active") || value.includes("daily run") || value.includes("just want to run") || value.includes("meet my exercise goals")) return "keepActive";
      if (value.includes("fitness") || value.includes("pace")) return "fitness";
      if (value.includes("community") || value.includes("compete")) return "community";
      if (value.includes("planned runs") || value.includes("habit") || value.includes("discipline") || value.includes("exercise plan")) return "plannedRuns";
      if (value.includes("run window") || value.includes("time window") || value.includes("manage exercise time") || value.includes("set exercise time")) return "runWindow";
      if (value.includes("medal")) return "medals";
      return null;
    };
    const clockFitsWindow = (window: any): boolean => {
      const activityStart = timeToMinutes(startTime);
      let activityEnd = timeToMinutes(endTime);
      const windowStart = timeToMinutes(window?.start);
      let windowEnd = timeToMinutes(window?.end);
      if (activityStart === null || activityEnd === null || windowStart === null || windowEnd === null) return false;
      if (activityEnd < activityStart) activityEnd += 24 * 60;
      if (windowEnd < windowStart) windowEnd += 24 * 60;
      return activityStart >= windowStart && activityEnd <= windowEnd;
    };
    const appendCurrentActivity = (activities: any[]) => {
      const exists = activities.some((activity) => activity.activity_id === activityId);
      if (exists) return activities;
      return [
        ...activities,
        {
          activity_id: activityId,
          registration_id: ownerRegistrationId,
          activity_date: activityDate,
          exercise_type: exerciseType || "Run",
          distance_km: distanceKm,
          start_time: startTime,
          end_time: endTime,
          pause_duration_seconds: pauseDurationSecondsRef.current,
          pace_min_per_km: durationSeconds > 0 && distanceKm > 0 ? (durationSeconds / 60) / distanceKm : 0,
        },
      ];
    };

    try {
      const { data: userGoals, error: userGoalsError } = await supabase
        .from("user_goals")
        .select("goal")
        .eq("registration_id", ownerRegistrationId);
      if (userGoalsError) throw userGoalsError;

      const selectedGoalKeys = new Set((userGoals || []).map((row: any) => normalizeGoalKey(String(row.goal || ""))).filter(Boolean));
      if (selectedGoalKeys.size === 0) {
        speakActivityMessage("Congratulations, activity completed. You have not selected any goals for a goal report yet.");
        return;
      }

      const reports: string[] = [];

      const [
        activitiesResult,
        dailyGoalResult,
        fitnessGoalResult,
        habitResult,
        runWindowResult,
      ] = await Promise.all([
        supabase
          .from("activities")
          .select("activity_id, registration_id, activity_date, exercise_type, distance_km, start_time, end_time, pause_duration_seconds, pace_min_per_km")
          .eq("registration_id", ownerRegistrationId),
        selectedGoalKeys.has("keepActive")
          ? supabase.from("daily_run_goal").select("*").eq("registration_id", ownerRegistrationId).order("created_at", { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        selectedGoalKeys.has("fitness")
          ? supabase.from("fitness_goal").select("*").eq("registration_id", ownerRegistrationId).order("created_at", { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        selectedGoalKeys.has("plannedRuns")
          ? supabase.from("habit_declarations").select("*").eq("registration_id", ownerRegistrationId).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        selectedGoalKeys.has("runWindow")
          ? supabase.from("run_window_goal").select("*").eq("registration_id", ownerRegistrationId).order("created_at", { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);
      if (activitiesResult.error || dailyGoalResult.error || fitnessGoalResult.error || habitResult.error || runWindowResult.error) {
        throw activitiesResult.error || dailyGoalResult.error || fitnessGoalResult.error || habitResult.error || runWindowResult.error;
      }

      const activities = appendCurrentActivity(activitiesResult.data || []);

      if (selectedGoalKeys.has("keepActive") && dailyGoalResult.data) {
        const goal = dailyGoalResult.data as any;
        const goalActivities = activities.filter((activity: any) =>
          activity.exercise_type === "Run" &&
          dateOnlyLocal(activity.activity_date) >= goal.start_date &&
          dateOnlyLocal(activity.activity_date) <= goal.end_date
        );
        const runDays = new Set(goalActivities.map((activity: any) => dateOnlyLocal(activity.activity_date))).size;
        const start = new Date(`${goal.start_date}T00:00:00`);
        const end = new Date(`${goal.end_date}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const effectiveEnd = today < end ? today : end;
        const elapsedDays = Math.max(0, Math.floor((effectiveEnd.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
        const targetRuns = elapsedDays > 0 ? Math.ceil((elapsedDays * Number(goal.target_percent || 0)) / 100) : 0;
        reports.push(`Meet my exercise goals-${runDays >= targetRuns ? "accomplished" : "fell short"}`);
      }

      if (selectedGoalKeys.has("fitness") && fitnessGoalResult.data) {
        const goal = fitnessGoalResult.data as any;
        const bands = Array.isArray(goal.target_bands) ? goal.target_bands : [];
        const sortedBands = bands
          .map((band: any) => ({
            distanceKm: Number(band.distance_km),
            targetPace: Number(band.target_pace_min_per_km),
          }))
          .filter((band: any) => band.distanceKm > 0 && band.targetPace > 0)
          .sort((a: any, b: any) => a.distanceKm - b.distanceKm);
        const targetPace = sortedBands.find((band: any) => distanceKm <= band.distanceKm)?.targetPace ||
          sortedBands[sortedBands.length - 1]?.targetPace ||
          Number(goal.target_pace_min_per_km || 0);
        const activityPace = durationSeconds > 0 && distanceKm > 0 ? (durationSeconds / 60) / distanceKm : 0;
        if (targetPace > 0 && activityPace > 0) {
          reports.push(`Work on my pace-${activityPace <= targetPace ? "accomplished" : "fell short"}`);
        }
      }

      if (selectedGoalKeys.has("community")) {
        const { data: allActivities, error: allActivitiesError } = await supabase
          .from("activities")
          .select("activity_id, registration_id, activity_date, distance_km, start_time, end_time, pause_duration_seconds, pace_min_per_km");
        if (allActivitiesError) throw allActivitiesError;
        const { data: registrations, error: registrationsError } = await supabase
          .from("registrations")
          .select("registration_id, first_name, other_names, dob, has_disability, para_uses_equipment");
        if (registrationsError) throw registrationsError;

        const allRankActivities = appendCurrentActivity(allActivities || []);
        const eligibleIds = new Set((registrations || [])
          .filter((registration: any) => !isJunior(registration.dob) && !isParaEquipmentUser(registration))
          .map((registration: any) => registration.registration_id));
        const statsByUser = new Map<string, { totalDistance: number; totalTime: number; paceSum: number; count: number; days: Set<string> }>();
        allRankActivities.forEach((activity: any) => {
          const regId = activity.registration_id;
          if (!eligibleIds.has(regId)) return;
          const existing = statsByUser.get(regId) || { totalDistance: 0, totalTime: 0, paceSum: 0, count: 0, days: new Set<string>() };
          existing.totalDistance += Number(activity.distance_km) || 0;
          existing.totalTime += activityDurationMinutes(activity);
          existing.paceSum += Number(activity.pace_min_per_km) || 0;
          existing.count += 1;
          const date = dateOnlyLocal(activity.activity_date);
          if (date) existing.days.add(date);
          statsByUser.set(regId, existing);
        });
        const rankedRows = Array.from(statsByUser.entries())
          .map(([regId, stats]) => ({
            registrationId: regId,
            avgDistance: stats.days.size > 0 ? stats.totalDistance / stats.days.size : 0,
            activeDays: stats.days.size,
            avgPace: stats.count > 0 ? stats.paceSum / stats.count : 0,
            totalDistance: stats.totalDistance,
            totalTime: stats.totalTime,
          }))
          .filter((row) => row.totalDistance >= 3 && row.totalTime >= 30 && row.activeDays > 0)
          .sort((a, b) => b.avgDistance - a.avgDistance || b.activeDays - a.activeDays || a.avgPace - b.avgPace);
        const currentIndex = rankedRows.findIndex((row) => row.registrationId === ownerRegistrationId);
        if (currentIndex >= 0) {
          const currentRank = currentIndex + 1;
          const previousStored = await AsyncStorage.getItem(`community_rank_${ownerRegistrationId}`);
          const previousRank = previousStored ? (JSON.parse(previousStored) as { rank?: number }).rank : null;
          if (previousRank && Number.isFinite(previousRank)) {
            if (currentRank < previousRank) {
              reports.push(`Be part in the community-Your rank improved from ${previousRank} to ${currentRank}`);
            } else if (currentRank > previousRank) {
              reports.push(`Be part in the community-Your rank moved from ${previousRank} to ${currentRank}`);
            } else {
              reports.push(`Be part in the community-Your rank stayed at ${currentRank}`);
            }
          } else {
            reports.push(`Be part in the community-Your current rank is ${currentRank}`);
          }
          await AsyncStorage.setItem(`community_rank_${ownerRegistrationId}`, JSON.stringify({
            rank: currentRank,
            totalParticipants: rankedRows.length,
            timestamp: new Date().toISOString(),
          }));
        }
      }

      if (selectedGoalKeys.has("plannedRuns") && habitResult.data) {
        const habit = habitResult.data as any;
        const targetAmount = Number(habit.target_amount) || 0;
        const unit = String(habit.unit || "").toLowerCase();
        const targetKm = unit.includes("mile") ? targetAmount * 1.60934 : targetAmount;
        if (targetKm > 0) {
          reports.push(`Follow an exercise plan-${distanceKm >= targetKm ? "accomplished" : "fell short"}`);
        }
      }

      if (selectedGoalKeys.has("runWindow") && runWindowResult.data) {
        const goal = runWindowResult.data as any;
        const regularWindows = Array.isArray(goal.regular_windows) ? goal.regular_windows : [];
        const regularWindow = regularWindows[0];
        if (regularWindow) {
          reports.push(`Set exercise time-${clockFitsWindow(regularWindow) ? "accomplished" : "fell short"}`);
        }
      }

      let medalReport = "";
      if (selectedGoalKeys.has("medals") && eventIds.length > 0) {
        const { data: medalEvents, error: medalEventsError } = await supabase
          .from("events")
          .select("event_id, has_medal, event_name")
          .in("event_id", eventIds)
          .eq("has_medal", true);
        if (medalEventsError) throw medalEventsError;
        if ((medalEvents || []).length > 0) {
          const { data: medalGoal, error: medalGoalError } = await supabase
            .from("medal_goal")
            .select("*")
            .eq("registration_id", ownerRegistrationId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (medalGoalError) throw medalGoalError;
          if (medalGoal) {
            const { data: goalEvents, error: goalEventsError } = await supabase
              .from("events")
              .select("event_id, has_medal, starts_at, ends_at")
              .eq("has_medal", true)
              .lte("starts_at", medalGoal.end_date)
              .gte("ends_at", medalGoal.start_date);
            if (goalEventsError) throw goalEventsError;
            const goalEventIds = (goalEvents || []).map((event: any) => event.event_id).filter(Boolean);
            const { data: participants, error: participantsError } = goalEventIds.length > 0
              ? await supabase
                .from("events_participants")
                .select("event_id, distance_km")
                .eq("registration_id", ownerRegistrationId)
                .in("event_id", goalEventIds)
              : { data: [], error: null } as any;
            if (participantsError) throw participantsError;
            const earnedEventIds = new Set((participants || [])
              .filter((participant: any) => Number(participant.distance_km) > 0)
              .map((participant: any) => participant.event_id));
            (medalEvents || []).forEach((event: any) => earnedEventIds.add(event.event_id));
            const medalsEarned = earnedEventIds.size;
            const targetMedals = Number(medalGoal.target_medals) || 0;
            const medalsLeft = Math.max(0, targetMedals - medalsEarned);
            medalReport = `Congratulations, you earned your ${medalsEarned}${medalsEarned === 1 ? "st" : medalsEarned === 2 ? "nd" : medalsEarned === 3 ? "rd" : "th"} medal out of your target of ${targetMedals}. ${medalsLeft} more medal${medalsLeft === 1 ? "" : "s"} to hit the target.`;
          }
        }
      }

      const summary = reports.length > 0
        ? `Congratulations, activity completed. This is a summary of your goals: ${reports.join(", ")}.`
        : "Congratulations, activity completed. I could not find any goal results linked to this activity.";
      speakActivityMessage(medalReport ? `${summary} ${medalReport}` : summary);
    } catch (error) {
      console.warn("[Activity Voice] Goal report unavailable:", error);
      speakActivityMessage(`Congratulations, activity completed. ${offlineMessage}`);
    }
  }, [exerciseType, speakActivityMessage]);

  const requestLocationPermission = async () => {
    if (Platform.OS === 'web') {
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === "granted") {
      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setCurrentLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        console.log('[Location] Initial position obtained, accuracy:', location.coords.accuracy, 'm');
      } catch (err) {
        console.error('[Location] Error getting initial position:', err);
      }
    }
  };

  const ensureForegroundLocationPermission = useCallback(async () => {
    if (Platform.OS === "web") {
      return false;
    }

    const existingPermission = await Location.getForegroundPermissionsAsync();
    const permission =
      existingPermission.status === "granted"
        ? existingPermission
        : await Location.requestForegroundPermissionsAsync();

    if (permission.status !== "granted") {
      Alert.alert("Location Required", "Please allow location access before starting a GPS workout.");
      return false;
    }

    return true;
  }, []);

  const isValidGpsPoint = useCallback((point: LocationPoint, exerciseT: ExerciseType): boolean => {
    if (point.accuracy !== null && point.accuracy > GPS_ACCURACY_THRESHOLD) {
      console.log('[GPS Filter] Rejected: accuracy too low:', point.accuracy, 'm');
      filteredPointCount.current++;
      return false;
    }

    if (!lastValidPoint.current) {
      return true;
    }

    const dist = calculateDistance(
      { latitude: lastValidPoint.current.latitude, longitude: lastValidPoint.current.longitude },
      { latitude: point.latitude, longitude: point.longitude }
    );

    if (dist < MIN_DISTANCE_BETWEEN_POINTS) {
      console.log('[GPS Filter] Rejected: too close:', (dist * 1000).toFixed(1), 'm');
      filteredPointCount.current++;
      return false;
    }

    const timeDiffHours = (point.timestamp - lastValidPoint.current.timestamp) / (1000 * 3600);
    if (timeDiffHours > 0) {
      const speedKmh = dist / timeDiffHours;
      const maxSpeed =
        exerciseT === "Walk"
          ? MAX_SPEED_KMH_WALK
          : exerciseT === "Cycle"
            ? MAX_SPEED_KMH_CYCLE
            : MAX_SPEED_KMH_RUN;

      if (speedKmh > maxSpeed) {
        console.log('[GPS Filter] Rejected: unrealistic speed:', speedKmh.toFixed(1), 'km/h (max:', maxSpeed, ')');
        filteredPointCount.current++;
        return false;
      }
    }

    return true;
  }, []);

  const startWorkoutTimer = useCallback(() => {
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    timerInterval.current = setInterval(() => {
      if (runningStartTimestamp.current !== null) {
        const now = Date.now();
        const currentSegment = Math.max(0, Math.floor((now - runningStartTimestamp.current) / 1000));
        const nextDuration = elapsedBeforePause.current + currentSegment;
        durationRef.current = nextDuration;
        setDuration(nextDuration);
      }
    }, 1000) as any;
  }, []);

  const autoPauseWorkout = useCallback((stationarySince: number) => {
    if (autoPaused.current || runningStartTimestamp.current === null) {
      return;
    }

    const now = Date.now();
    const pauseStartedAt = Math.min(now, stationarySince);
    elapsedBeforePause.current += Math.max(
      0,
      Math.floor((pauseStartedAt - runningStartTimestamp.current) / 1000)
    );
    durationRef.current = elapsedBeforePause.current;
    setDuration(elapsedBeforePause.current);
    runningStartTimestamp.current = null;
    pauseStartTimestamp.current = pauseStartedAt;
    autoPaused.current = true;
    runStateRef.current = "paused";
    setRunState("paused");
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
    speakActivityMessage("Auto pause. Workout paused.");
    void persistActiveWorkoutSession("paused");
  }, [persistActiveWorkoutSession, speakActivityMessage]);

  const autoResumeWorkout = useCallback(() => {
    if (!autoPaused.current) {
      return;
    }

    const now = Date.now();
    if (pauseStartTimestamp.current !== null) {
      totalPauseDuration.current += now - pauseStartTimestamp.current;
    }
    pauseStartTimestamp.current = null;
    runningStartTimestamp.current = now;
    autoPaused.current = false;
    stationaryStartTimestamp.current = null;
    autoPauseAnchorPoint.current = null;
    isResuming.current = true;
    runStateRef.current = "running";
    setRunState("running");
    startWorkoutTimer();
    speakActivityMessage("Auto resume. Workout resumed.");
    void persistActiveWorkoutSession("running");
  }, [persistActiveWorkoutSession, speakActivityMessage, startWorkoutTimer]);

  const evaluateAutoPause = useCallback((
    point: LocationPoint,
    movementDistanceKm: number,
    speedKmh: number | null,
    hasNativeSpeed: boolean
  ) => {
    if (appState.current !== "active" && !autoPaused.current) {
      stationaryStartTimestamp.current = null;
      autoPauseAnchorPoint.current = point;
      return;
    }

    if (!autoPauseEnabled.current) {
      stationaryStartTimestamp.current = null;
      autoPauseAnchorPoint.current = point;
      return;
    }
    if (runStateRef.current !== "running" && !autoPaused.current) {
      return;
    }

    const isMoving = hasNativeSpeed
      ? speedKmh !== null && speedKmh >= AUTO_RESUME_MIN_SPEED_KMH
      : movementDistanceKm >= AUTO_RESUME_MIN_DISTANCE_KM ||
        (speedKmh !== null && speedKmh >= AUTO_RESUME_MIN_SPEED_KMH);
    autoPauseAnchorPoint.current = point;

    if (isMoving) {
      stationaryStartTimestamp.current = null;
      if (autoPaused.current) {
        autoResumeWorkout();
      }
      return;
    }

    if (autoPaused.current || runStateRef.current !== "running") {
      return;
    }

    const isStationary = hasNativeSpeed
      ? speedKmh === null || speedKmh <= AUTO_PAUSE_MAX_SPEED_KMH
      : movementDistanceKm < AUTO_RESUME_MIN_DISTANCE_KM &&
        (speedKmh === null || speedKmh <= AUTO_PAUSE_MAX_SPEED_KMH);

    if (!isStationary) {
      stationaryStartTimestamp.current = null;
      return;
    }

    if (stationaryStartTimestamp.current === null) {
      stationaryStartTimestamp.current = point.timestamp;
      autoPauseAnchorPoint.current = point;
      return;
    }

    const stationarySeconds = (point.timestamp - stationaryStartTimestamp.current) / 1000;
    if (stationarySeconds >= AUTO_PAUSE_STATIONARY_SECONDS) {
      autoPauseWorkout(stationaryStartTimestamp.current);
    }
  }, [autoPauseWorkout, autoResumeWorkout]);

  const announceKilometerSplitIfNeeded = useCallback((nextDistanceKm: number) => {
    if (exerciseTypeRef.current === "Stairs") {
      return;
    }
    const reachedKilometer = Math.floor(nextDistanceKm / KM_VOICE_ANNOUNCEMENT_INTERVAL);
    if (reachedKilometer <= lastAnnouncedKilometer.current || reachedKilometer < 1) {
      return;
    }

    lastAnnouncedKilometer.current = reachedKilometer;
    const currentDuration =
      runningStartTimestamp.current !== null
        ? elapsedBeforePause.current + Math.max(0, Math.floor((Date.now() - runningStartTimestamp.current) / 1000))
        : durationRef.current;
    const distanceLabel = reachedKilometer === 1 ? "1 kilometre" : `${reachedKilometer} kilometres`;
    speakActivityMessage(
      `${distanceLabel}. Time ${formatDurationForVoice(currentDuration)}. Average pace ${formatPaceForVoice(currentDuration, nextDistanceKm)}.`
    );
  }, [formatDurationForVoice, formatPaceForVoice, speakActivityMessage]);

  const handleLocationUpdate = useCallback(async (location: Location.LocationObject, exerciseT: ExerciseType) => {
    const activityStartTime = startTimeRef.current;
    if (activityStartTime && location.timestamp < activityStartTime.getTime()) {
      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      return;
    }

    if (
      lastProcessedLocationTimestamp.current !== null &&
      location.timestamp <= lastProcessedLocationTimestamp.current
    ) {
      return;
    }
    lastProcessedLocationTimestamp.current = location.timestamp;

    const newPoint: LocationPoint = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      timestamp: location.timestamp,
    };

    const newCoord: Coordinates = {
      latitude: newPoint.latitude,
      longitude: newPoint.longitude,
    };

    setCurrentLocation(newCoord);

    const previousValidPoint = lastValidPoint.current;
    const canEvaluateAutoPause =
      previousValidPoint !== null && (newPoint.accuracy === null || newPoint.accuracy <= AUTO_PAUSE_ACCURACY_THRESHOLD);
    if (canEvaluateAutoPause) {
      const movementAnchor = autoPauseAnchorPoint.current ?? previousValidPoint;
      const movementDistanceKm = calculateDistance(
        { latitude: movementAnchor.latitude, longitude: movementAnchor.longitude },
        newCoord
      );
      const movementHours = (newPoint.timestamp - movementAnchor.timestamp) / (1000 * 3600);
      const calculatedSpeedKmh = movementHours > 0 ? movementDistanceKm / movementHours : null;
      const nativeSpeedKmh =
        typeof location.coords.speed === "number" && location.coords.speed >= 0
          ? location.coords.speed * 3.6
          : null;
      const speedKmh = nativeSpeedKmh ?? calculatedSpeedKmh;
      evaluateAutoPause(newPoint, movementDistanceKm, speedKmh, nativeSpeedKmh !== null);
      if (autoPaused.current || runStateRef.current !== "running" || stationaryStartTimestamp.current !== null) {
        await persistActiveWorkoutSession(autoPaused.current || runStateRef.current === "paused" ? "paused" : "running");
        return;
      }
    } else if (autoPaused.current || runStateRef.current !== "running") {
      await persistActiveWorkoutSession(autoPaused.current || runStateRef.current === "paused" ? "paused" : "running");
      return;
    }

    if (isResuming.current) {
      console.log('[GPS] First point after resume â€” skipping distance, updating anchor');
      lastValidPoint.current = newPoint;
      isResuming.current = false;
      const nextCoords = [...coordsRef.current, newCoord].slice(-MAX_ROUTE_POINTS);
      coordsRef.current = nextCoords;
      setCoords(nextCoords);
      await persistActiveWorkoutSession("running");
      return;
    }

    if (!isValidGpsPoint(newPoint, exerciseT)) {
      await persistActiveWorkoutSession("running");
      return;
    }

    if (lastValidPoint.current) {
      const dist = calculateDistance(
        { latitude: lastValidPoint.current.latitude, longitude: lastValidPoint.current.longitude },
        newCoord
      );
      console.log('[GPS] Valid point, distance delta:', (dist * 1000).toFixed(1), 'm, accuracy:', newPoint.accuracy?.toFixed(1), 'm');
      const nextDistance = distanceRef.current + dist;
      distanceRef.current = nextDistance;
      setDistance(nextDistance);
      announceKilometerSplitIfNeeded(nextDistance);
    }

    lastValidPoint.current = newPoint;
    const nextCoords = [...coordsRef.current, newCoord].slice(-MAX_ROUTE_POINTS);
    coordsRef.current = nextCoords;
    setCoords(nextCoords);
    await persistActiveWorkoutSession("running");
  }, [announceKilometerSplitIfNeeded, evaluateAutoPause, isValidGpsPoint, persistActiveWorkoutSession]);

  const startBackgroundLocationWatch = useCallback(async (exerciseT: ExerciseType): Promise<boolean> => {
    if (Platform.OS === "web" || !exerciseT) {
      return false;
    }

    try {
      const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
      if (backgroundPermission.status !== "granted") {
        console.warn("[Background Location] Permission not granted; lock-screen tracking may pause.");
        return false;
      }

      const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (alreadyStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: BACKGROUND_LOCATION_DISTANCE_METERS,
        timeInterval: BACKGROUND_LOCATION_INTERVAL_MS,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "RunNation workout active",
          notificationBody: "Tracking distance while your screen is locked.",
          notificationColor: "#FF6B35",
          killServiceOnDestroy: false,
        },
      });
      console.log("[Background Location] Started lock-screen tracking for", exerciseT);
      return true;
    } catch (error) {
      console.warn("[Background Location] Could not start background tracking:", error);
      return false;
    }
  }, []);

  const stopBackgroundLocationWatch = useCallback(async () => {
    if (Platform.OS === "web") {
      return;
    }

    try {
      const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (started) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
      backgroundLocationHandler = null;
    } catch (error) {
      console.warn("[Background Location] Could not stop background tracking:", error);
    }
  }, []);

  const startLocationWatch = useCallback(async (exerciseT: ExerciseType) => {
    if (!exerciseT) {
      return;
    }

    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    backgroundLocationHandler = (location) => handleLocationUpdate(location, exerciseT);

    try {
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: FOREGROUND_LOCATION_DISTANCE_METERS,
          timeInterval: FOREGROUND_LOCATION_INTERVAL_MS,
        },
        (location) => {
          void handleLocationUpdate(location, exerciseT);
        }
      );
    } catch (error) {
      backgroundLocationHandler = null;
      throw error;
    }

    void startBackgroundLocationWatch(exerciseT);
  }, [handleLocationUpdate, startBackgroundLocationWatch]);

  useEffect(() => {
    return () => {
      if (runStateRef.current === "idle" || runStateRef.current === "finished") {
        void stopBackgroundLocationWatch();
      }
    };
  }, [stopBackgroundLocationWatch]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const restoreActiveWorkout = async () => {
      const session = await getPersistedWorkoutSession();
      if (!session || session.status === "finished" || runStateRef.current !== "idle") {
        return;
      }

      const startDate = new Date(session.startTimeIso);
      if (Number.isNaN(startDate.getTime())) {
        await clearPersistedWorkoutSession();
        return;
      }

      activeWorkoutSessionId.current = session.id;
      workoutOwnerRegistrationId.current = session.registrationId ?? (effectiveRegistrationId || null);
      elapsedBeforePause.current = session.elapsedBeforePause;
      runningStartTimestamp.current = session.runningStartTimestamp;
      totalPauseDuration.current = session.totalPauseDuration;
      pauseStartTimestamp.current = session.pauseStartTimestamp;
      lastValidPoint.current = session.lastValidPoint;
      lastProcessedLocationTimestamp.current = session.lastProcessedLocationTimestamp;
      filteredPointCount.current = session.filteredPointCount;
      distanceRef.current = session.distance;
      coordsRef.current = session.coords.slice(-MAX_ROUTE_POINTS);
      exerciseTypeRef.current = session.exerciseType;
      selectedEventRunRef.current = session.eventRun;
      startTimeRef.current = startDate;
      pauseDurationSecondsRef.current = session.pauseDurationSeconds;
      autoPaused.current = session.autoPaused === true;
      autoPauseEnabled.current = session.autoPauseEnabled !== false;
      stationaryStartTimestamp.current = session.stationaryStartTimestamp ?? null;
      autoPauseAnchorPoint.current = session.autoPauseAnchorPoint ?? session.lastValidPoint;
      lastAnnouncedKilometer.current = Math.floor(session.distance / KM_VOICE_ANNOUNCEMENT_INTERVAL);
      mergeWorkoutBaseRef.current = session.mergeBase ?? null;
      setExerciseType(session.exerciseType);
      setSelectedEventRun(session.eventRun);
      setStartTime(startDate);
      setDistance(session.distance);
      setCoords(session.coords.slice(-MAX_ROUTE_POINTS));
      setPauseDurationSeconds(session.pauseDurationSeconds);

      const restoredState: RunState = session.status === "paused" ? "paused" : "running";
      runStateRef.current = restoredState;
      setRunState(restoredState);

      if (session.coords.length > 0) {
        setCurrentLocation(session.coords[session.coords.length - 1]);
      }

      if (restoredState === "running" || session.autoPaused === true) {
        const now = Date.now();
        const currentSegment = session.runningStartTimestamp
          ? Math.max(0, Math.floor((now - session.runningStartTimestamp) / 1000))
          : 0;
        const restoredDuration = session.elapsedBeforePause + currentSegment;
        durationRef.current = restoredDuration;
        setDuration(restoredDuration);

        if (restoredState === "running") {
          startWorkoutTimer();
        }

        try {
          await startLocationWatch(session.exerciseType);
        } catch (error) {
          console.warn("[Workout Persistence] Could not restart foreground GPS watch:", error);
        }
      } else {
        setDuration(session.elapsedBeforePause);
      }

      console.log("[Workout Persistence] Restored active workout", session.id);
    };

    void restoreActiveWorkout();
  }, [effectiveRegistrationId, startLocationWatch, startWorkoutTimer]);

  const findSameDayMergeCandidate = useCallback(async (type: Exclude<ExerciseType, null>, ownerRegistrationId: string): Promise<MergeWorkoutBase | null> => {
    if (type === "Treadmill") return null;
    const today = localDateOnly();
    const { data, error } = await supabase
      .from("activities")
      .select("activity_id, activity_date, exercise_type, distance_km, steps_count, start_time, end_time, pause_duration_seconds")
      .eq("registration_id", ownerRegistrationId)
      .eq("activity_date", today)
      .eq("exercise_type", type)
      .order("end_time", { ascending: false })
      .limit(1);

    if (error) {
      console.warn("[Workout Merge] Could not check same-day activity:", error.message);
      return null;
    }

    const activity = data?.[0] as any;
    if (!activity?.activity_id) return null;

    const pauseSeconds = Number(activity.pause_duration_seconds) || 0;
    const durationSeconds = activityDurationSeconds(activity.start_time, activity.end_time, pauseSeconds);
    const distanceKm = type === "Stairs" ? 0 : Number(activity.distance_km || 0);
    const startedAt = combineActivityDateTime(activity.activity_date, activity.start_time);
    const endedAt = combineActivityDateTime(activity.activity_date, activity.end_time);

    return {
      activityId: String(activity.activity_id),
      activityDate: String(activity.activity_date).slice(0, 10),
      exerciseType: type,
      distanceKm,
      durationSeconds,
      pauseDurationSeconds: pauseSeconds,
      startTime: String(activity.start_time || "00:00:00"),
      endTime: String(activity.end_time || "00:00:00"),
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
    };
  }, []);

  const askToMergeSameDayActivity = useCallback((candidate: MergeWorkoutBase) => {
    return new Promise<boolean>((resolve) => {
      const activityLabel = candidate.exerciseType === "Stairs" ? "Stairs" : candidate.exerciseType;
      Alert.alert(
        `Merge with earlier ${activityLabel}?`,
        `You already completed ${candidate.distanceKm.toFixed(2)} km and ${formatTime(candidate.durationSeconds)} today. Start from that distance and time?`,
        [
          { text: "Start New", style: "cancel", onPress: () => resolve(false) },
          { text: "Merge", onPress: () => resolve(true) },
        ]
      );
    });
  }, []);

  const resolveMergeWorkoutBase = useCallback(async (type: ExerciseType, eventRun: RegisteredEventRun | null): Promise<MergeWorkoutBase | null> => {
    if (!type || eventRun || type === "Treadmill") return null;
    const ownerRegistrationId = effectiveRegistrationId || user?.id || "";
    if (!ownerRegistrationId) return null;

    const candidate = await findSameDayMergeCandidate(type, ownerRegistrationId);
    if (!candidate) return null;

    const shouldMerge = await askToMergeSameDayActivity(candidate);
    return shouldMerge ? candidate : null;
  }, [askToMergeSameDayActivity, effectiveRegistrationId, findSameDayMergeCandidate, user?.id]);

  const startTracking = useCallback(async (
    type: ExerciseType,
    eventRun: RegisteredEventRun | null = null,
    scheduledStartTimestamp = Date.now(),
    mergeBase: MergeWorkoutBase | null = null
  ) => {
    if (!type) return;
    const ownerRegistrationId = effectiveRegistrationId || user?.id || "";
    if (!ownerRegistrationId) {
      Alert.alert("Sign In Required", "Sign in once while online before recording offline workouts.");
      return;
    }

    if (type === "Treadmill") {
      setShowTreadmillModal(true);
      return;
    }

    if (type === "Cycle" && !canUseCycleWorkout) {
      Alert.alert("Cycle Workouts", "Cycle is available for Para Runners who use a wheelchair or handcycle.");
      return;
    }
    if ((type === "Walk" || type === "Run") && cycleWorkoutOnly) {
      Alert.alert("Workout Type", "Your Para equipment profile qualifies for Cycle workouts only.");
      return;
    }

    if (Platform.OS === 'web') {
      return;
    }

    const hasLocationPermission = await ensureForegroundLocationPermission();
    if (!hasLocationPermission) return;

    const previousEnd = mergeBase ? new Date(mergeBase.endedAt) : null;
    const pauseGapSeconds =
      previousEnd && !Number.isNaN(previousEnd.getTime())
        ? Math.max(0, Math.floor((scheduledStartTimestamp - previousEnd.getTime()) / 1000))
        : 0;
    const initialDistance = mergeBase?.distanceKm ?? 0;
    const initialElapsed = mergeBase?.durationSeconds ?? 0;
    const initialPauseSeconds = (mergeBase?.pauseDurationSeconds ?? 0) + pauseGapSeconds;

    setCoords([]);
    coordsRef.current = [];
    setDistance(initialDistance);
    distanceRef.current = initialDistance;
    setDuration(initialElapsed);
    durationRef.current = initialElapsed;
    setPauseDurationSeconds(initialPauseSeconds);
    pauseDurationSecondsRef.current = initialPauseSeconds;
    lastValidPoint.current = null;
    lastProcessedLocationTimestamp.current = null;
    isResuming.current = false;
    totalPauseDuration.current = initialPauseSeconds * 1000;
    pauseStartTimestamp.current = null;
    filteredPointCount.current = 0;
    lastAnnouncedKilometer.current = 0;
    stationaryStartTimestamp.current = null;
    autoPaused.current = false;
    autoPauseAnchorPoint.current = null;
    elapsedBeforePause.current = initialElapsed;
    const sessionId = mergeBase?.activityId ?? uuidv4();
    autoPauseEnabled.current = await getWorkoutAutoPauseEnabled();
    const startDate = new Date(scheduledStartTimestamp);
    activeWorkoutSessionId.current = sessionId;
    workoutOwnerRegistrationId.current = ownerRegistrationId;
    mergeWorkoutBaseRef.current = mergeBase;
    runningStartTimestamp.current = scheduledStartTimestamp;
    exerciseTypeRef.current = type;
    selectedEventRunRef.current = eventRun;
    startTimeRef.current = startDate;
    runStateRef.current = "running";
    setExerciseType(type);
    setSelectedEventRun(eventRun);
    setRunState("running");
    setStartTime(startDate);

    await setPersistedWorkoutSession({
      id: sessionId,
      registrationId: ownerRegistrationId,
      status: scheduledStartTimestamp > Date.now() ? "pending" : "running",
      exerciseType: type,
      eventRun,
      startTimeIso: startDate.toISOString(),
      startTimestamp: scheduledStartTimestamp,
      runningStartTimestamp: scheduledStartTimestamp,
      elapsedBeforePause: initialElapsed,
      pauseStartTimestamp: null,
      totalPauseDuration: initialPauseSeconds * 1000,
      pauseDurationSeconds: initialPauseSeconds,
      autoPaused: false,
      autoPauseEnabled: autoPauseEnabled.current,
      stationaryStartTimestamp: null,
      autoPauseAnchorPoint: null,
      distance: initialDistance,
      coords: [],
      lastValidPoint: null,
      lastProcessedLocationTimestamp: null,
      filteredPointCount: 0,
      mergeBase,
      updatedAt: Date.now(),
    });

    console.log('[Tracking] Started', type, 'for official start at', startDate.toISOString());

    try {
      await startLocationWatch(type);
    } catch (error) {
      console.error("[Tracking] Could not start GPS workout:", error);
      Alert.alert("Workout Start Failed", "RunNation could not start GPS tracking. Please check location permission and try again.");
      await stopBackgroundLocationWatch();
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      backgroundLocationHandler = null;
      runningStartTimestamp.current = null;
      activeWorkoutSessionId.current = null;
      await clearPersistedWorkoutSession();
      runStateRef.current = "idle";
      exerciseTypeRef.current = null;
      selectedEventRunRef.current = null;
      startTimeRef.current = null;
      setRunState("idle");
      setExerciseType(null);
      setSelectedEventRun(null);
      return;
    }

    startWorkoutTimer();
  }, [canUseCycleWorkout, cycleWorkoutOnly, effectiveRegistrationId, ensureForegroundLocationPermission, startLocationWatch, startWorkoutTimer, stopBackgroundLocationWatch, user?.id]);

  const playCountdownCue = useCallback((value: string) => {
    if (!activityVoiceAssistantEnabled) {
      return;
    }

    const spokenValue = value === "START" ? "Start" : value;
    AccessibilityInfo.announceForAccessibility(spokenValue);

    if (Platform.OS === "web") {
      const webGlobal = globalThis as any;
      const SpeechUtterance = webGlobal.SpeechSynthesisUtterance;
      if (webGlobal.speechSynthesis && SpeechUtterance) {
        webGlobal.speechSynthesis.cancel();
        webGlobal.speechSynthesis.speak(new SpeechUtterance(spokenValue));
      }
      return;
    }

    Speech.stop();
    Speech.speak(spokenValue, {
      rate: 0.95,
      pitch: 1,
    });
  }, [activityVoiceAssistantEnabled]);

  const waitForCountdownStep = useCallback((milliseconds: number) => {
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, milliseconds);
      countdownTimeouts.current.push(timeout);
    });
  }, []);

  const startTrackingWithCountdown = useCallback(async (type: ExerciseType, eventRun: RegisteredEventRun | null = null) => {
    if (!type || isCountdownActive || runState !== "idle") {
      return;
    }

    if (type === "Treadmill") {
      setShowTreadmillModal(true);
      return;
    }

    if (type === "Cycle" && !canUseCycleWorkout) {
      Alert.alert("Cycle Workouts", "Cycle is available for Para Runners who use a wheelchair or handcycle.");
      return;
    }
    if ((type === "Walk" || type === "Run") && cycleWorkoutOnly) {
      Alert.alert("Workout Type", "Your Para equipment profile qualifies for Cycle workouts only.");
      return;
    }

    const mergeBase = await resolveMergeWorkoutBase(type, eventRun);

    setIsCountdownActive(true);
    try {
      const officialStartTimestamp = Date.now() + WORKOUT_COUNTDOWN_MS;
      await startTracking(type, eventRun, officialStartTimestamp, mergeBase);
      if (!activeWorkoutSessionId.current || runStateRef.current === "idle") {
        return;
      }
      for (const value of ["3", "2", "1", "START"]) {
        setCountdownValue(value);
        playCountdownCue(value);
        await waitForCountdownStep(value === "START" ? 500 : 900);
      }
      setCountdownValue(null);
    } finally {
      setCountdownValue(null);
      setIsCountdownActive(false);
      countdownTimeouts.current = [];
    }
  }, [canUseCycleWorkout, cycleWorkoutOnly, isCountdownActive, playCountdownCue, resolveMergeWorkoutBase, runState, startTracking, waitForCountdownStep]);

  const getStairSensorSummary = useCallback(() => {
    const samples = stairSensorSamples.current;
    const activeSamples = stairSensorActiveSamples.current;
    const elapsedSeconds = stairSensorSessionStart.current
      ? Math.max(0, Math.floor((Date.now() - stairSensorSessionStart.current) / 1000))
      : 0;
    const movementRatio = samples > 0 ? activeSamples / samples : 0;
    return {
      movementActiveSeconds: Math.max(0, Math.floor(elapsedSeconds * movementRatio)),
      sensorDataCoverage: samples > 0 ? 1 : 0,
      detectedStepEvents: activeSamples,
      barometricElevationChangeM: null,
    };
  }, []);

  const openStairScanner = useCallback(() => {
    if (runState !== "idle") {
      Alert.alert("Workout Active", "Finish or close the current workout before starting a Stair Climb.");
      return;
    }
    setStairCameraEnabled(false);
    setStairLandingSection("menu");
    setShowStairScannerModal(true);
  }, [runState]);

  const canRouteUseScanner = useCallback((route: any | null) => {
    if (!route) return false;
    return Boolean(
      route.hasPrintableQrs &&
      route.hasPrintedQrs &&
      Number(route.qrCheckpointCount || 0) >= (route.middleCheckpointRequired ? 3 : 2)
    );
  }, []);

  const startSelectedStairScanner = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("Camera Not Available", "This device cannot scan stair QR codes here. Use a phone build with camera QR scanning.");
      return;
    }
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert(
          "Camera Permission Needed",
          "RunNation needs camera access to scan staircase QR checkpoints. If the device cannot read QR codes, this stairs activity cannot be performed on it."
        );
        return;
      }
    }
    setStairLandingSection("start");
    setStairCameraEnabled(true);
  }, [cameraPermission?.granted, requestCameraPermission]);

  const downloadGeneratedStairQrSheet = useCallback(async () => {
    if (!generatedStairRouteId || generatedStairStickers.length === 0 || !effectiveRegistrationId) {
      Alert.alert("No QR Sheet", "Create a building first so RunNation can generate its stair QR sheet.");
      return;
    }

    const buildingName = stairSetupForm.buildingName.trim() || "Stair building";
    const qrBlocks = generatedStairStickers.map((sticker) => `
      <section class="tag">
        <h1>RunNation</h1>
        <h2>Stairs Workout</h2>
        <img src="${sticker.qrDataUrl}" />
        <p class="floor">Floor: ${sticker.floorLabel || sticker.checkpointType}</p>
        <p>${sticker.label}</p>
      </section>
    `).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8" />
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111827}
        .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
        .tag{border:2px solid #0F766E;border-radius:12px;padding:18px;text-align:center;page-break-inside:avoid}
        h1{margin:0;color:#0F766E;font-size:28px} h2{margin:4px 0 12px;font-size:20px}
        img{width:240px;height:240px}.floor{font-weight:700;font-size:18px}
      </style></head><body><h1>${buildingName}</h1><div class="grid">${qrBlocks}</div></body></html>`;
    const fileName = `runnation-stairs-${Date.now()}.html`;
    const fileUri = `${FileSystem.documentDirectory || ""}${fileName}`;

    try {
      await FileSystem.writeAsStringAsync(fileUri, html, { encoding: FileSystem.EncodingType.UTF8 });
      await getServerClient().activities.markStairRoutePrinted.mutate({
        registrationId: effectiveRegistrationId,
        routeId: generatedStairRouteId,
      });
      await refetchStairRoutes();
      await Share.share({
        title: "RunNation Stairs QR Sheet",
        message: `Printable RunNation stairs QR sheet created for ${buildingName}: ${fileUri}`,
        url: fileUri,
      } as any);
      Alert.alert("QR Sheet Ready", "The QR sheet was generated and recorded as downloaded/printed for this building.");
    } catch (error: any) {
      Alert.alert("QR Sheet Failed", error?.message || "Could not generate the printable QR sheet.");
    }
  }, [effectiveRegistrationId, generatedStairRouteId, generatedStairStickers, refetchStairRoutes, stairSetupForm.buildingName]);

  const handleStairQrToken = useCallback(async (rawToken: string) => {
    const token = rawToken.trim();
    if (!token || isScanningStairQr) return;
    if (!effectiveRegistrationId) {
      Alert.alert("Error", "You must be logged in to record a Stair Climb.");
      return;
    }

    setIsScanningStairQr(true);
    try {
      const result = await getServerClient().activities.scanStairCheckpoint.mutate({
        registrationId: effectiveRegistrationId,
        qrToken: token,
        sessionId: activeStairSession?.sessionId || null,
        selectedAscentType: stairScanMode,
        devicePlatform: Platform.OS,
        deviceModel: Platform.OS,
        availableSensors: { accelerometer: true },
        sensorSummary: getStairSensorSummary(),
      });

      if (!result.sessionId) {
        throw new Error("Stair scan did not return an active session.");
      }

      const nextSession: ActiveStairSession = {
        sessionId: result.sessionId,
        lapId: result.lapId,
        routeId: result.route?.routeId,
        buildingName: result.route?.buildingName,
        routeName: result.route?.routeName,
        nextCheckpoint: result.nextCheckpoint,
        completedAscents: result.completedAscents ?? activeStairSession?.completedAscents ?? 0,
        verifiedSteps: result.totalSteps ?? activeStairSession?.verifiedSteps ?? 0,
        startedAt: activeStairSession?.startedAt ?? new Date(),
        lastMessage: result.message || "Checkpoint scanned.",
      };
      setActiveStairSession(nextSession);
      if (stairScanAutoCloseTimeout.current) {
        clearTimeout(stairScanAutoCloseTimeout.current);
        stairScanAutoCloseTimeout.current = null;
      }
      if (result.route?.routeId) {
        const matchedRoute = stairRoutes.find((route: any) => route.routeId === result.route?.routeId);
        setSelectedStairRoute(matchedRoute || {
          routeId: result.route.routeId,
          routeName: result.route.routeName,
          building: { buildingName: result.route.buildingName },
        });
      }
      setManualStairQrToken("");
      stairSensorSessionStart.current = Date.now();
      stairSensorSamples.current = 0;
      stairSensorActiveSamples.current = 0;
      stairSensorLastSample.current = null;
      speakActivityMessage(result.message || "Stair checkpoint scanned.");
    } catch (error: any) {
      Alert.alert("Stair QR Not Accepted", error?.message || "This checkpoint could not be used for the current stair activity.");
    } finally {
      setTimeout(() => setIsScanningStairQr(false), 1200);
    }
  }, [activeStairSession, effectiveRegistrationId, getStairSensorSummary, isScanningStairQr, speakActivityMessage, stairRoutes, stairScanMode]);

  const registerStairBuildingRoute = useCallback(async () => {
    if (!effectiveRegistrationId) {
      Alert.alert("Error", "You must be logged in to set up a staircase.");
      return;
    }

    const floorSegments = parseInt(stairSetupForm.floorSegments, 10);
    const stepsGroundToFirst = parseInt(stairSetupForm.stepsGroundToFirst, 10);
    const middleRequired = floorSegments > 7;
    const bottomToMiddleSegments = middleRequired ? Math.ceil(floorSegments / 2) : null;
    const middleToTopSegments = middleRequired && bottomToMiddleSegments ? floorSegments - bottomToMiddleSegments : null;
    const bottomToMiddleSteps = bottomToMiddleSegments ? bottomToMiddleSegments * stepsGroundToFirst : null;
    const middleToTopSteps = middleToTopSegments ? middleToTopSegments * stepsGroundToFirst : null;
    const bottomToTopSteps = floorSegments * stepsGroundToFirst;

    if (!stairSetupForm.buildingName.trim()) {
      Alert.alert("Missing Details", "Enter the building name.");
      return;
    }
    if (!floorSegments || floorSegments < 3) {
      Alert.alert("Building Does Not Qualify", "A building needs at least 3 staircase segments, including basement segments where applicable, to qualify.");
      return;
    }
    if (!stepsGroundToFirst || stepsGroundToFirst <= 0) {
      Alert.alert("Invalid Stair Count", "Enter the physically counted steps from the ground floor to the first floor.");
      return;
    }

    setIsRegisteringStairRoute(true);
    try {
      const result = await getServerClient().activities.registerStairRoute.mutate({
        registrationId: effectiveRegistrationId,
        buildingName: stairSetupForm.buildingName.trim(),
        countryCode: stairSetupForm.countryCode.trim() || null,
        city: stairSetupForm.city.trim() || null,
        addressDescription: stairSetupForm.addressDescription.trim() || null,
        accessType: stairSetupForm.accessType,
        qrTagType: "permanent_tag",
        qrCustodianName: stairSetupForm.qrCustodianName.trim() || null,
        qrCustodianPhone: stairSetupForm.qrCustodianPhone.trim() || null,
        qrCustodianEmail: stairSetupForm.qrCustodianEmail.trim() || null,
        routeName: stairSetupForm.routeName.trim() || "Main staircase",
        stairwellName: stairSetupForm.stairwellName.trim() || null,
        bottomFloorLabel: "Bottom",
        middleFloorLabel: middleRequired ? `Segment ${bottomToMiddleSegments}` : null,
        topFloorLabel: `Segment ${floorSegments}`,
        floorSegments,
        bottomToMiddleSteps: middleRequired ? bottomToMiddleSteps : null,
        middleToTopSteps: middleRequired ? middleToTopSteps : null,
        bottomToTopSteps,
        minimumDurationSeconds: parseInt(stairSetupForm.minimumDurationSeconds, 10) || 20,
        maximumDurationSeconds: parseInt(stairSetupForm.maximumDurationSeconds, 10) || 7200,
        measurementMethod: "User counted ground-to-first-floor steps; total calculated from building floor count",
        activateCheckpoints: false,
      });
      setGeneratedStairStickers(result.printableStickers || []);
      setGeneratedStairRouteId(result.route?.routeId || null);
      setShowStairSetupForm(false);
      await refetchStairRoutes();
      Alert.alert("Staircase Registered", "Printable QR stickers were generated. They should be approved and activated before competitive use.");
    } catch (error: any) {
      Alert.alert("Could Not Register Staircase", error?.message || "Please check the details and try again.");
    } finally {
      setIsRegisteringStairRoute(false);
    }
  }, [effectiveRegistrationId, refetchStairRoutes, stairSetupForm]);

  const endActiveStairSession = useCallback(async () => {
    if (!activeStairSession || !effectiveRegistrationId) {
      setShowStairScannerModal(false);
      return;
    }

    setIsSaving(true);
    try {
      const result = await getServerClient().activities.endStairSession.mutate({
        registrationId: effectiveRegistrationId,
        sessionId: activeStairSession.sessionId,
      });
      setActiveStairSession(null);
      setShowStairScannerModal(false);
      Alert.alert(
        "Stair Climb Saved",
        `${Number(result.session.verifiedAscendingSteps || 0).toLocaleString()} verified stair steps across ${result.session.completedAscents} ascent${result.session.completedAscents === 1 ? "" : "s"}.`
      );
      void speakGoalReportAfterActivity({
        registrationId: effectiveRegistrationId,
        activityId: result.session.activityId || activeStairSession.sessionId,
        activityDate: new Date().toISOString().split("T")[0],
        startTime: new Date(activeStairSession.startedAt).toISOString().split("T")[1].split(".")[0],
        endTime: new Date().toISOString().split("T")[1].split(".")[0],
        distanceKm: 0,
        durationSeconds: result.session.totalDurationSeconds || stairSessionSeconds,
        eventIds: [],
      });
    } catch (error: any) {
      Alert.alert("Could Not End Stair Climb", error?.message || "Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [activeStairSession, effectiveRegistrationId, speakGoalReportAfterActivity, stairSessionSeconds]);

  const pauseTracking = () => {
    if (runningStartTimestamp.current !== null) {
      const now = Date.now();
      elapsedBeforePause.current += Math.floor((now - runningStartTimestamp.current) / 1000);
      runningStartTimestamp.current = null;
    }
    pauseStartTimestamp.current = Date.now();
    autoPaused.current = false;
    stationaryStartTimestamp.current = null;
    autoPauseAnchorPoint.current = null;
    runStateRef.current = "paused";
    setRunState("paused");
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    void stopBackgroundLocationWatch();
    void persistActiveWorkoutSession("paused");
    console.log('[Tracking] Paused. Elapsed so far:', elapsedBeforePause.current, 's');
  };

  const resumeTracking = async () => {
    if (Platform.OS === 'web') {
      return;
    }

    if (pauseStartTimestamp.current !== null) {
      const pauseMs = Date.now() - pauseStartTimestamp.current;
      totalPauseDuration.current += pauseMs;
      pauseStartTimestamp.current = null;
      console.log('[Tracking] Pause duration:', Math.floor(pauseMs / 1000), 's. Total pause:', Math.floor(totalPauseDuration.current / 1000), 's');
    }

    isResuming.current = true;
    autoPaused.current = false;
    stationaryStartTimestamp.current = null;
    autoPauseAnchorPoint.current = null;
    runStateRef.current = "running";
    setRunState("running");
    runningStartTimestamp.current = Date.now();

    startWorkoutTimer();

    await startLocationWatch(exerciseType);
    void persistActiveWorkoutSession("running");
  };

  const resumeFinishedActivity = async () => {
    if (!exerciseTypeRef.current || !startTimeRef.current || !activeWorkoutSessionId.current) {
      Alert.alert("Cannot Resume", "RunNation could not find the active workout details for this activity.");
      return;
    }

    setShowRunDetailsModal(false);
    setActivitySaved(false);
    pauseStartTimestamp.current = Date.now();
    runStateRef.current = "paused";
    setRunState("paused");
    await resumeTracking();
  };

  const startFinishHoldFeedback = () => {
    finishHoldProgress.stopAnimation();
    finishHoldProgress.setValue(0);
    Animated.timing(finishHoldProgress, {
      toValue: 1,
      duration: FINISH_LONG_PRESS_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const resetFinishHoldFeedback = () => {
    finishHoldProgress.stopAnimation();
    Animated.timing(finishHoldProgress, {
      toValue: 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  };

  const finishWorkoutAfterHold = () => {
    finishHoldProgress.stopAnimation();
    Animated.timing(finishHoldProgress, {
      toValue: 1,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
    void stopTracking();
  };

  const stopTracking = async () => {
    if (runningStartTimestamp.current !== null) {
      const now = Date.now();
      elapsedBeforePause.current += Math.floor((now - runningStartTimestamp.current) / 1000);
      runningStartTimestamp.current = null;
    }
    const finalDuration = elapsedBeforePause.current;
    durationRef.current = finalDuration;
    const activePauseMs = pauseStartTimestamp.current !== null ? Date.now() - pauseStartTimestamp.current : 0;
    const finalPauseDurationSeconds = Math.floor((totalPauseDuration.current + activePauseMs) / 1000);
    setDuration(finalDuration);
    setPauseDurationSeconds(finalPauseDurationSeconds);
    pauseDurationSecondsRef.current = finalPauseDurationSeconds;

    console.log('[Tracking] Stopped. Final distance:', distance.toFixed(3), 'km, duration:', finalDuration, 's, filtered points:', filteredPointCount.current);

    if (!startTime || !workoutOwnerRegistrationId.current) {
      console.log('[Tracking] Missing local workout identity or start time');
      return;
    }

    const durationMinutes = finalDuration / 60;
    if (isAbnormallyFastWalkOrRun(exerciseType, distance, finalDuration)) {
      if (pauseStartTimestamp.current === null) {
        pauseStartTimestamp.current = Date.now();
      }
      runStateRef.current = "paused";
      setRunState("paused");
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      void stopBackgroundLocationWatch();
      void persistActiveWorkoutSession("paused");
      Alert.alert(
        "Abnormally High Speed",
        "This Run or Walk is over 1 km and its average speed is above 2.3 km/min. It cannot be finished or saved. Resume to continue recording, or close it without saving."
      );
      return;
    }

    const requiresDistance = exerciseType === "Walk" || exerciseType === "Run" || exerciseType === "Cycle";
    const requiredDistance = exerciseType === "Walk" ? MIN_DISTANCE_WALK : MIN_DISTANCE_RUN;
    const needsDistance = requiresDistance && distance < requiredDistance;
    const needsTime = (requiresDistance || exerciseType === "Stairs") && durationMinutes < MIN_ACTIVITY_DURATION_MINUTES;
    if (needsDistance || needsTime) {
      if (pauseStartTimestamp.current === null) {
        pauseStartTimestamp.current = Date.now();
      }
      runStateRef.current = "paused";
      setRunState("paused");
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      void stopBackgroundLocationWatch();
      void persistActiveWorkoutSession("paused");
      Alert.alert(
        "Pause and Resume Later",
        exerciseType === "Stairs"
          ? `Stairs workouts need at least ${MIN_ACTIVITY_DURATION_MINUTES} minutes. You have ${Math.floor(durationMinutes)} minutes so far.`
          : `Recordable workouts need at least ${requiredDistance} km and ${MIN_ACTIVITY_DURATION_MINUTES} minutes. You have ${distance.toFixed(2)} km and ${Math.floor(durationMinutes)} minutes so far.`,
        [
          { text: "Resume Later", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: resetTracking },
        ]
      );
      return;
    }

    if (pauseStartTimestamp.current !== null) {
      totalPauseDuration.current += activePauseMs;
      pauseStartTimestamp.current = null;
    }
    setPauseDurationSeconds(Math.floor(totalPauseDuration.current / 1000));
    pauseDurationSecondsRef.current = Math.floor(totalPauseDuration.current / 1000);
    runStateRef.current = "finished";
    setRunState("finished");
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    void stopBackgroundLocationWatch();
    void persistActiveWorkoutSession("finished");
    setActivitySaved(false);
    setShowRunDetailsModal(true);
  };

  const saveFinishedActivity = async () => {
    if (activitySaved) {
      Alert.alert("Already Saved", "This activity has already been saved.");
      return;
    }

    if (isAbnormallyFastWalkOrRun(exerciseType, distance, duration)) {
      Alert.alert(
        "Workout Cannot Be Saved",
        "This Run or Walk was flagged for abnormally high average speed. Continue recording or close it without saving."
      );
      return;
    }

    const ownerRegistrationId = workoutOwnerRegistrationId.current || effectiveRegistrationId || user?.id;
    if (!ownerRegistrationId || !startTime) {
      Alert.alert("Error", "Missing activity details. Please try again.");
      return;
    }

    const finalDuration = duration;
    const isStairsWorkout = exerciseType === "Stairs";
    const stairsSteps = isStairsWorkout ? parseInt(stairsStepsInput.replace(/,/g, ""), 10) : null;
    if (isStairsWorkout && (!stairsSteps || isNaN(stairsSteps) || stairsSteps <= 0)) {
      Alert.alert("Stair Steps Required", "Enter the number of stair steps climbed before saving this workout.");
      return;
    }

    setIsSaving(true);
    try {
      const activeMergeBase = mergeWorkoutBaseRef.current;
      const savedStartTime = activeMergeBase ? new Date(activeMergeBase.startedAt) : startTime;
      const today = activeMergeBase?.activityDate || savedStartTime.toISOString().split('T')[0];
      const savedDistanceKm = isStairsWorkout ? 0 : parseFloat(distance.toFixed(2));
      const calculatedPace = !isStairsWorkout && finalDuration > 0 && distance > 0 ? (finalDuration / 60) / distance : 0;
      const actualEndTime = new Date(savedStartTime.getTime() + ((finalDuration + pauseDurationSeconds) * 1000));
      const startTimeStr = activeMergeBase?.startTime || savedStartTime.toISOString().split('T')[1].split('.')[0];
      const endTimeStr = actualEndTime.toISOString().split('T')[1].split('.')[0];
      const nextActivityId = activeMergeBase?.activityId || activeWorkoutSessionId.current || uuidv4();
      const eventIds = selectedEventRun
        ? selectedEventRun.eventIds?.length
          ? selectedEventRun.eventIds
          : [selectedEventRun.eventId]
        : [];

      const pendingCount = await enqueueOfflineWorkout({
        queueId: nextActivityId,
        createdAt: new Date().toISOString(),
        activity: {
          activity_id: nextActivityId,
          registration_id: ownerRegistrationId,
          activity_date: today,
          exercise_type: exerciseType || "Run",
          distance_km: savedDistanceKm,
          steps_count: isStairsWorkout ? stairsSteps : null,
          pause_duration_seconds: pauseDurationSeconds,
          start_time: startTimeStr,
          end_time: endTimeStr,
          pace_min_per_km: parseFloat(calculatedPace.toFixed(2)),
        },
        eventResults: isStairsWorkout ? [] : eventIds.map((eventId) => ({
          eventId,
          registrationId: ownerRegistrationId,
          distanceKm: savedDistanceKm,
          timeSeconds: finalDuration,
        })),
        snapshot: {
          startTimeIso: savedStartTime.toISOString(),
          durationSeconds: finalDuration,
          pauseDurationSeconds,
          distanceKm: distance,
          coordinates: coordsRef.current.slice(-MAX_ROUTE_POINTS),
        },
      });

      setActivitySaved(true);
      setPendingWorkoutSyncCount(pendingCount);
      void speakGoalReportAfterActivity({
        registrationId: ownerRegistrationId,
        activityId: nextActivityId,
        activityDate: today,
        startTime: startTimeStr,
        endTime: endTimeStr,
        distanceKm: savedDistanceKm,
        durationSeconds: finalDuration,
        eventIds: isStairsWorkout ? [] : eventIds,
      });
      const { data: savedActivities } = await supabase
        .from("activities")
        .select("activity_id, distance_km")
        .eq("registration_id", ownerRegistrationId);
      const existingSavedActivity = (savedActivities || []).find((activity: any) => activity.activity_id === nextActivityId);
      const existingDistance = Number(existingSavedActivity?.distance_km || 0);
      const previousDistance = (savedActivities || []).reduce((sum: number, activity: any) => sum + (Number(activity.distance_km) || 0), 0);
      const previousActivities = savedActivities?.length || 0;
      const totalDistance = previousDistance - existingDistance + savedDistanceKm;
      const totalActivities = previousActivities + (existingSavedActivity ? 0 : 1);
      void checkAndNotifyWorkoutMilestones(
        ownerRegistrationId,
        totalDistance,
        totalActivities,
        getEarnedBadgeCount(totalDistance, totalActivities),
        previousDistance,
        previousActivities,
        getEarnedBadgeCount(previousDistance, previousActivities)
      );
      Alert.alert(
        "Saved on Device",
        "Your workout is safe. RunNation will sync it automatically whenever internet access is available."
      );
      void syncQueuedWorkouts();
    } catch (err) {
      console.error("[Tracking] Could not save workout locally:", err);
      Alert.alert("Storage Error", "RunNation could not store this workout on the device. Please keep this screen open and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const resetTracking = () => {
    runStateRef.current = "idle";
    setRunState("idle");
    setDistance(0);
    distanceRef.current = 0;
    setDuration(0);
    durationRef.current = 0;
    setPauseDurationSeconds(0);
    pauseDurationSecondsRef.current = 0;
    setPace(0);
    setStairsStepsInput("");
    setCoords([]);
    coordsRef.current = [];
    setStartTime(null);
    startTimeRef.current = null;
    setExerciseType(null);
    exerciseTypeRef.current = null;
    setSelectedEventRun(null);
    selectedEventRunRef.current = null;
    setWorkoutLocation(null);
    mergeWorkoutBaseRef.current = null;
    setShowRunDetailsModal(false);
    setActivitySaved(false);
    elapsedBeforePause.current = 0;
    runningStartTimestamp.current = null;
    lastValidPoint.current = null;
    lastProcessedLocationTimestamp.current = null;
    isResuming.current = false;
    totalPauseDuration.current = 0;
    pauseStartTimestamp.current = null;
    filteredPointCount.current = 0;
    lastAnnouncedKilometer.current = 0;
    stationaryStartTimestamp.current = null;
    autoPaused.current = false;
    autoPauseAnchorPoint.current = null;
    activeWorkoutSessionId.current = null;
    workoutOwnerRegistrationId.current = null;
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    void stopBackgroundLocationWatch();
    void clearPersistedWorkoutSession();
    countdownTimeouts.current.forEach(clearTimeout);
    countdownTimeouts.current = [];
    setCountdownValue(null);
    setIsCountdownActive(false);
    Speech.stop();
  };

  const closeFinishedActivity = () => {
    resetTracking();
    router.replace("/(tabs)/activity" as any);
  };

  const closeAbnormalWorkoutWithoutSaving = () => {
    Alert.alert(
      "Close Without Saving?",
      "This workout will be permanently discarded and will not count toward leaderboards or events.",
      [
        { text: "Keep Workout", style: "cancel" },
        {
          text: "Close Without Saving",
          style: "destructive",
          onPress: () => {
            resetTracking();
            router.replace("/(tabs)/activity" as any);
          },
        },
      ]
    );
  };

  const getRunShareMessage = () => {
    const runnerName = runnerProfile?.name || user?.username || "RunNation Runner";
    const eventLine = selectedEventRun ? `\nEvent: ${selectedEventRun.eventName}` : "";
    const dateLine = startTime ? startTime.toLocaleDateString() : new Date().toLocaleDateString();
    const startLine = startTime ? startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";
    const isStairsWorkout = exerciseType === "Stairs";
    const stairsSteps = parseInt(stairsStepsInput.replace(/,/g, ""), 10) || 0;

    return [
      `${runnerName} completed a ${exerciseType || "Run"} on RunNation.`,
      isStairsWorkout ? `Stair steps: ${stairsSteps.toLocaleString()}` : `Distance: ${distance.toFixed(2)} km`,
      `Time: ${formatTime(duration)}`,
      isStairsWorkout ? null : `Pace: ${formatPaceMinPerKm()} /km`,
      `Date: ${dateLine}`,
      `Start: ${startLine}${eventLine}`,
      "RunNation - Where runners belong",
      "",
      Platform.OS === "ios"
        ? "Get RunNation on iOS: coming soon"
        : `Get RunNation Android APK: ${RUNNATION_ANDROID_APK_LINK}`,
    ].filter(Boolean).join("\n");
  };

  const formatPaceMinPerKm = () => {
    if (!distance || duration <= 0) return "-";
    const totalSecondsPerKm = Math.round(duration / distance);
    const minutes = Math.floor(totalSecondsPerKm / 60);
    const seconds = totalSecondsPerKm % 60;
    return `${minutes.toString().padStart(2, "0")}'${seconds.toString().padStart(2, "0")}"`;
  };

  const getRunDetailsMeta = () => {
    const locationLabel = [
      workoutLocation?.locality,
      workoutLocation?.country,
    ].filter(Boolean).join(", ");

    return [
      workoutLocation?.countryFlag,
      locationLabel,
    ].filter(Boolean).join("  ");
  };

  const getRouteRegion = () => {
    if (coords.length === 0) {
      return currentLocation
        ? {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }
        : {
            latitude: 0,
            longitude: 0,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          };
    }

    const latitudes = coords.map((coord) => coord.latitude);
    const longitudes = coords.map((coord) => coord.longitude);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLon = Math.min(...longitudes);
    const maxLon = Math.max(...longitudes);
    const latitudeDelta = Math.max((maxLat - minLat) * 2.2, 0.0035);
    const longitudeDelta = Math.max((maxLon - minLon) * 2.2, 0.0035);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta,
      longitudeDelta,
    };
  };

  const getWeatherDisplay = () => {
    const month = startTime?.getMonth() ?? new Date().getMonth();
    const hour = startTime?.getHours() ?? new Date().getHours();

    if (month === 11 || month === 0 || month === 1) return "â„ï¸ Snow";
    if (month >= 2 && month <= 4) return "ðŸŒ¦ï¸ Rainy";
    if (hour >= 18 || hour < 6) return "ðŸŒ™ Cool";
    return "â˜€ï¸ Sunny";
  };

  const shareRunDetails = async () => {
    try {
      await Share.share({
        title: "RunNation Activity",
        message: getRunShareMessage(),
      });
    } catch (error) {
      console.error("[Share Run] Error:", error);
      Alert.alert("Error", "Could not open sharing options.");
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setTreadmillImage(result.assets[0].uri);
    }
  };

  const pickEvidenceImage = async (setImage: (uri: string) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setImage(result.assets[0].uri);
    }
  };

  const getMimeTypeFromUri = (uri: string) => {
    const dataUriMatch = uri.match(/^data:([^;]+);base64,/);
    if (dataUriMatch?.[1]) return dataUriMatch[1];
    const lowerUri = uri.toLowerCase();
    if (lowerUri.includes(".png")) return "image/png";
    if (lowerUri.includes(".webp")) return "image/webp";
    if (lowerUri.includes(".avif")) return "image/avif";
    return "image/jpeg";
  };

  const readImageAsBase64 = async (uri: string) => {
    const dataUriMatch = uri.match(/^data:[^;]+;base64,(.+)$/);
    if (dataUriMatch?.[1]) return dataUriMatch[1];

    if (Platform.OS !== "web") {
      return FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });
    }

    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = String(reader.result || "");
        const base64 = result.split(",")[1];
        if (base64) {
          resolve(base64);
        } else {
          reject(new Error("Could not read selected image."));
        }
      };
      reader.onerror = () => reject(new Error("Could not read selected image."));
      reader.readAsDataURL(blob);
    });
  };

  const getEvidenceImagePayload = async (uri: string) => {
    const imageBase64 = await readImageAsBase64(uri);
    const mimeType = getMimeTypeFromUri(uri);
    return { evidenceImageBase64: imageBase64, evidenceMimeType: mimeType };
  };

  const isExternalActivityInRegisteredEvent = (activityDate: string) => {
    if (!activityDate || !/^\d{4}-\d{2}-\d{2}$/.test(activityDate)) return false;
    const activityWeekday = getUtcWeekday(activityDate);

    return (registeredEvents || []).some((eventItem) => {
      const event = eventItem as RegisteredEventRun;
      const eventType = getRegisteredEventType(event);
      const startDate = getDateOnly(event.startsAt);
      const endDate = getDateOnly(event.endsAt);

      if (startDate && activityDate < startDate) return false;
      if (endDate && activityDate > endDate) return false;

      if (eventType === "recurring") {
        return event.recurrenceWeekday === null ||
          event.recurrenceWeekday === undefined ||
          Number(event.recurrenceWeekday) === activityWeekday;
      }

      if (eventType === "multiday") {
        return Boolean(startDate && endDate && activityDate >= startDate && activityDate <= endDate);
      }

      return startDate === activityDate;
    });
  };

  const submitTreadmill = async () => {
    if (!treadmillDistance || !treadmillTime || !treadmillImage) {
      Alert.alert("Error", "Please fill all fields and upload an image");
      return;
    }

    const distanceKm = parseFloat(treadmillDistance);
    const timeMinutes = parseFloat(treadmillTime);

    if (isNaN(distanceKm) || isNaN(timeMinutes) || distanceKm <= 0 || timeMinutes <= 0) {
      Alert.alert("Error", "Please enter valid distance and time");
      return;
    }

    if (!user) {
      Alert.alert("Error", "You must be logged in to submit activities");
      return;
    }

    try {
      const imageBase64 = await readImageAsBase64(treadmillImage);
      const mimeType = getMimeTypeFromUri(treadmillImage);

      await getServerClient().activities.submitTreadmillActivity.mutate({
        registrationId: user.id,
        distanceKm,
        timeMinutes,
        imageBase64,
        mimeType,
      });
    } catch (error: any) {
      console.error("Error submitting treadmill activity:", error);
      Alert.alert("Error", error?.message || "Failed to submit activity");
      return;
    }

    Alert.alert("Success", "Treadmill activity submitted for approval");
    setShowTreadmillModal(false);
    setTreadmillDistance("");
    setTreadmillTime("");
    setTreadmillImage(null);
  };

  const submitSmartWatch = async () => {
    if (!user) {
      Alert.alert("Error", "You must be logged in");
      return;
    }

    const heartRate = smartWatchValues.heart_rate.trim() ? parseInt(smartWatchValues.heart_rate, 10) : null;
    const steps = smartWatchValues.steps.trim() ? parseInt(smartWatchValues.steps, 10) : null;
    const distanceKm = smartWatchValues.distance_km.trim() ? parseFloat(smartWatchValues.distance_km) : null;
    const spo2 = smartWatchValues.spo2.trim() ? parseFloat(smartWatchValues.spo2) : null;
    const hasHealthMetrics = heartRate !== null || steps !== null || spo2 !== null;
    const hasActivitySubmission = distanceKm !== null;

    if (!hasHealthMetrics && !hasActivitySubmission) {
      Alert.alert("Error", "Enter health readings for Goals, or add distance details for activity approval.");
      return;
    }

    if (heartRate !== null && (isNaN(heartRate) || heartRate < 20 || heartRate > 250)) {
      Alert.alert("Error", "Please enter a valid heart rate (20-250 bpm)");
      return;
    }
    if (steps !== null && (isNaN(steps) || steps < 0)) {
      Alert.alert("Error", "Please enter valid steps");
      return;
    }
    if (distanceKm !== null && (isNaN(distanceKm) || distanceKm <= 0)) {
      Alert.alert("Error", "Please enter a valid smart watch distance");
      return;
    }
    if (spo2 !== null && (isNaN(spo2) || spo2 < 50 || spo2 > 100)) {
      Alert.alert("Error", "Please enter valid SpO2 (50-100%)");
      return;
    }
    if (hasActivitySubmission) {
      if (!smartWatchActivityForm.activityDate || !smartWatchActivityForm.startTime || !smartWatchActivityForm.duration) {
        Alert.alert("Missing Activity Details", "Add date, start time, and duration so the smart watch activity can be reviewed.");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(smartWatchActivityForm.activityDate)) {
        Alert.alert("Invalid Date", "Use YYYY-MM-DD for smart watch activity date.");
        return;
      }
      if (!/^\d{2}:\d{2}$/.test(smartWatchActivityForm.startTime)) {
        Alert.alert("Invalid Start Time", "Use HH:MM for smart watch start time.");
        return;
      }
      if (!/^\d{2}:\d{2}$/.test(smartWatchActivityForm.duration)) {
        Alert.alert("Invalid Duration", "Use HH:MM for smart watch duration.");
        return;
      }
      if (isExternalActivityInRegisteredEvent(smartWatchActivityForm.activityDate) && !smartWatchEvidenceImage) {
        Alert.alert("Missing Event Evidence", "This date matches a registered event. Upload a smart watch screenshot for event credit, or use a non-event date.");
        return;
      }
    }

    setIsSubmittingSmartWatch(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      console.log("[SmartWatch] Saving data for date:", today);

      if (hasHealthMetrics) {
        const { data: existing } = await supabase
          .from("health_goal")
          .select("health_id")
          .eq("registration_id", user.id)
          .eq("record_date", today)
          .maybeSingle();

        const healthUpdateData: Record<string, any> = {};
        if (steps !== null) healthUpdateData.steps = steps;
        if (heartRate !== null) healthUpdateData.heart_rate_bpm = heartRate;
        if (spo2 !== null) healthUpdateData.blood_oxygen_spo2 = spo2;

        if (existing) {
          const { error } = await supabase
            .from("health_goal")
            .update(healthUpdateData)
            .eq("health_id", existing.health_id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("health_goal")
            .insert({
              registration_id: user.id,
              record_date: today,
              steps: steps ?? 0,
              heart_rate_bpm: heartRate,
              blood_oxygen_spo2: spo2,
            });
          if (error) throw error;
        }
      }

      if (hasActivitySubmission) {
        const evidencePayload = smartWatchEvidenceImage
          ? await getEvidenceImagePayload(smartWatchEvidenceImage)
          : {};
        await getServerClient().activities.submitExternalActivity.mutate({
          registrationId: user.id,
          activityDate: smartWatchActivityForm.activityDate,
          exerciseType: "Run",
          startTime: `${smartWatchActivityForm.startTime}:00`,
          duration: `${smartWatchActivityForm.duration}:00`,
          distanceKm,
          sourceType: "smart_watch",
          sourceLabel: "Smart Watch",
          ...evidencePayload,
        });
      }

      console.log("[SmartWatch] Data saved successfully");
      const successMessage = hasHealthMetrics && hasActivitySubmission
        ? "Health readings saved. Smart watch activity submitted for approval."
        : hasActivitySubmission
        ? "Smart watch activity submitted for approval."
        : "Smart watch health readings saved to Goals.";
      Alert.alert("Success", successMessage);
      setShowSmartWatchModal(false);
      setSmartWatchValues({
        heart_rate: "",
        steps: "",
        distance_km: "",
        spo2: "",
        calories: "",
        blood_pressure: "",
      });
      setSmartWatchActivityForm({
        activityDate: "",
        startTime: "",
        duration: "",
      });
      setSmartWatchEvidenceImage(null);
    } catch (error: any) {
      console.error("[SmartWatch] Error saving:", error);
      Alert.alert("Error", error?.message || "Failed to save smart watch data");
    } finally {
      setIsSubmittingSmartWatch(false);
    }
  };

  const submitOtherSportsApp = async () => {
    if (!user?.id) {
      Alert.alert("Error", "You must be logged in to submit activities");
      return;
    }

    if (!otherSportsForm.sportsApp.trim()) {
      Alert.alert("Error", "Please enter the Sports App name");
      return;
    }

    const isStairs = otherSportsForm.exerciseType === "Stairs";
    const requiredMeasure = isStairs ? otherSportsForm.stepsCount : otherSportsForm.distanceKm;

    if (!otherSportsForm.activityDate || !otherSportsForm.startTime || !otherSportsForm.duration || !requiredMeasure) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (otherSportsForm.exerciseType === "Cycle" && !canUseCycleWorkout) {
      Alert.alert("Cycle Workouts", "Cycle is available for Para Runners who use a wheelchair or handcycle.");
      return;
    }

    if ((otherSportsForm.exerciseType === "Walk" || otherSportsForm.exerciseType === "Run") && cycleWorkoutOnly) {
      Alert.alert("Workout Type", "Your Para equipment profile qualifies for Cycle workouts only.");
      return;
    }

    const durationRegex = /^\d{2}:\d{2}:\d{2}$/;
    if (!/^\d{2}:\d{2}$/.test(otherSportsForm.startTime)) {
      Alert.alert("Error", "Start time must be in HH:MM format (e.g., 07:30)");
      return;
    }

    if (!durationRegex.test(otherSportsForm.duration)) {
      Alert.alert("Error", "Duration must be in HH:MM:SS format (e.g., 00:45:30)");
      return;
    }

    if (isExternalActivityInRegisteredEvent(otherSportsForm.activityDate) && !otherSportsEvidenceImage) {
      Alert.alert("Missing Event Evidence", "This date matches a registered event. Upload a sports app screenshot for event credit, or use a non-event date.");
      return;
    }

    const distanceNum = isStairs ? 0 : parseFloat(otherSportsForm.distanceKm);
    const stepsNum = isStairs ? parseInt(otherSportsForm.stepsCount.replace(/,/g, ""), 10) : null;
    if (!isStairs && (isNaN(distanceNum) || distanceNum <= 0)) {
      Alert.alert("Error", "Please enter a valid distance");
      return;
    }

    if (isStairs && (!stepsNum || isNaN(stepsNum) || stepsNum <= 0)) {
      Alert.alert("Error", "Please enter a valid stair step count");
      return;
    }

    const durationParts = otherSportsForm.duration.split(':');
    const durationMinutes = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1]) + parseInt(durationParts[2]) / 60;

    if (otherSportsForm.exerciseType === "Walk") {
      if (distanceNum < MIN_DISTANCE_WALK) {
        Alert.alert("Activity Not Saved", `A Walk must be at least ${MIN_DISTANCE_WALK} km to be saved.`);
        return;
      }
      if (durationMinutes < MIN_ACTIVITY_DURATION_MINUTES) {
        Alert.alert("Activity Not Saved", `A Walk must be at least ${MIN_ACTIVITY_DURATION_MINUTES} minutes to be saved.`);
        return;
      }
    } else if (otherSportsForm.exerciseType === "Run" || otherSportsForm.exerciseType === "Cycle") {
      if (distanceNum < MIN_DISTANCE_RUN) {
        Alert.alert("Activity Not Saved", `A ${otherSportsForm.exerciseType} must be at least ${MIN_DISTANCE_RUN} km to be saved.`);
        return;
      }
      if (durationMinutes < MIN_ACTIVITY_DURATION_MINUTES) {
        Alert.alert("Activity Not Saved", `A ${otherSportsForm.exerciseType} must be at least ${MIN_ACTIVITY_DURATION_MINUTES} minutes to be saved.`);
        return;
      }
    }

    setIsSubmittingOtherSports(true);

    try {
      const evidencePayload = otherSportsEvidenceImage
        ? await getEvidenceImagePayload(otherSportsEvidenceImage)
        : {};
      await getServerClient().activities.submitExternalActivity.mutate({
        registrationId: user.id,
        activityDate: otherSportsForm.activityDate,
        exerciseType: otherSportsForm.exerciseType,
        startTime: `${otherSportsForm.startTime}:00`,
        duration: otherSportsForm.duration,
        distanceKm: isStairs ? null : distanceNum,
        stepsCount: isStairs ? stepsNum : null,
        sourceType: "other_sports_app",
        sourceLabel: otherSportsForm.sportsApp.trim(),
        ...evidencePayload,
      });
      Alert.alert("Success", "Your activity has been submitted successfully!");

      setShowOtherSportsModal(false);
      setOtherSportsForm({
        sportsApp: "",
        activityDate: "",
        exerciseType: cycleWorkoutOnly ? "Cycle" : "Run",
        startTime: "",
        duration: "",
        distanceKm: "",
        stepsCount: "",
      });
      setOtherSportsEvidenceImage(null);
    } catch (error: any) {
      console.error("[Submit Other Sports] Error:", error);
      Alert.alert("Error", error?.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmittingOtherSports(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getDateOnly = (value?: string | null) => String(value || "").slice(0, 10);
  const getLocalDayWindow = (dateOnly: string) => {
    const [year, month, day] = dateOnly.split("-").map(Number);
    if (!year || !month || !day) return null;
    const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    const end = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
    return { start, end };
  };
  const getUtcWeekday = (dateOnly: string) => {
    const [year, month, day] = dateOnly.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  };
  const getTodayDateOnly = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const getRegisteredEventType = (eventItem: RegisteredEventRun) => {
    if (eventItem.eventType === "recurring") return "recurring";
    if (eventItem.eventType === "multiday") return "multiday";
    return getDateOnly(eventItem.startsAt) && getDateOnly(eventItem.startsAt) === getDateOnly(eventItem.endsAt)
      ? "same_day"
      : "multiday";
  };
  const formatRunEventDate = (dateOnly?: string | null) => {
    if (!dateOnly) return "";
    const [year, month, day] = dateOnly.split("-");
    return `${Number(day)}/${Number(month)}/${String(year).slice(-2)}`;
  };
  const getEventWindow = (eventItem: RegisteredEventRun) => {
    const now = Date.now();
    const fourHours = 4 * 60 * 60 * 1000;
    const eventType = getRegisteredEventType(eventItem);
    const todayDateOnly = getTodayDateOnly();
    const occurrenceDate =
      eventType === "recurring"
        ? todayDateOnly
        : getDateOnly(eventItem.startsAt);
    const dayWindow = occurrenceDate ? getLocalDayWindow(occurrenceDate) : null;
    const startMs = dayWindow ? dayWindow.start - fourHours : 0;
    const endMs = dayWindow ? dayWindow.end + fourHours : 0;
    const isRecurringDay =
      eventType !== "recurring" ||
      eventItem.recurrenceWeekday === null ||
      eventItem.recurrenceWeekday === undefined ||
      getUtcWeekday(todayDateOnly) === Number(eventItem.recurrenceWeekday);
    const startsBoundary = getDateOnly(eventItem.startsAt);
    const endsBoundary = getDateOnly(eventItem.endsAt);
    const withinRecurringDateRange =
      eventType !== "recurring" ||
      ((!startsBoundary || todayDateOnly >= startsBoundary) && (!endsBoundary || todayDateOnly <= endsBoundary));
    const active = Boolean(dayWindow && isRecurringDay && withinRecurringDateRange && now >= startMs && now <= endMs);
    const daysTo = dayWindow ? Math.max(0, Math.ceil((dayWindow.start - now) / (24 * 60 * 60 * 1000))) : null;

    return {
      isEnded: Boolean(dayWindow && now > endMs),
      isActive: active,
      isSoon: active,
      daysTo,
      occurrenceDate,
      activeWindowLabel: dayWindow ? `Active ${formatRunEventDate(occurrenceDate)} (+/- 4 hrs)` : "Date pending",
    };
  };

  const timedEventRunOptions = useMemo(() => {
    const timedEvents = (registeredEvents || [])
      .filter(Boolean)
      .map((eventItem) => eventItem as RegisteredEventRun)
      .filter((eventItem) => {
        const eventType = getRegisteredEventType(eventItem);
        return eventType === "same_day" || eventType === "recurring";
      });

    const grouped = new Map<string, RegisteredEventRun[]>();
    timedEvents.forEach((eventItem) => {
      const eventType = getRegisteredEventType(eventItem);
      const key = eventType === "recurring"
        ? `recurring-${eventItem.eventId}`
        : `same-${getDateOnly(eventItem.startsAt)}`;
      grouped.set(key, [...(grouped.get(key) || []), eventItem]);
    });

    return Array.from(grouped.values()).map((group) => {
      const primary = group[0];
      if (group.length <= 1 || getRegisteredEventType(primary) !== "same_day") return primary;
      return {
        ...primary,
        eventIds: group.map((item) => item.eventId),
        eventName: `${primary.eventName} + ${group.length - 1} more`,
        sharedCountMessage: `This run counts for ${group.map((item) => item.eventName).join(", ")}.`,
      };
    });
  }, [registeredEvents]);

  const multidayRegisteredCount = useMemo(
    () => (registeredEvents || []).filter((eventItem) => eventItem && getRegisteredEventType(eventItem as RegisteredEventRun) === "multiday").length,
    [registeredEvents]
  );

  useEffect(() => {
    if (duration > 0 && distance > 0) {
      const calculatedPace = distance / (duration / 3600);
      setPace(calculatedPace);
    }
  }, [distance, duration]);

  const renderImportanceBadge = (importance: ImportanceLevel) => {
    const bgColor = IMPORTANCE_COLORS[importance];
    return (
      <View style={[styles.importanceBadge, { backgroundColor: bgColor + "18" }]}>
        <Text style={[styles.importanceBadgeText, { color: bgColor }]}>{importance}</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Stack.Screen options={{ title: "Workout" }} />
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: workoutBottomPadding }]}>
        {Platform.OS !== 'web' && currentLocation && runState !== 'idle' && (
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              region={{
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              showsUserLocation
              followsUserLocation
            >
              {coords.length > 1 && (
                <Polyline
                  coordinates={coords}
                  strokeColor={colors.primary}
                  strokeWidth={5}
                />
              )}
            </MapView>
          </View>
        )}

        {selectedEventRun && runState !== 'idle' && (
          <View style={[styles.eventRunBanner, { backgroundColor: themeColors.cardBackground }]}>
            <Text style={[styles.eventRunBannerLabel, { color: themeColors.textSecondary }]}>Workout Event</Text>
            <Text style={[styles.eventRunBannerTitle, { color: themeColors.text }]}>{selectedEventRun.eventName}</Text>
          </View>
        )}

        {runState !== 'idle' && (
          <View style={styles.statsContainer}>
            <LinearGradient colors={colors.gradient.orange} style={styles.statCardSmall}>
              <Text style={styles.statLabel}>{exerciseType === "Stairs" ? "Steps" : "Distance"}</Text>
              <Text style={styles.statValue}>
                {exerciseType === "Stairs" ? (parseInt(stairsStepsInput.replace(/,/g, ""), 10) || 0).toLocaleString() : distance.toFixed(2)}
              </Text>
              <Text style={styles.statUnit}>{exerciseType === "Stairs" ? "stairs" : "km"}</Text>
            </LinearGradient>
            <LinearGradient colors={colors.gradient.teal} style={styles.statCardLarge}>
              <Timer size={18} color={colors.white} style={styles.statIcon} />
              <Text style={styles.statLabel}>Time</Text>
              <Text style={styles.statValue}>{formatTime(duration)}</Text>
            </LinearGradient>
            <LinearGradient colors={colors.gradient.blue} style={styles.statCardSmall}>
              <Gauge size={18} color={colors.white} style={styles.statIcon} />
              <Text style={styles.statLabel}>{exerciseType === "Stairs" ? "Measure" : "Pace"}</Text>
              <Text style={styles.statValue}>{exerciseType === "Stairs" ? "Steps" : formatPaceMinPerKm()}</Text>
              <Text style={styles.statUnit}>{exerciseType === "Stairs" ? "count" : "/km"}</Text>
            </LinearGradient>
          </View>
        )}

        <View style={styles.controlsContainer}>
          {runState === "idle" && (
            <View style={styles.categoriesContainer}>
              {showMyWorkouts ? (
                <View style={styles.myWorkoutsHeader}>
                  <TouchableOpacity
                    style={styles.myWorkoutsBackButton}
                    onPress={() => setShowMyWorkouts(false)}
                    activeOpacity={0.75}
                  >
                    <ArrowLeft size={18} color={colors.primary} />
                    <Text style={styles.myWorkoutsBackText}>Back</Text>
                  </TouchableOpacity>
                  <Text style={[styles.myWorkoutsTitle, { color: themeColors.text }]}>My Workouts</Text>
                </View>
              ) : (
                <>
                  <View style={styles.workoutTabs}>
                    {([
                      { key: "record", label: "Record" },
                      { key: "event", label: "Event Run" },
                      { key: "sources", label: "Sources" },
                    ] as const).map((tab) => (
                      <TouchableOpacity
                        key={tab.key}
                        style={[styles.workoutTabButton, activeWorkoutTab === tab.key && styles.workoutTabButtonActive]}
                        onPress={() => setActiveWorkoutTab(tab.key)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.workoutTabText, activeWorkoutTab === tab.key && styles.workoutTabTextActive]}>
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {showMyWorkouts ? (
                <MyWorkouts />
              ) : activeWorkoutTab === "record" && (
              <View style={styles.categorySection}>
                <View style={styles.categoryHeaderRow}>
                  <View style={[styles.categoryDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.categoryTitle, { color: themeColors.text }]}>Record Workout</Text>
                </View>
                <Text style={[styles.categorySubtitle, { color: themeColors.textSecondary }]}>
                  Records multiday events plus non event activity
                </Text>
                <Text style={[styles.workoutHeadNote, { color: themeColors.textSecondary }]}>
                  Stairs records staircase climbing workouts using QR checkpoints and verified step counts.
                </Text>
                <Text style={[styles.workoutHeadNote, { color: themeColors.textSecondary }]}>
                  {cycleWorkoutOnly
                    ? "Your Para equipment profile uses wheelchair/handcycle equipment, so Cycle is the available workout type."
                    : "Cycle is available for wheelchair/handcycle Para users."}
                </Text>

                <View style={styles.exerciseRow}>
                  <TouchableOpacity
                    style={[styles.exerciseCard, cycleWorkoutOnly && styles.exerciseCardDisabled]}
                    onPress={() => void startTrackingWithCountdown("Walk")}
                    disabled={isCountdownActive || cycleWorkoutOnly}
                    activeOpacity={0.7}
                    testID="exercise-walk"
                  >
                    <LinearGradient
                      colors={cycleWorkoutOnly ? ['#9CA3AF', '#6B7280'] : ['#8B5CF6', '#A78BFA']}
                      style={styles.exerciseCardGradient}
                    >
                      <Footprints size={28} color={colors.white} />
                      <Text style={styles.exerciseCardTitle}>Walk</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.exerciseCard, cycleWorkoutOnly && styles.exerciseCardDisabled]}
                    onPress={() => void startTrackingWithCountdown("Run")}
                    disabled={isCountdownActive || cycleWorkoutOnly}
                    activeOpacity={0.7}
                    testID="exercise-run"
                  >
                    <LinearGradient
                      colors={cycleWorkoutOnly ? ['#9CA3AF', '#6B7280'] : colors.gradient.orange}
                      style={styles.exerciseCardGradient}
                    >
                      <Play size={28} color={colors.white} />
                      <Text style={styles.exerciseCardTitle}>Run</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.exerciseCard, !canUseCycleWorkout && styles.exerciseCardDisabled]}
                    onPress={() => void startTrackingWithCountdown("Cycle")}
                    disabled={isCountdownActive || !canUseCycleWorkout}
                    activeOpacity={0.7}
                    testID="exercise-cycle"
                  >
                    <LinearGradient
                      colors={canUseCycleWorkout ? ['#0EA5E9', '#2563EB'] : ['#9CA3AF', '#6B7280']}
                      style={styles.exerciseCardGradient}
                    >
                      <Bike size={28} color={colors.white} />
                      <Text style={styles.exerciseCardTitle}>Cycle</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.exerciseCard, cycleWorkoutOnly && styles.exerciseCardDisabled]}
                    onPress={() => void openStairScanner()}
                    disabled={isCountdownActive || cycleWorkoutOnly}
                    activeOpacity={0.7}
                    testID="exercise-stairs"
                  >
                    <LinearGradient
                      colors={cycleWorkoutOnly ? ['#9CA3AF', '#6B7280'] : ['#14B8A6', '#0F766E']}
                      style={styles.exerciseCardGradient}
                    >
                      <StaircaseIcon size={30} color={colors.white} />
                      <Text style={styles.exerciseCardTitle}>Stairs</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.myWorkoutsButton, { backgroundColor: themeColors.cardBackground }]}
                  onPress={() => setShowMyWorkouts(true)}
                  activeOpacity={0.75}
                >
                  <View style={styles.myWorkoutsButtonIcon}>
                    <Activity size={18} color={colors.white} />
                  </View>
                  <Text style={[styles.myWorkoutsButtonText, { color: themeColors.text }]}>My Workouts</Text>
                  <ChevronRight size={18} color={themeColors.textLight} />
                </TouchableOpacity>
              </View>
              )}

              {!showMyWorkouts && activeWorkoutTab === "event" && (
              <View style={styles.categorySection}>
                <View style={styles.categoryHeaderRow}>
                  <View style={[styles.categoryDot, { backgroundColor: "#2563EB" }]} />
                  <Text style={[styles.categoryTitle, { color: themeColors.text }]}>Event Run</Text>
                </View>
                <TouchableOpacity
                  style={[styles.addActivityCard, { backgroundColor: themeColors.cardBackground }]}
                  onPress={async () => {
                    if (effectiveRegistrationId) {
                      await Promise.all([
                        trpcUtils.events.getRegisteredEvents.invalidate({ registrationId: effectiveRegistrationId }),
                        refetchRegisteredEvents(),
                      ]);
                    }
                    setShowEventRunModal(true);
                  }}
                  activeOpacity={0.7}
                  testID="run-event"
                >
                  <LinearGradient colors={colors.gradient.blue} style={styles.addActivityIcon}>
                    <Footprints size={20} color={colors.white} />
                  </LinearGradient>
                  <View style={styles.addActivityInfo}>
                    <Text style={[styles.addActivityTitle, { color: themeColors.text }]}>Run Event</Text>
                    <Text style={[styles.addActivitySub, { color: themeColors.textSecondary }]}>
                      {timedEventRunOptions.length > 0
                        ? `${timedEventRunOptions.length} timed event${timedEventRunOptions.length === 1 ? "" : "s"} listed`
                        : multidayRegisteredCount > 0
                        ? "Find here your one day events"
                        : "Find here your one day events"}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={themeColors.textLight} />
                </TouchableOpacity>
              </View>
              )}

              {!showMyWorkouts && activeWorkoutTab === "sources" && (
              <View style={styles.categorySection}>
                <View style={styles.categoryHeaderRow}>
                  <View style={[styles.categoryDot, { backgroundColor: colors.secondary }]} />
                  <Text style={[styles.categoryTitle, { color: themeColors.text }]}>Add From Other Source</Text>
                </View>
                <TouchableOpacity
                  style={[styles.addActivityCard, { backgroundColor: themeColors.cardBackground }]}
                  onPress={() => setShowTreadmillModal(true)}
                  activeOpacity={0.7}
                  testID="add-treadmill"
                >
                  <LinearGradient colors={colors.gradient.teal} style={styles.addActivityIcon}>
                    <Dumbbell size={20} color={colors.white} />
                  </LinearGradient>
                  <View style={styles.addActivityInfo}>
                    <Text style={[styles.addActivityTitle, { color: themeColors.text }]}>Treadmill</Text>
                    <Text style={[styles.addActivitySub, { color: themeColors.textSecondary }]}>Record your treadmill activity here; it does not count for events</Text>
                  </View>
                  <ChevronRight size={18} color={themeColors.textLight} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addActivityCard, { backgroundColor: themeColors.cardBackground }]}
                  onPress={() => setShowSmartWatchModal(true)}
                  activeOpacity={0.7}
                  testID="add-smartwatch"
                >
                  <LinearGradient colors={colors.gradient.blue} style={styles.addActivityIcon}>
                    <Watch size={20} color={colors.white} />
                  </LinearGradient>
                  <View style={styles.addActivityInfo}>
                    <Text style={[styles.addActivityTitle, { color: themeColors.text }]}>Smart Watch</Text>
                    <Text style={[styles.addActivitySub, { color: themeColors.textSecondary }]}>Record your smart watch activity here (counts for events)</Text>
                  </View>
                  <ChevronRight size={18} color={themeColors.textLight} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addActivityCard, styles.wearableComingSoonCard, { backgroundColor: themeColors.cardBackground }]}
                  disabled
                  activeOpacity={1}
                  testID="health-connect-coming-soon"
                  accessibilityLabel="Health Connect, coming soon"
                >
                  <View style={[styles.addActivityIcon, styles.wearableComingSoonIcon]}>
                    <Heart size={20} color={themeColors.iconMuted} />
                  </View>
                  <View style={styles.addActivityInfo}>
                    <View style={styles.wearableComingSoonTitleRow}>
                      <Text style={[styles.addActivityTitle, { color: themeColors.textLight }]}>Health Connect</Text>
                      <View style={styles.wearableComingSoonBadge}>
                        <Text style={styles.wearableComingSoonBadgeText}>COMING SOON</Text>
                      </View>
                    </View>
                    <Text style={[styles.addActivitySub, { color: themeColors.textSecondary }]}>
                      Automatic Android workout and health data sync
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addActivityCard, styles.wearableComingSoonCard, { backgroundColor: themeColors.cardBackground }]}
                  disabled
                  activeOpacity={1}
                  testID="garmin-coming-soon"
                  accessibilityLabel="Garmin, coming soon"
                >
                  <View style={[styles.addActivityIcon, styles.wearableComingSoonIcon]}>
                    <Watch size={20} color={themeColors.iconMuted} />
                  </View>
                  <View style={styles.addActivityInfo}>
                    <View style={styles.wearableComingSoonTitleRow}>
                      <Text style={[styles.addActivityTitle, { color: themeColors.textLight }]}>Garmin</Text>
                      <View style={styles.wearableComingSoonBadge}>
                        <Text style={styles.wearableComingSoonBadgeText}>COMING SOON</Text>
                      </View>
                    </View>
                    <Text style={[styles.addActivitySub, { color: themeColors.textSecondary }]}>
                      Automatic Garmin activity and wellness sync
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addActivityCard, { backgroundColor: themeColors.cardBackground }]}
                  onPress={() => setShowOtherSportsModal(true)}
                  activeOpacity={0.7}
                  testID="add-other-sports"
                >
                  <LinearGradient colors={['#F59E0B', '#FBBF24']} style={styles.addActivityIcon}>
                    <Smartphone size={20} color={colors.white} />
                  </LinearGradient>
                  <View style={styles.addActivityInfo}>
                    <Text style={[styles.addActivityTitle, { color: themeColors.text }]}>Other Sports App</Text>
                    <Text style={[styles.addActivitySub, { color: themeColors.textSecondary }]}>Record here your activity from other sports apps (counts for events)</Text>
                  </View>
                  <ChevronRight size={18} color={themeColors.textLight} />
                </TouchableOpacity>
              </View>
              )}
            </View>
          )}

          {runState === "running" && (
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.actionButton} onPress={pauseTracking} activeOpacity={0.8}>
                <LinearGradient colors={['#F59E0B', '#FBBF24']} style={styles.actionButtonGradient}>
                  <Pause size={28} color={colors.white} />
                  <Text style={styles.actionButtonText}>Pause</Text>
                </LinearGradient>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, hasAbnormalWorkoutSpeed && styles.actionButtonDisabled]}
                onPressIn={startFinishHoldFeedback}
                onPressOut={resetFinishHoldFeedback}
                onLongPress={finishWorkoutAfterHold}
                delayLongPress={FINISH_LONG_PRESS_MS}
                disabled={isSaving || hasAbnormalWorkoutSpeed}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Hold to finish workout"
              >
                <LinearGradient
                  colors={hasAbnormalWorkoutSpeed ? ['#6B7280', '#9CA3AF'] : ['#EF4444', '#F87171']}
                  style={styles.actionButtonGradient}
                >
                  <Animated.View pointerEvents="none" style={[styles.finishButtonShine, { opacity: finishHoldShineOpacity }]} />
                  <Square size={28} color={colors.white} />
                  <Text style={styles.actionButtonText}>{isSaving ? "Saving..." : "Hold to Finish"}</Text>
                  <View style={styles.finishHoldTrack}>
                    <Animated.View style={[styles.finishHoldProgress, { width: finishHoldWidth }]} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {runState === "running" && hasAbnormalWorkoutSpeed && (
            <View style={styles.abnormalSpeedNotice}>
              <Text style={styles.abnormalSpeedTitle}>Abnormally high speed detected</Text>
              <Text style={styles.abnormalSpeedText}>
                This Run or Walk is over 1 km and above 2.3 km/min. Finish is disabled. Keep recording or close without saving.
              </Text>
              <TouchableOpacity
                style={styles.closeWithoutSavingButton}
                onPress={closeAbnormalWorkoutWithoutSaving}
                activeOpacity={0.8}
              >
                <Text style={styles.closeWithoutSavingButtonText}>Close Without Saving</Text>
              </TouchableOpacity>
            </View>
          )}

          {runState === "paused" && (
            <View style={styles.pausedActions}>
              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.actionButton} onPress={resumeTracking} activeOpacity={0.8}>
                  <LinearGradient colors={colors.gradient.teal} style={styles.actionButtonGradient}>
                    <Play size={28} color={colors.white} />
                    <Text style={styles.actionButtonText}>Resume</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, hasAbnormalWorkoutSpeed && styles.actionButtonDisabled]}
                  onPressIn={startFinishHoldFeedback}
                  onPressOut={resetFinishHoldFeedback}
                  onLongPress={finishWorkoutAfterHold}
                  delayLongPress={FINISH_LONG_PRESS_MS}
                  disabled={isSaving || hasAbnormalWorkoutSpeed}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Hold to finish workout"
                >
                  <LinearGradient
                    colors={hasAbnormalWorkoutSpeed ? ['#6B7280', '#9CA3AF'] : ['#EF4444', '#F87171']}
                    style={styles.actionButtonGradient}
                  >
                    <Animated.View pointerEvents="none" style={[styles.finishButtonShine, { opacity: finishHoldShineOpacity }]} />
                    <Square size={28} color={colors.white} />
                    <Text style={styles.actionButtonText}>{isSaving ? "Saving..." : "Hold to Finish"}</Text>
                    <View style={styles.finishHoldTrack}>
                      <Animated.View style={[styles.finishHoldProgress, { width: finishHoldWidth }]} />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {hasAbnormalWorkoutSpeed && (
                <View style={styles.abnormalSpeedNotice}>
                  <Text style={styles.abnormalSpeedTitle}>Abnormally high speed detected</Text>
                  <Text style={styles.abnormalSpeedText}>
                    Resume to continue recording, or close this workout without saving it.
                  </Text>
                  <TouchableOpacity
                    style={styles.closeWithoutSavingButton}
                    onPress={closeAbnormalWorkoutWithoutSaving}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.closeWithoutSavingButtonText}>Close Without Saving</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {runState === "finished" && (
            <View style={styles.finishedContainer}>
              <LinearGradient colors={colors.gradient.sunset} style={styles.finishedCard}>
                <View style={styles.finishedBadge}>
                  <Activity size={18} color="#F97316" />
                  <Text style={styles.finishedBadgeText}>RUNNATION WORKOUT</Text>
                </View>
                <Text style={styles.finishedTitle}>{selectedEventRun ? "Event completed" : `${exerciseType} completed`}</Text>
                {selectedEventRun ? (
                  <Text style={styles.finishedSubtitle}>{selectedEventRun.eventName}</Text>
                ) : null}
                {exerciseType === "Stairs" ? (
                  <View style={styles.stairsStepsCard}>
                    <Text style={styles.stairsStepsLabel}>Stair steps climbed</Text>
                    <TextInput
                      style={styles.stairsStepsInput}
                      value={stairsStepsInput}
                      onChangeText={setStairsStepsInput}
                      placeholder="e.g., 720"
                      placeholderTextColor="rgba(255,255,255,0.65)"
                      keyboardType="numeric"
                    />
                  </View>
                ) : (
                  <View style={styles.finishedDistanceRow}>
                    <Text style={styles.finishedDistanceValue}>{distance.toFixed(2)}</Text>
                    <Text style={styles.finishedDistanceUnit}>km</Text>
                  </View>
                )}
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Moving time</Text>
                    <Text style={styles.summaryValue}>{formatTime(duration)}</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>{exerciseType === "Stairs" ? "Measure" : "Average pace"}</Text>
                    <Text style={styles.summaryValue}>{exerciseType === "Stairs" ? "Steps" : `${formatPaceMinPerKm()} /km`}</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Paused</Text>
                    <Text style={styles.summaryValue}>{formatTime(pauseDurationSeconds)}</Text>
                  </View>
                </View>
              </LinearGradient>

              <TouchableOpacity style={styles.resetButton} onPress={() => setShowRunDetailsModal(true)} activeOpacity={0.8}>
                <LinearGradient colors={colors.gradient.blue} style={styles.resetButtonGradient}>
                  <Text style={styles.resetButtonText}>
                    {activitySaved
                      ? pendingWorkoutSyncCount > 0
                        ? "Saved Offline / View Card"
                        : "View Share Card"
                      : "Review / Save Activity"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {!activitySaved && (
                <TouchableOpacity style={styles.resetButton} onPress={() => void resumeFinishedActivity()} activeOpacity={0.8}>
                  <LinearGradient colors={colors.gradient.teal} style={styles.resetButtonGradient}>
                    <Text style={styles.resetButtonText}>Resume Activity</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity style={styles.resetButton} onPress={resetTracking} activeOpacity={0.8}>
                <LinearGradient colors={colors.gradient.orange} style={styles.resetButtonGradient}>
                  <Text style={styles.resetButtonText}>Start New Activity</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={styles.resetButton} onPress={closeFinishedActivity} activeOpacity={0.8}>
                <View style={[styles.resetButtonGradient, styles.finishedCloseButton]}>
                  <Text style={styles.finishedCloseButtonText}>Close</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showRunDetailsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRunDetailsModal(false)}
      >
        <View style={[styles.runDetailsOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={styles.runDetailsShell}>
            <ScrollView contentContainerStyle={styles.runDetailsScroll}>
              <View style={styles.shareCard}>
                <View style={styles.shareMapHero}>
                  {Platform.OS !== "web" && coords.length > 0 ? (
                    <MapView
                      key={`run-share-map-${coords.length}-${startTime?.getTime() ?? 0}`}
                      style={styles.shareMap}
                      pointerEvents="none"
                      region={getRouteRegion()}
                    >
                      <Polyline coordinates={coords} strokeColor="#F97316" strokeWidth={7} />
                      <Circle center={coords[0]} radius={8} fillColor="#10B981" strokeColor="#FFFFFF" strokeWidth={2} />
                      <Circle center={coords[coords.length - 1]} radius={8} fillColor="#EF4444" strokeColor="#FFFFFF" strokeWidth={2} />
                    </MapView>
                  ) : (
                    <View style={styles.shareMapPlaceholder}>
                      <Text style={styles.shareMapPlaceholderText}>Route map</Text>
                    </View>
                  )}
                  <View style={styles.shareMapShade} />
                  <View style={styles.shareBrandPill}>
                    <Image source={require("../../assets/images/adaptive-icon-fill.png")} style={styles.shareBrandLogo} resizeMode="cover" />
                    <View>
                      <Text style={styles.shareBrand}>RunNation</Text>
                      <Text style={styles.shareTagline}>Where runners belong</Text>
                    </View>
                  </View>
                </View>

                <View style={[
                  styles.shareDetailsSheet,
                  runCardTheme === "dark" ? styles.shareDetailsSheetDark : styles.shareDetailsSheetLight,
                ]}>
                  <View style={styles.shareDetailsContent}>
                  <View style={styles.shareSheetHandle} />
                  <View style={styles.shareActivityHeader}>
                    <View style={styles.shareActivityIcon}>
                      <Activity size={18} color="#FFFFFF" />
                    </View>
                    <View style={styles.shareActivityHeaderCopy}>
                      <Text style={styles.shareActivityKicker}>RUNNATION {String(exerciseType || "Run").toUpperCase()}</Text>
                      <Text style={[styles.shareActivityTitle, runCardTheme === "dark" ? styles.shareTextLight : styles.shareTextDark]}>
                        {selectedEventRun?.eventName || "Workout completed"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.shareDistanceHero}>
                    <Text style={[styles.shareDistanceValue, runCardTheme === "dark" ? styles.shareTextLight : styles.shareTextDark]}>
                      {exerciseType === "Stairs"
                        ? (parseInt(stairsStepsInput.replace(/,/g, ""), 10) || 0).toLocaleString()
                        : distance.toFixed(2)}
                    </Text>
                    <Text style={[styles.shareDistanceUnit, runCardTheme === "dark" ? styles.shareTextMutedDark : styles.shareTextMutedLight]}>
                      {exerciseType === "Stairs" ? "stair steps" : "kilometres"}
                    </Text>
                  </View>

                  {exerciseType === "Stairs" && !activitySaved ? (
                    <View style={styles.runDetailsStairsInputBlock}>
                      <Text style={[styles.runDetailsOptionTitle, runCardTheme === "dark" ? styles.shareTextLight : styles.shareTextDark]}>
                        Stair steps climbed
                      </Text>
                      <TextInput
                        style={[
                          styles.runDetailsStairsInput,
                          runCardTheme === "dark" ? styles.runDetailsStairsInputDark : styles.runDetailsStairsInputLight,
                        ]}
                        value={stairsStepsInput}
                        onChangeText={setStairsStepsInput}
                        placeholder="e.g., 720"
                        placeholderTextColor={runCardTheme === "dark" ? "rgba(255,255,255,0.5)" : "#9CA3AF"}
                        keyboardType="numeric"
                      />
                    </View>
                  ) : null}

                  <View style={styles.shareRunnerStrip}>
                    <View style={styles.shareRunnerIdentity}>
                      {runnerProfile?.photoUrl ? (
                        <Image source={{ uri: runnerProfile.photoUrl }} style={styles.shareAvatar} resizeMode="cover" />
                      ) : (
                        <View style={styles.shareAvatarFallback}>
                          <Text style={styles.shareAvatarInitial}>
                            {(runnerProfile?.name || user?.username || "R").charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.shareRunnerInfo}>
                        <Text style={[styles.shareRunnerName, runCardTheme === "dark" ? styles.shareTextLight : styles.shareTextDark]} numberOfLines={1}>
                          {runnerProfile?.name || user?.username || "RunNation Runner"}
                        </Text>
                        <Text style={[styles.shareRunnerMeta, runCardTheme === "dark" ? styles.shareTextMutedDark : styles.shareTextMutedLight]} numberOfLines={1}>
                          {getRunDetailsMeta() || "Workout location"}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.shareDateText, runCardTheme === "dark" ? styles.shareTextMutedDark : styles.shareTextMutedLight]}>
                      {startTime
                        ? `${startTime.toLocaleDateString(undefined, { day: "numeric", month: "short" })}\n${startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : "-"}
                    </Text>
                  </View>

                  <View style={styles.shareMetricsGrid}>
                    <View style={[styles.shareMetric, runCardTheme === "dark" ? styles.shareMetricDark : styles.shareMetricLight]}>
                      <Timer size={17} color="#F97316" />
                      <Text style={[styles.shareMetricValue, runCardTheme === "dark" ? styles.shareTextLight : styles.shareTextDark]}>{formatTime(duration)}</Text>
                      <Text style={styles.shareMetricLabel}>Moving time</Text>
                    </View>
                    <View style={[styles.shareMetric, runCardTheme === "dark" ? styles.shareMetricDark : styles.shareMetricLight]}>
                      <Gauge size={17} color="#2563EB" />
                      <Text style={[styles.shareMetricValue, runCardTheme === "dark" ? styles.shareTextLight : styles.shareTextDark]}>
                        {exerciseType === "Stairs" ? "Steps" : formatPaceMinPerKm()}
                      </Text>
                      <Text style={styles.shareMetricLabel}>{exerciseType === "Stairs" ? "Primary measure" : "Average pace /km"}</Text>
                    </View>
                    <View style={[styles.shareMetric, runCardTheme === "dark" ? styles.shareMetricDark : styles.shareMetricLight]}>
                      <Pause size={17} color="#8B5CF6" />
                      <Text style={[styles.shareMetricValue, runCardTheme === "dark" ? styles.shareTextLight : styles.shareTextDark]}>{formatTime(pauseDurationSeconds)}</Text>
                      <Text style={styles.shareMetricLabel}>Paused time</Text>
                    </View>
                    <View style={[styles.shareMetric, runCardTheme === "dark" ? styles.shareMetricDark : styles.shareMetricLight]}>
                      <Flame size={17} color="#10B981" />
                      <Text style={[styles.shareMetricValue, runCardTheme === "dark" ? styles.shareTextLight : styles.shareTextDark]}>{getWeatherDisplay()}</Text>
                      <Text style={styles.shareMetricLabel}>Weather</Text>
                    </View>
                  </View>
                  </View>
                </View>
              </View>

              <View style={styles.runDetailsOptions}>
                <Text style={[styles.runDetailsOptionTitle, { color: themeColors.text }]}>Colour Theme</Text>
                <View style={styles.runDetailsOptionRow}>
                  {(["dark", "light"] as const).map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.runDetailsChip, runCardTheme === mode && styles.runDetailsChipActive]}
                      onPress={() => setRunCardTheme(mode)}
                    >
                      <Text style={[styles.runDetailsChipText, runCardTheme === mode && styles.runDetailsChipTextActive]}>
                        {mode === "dark" ? "Dark" : "Light"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {pendingWorkoutSyncCount > 0 ? (
                  <TouchableOpacity
                    style={styles.workoutSyncNotice}
                    onPress={() => void syncQueuedWorkouts(true)}
                    disabled={isSyncingWorkouts}
                  >
                    <View style={styles.workoutSyncNoticeCopy}>
                      <Text style={styles.workoutSyncNoticeTitle}>
                        {pendingWorkoutSyncCount} workout{pendingWorkoutSyncCount === 1 ? "" : "s"} saved offline
                      </Text>
                      <Text style={styles.workoutSyncNoticeText}>
                        {isSyncingWorkouts ? "Checking connection..." : "Stored safely on this device. Tap to sync now."}
                      </Text>
                    </View>
                    <Upload size={18} color="#F97316" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </ScrollView>

            <View style={[styles.runDetailsActions, { paddingBottom: runDetailsActionsBottomPadding }]}>
              <TouchableOpacity
                style={styles.runDetailsActionButton}
                onPress={() => setShowRunDetailsModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Close workout details"
              >
                <X size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.runDetailsActionButton}
                onPress={shareRunDetails}
                accessibilityRole="button"
                accessibilityLabel="Share workout"
              >
                <Share2 size={22} color="#2563EB" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.runDetailsActionButton,
                  (isSaving || activitySaved || hasAbnormalWorkoutSpeed) && styles.runDetailsDisabledButton,
                ]}
                onPress={saveFinishedActivity}
                disabled={isSaving || activitySaved || hasAbnormalWorkoutSpeed}
                accessibilityRole="button"
                accessibilityLabel={
                  activitySaved
                    ? "Workout saved"
                    : hasAbnormalWorkoutSpeed
                      ? "Save disabled because of abnormally high speed"
                      : "Save workout"
                }
              >
                {activitySaved
                  ? <Check size={22} color="#10B981" />
                  : <Save size={22} color="#10B981" />}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!countdownValue}
        transparent={true}
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.countdownOverlay}>
          <LinearGradient colors={colors.gradient.orange} style={styles.countdownCircle}>
            <Text style={styles.countdownText}>{countdownValue}</Text>
          </LinearGradient>
        </View>
      </Modal>

      <Modal
        visible={showStairScannerModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (activeStairSession) {
            Alert.alert("End Stair Climb?", "End the current Stair Climb session before closing this scanner.", [
              { text: "Keep Scanning", style: "cancel" },
              { text: "End Session", style: "destructive", onPress: () => void endActiveStairSession() },
            ]);
          } else {
            setShowStairScannerModal(false);
          }
        }}
      >
        <View style={[styles.modalOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={[styles.modalContentCenter, styles.stairScannerContent, { backgroundColor: themeColors.surface }]}>
            <LinearGradient colors={['#0F766E', '#14B8A6']} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Stair Climb QR</Text>
              <TouchableOpacity
                onPress={() => {
                  if (activeStairSession) {
                    void endActiveStairSession();
                  } else {
                    setStairCameraEnabled(false);
                    setShowStairScannerModal(false);
                  }
                }}
              >
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody} contentContainerStyle={styles.stairScannerBody}>
              <View style={styles.stairSummaryRow}>
                <View style={[styles.stairSummaryTile, { backgroundColor: themeColors.cardBackground }]}>
                  <Text style={[styles.stairSummaryLabel, { color: themeColors.textSecondary }]}>Verified steps</Text>
                  <Text style={[styles.stairSummaryValue, { color: themeColors.text }]}>
                    {Number(activeStairSession?.verifiedSteps || 0).toLocaleString()}
                  </Text>
                </View>
                <View style={[styles.stairSummaryTile, { backgroundColor: themeColors.cardBackground }]}>
                  <Text style={[styles.stairSummaryLabel, { color: themeColors.textSecondary }]}>Ascents</Text>
                  <Text style={[styles.stairSummaryValue, { color: themeColors.text }]}>
                    {Number(activeStairSession?.completedAscents || 0).toLocaleString()}
                  </Text>
                </View>
                <View style={[styles.stairSummaryTile, { backgroundColor: themeColors.cardBackground }]}>
                  <Text style={[styles.stairSummaryLabel, { color: themeColors.textSecondary }]}>Time</Text>
                  <Text style={[styles.stairSummaryValue, { color: themeColors.text }]}>
                    {formatTime(stairSessionSeconds)}
                  </Text>
                </View>
              </View>

              {!activeStairSession && stairLandingSection === "menu" ? (
                <View style={[styles.stairFirstUsePanel, { backgroundColor: themeColors.cardBackground }]}>
                  <Text style={[styles.stairFirstUseTitle, { color: themeColors.text }]}>Stairs</Text>
                  <Text style={[styles.stairFirstUseText, { color: themeColors.textSecondary }]}>
                    Choose how you want to use RunNation Stairs.
                  </Text>
                  <View style={styles.stairLandingActions}>
                    <TouchableOpacity style={styles.stairLandingActionButton} onPress={() => void startSelectedStairScanner()} activeOpacity={0.75}>
                      <QrCode size={20} color="#0F766E" />
                      <View style={styles.stairRouteCardCopy}>
                        <Text style={[styles.stairFirstUseActionText, { color: themeColors.text }]}>Start</Text>
                        <Text style={[styles.stairRouteMeta, { color: themeColors.textSecondary }]}>Scan a stair QR code to begin.</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.stairLandingActionButton} onPress={() => setStairLandingSection("setup")} activeOpacity={0.75}>
                      <Building2 size={20} color="#0F766E" />
                      <View style={styles.stairRouteCardCopy}>
                        <Text style={[styles.stairFirstUseActionText, { color: themeColors.text }]}>Set up</Text>
                        <Text style={[styles.stairRouteMeta, { color: themeColors.textSecondary }]}>Search, add buildings, and print QR sheets.</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.stairLandingActionButton} onPress={() => setStairLandingSection("instructions")} activeOpacity={0.75}>
                      <Printer size={20} color="#0F766E" />
                      <View style={styles.stairRouteCardCopy}>
                        <Text style={[styles.stairFirstUseActionText, { color: themeColors.text }]}>Instructions</Text>
                        <Text style={[styles.stairRouteMeta, { color: themeColors.textSecondary }]}>Read the activity and setup guide.</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                  {myStairWorkoutSpots.length > 0 ? (
                    <View style={styles.stairRouteList}>
                      {myStairWorkoutSpots.map((route: any) => (
                        <TouchableOpacity
                          key={`mine-${route.routeId}`}
                          style={[
                            styles.stairRouteCard,
                            selectedStairRoute?.routeId === route.routeId && styles.stairRouteCardSelected,
                            { backgroundColor: themeColors.inputBackground, borderColor: selectedStairRoute?.routeId === route.routeId ? "#0F766E" : themeColors.inputBorder },
                          ]}
                          onPress={() => {
                            setSelectedStairRoute(route);
                            setStairCameraEnabled(false);
                          }}
                          activeOpacity={0.75}
                        >
                          <Building2 size={22} color="#0F766E" />
                          <View style={styles.stairRouteCardCopy}>
                            <Text style={[styles.stairRouteTitle, { color: themeColors.text }]} numberOfLines={1}>{route.building?.buildingName || "Registered building"}</Text>
                            <Text style={[styles.stairRouteMeta, { color: themeColors.textSecondary }]} numberOfLines={2}>
                              {route.building?.city || "Unknown town"} - {Number(route.mySessionCount || 0)} workout{Number(route.mySessionCount || 0) === 1 ? "" : "s"} - {route.hasPrintedQrs ? "QR sheet ready" : "QR sheet not printed"}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <Text style={[styles.stairNoRoutesText, { color: themeColors.textSecondary }]}>
                      No stairs workout spot history yet. Search registered buildings or add a building below.
                    </Text>
                  )}
                </View>
              ) : null}

              {!activeStairSession && stairLandingSection === "instructions" ? (
                <View style={[styles.stairFirstUsePanel, { backgroundColor: themeColors.cardBackground }]}>
                  <TouchableOpacity style={styles.stairInlineBackButton} onPress={() => setStairLandingSection("menu")} activeOpacity={0.75}>
                    <ArrowLeft size={16} color="#0F766E" />
                    <Text style={styles.stairSetupToggleText}>Back</Text>
                  </TouchableOpacity>
                  <Text style={[styles.stairFirstUseTitle, { color: themeColors.text }]}>How Stairs Works</Text>
                  <Text style={[styles.stairFirstUseText, { color: themeColors.textSecondary }]}>
                    Start opens the QR scanner. Scan the bottom QR code on a registered building to populate the building details and begin the workout. Continue scanning the required middle or top QR codes as you climb.
                  </Text>
                  <Text style={[styles.stairStickerAdvice, { color: themeColors.textSecondary }]}>
                    If you cannot find QR codes in your building, use Set up to search/filter registered buildings, add a qualifying building with country, city/town and address details, then download/print the generated QR sheet.
                  </Text>
                  <Text style={[styles.stairStickerAdvice, { color: themeColors.textSecondary }]}>
                    QR codes should be labelled RunNation, Stairs Workout and Floor. You can create a sticker or hanger, but first make sure building management permits stair exercise.
                  </Text>
                  <Text style={[styles.stairStickerAdvice, { color: themeColors.textSecondary }]}>
                    Community Stairs results are viewed in Leaderboard. Your personal Stairs records are viewed in My Workouts.
                  </Text>
                </View>
              ) : null}

              {!activeStairSession && stairLandingSection === "setup" ? (
                <View style={styles.inputGroup}>
                  <TouchableOpacity style={styles.stairInlineBackButton} onPress={() => setStairLandingSection("menu")} activeOpacity={0.75}>
                    <ArrowLeft size={16} color="#0F766E" />
                    <Text style={styles.stairSetupToggleText}>Back</Text>
                  </TouchableOpacity>
                  <View style={styles.stairSearchHeader}>
                    <Text style={[styles.inputLabel, styles.stairSearchLabel, { color: themeColors.text }]}>Search registered buildings</Text>
                    <TouchableOpacity style={styles.stairIconActionButton} onPress={() => setShowStairRouteFilters((value) => !value)} activeOpacity={0.75}>
                      <Filter size={16} color="#0F766E" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.stairIconActionButton} onPress={() => setShowStairSetupForm((prev) => !prev)} activeOpacity={0.75}>
                      <Plus size={16} color="#0F766E" />
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.stairSearchBox, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder }]}>
                    <Search size={17} color={themeColors.textLight} />
                    <TextInput
                      style={[styles.stairSearchInput, { color: themeColors.text }]}
                      value={stairBuildingSearch}
                      onChangeText={setStairBuildingSearch}
                      placeholder="Building, town, route, address"
                      placeholderTextColor={themeColors.textLight}
                    />
                  </View>
                  {showStairRouteFilters ? (
                    <View style={[styles.stairFilterPanel, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.inputBorder }]}>
                      <View style={styles.stairFilterGrid}>
                        <TextInput
                          style={[styles.stairFilterInput, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                          value={stairFilterCountry}
                          onChangeText={setStairFilterCountry}
                          placeholder="Country"
                          placeholderTextColor={themeColors.textLight}
                        />
                        <TextInput
                          style={[styles.stairFilterInput, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                          value={stairFilterCity}
                          onChangeText={setStairFilterCity}
                          placeholder="City/town"
                          placeholderTextColor={themeColors.textLight}
                        />
                      </View>
                      <View style={styles.stairChipRow}>
                        {(["all", "public", "residential"] as const).map((option) => (
                          <TouchableOpacity
                            key={option}
                            style={[styles.stairFilterChip, stairFilterAccess === option && styles.stairFilterChipActive]}
                            onPress={() => setStairFilterAccess(option)}
                          >
                            <Text style={[styles.stairFilterChipText, stairFilterAccess === option && styles.stairFilterChipTextActive]}>
                              {option === "all" ? "All access" : option === "public" ? "Public access" : "Residents only"}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.stairChipRow}>
                        {([
                          ["all", "All floors"],
                          ["low", "5 & below"],
                          ["mid", "6-10"],
                          ["high", "Above 10"],
                        ] as const).map(([key, label]) => (
                          <TouchableOpacity
                            key={key}
                            style={[styles.stairFilterChip, stairFilterFloorTier === key && styles.stairFilterChipActive]}
                            onPress={() => setStairFilterFloorTier(key)}
                          >
                            <Text style={[styles.stairFilterChipText, stairFilterFloorTier === key && styles.stairFilterChipTextActive]}>{label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.stairRouteList}>
                    {filteredStairRoutes.length > 0 ? filteredStairRoutes.map((route: any) => (
                      <TouchableOpacity
                        key={route.routeId}
                        style={[
                          styles.stairRouteCard,
                          selectedStairRoute?.routeId === route.routeId && styles.stairRouteCardSelected,
                          { backgroundColor: themeColors.inputBackground, borderColor: selectedStairRoute?.routeId === route.routeId ? "#0F766E" : themeColors.inputBorder },
                        ]}
                        onPress={() => {
                          setSelectedStairRoute(route);
                          setStairCameraEnabled(false);
                        }}
                        activeOpacity={0.75}
                      >
                        <StaircaseIcon size={22} color="#0F766E" />
                        <View style={styles.stairRouteCardCopy}>
                          <Text style={[styles.stairRouteTitle, { color: themeColors.text }]} numberOfLines={1}>
                            {route.building?.buildingName || "Registered building"}
                          </Text>
                          <Text style={[styles.stairRouteMeta, { color: themeColors.textSecondary }]} numberOfLines={2}>
                            {route.routeName} - {route.building?.city || "Unknown town"} - {route.building?.accessType === "residential" ? "Residents only" : route.building?.accessType || "public"} - {Number(route.floorSegments || 0)} floors
                          </Text>
                          <Text style={[styles.stairRouteMeta, { color: route.hasPrintedQrs ? "#0F766E" : colors.primary }]} numberOfLines={1}>
                            {route.hasPrintedQrs ? "QR sheet downloaded/printed" : "QR sheet not printed yet"} - {Number(route.qrCheckpointCount || 0)} QR codes
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )) : (
                      <Text style={[styles.stairNoRoutesText, { color: themeColors.textSecondary }]}>
                        No registered building matched. A founder user can create a permanent QR tag for this building below.
                      </Text>
                    )}
                  </View>
                </View>
              ) : null}

              {!activeStairSession && stairLandingSection === "setup" && showStairSetupForm ? (
                <View style={[styles.stairSetupForm, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.inputBorder }]}>
                  {([
                    ["buildingName", "Building name", "e.g., Acacia Towers"],
                    ["city", "Town or city", "e.g., Kampala"],
                    ["countryCode", "Country code", "e.g., UG"],
                    ["addressDescription", "Address / location hint", "Street, estate, campus, block"],
                    ["qrCustodianName", "QR tag custodian", "Person who keeps or hangs the tag"],
                    ["qrCustodianPhone", "Custodian phone", "Searchable contact"],
                    ["qrCustodianEmail", "Custodian email", "Optional"],
                    ["routeName", "Route name", "e.g., Main staircase"],
                    ["stairwellName", "Stairwell name", "Optional"],
                    ["floorSegments", "Number of floors", "Minimum 3, include basement floors"],
                    ["stepsGroundToFirst", "Steps from ground to 1st floor", "Physically counted steps"],
                  ] as const).map(([key, label, placeholder]) => (
                    <View key={key} style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { color: themeColors.text }]}>{label}</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                        value={String(stairSetupForm[key] || "")}
                        onChangeText={(text) => setStairSetupForm((prev) => ({ ...prev, [key]: text }))}
                        placeholder={placeholder}
                        placeholderTextColor={themeColors.textLight}
                        keyboardType={["floorSegments", "stepsGroundToFirst"].includes(key) ? "numeric" : "default"}
                      />
                    </View>
                  ))}
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: themeColors.text }]}>Access</Text>
                    <View style={styles.stairChipRow}>
                      {([
                        ["public", "Public access"],
                        ["residential", "Residents only"],
                        ["club", "Club"],
                        ["corporate", "Corporate"],
                        ["private", "Private"],
                        ["other", "Other"],
                      ] as const).map(([key, label]) => (
                        <TouchableOpacity
                          key={key}
                          style={[styles.stairFilterChip, stairSetupForm.accessType === key && styles.stairFilterChipActive]}
                          onPress={() => setStairSetupForm((prev) => ({ ...prev, accessType: key }))}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.stairFilterChipText, stairSetupForm.accessType === key && styles.stairFilterChipTextActive]}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.stairRegisterButton, isRegisteringStairRoute && styles.actionButtonDisabled]}
                    onPress={() => void registerStairBuildingRoute()}
                    disabled={isRegisteringStairRoute}
                    activeOpacity={0.75}
                  >
                    <Printer size={18} color={colors.white} />
                    <Text style={styles.stairRegisterButtonText}>
                      {isRegisteringStairRoute ? "Generating..." : "Create permanent QR tag"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {stairLandingSection === "setup" && generatedStairStickers.length > 0 ? (
                <View style={styles.stairStickerPreviewList}>
                  <Text style={[styles.inputLabel, { color: themeColors.text }]}>Printable stickers</Text>
                  <TouchableOpacity
                    style={styles.stairDownloadSheetButton}
                    onPress={() => void downloadGeneratedStairQrSheet()}
                    activeOpacity={0.75}
                  >
                    <Download size={18} color={colors.white} />
                    <Text style={styles.stairDownloadSheetText}>Download / print QR sheet</Text>
                  </TouchableOpacity>
                  {generatedStairStickers.map((sticker) => (
                    <View key={sticker.checkpointId} style={[styles.stairStickerPreview, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.inputBorder }]}>
                      <Image source={{ uri: sticker.qrDataUrl }} style={styles.stairStickerQr} resizeMode="contain" />
                      <View style={styles.stairStickerCopy}>
                        <Text style={[styles.stairStickerTitle, { color: themeColors.text }]}>{sticker.label}</Text>
                        <Text style={[styles.stairStickerMeta, { color: themeColors.textSecondary }]}>
                          Print as a permanent building tag. If building rules limit stair exercise during work hours, keep it with the custodian as a removable hang tag.
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {!activeStairSession && stairLandingSection === "setup" && selectedStairRoute ? (
                <View style={[styles.stairSelectedRoutePanel, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.inputBorder }]}>
                  <View style={styles.stairSelectedRouteHeader}>
                    <Building2 size={22} color="#0F766E" />
                    <View style={styles.stairRouteCardCopy}>
                      <Text style={[styles.stairRouteTitle, { color: themeColors.text }]} numberOfLines={1}>
                        {selectedStairRoute.building?.buildingName || "Selected building"}
                      </Text>
                      <Text style={[styles.stairRouteMeta, { color: themeColors.textSecondary }]} numberOfLines={2}>
                        {selectedStairRoute.building?.countryCode || "Country"} - {selectedStairRoute.building?.city || "City/town"} - {selectedStairRoute.building?.addressDescription || "Address not listed"}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.stairReadinessRow}>
                    <Text style={[styles.stairReadinessText, { color: selectedStairRoute.hasPrintableQrs ? "#0F766E" : colors.primary }]}>
                      QR codes: {Number(selectedStairRoute.qrCheckpointCount || 0)}
                    </Text>
                    <Text style={[styles.stairReadinessText, { color: selectedStairRoute.hasPrintedQrs ? "#0F766E" : colors.primary }]}>
                      {selectedStairRoute.hasPrintedQrs ? "Printed/downloaded" : "Needs QR sheet print"}
                    </Text>
                  </View>
                  <Text style={[styles.stairStickerAdvice, { color: themeColors.textSecondary }]}>
                    Captain: {selectedStairRoute.building?.qrCustodianName || "not listed"}
                    {selectedStairRoute.building?.qrCustodianPhone ? ` - ${selectedStairRoute.building.qrCustodianPhone}` : ""}
                  </Text>
                  <TouchableOpacity
                    style={[styles.stairStartScannerButton, !canRouteUseScanner(selectedStairRoute) && styles.actionButtonDisabled]}
                    onPress={() => void startSelectedStairScanner()}
                    activeOpacity={0.75}
                  >
                    <Camera size={18} color={colors.white} />
                    <Text style={styles.stairStartScannerText}>Start QR scanner</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {(activeStairSession || stairLandingSection === "start") ? (
              <View style={[styles.stairStatusCard, { backgroundColor: themeColors.cardBackground }]}>
                <Text style={[styles.stairStatusTitle, { color: themeColors.text }]}>
                  {activeStairSession
                    ? `${activeStairSession.buildingName || "Staircase"}${activeStairSession.routeName ? ` - ${activeStairSession.routeName}` : ""}`
                    : selectedStairRoute
                      ? "Ready when QR scanner is started"
                      : "Select a building to start"}
                </Text>
                <Text style={[styles.stairStatusText, { color: themeColors.textSecondary }]}>
                  {activeStairSession?.lastMessage || "The QR code identifies the staircase route. RunNation awards only the fixed measured steps for accepted checkpoint sequences."}
                </Text>
                <Text style={[styles.stairNextCheckpointText, { color: colors.primary }]}>
                  Next scan: {activeStairSession?.nextCheckpoint ? String(activeStairSession.nextCheckpoint).toUpperCase() : "BOTTOM"}
                </Text>
              </View>
              ) : null}

              {!activeStairSession && stairLandingSection === "start" ? (
                <View style={styles.stairModeRow}>
                  {(["full", "short"] as const).map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.stairModeButton, stairScanMode === mode && styles.stairModeButtonActive]}
                      onPress={() => setStairScanMode(mode)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.stairModeButtonText, stairScanMode === mode && styles.stairModeButtonTextActive]}>
                        {mode === "full" ? "Climb to Top" : "Climb to Middle"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {(activeStairSession || stairLandingSection === "start") ? (
              <View style={styles.stairCameraFrame}>
                {Platform.OS !== "web" && cameraPermission?.granted && stairCameraEnabled ? (
                  <CameraView
                    style={styles.stairCamera}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={isScanningStairQr ? undefined : ({ data }) => void handleStairQrToken(String(data || ""))}
                  >
                    <View style={styles.stairCameraReticle} />
                  </CameraView>
                ) : (
                  <View style={[styles.stairCameraFallback, { backgroundColor: themeColors.inputBackground }]}>
                    <Camera size={36} color={themeColors.textLight} />
                    <Text style={[styles.stairCameraFallbackText, { color: themeColors.textSecondary }]}>
                      {Platform.OS === "web"
                            ? "Camera scanning is available on phone builds. This device cannot perform stairs QR activity here."
                            : stairCameraEnabled
                              ? "Camera permission is required for QR scanning."
                              : "Tap Start to open the QR scanner."}
                    </Text>
                    {Platform.OS !== "web" ? (
                      <TouchableOpacity style={styles.stairPermissionButton} onPress={() => void startSelectedStairScanner()}>
                        <Text style={styles.stairPermissionButtonText}>Start QR scanner</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
              </View>
              ) : null}

              {(activeStairSession || stairLandingSection === "start") ? (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Manual QR token</Text>
                <View style={styles.stairManualTokenRow}>
                  <TextInput
                    style={[styles.input, styles.stairManualTokenInput, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                    value={manualStairQrToken}
                    onChangeText={setManualStairQrToken}
                    placeholder="Paste QR token for testing"
                    placeholderTextColor={themeColors.textLight}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={[styles.stairScanButton, isScanningStairQr && styles.actionButtonDisabled]}
                    disabled={isScanningStairQr}
                    onPress={() => void handleStairQrToken(manualStairQrToken)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.stairScanButtonText}>{isScanningStairQr ? "Scanning" : "Scan"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              ) : null}
            </ScrollView>

            <View style={styles.stairScannerFooter}>
              <TouchableOpacity
                style={[styles.submitButton, !activeStairSession && styles.actionButtonDisabled]}
                disabled={!activeStairSession || isSaving}
                onPress={() => void endActiveStairSession()}
                activeOpacity={0.8}
              >
                <Text style={styles.submitButtonText}>{isSaving ? "Ending..." : "End Session"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEventRunModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEventRunModal(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={[styles.modalContentCenter, { backgroundColor: themeColors.surface }]}>
            <LinearGradient colors={colors.gradient.blue} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Run Event</Text>
              <TouchableOpacity onPress={() => setShowEventRunModal(false)}>
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody}>
              <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                Choose an event you are already registered for.
              </Text>

              {timedEventRunOptions.length === 0 ? (
                <View style={styles.eventRunEmptyState}>
                  <Text style={[styles.eventRunEmptyTitle, { color: themeColors.text }]}>No timed event runs</Text>
                  <Text style={[styles.eventRunEmptyText, { color: themeColors.textSecondary }]}>
                    Same-day and recurring events appear here. Multiday events are recorded through the normal Run button.
                  </Text>
                </View>
              ) : (
                timedEventRunOptions.map((eventItem: RegisteredEventRun) => {
                  if (!eventItem) {
                    return null;
                  }

                  const eventWindow = getEventWindow(eventItem);
                  const canStartEventRun = eventWindow.isActive && !isCountdownActive;
                  return (
                    <View key={eventItem.eventId} style={[styles.eventRunCard, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.border }]}>
                      <View style={styles.eventRunCardHeader}>
                        <Text style={[styles.eventRunCardTitle, { color: themeColors.text }]}>{eventItem.eventName}</Text>
                        {eventWindow.isActive ? (
                          <View style={styles.eventRunReadyBadge}>
                            <Footprints size={14} color={colors.white} />
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.eventRunMeta, { color: themeColors.textSecondary }]}>
                        {eventWindow.activeWindowLabel}
                      </Text>
                      <Text style={[styles.eventRunCountdown, { color: themeColors.text }]}>
                        {eventWindow.isActive
                          ? "Start active now"
                          : eventWindow.isEnded
                          ? "Event window closed"
                          : `${eventWindow.daysTo ?? 0} day${eventWindow.daysTo === 1 ? "" : "s"} to event window`}
                      </Text>
                      {eventItem.sharedCountMessage ? (
                        <Text style={styles.eventRunCaution}>{eventItem.sharedCountMessage}</Text>
                      ) : eventWindow.isActive ? (
                        <Text style={styles.eventRunCaution}>
                          Record only when you are taking part in this event.
                        </Text>
                      ) : null}
                      <TouchableOpacity
                        style={[styles.eventRunStartButton, !canStartEventRun && styles.eventRunStartButtonDisabled]}
                        onPress={() => {
                          setShowEventRunModal(false);
                          void startTrackingWithCountdown("Run", eventItem);
                        }}
                        disabled={!canStartEventRun}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={!canStartEventRun ? ["#9CA3AF", "#9CA3AF"] : colors.gradient.orange}
                          style={styles.eventRunStartGradient}
                        >
                          <Play size={18} color={colors.white} />
                          <Text style={styles.eventRunStartText}>{canStartEventRun ? "Start" : "Inactive"}</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showTreadmillModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTreadmillModal(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.surface }]}>
            <LinearGradient colors={colors.gradient.teal} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Treadmill Activity</Text>
              <TouchableOpacity onPress={() => setShowTreadmillModal(false)}>
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody}>
              <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                Treadmill submissions are approved as workout records only and do not count for events.
              </Text>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Distance (km)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  value={treadmillDistance}
                  onChangeText={setTreadmillDistance}
                  keyboardType="decimal-pad"
                  placeholder="e.g., 5.2"
                  placeholderTextColor={themeColors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Time (minutes)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  value={treadmillTime}
                  onChangeText={setTreadmillTime}
                  keyboardType="decimal-pad"
                  placeholder="e.g., 30"
                  placeholderTextColor={themeColors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Treadmill Screen Photo</Text>
                <TouchableOpacity style={styles.imageUploadButton} onPress={pickImage}>
                  {treadmillImage ? (
                    <Image source={{ uri: treadmillImage }} style={styles.uploadedImage} />
                  ) : (
                    <View style={styles.uploadPlaceholder}>
                      <Upload size={40} color={colors.primary} />
                      <Text style={styles.uploadButtonText}>Tap to Upload Photo</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
                ðŸ“¸ Your submission will be reviewed by an admin
              </Text>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: themeColors.border }]}>
              <TouchableOpacity style={styles.submitButton} onPress={submitTreadmill} activeOpacity={0.8}>
                <LinearGradient colors={colors.gradient.teal} style={styles.submitButtonGradient}>
                  <Text style={styles.submitButtonText}>Submit for Approval</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSmartWatchModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSmartWatchModal(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={[styles.modalContentCenter, { backgroundColor: themeColors.surface }]}>
            <LinearGradient colors={colors.gradient.blue} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Smart Watch</Text>
              <TouchableOpacity onPress={() => setShowSmartWatchModal(false)}>
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody}>
              <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                Health readings update Goals. Distance with date, start time, and duration is submitted separately for approval.
              </Text>

              <Text style={[styles.sourceFootnote, { color: themeColors.textSecondary }]}>
                Goals health readings
              </Text>

              {SMART_WATCH_FIELDS.map((field) => (
                <View key={field.key} style={styles.inputGroup}>
                  <View style={styles.swLabelRow}>
                    {field.icon}
                    <Text style={[styles.inputLabel, styles.swLabelText, { color: themeColors.text }]}>{field.label}</Text>
                    {renderImportanceBadge(field.importance)}
                  </View>
                  <TextInput
                    style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                    value={smartWatchValues[field.key]}
                    onChangeText={(text) => setSmartWatchValues((prev) => ({ ...prev, [field.key]: text }))}
                    keyboardType={field.keyboardType}
                    placeholder={field.placeholder}
                    placeholderTextColor={themeColors.textLight}
                  />
                </View>
              ))}

              <Text style={[styles.sourceFootnote, { color: themeColors.textSecondary }]}>
                Activity approval details. Screenshot is required only if this date matches a registered event.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Activity Date</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  value={smartWatchActivityForm.activityDate}
                  onChangeText={(text) => setSmartWatchActivityForm((prev) => ({ ...prev, activityDate: text }))}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={themeColors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Start Time</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  value={smartWatchActivityForm.startTime}
                  onChangeText={(text) => setSmartWatchActivityForm((prev) => ({ ...prev, startTime: text }))}
                  placeholder="HH:MM"
                  placeholderTextColor={themeColors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Duration</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  value={smartWatchActivityForm.duration}
                  onChangeText={(text) => setSmartWatchActivityForm((prev) => ({ ...prev, duration: text }))}
                  placeholder="HH:MM"
                  placeholderTextColor={themeColors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Smart Watch Screenshot</Text>
                <TouchableOpacity
                  style={styles.imageUploadButton}
                  onPress={() => pickEvidenceImage(setSmartWatchEvidenceImage)}
                >
                  {smartWatchEvidenceImage ? (
                    <Image source={{ uri: smartWatchEvidenceImage }} style={styles.uploadedImage} />
                  ) : (
                    <View style={styles.uploadPlaceholder}>
                      <Upload size={40} color={colors.primary} />
                      <Text style={styles.uploadButtonText}>Tap to Upload Screenshot</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={[styles.modalFooterRow, { borderTopColor: themeColors.border }]}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowSmartWatchModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={submitSmartWatch}
                disabled={isSubmittingSmartWatch}
                activeOpacity={0.8}
              >
                <LinearGradient colors={colors.gradient.blue} style={styles.modalSubmitBtnGradient}>
                  <Text style={styles.modalSubmitBtnText}>
                    {isSubmittingSmartWatch ? "Saving..." : "Save Data"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showOtherSportsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowOtherSportsModal(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={[styles.modalContentCenter, { backgroundColor: themeColors.surface }]}>
            <LinearGradient colors={['#F59E0B', '#FBBF24']} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Other Sports App</Text>
              <TouchableOpacity onPress={() => setShowOtherSportsModal(false)}>
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody}>
              <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                Import from other running apps. Event credit is applied only after club/organizer approval.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Sports App Name *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  placeholder="e.g., Strava, Nike Run Club, Garmin"
                  value={otherSportsForm.sportsApp}
                  onChangeText={(text) => setOtherSportsForm((prev) => ({ ...prev, sportsApp: text }))}
                  placeholderTextColor={themeColors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Date *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  placeholder="YYYY-MM-DD (e.g., 2024-12-25)"
                  value={otherSportsForm.activityDate}
                  onChangeText={(text) => setOtherSportsForm((prev) => ({ ...prev, activityDate: text }))}
                  placeholderTextColor={themeColors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Activity Type *</Text>
                <View style={styles.typeChipsContainer}>
                  {(["Run", "Walk", "Cycle", "Stairs"] as const).map((type) => {
                    const isTypeDisabled =
                      (type === "Cycle" && !canUseCycleWorkout) ||
                      ((type === "Walk" || type === "Run") && cycleWorkoutOnly);
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.typeChip,
                          otherSportsForm.exerciseType === type && styles.typeChipActive,
                          isTypeDisabled && styles.typeChipDisabled,
                        ]}
                        onPress={() => {
                          if (type === "Cycle" && !canUseCycleWorkout) {
                            Alert.alert("Cycle Workouts", "Cycle is available for Para Runners who use a wheelchair or handcycle.");
                            return;
                          }
                          if ((type === "Walk" || type === "Run") && cycleWorkoutOnly) {
                            Alert.alert("Workout Type", "Your Para equipment profile qualifies for Cycle workouts only.");
                            return;
                          }
                          setOtherSportsForm((prev) => ({ ...prev, exerciseType: type }));
                        }}
                        disabled={isTypeDisabled}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.typeChipText,
                            otherSportsForm.exerciseType === type && styles.typeChipTextActive,
                          ]}
                        >
                          {type}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Start Time *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  placeholder="HH:MM (e.g., 08:30)"
                  value={otherSportsForm.startTime}
                  onChangeText={(text) => setOtherSportsForm((prev) => ({ ...prev, startTime: text }))}
                  placeholderTextColor={themeColors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Duration (HH:MM:SS) *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  placeholder="e.g., 00:45:30"
                  value={otherSportsForm.duration}
                  onChangeText={(text) => setOtherSportsForm((prev) => ({ ...prev, duration: text }))}
                  placeholderTextColor={themeColors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>
                  {otherSportsForm.exerciseType === "Stairs" ? "Stair Steps *" : "Distance (km) *"}
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  placeholder={otherSportsForm.exerciseType === "Stairs" ? "e.g., 720" : "e.g., 5.5"}
                  keyboardType="numeric"
                  value={otherSportsForm.exerciseType === "Stairs" ? otherSportsForm.stepsCount : otherSportsForm.distanceKm}
                  onChangeText={(text) =>
                    setOtherSportsForm((prev) =>
                      otherSportsForm.exerciseType === "Stairs"
                        ? { ...prev, stepsCount: text }
                        : { ...prev, distanceKm: text }
                    )
                  }
                  placeholderTextColor={themeColors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Activity Screenshot *</Text>
                <TouchableOpacity
                  style={styles.imageUploadButton}
                  onPress={() => pickEvidenceImage(setOtherSportsEvidenceImage)}
                >
                  {otherSportsEvidenceImage ? (
                    <Image source={{ uri: otherSportsEvidenceImage }} style={styles.uploadedImage} />
                  ) : (
                    <View style={styles.uploadPlaceholder}>
                      <Upload size={40} color={colors.primary} />
                      <Text style={styles.uploadButtonText}>Tap to Upload Screenshot</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={[styles.modalFooterRow, { borderTopColor: themeColors.border }]}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowOtherSportsModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={submitOtherSportsApp}
                disabled={isSubmittingOtherSports}
                activeOpacity={0.8}
              >
                <LinearGradient colors={colors.gradient.orange} style={styles.modalSubmitBtnGradient}>
                  <Text style={styles.modalSubmitBtnText}>
                    {isSubmittingOtherSports ? "Submitting..." : "Submit"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function ExerciseScreen() {
  const isWatchDisplay = useIsWatchDisplay();

  if (isWatchDisplay) {
    return <WatchRunExperience />;
  }

  return <PhoneExerciseScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  eventRunBanner: {
    margin: 16,
    marginBottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
  },
  eventRunBannerLabel: {
    fontSize: 12,
    fontWeight: "600" as const,
    marginBottom: 2,
  },
  eventRunBannerTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
  },
  mapContainer: {
    height: 300,
    backgroundColor: colors.extraLightGray,
  },
  map: {
    flex: 1,
  },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  statCardSmall: {
    flex: 0.9,
    borderRadius: 16,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 80,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  statCardLarge: {
    flex: 1.2,
    borderRadius: 16,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 80,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  statIcon: {
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.white,
    marginBottom: 6,
    opacity: 0.9,
    fontWeight: "600" as const,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800" as const,
    color: colors.white,
  },
  statUnit: {
    fontSize: 12,
    color: colors.white,
    marginTop: 2,
    opacity: 0.9,
  },
  controlsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 16,
    flex: 1,
    justifyContent: "flex-start" as const,
  },
  categoriesContainer: {
    gap: 14,
  },
  workoutWelcomeCard: {
    minHeight: 104,
    borderRadius: 18,
    padding: 16,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    overflow: "hidden" as const,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 9,
    elevation: 4,
  },
  workoutWelcomeCopy: {
    flex: 1,
    gap: 5,
  },
  workoutWelcomeKicker: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "900" as const,
    textTransform: "uppercase" as const,
  },
  workoutWelcomeTitle: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "900" as const,
  },
  workoutWelcomeIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  workoutTabs: {
    flexDirection: "row" as const,
    gap: 8,
    backgroundColor: "rgba(255, 107, 53, 0.08)",
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 53, 0.14)",
  },
  workoutTabButton: {
    flex: 1,
    minHeight: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 9,
    paddingHorizontal: 8,
  },
  workoutTabButtonActive: {
    backgroundColor: colors.primary,
  },
  workoutTabText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: colors.textSecondary,
  },
  workoutTabTextActive: {
    color: colors.white,
  },
  myWorkoutsButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  myWorkoutsButtonIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: colors.primary,
  },
  myWorkoutsButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800" as const,
  },
  myWorkoutsHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  myWorkoutsBackButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingVertical: 8,
    paddingRight: 12,
  },
  myWorkoutsBackText: {
    fontSize: 14,
    fontWeight: "800" as const,
    color: colors.primary,
  },
  myWorkoutsTitle: {
    fontSize: 20,
    fontWeight: "800" as const,
  },
  categorySection: {
    gap: 10,
  },
  categoryHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: colors.text,
  },
  categorySubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: -6,
    marginLeft: 16,
    marginBottom: 0,
    fontStyle: "italic" as const,
    opacity: 0.72,
  },
  workoutHeadNote: {
    fontSize: 11,
    lineHeight: 15,
    marginLeft: 16,
    marginTop: -4,
    marginBottom: 2,
  },
  exerciseRow: {
    flexDirection: "row" as const,
    gap: 12,
  },
  exerciseCard: {
    flex: 1,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
  },
  exerciseCardDisabled: {
    opacity: 0.72,
  },
  exerciseCardGradient: {
    padding: 14,
    alignItems: "center" as const,
    gap: 8,
    minHeight: 96,
    justifyContent: "center" as const,
  },
  exerciseCardTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: colors.white,
  },
  categorySeparator: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 10,
    marginHorizontal: 4,
  },
  addActivityCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.white,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    gap: 12,
  },
  addActivityIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  addActivityInfo: {
    flex: 1,
  },
  addActivityTitle: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.text,
  },
  addActivitySub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  wearableComingSoonCard: {
    opacity: 0.62,
    elevation: 0,
    shadowOpacity: 0,
  },
  wearableComingSoonIcon: {
    backgroundColor: "#E5E7EB",
  },
  wearableComingSoonTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  wearableComingSoonBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: "#E5E7EB",
  },
  wearableComingSoonBadgeText: {
    color: "#6B7280",
    fontSize: 8,
    fontWeight: "700" as const,
  },
  sourceFootnote: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
    marginLeft: 4,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 16,
  },
  pausedActions: {
    gap: 14,
  },
  actionButton: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  actionButtonDisabled: {
    opacity: 0.62,
    shadowOpacity: 0,
    elevation: 0,
  },
  actionButtonGradient: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    overflow: "hidden",
  },
  finishButtonShine: {
    position: "absolute",
    top: -28,
    bottom: -28,
    width: 46,
    left: "50%",
    backgroundColor: "rgba(255,255,255,0.88)",
    transform: [{ rotate: "18deg" }],
  },
  finishHoldTrack: {
    width: "78%",
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.28)",
    overflow: "hidden",
    marginTop: 2,
  },
  finishHoldProgress: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.white,
  },
  actionButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700" as const,
  },
  abnormalSpeedNotice: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#9CA3AF",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#F3F4F6",
  },
  abnormalSpeedTitle: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "800" as const,
  },
  abnormalSpeedText: {
    marginTop: 6,
    color: "#4B5563",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600" as const,
  },
  closeWithoutSavingButton: {
    alignSelf: "flex-start",
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#4B5563",
  },
  closeWithoutSavingButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800" as const,
  },
  runDetailsOverlay: {
    flex: 1,
    justifyContent: "flex-end" as const,
  },
  runDetailsShell: {
    maxHeight: "94%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden" as const,
    backgroundColor: "transparent",
  },
  runDetailsScroll: {
    padding: 0,
    paddingBottom: 68,
    gap: 14,
  },
  shareCard: {
    overflow: "hidden" as const,
    minHeight: 650,
    backgroundColor: "#E5E7EB",
  },
  shareMapHero: {
    height: 310,
    backgroundColor: "#9CA3AF",
  },
  shareMapShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  shareBrandPill: {
    position: "absolute" as const,
    top: 18,
    left: 18,
    right: 18,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    alignSelf: "center" as const,
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  shareBrandLogo: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#001623",
  },
  shareBrand: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "900" as const,
    textShadowColor: "rgba(255,255,255,0.68)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  shareTagline: {
    color: "#1F2937",
    fontSize: 13,
    fontWeight: "700" as const,
    textShadowColor: "rgba(255,255,255,0.72)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  shareDetailsSheet: {
    marginTop: -18,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingTop: 12,
    minHeight: 360,
    overflow: "hidden" as const,
  },
  shareDetailsSheetLight: {
    backgroundColor: "#FFFFFF",
  },
  shareDetailsSheetDark: {
    backgroundColor: "#111827",
  },
  shareDetailsContent: {
    position: "relative" as const,
  },
  shareSheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center" as const,
    marginBottom: 10,
  },
  shareTopRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    gap: 10,
  },
  shareActivityHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.28)",
  },
  shareActivityIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F97316",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  shareActivityHeaderCopy: {
    flex: 1,
  },
  shareActivityKicker: {
    color: "#F97316",
    fontSize: 10,
    fontWeight: "900" as const,
  },
  shareActivityTitle: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: "800" as const,
  },
  shareDistanceHero: {
    alignItems: "center" as const,
    paddingVertical: 12,
  },
  runDetailsStairsInputBlock: {
    gap: 8,
    marginBottom: 18,
  },
  runDetailsStairsInput: {
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 18,
    fontWeight: "800" as const,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  runDetailsStairsInputDark: {
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    color: colors.white,
  },
  runDetailsStairsInputLight: {
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    color: "#111827",
  },
  shareRunnerStrip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 10,
    paddingBottom: 12,
  },
  shareRunnerIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 9,
  },
  shareRunnerBlock: {
    flex: 1,
  },
  shareAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#F97316",
  },
  shareAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "#F97316",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  shareAvatarInitial: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "900" as const,
  },
  shareRunnerInfo: {
    flex: 1,
  },
  shareRunnerName: {
    fontSize: 15,
    fontWeight: "800" as const,
  },
  shareRunnerMeta: {
    fontSize: 12,
    fontWeight: "500" as const,
    marginTop: 3,
    lineHeight: 15,
  },
  shareTextLight: {
    color: colors.white,
  },
  shareTextDark: {
    color: "#111827",
  },
  shareTextMutedDark: {
    color: "rgba(255,255,255,0.78)",
  },
  shareTextMutedLight: {
    color: "#475569",
  },
  shareDistanceBlock: {
    alignItems: "flex-end" as const,
    justifyContent: "flex-start" as const,
    minWidth: 132,
  },
  shareMedalSymbol: {
    fontSize: 24,
    marginBottom: -4,
  },
  shareDistanceRow: {
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    gap: 8,
  },
  shareDistanceValue: {
    fontSize: 58,
    fontWeight: "900" as const,
    lineHeight: 62,
  },
  shareDistanceUnit: {
    fontSize: 12,
    fontWeight: "800" as const,
    textTransform: "uppercase" as const,
  },
  shareMetricsGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  shareMetric: {
    width: "48.5%",
    minHeight: 82,
    alignItems: "flex-start" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  shareMetricLight: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
  shareMetricDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  shareMetricLabel: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700" as const,
    marginTop: 2,
  },
  shareMetricValue: {
    fontSize: 18,
    fontWeight: "800" as const,
    marginTop: 4,
  },
  shareDateText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700" as const,
    textAlign: "right" as const,
  },
  shareMap: {
    flex: 1,
  },
  shareMapPlaceholder: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  shareMapPlaceholderText: {
    color: "#6B7280",
    fontWeight: "800" as const,
  },
  runDetailsOptions: {
    gap: 10,
  },
  runDetailsOptionTitle: {
    fontSize: 14,
    fontWeight: "800" as const,
  },
  runDetailsOptionRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  workoutSyncNotice: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FED7AA",
    backgroundColor: "#FFF7ED",
  },
  workoutSyncNoticeCopy: {
    flex: 1,
  },
  workoutSyncNoticeTitle: {
    color: "#9A3412",
    fontSize: 13,
    fontWeight: "800" as const,
  },
  workoutSyncNoticeText: {
    color: "#C2410C",
    fontSize: 11,
    marginTop: 2,
  },
  runDetailsChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
  },
  runDetailsChipActive: {
    backgroundColor: "#F97316",
  },
  runDetailsChipText: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "800" as const,
  },
  runDetailsChipTextActive: {
    color: colors.white,
  },
  runDetailsActions: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row" as const,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    gap: 28,
    paddingTop: 6,
    paddingHorizontal: 14,
    backgroundColor: "transparent",
  },
  runDetailsActionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "rgba(3,7,24,0.76)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.24,
    shadowRadius: 4,
    elevation: 4,
  },
  runDetailsDisabledButton: {
    opacity: 0.65,
  },
  countdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  countdownCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 10,
  },
  countdownText: {
    color: colors.white,
    fontSize: 48,
    fontWeight: "900" as const,
  },
  finishedContainer: {
    gap: 20,
  },
  finishedCard: {
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  finishedBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 14,
  },
  finishedBadgeText: {
    color: "#111827",
    fontSize: 11,
    fontWeight: "900" as const,
  },
  finishedEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  finishedTitle: {
    fontSize: 25,
    fontWeight: "800" as const,
    color: colors.white,
    marginBottom: 4,
  },
  finishedSubtitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "rgba(255,255,255,0.92)",
    marginTop: 0,
    marginBottom: 6,
    textAlign: "center" as const,
  },
  finishedDistanceRow: {
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    gap: 8,
    marginTop: 6,
    marginBottom: 16,
  },
  finishedDistanceValue: {
    color: colors.white,
    fontSize: 54,
    lineHeight: 58,
    fontWeight: "900" as const,
  },
  finishedDistanceUnit: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 17,
    fontWeight: "900" as const,
    marginBottom: 8,
  },
  stairsStepsCard: {
    width: "100%",
    marginTop: 12,
    marginBottom: 18,
    gap: 8,
  },
  stairsStepsLabel: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontWeight: "800" as const,
    textAlign: "center" as const,
  },
  stairsStepsInput: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    backgroundColor: "rgba(17,24,39,0.28)",
    borderRadius: 8,
    color: colors.white,
    fontSize: 30,
    fontWeight: "900" as const,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlign: "center" as const,
  },
  summaryRow: {
    flexDirection: "row",
    width: "100%",
    alignItems: "center",
    justifyContent: "space-around",
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.white,
    opacity: 0.3,
  },
  summaryLabel: {
    fontSize: 13,
    color: colors.white,
    marginBottom: 6,
    opacity: 0.9,
    fontWeight: "600" as const,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: colors.white,
  },
  resetButton: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  resetButtonGradient: {
    padding: 20,
    alignItems: "center",
  },
  resetButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700" as const,
  },
  finishedCloseButton: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  finishedCloseButtonText: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700" as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end" as const,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: "90%",
    overflow: "hidden",
  },
  modalContentCenter: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: "92%",
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    padding: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "800" as const,
    color: colors.white,
  },
  modalBody: {
    padding: 24,
  },
  modalSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 20,
    fontWeight: "600" as const,
  },
  eventRunEmptyState: {
    paddingVertical: 24,
    alignItems: "center" as const,
  },
  eventRunEmptyTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    marginBottom: 8,
    textAlign: "center" as const,
  },
  eventRunEmptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center" as const,
  },
  eventRunCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    gap: 8,
  },
  eventRunCardHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 12,
  },
  eventRunCardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700" as const,
  },
  eventRunMeta: {
    fontSize: 13,
  },
  eventRunCountdown: {
    fontSize: 14,
    fontWeight: "700" as const,
  },
  eventRunCaution: {
    fontSize: 13,
    lineHeight: 18,
    color: "#B45309",
  },
  eventRunReadyBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "#2563EB",
  },
  eventRunStartButton: {
    borderRadius: 14,
    overflow: "hidden" as const,
    marginTop: 4,
  },
  eventRunStartButtonDisabled: {
    opacity: 0.7,
  },
  eventRunStartGradient: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 12,
  },
  eventRunStartText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700" as const,
  },
  stairScannerContent: {
    maxHeight: "96%",
  },
  stairScannerBody: {
    paddingBottom: 14,
  },
  stairFirstUsePanel: {
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.22)",
    gap: 10,
  },
  stairFirstUseTitle: {
    fontSize: 17,
    fontWeight: "900" as const,
  },
  stairFirstUseText: {
    fontSize: 13,
    lineHeight: 19,
  },
  stairFirstUseActions: {
    flexDirection: "row" as const,
    gap: 8,
  },
  stairLandingActions: {
    gap: 10,
  },
  stairLandingActionButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(15,118,110,0.28)",
    padding: 12,
    backgroundColor: "rgba(15,118,110,0.08)",
  },
  stairInlineBackButton: {
    alignSelf: "flex-start" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginBottom: 10,
    paddingVertical: 6,
    paddingRight: 10,
  },
  stairFirstUseAction: {
    flex: 1,
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(15,118,110,0.28)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 8,
    gap: 6,
  },
  stairFirstUseActionText: {
    fontSize: 12,
    fontWeight: "800" as const,
    textAlign: "center" as const,
  },
  stairStickerAdvice: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600" as const,
  },
  stairRouteList: {
    gap: 10,
    marginTop: 10,
  },
  stairRouteCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  stairRouteCardSelected: {
    borderWidth: 2,
  },
  stairRouteCardCopy: {
    flex: 1,
    minWidth: 0,
  },
  stairRouteTitle: {
    fontSize: 14,
    fontWeight: "900" as const,
  },
  stairRouteMeta: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
  },
  stairNoRoutesText: {
    fontSize: 13,
    lineHeight: 18,
  },
  stairSearchHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 8,
  },
  stairSearchLabel: {
    flex: 1,
    marginBottom: 0,
  },
  stairIconActionButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "rgba(15,118,110,0.1)",
  },
  stairSearchBox: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  stairSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "700" as const,
    paddingVertical: 12,
  },
  stairFilterPanel: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 10,
  },
  stairFilterGrid: {
    flexDirection: "row" as const,
    gap: 8,
  },
  stairFilterInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: "700" as const,
  },
  stairChipRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  stairFilterChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(15,118,110,0.1)",
  },
  stairFilterChipActive: {
    backgroundColor: "#0F766E",
  },
  stairFilterChipText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: "#0F766E",
  },
  stairFilterChipTextActive: {
    color: colors.white,
  },
  stairSetupToggle: {
    marginTop: 12,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "rgba(15,118,110,0.1)",
  },
  stairSetupToggleText: {
    color: "#0F766E",
    fontSize: 14,
    fontWeight: "900" as const,
  },
  stairSetupForm: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
  },
  stairRegisterButton: {
    backgroundColor: "#0F766E",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
  },
  stairRegisterButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "900" as const,
  },
  stairStickerPreviewList: {
    gap: 10,
    marginBottom: 14,
  },
  stairDownloadSheetButton: {
    backgroundColor: "#0F766E",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
  },
  stairDownloadSheetText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "900" as const,
  },
  stairStickerPreview: {
    flexDirection: "row" as const,
    gap: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  stairStickerQr: {
    width: 86,
    height: 86,
    borderRadius: 6,
    backgroundColor: colors.white,
  },
  stairStickerCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center" as const,
  },
  stairStickerTitle: {
    fontSize: 14,
    fontWeight: "900" as const,
  },
  stairStickerMeta: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 17,
  },
  stairSummaryRow: {
    flexDirection: "row" as const,
    gap: 10,
    marginBottom: 14,
  },
  stairSummaryTile: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.22)",
  },
  stairSummaryLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    marginBottom: 5,
  },
  stairSummaryValue: {
    fontSize: 18,
    fontWeight: "900" as const,
  },
  stairStatusCard: {
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.22)",
    gap: 7,
  },
  stairSelectedRoutePanel: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    gap: 10,
  },
  stairSelectedRouteHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  stairReadinessRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  stairReadinessText: {
    fontSize: 12,
    fontWeight: "900" as const,
    backgroundColor: "rgba(15,118,110,0.08)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  stairStartScannerButton: {
    backgroundColor: "#0F766E",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
  },
  stairStartScannerText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "900" as const,
  },
  stairStatusTitle: {
    fontSize: 17,
    fontWeight: "800" as const,
  },
  stairStatusText: {
    fontSize: 13,
    lineHeight: 19,
  },
  stairNextCheckpointText: {
    fontSize: 13,
    fontWeight: "900" as const,
  },
  stairModeRow: {
    flexDirection: "row" as const,
    gap: 10,
    marginBottom: 14,
  },
  stairModeButton: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: "center" as const,
  },
  stairModeButtonActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  stairModeButtonText: {
    fontSize: 14,
    fontWeight: "800" as const,
    color: colors.textSecondary,
  },
  stairModeButtonTextActive: {
    color: colors.white,
  },
  stairCameraFrame: {
    height: 280,
    borderRadius: 8,
    overflow: "hidden" as const,
    marginBottom: 16,
    backgroundColor: "#111827",
  },
  stairCamera: {
    flex: 1,
  },
  stairCameraReticle: {
    alignSelf: "center" as const,
    marginTop: 70,
    width: 160,
    height: 160,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 8,
  },
  stairCameraFallback: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 10,
    padding: 20,
  },
  stairCameraFallbackText: {
    fontSize: 14,
    textAlign: "center" as const,
    lineHeight: 20,
  },
  stairPermissionButton: {
    backgroundColor: "#0F766E",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  stairPermissionButtonText: {
    color: colors.white,
    fontWeight: "800" as const,
  },
  stairManualTokenRow: {
    flexDirection: "row" as const,
    gap: 10,
    alignItems: "center" as const,
  },
  stairManualTokenInput: {
    flex: 1,
  },
  stairScanButton: {
    backgroundColor: "#0F766E",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  stairScanButtonText: {
    color: colors.white,
    fontWeight: "900" as const,
  },
  stairScannerFooter: {
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.extraLightGray,
    padding: 14,
    borderRadius: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
  },
  swLabelRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginBottom: 8,
  },
  swLabelText: {
    flex: 1,
    marginBottom: 0,
  },
  importanceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  importanceBadgeText: {
    fontSize: 10,
    fontWeight: "800" as const,
    letterSpacing: 0.3,
  },
  typeChipsContainer: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 10,
  },
  typeChip: {
    flexGrow: 1,
    flexBasis: "47%",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.extraLightGray,
    alignItems: "center" as const,
  },
  typeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeChipDisabled: {
    opacity: 0.5,
  },
  typeChipText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  typeChipTextActive: {
    color: colors.white,
  },
  imageUploadButton: {
    backgroundColor: colors.extraLightGray,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: colors.primary,
    borderStyle: "dashed" as const,
    minHeight: 200,
  },
  uploadPlaceholder: {
    padding: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 12,
  },
  uploadedImage: {
    width: "100%",
    height: 200,
  },
  uploadButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "700" as const,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center" as const,
    marginTop: 8,
    lineHeight: 20,
  },
  modalFooter: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalFooterRow: {
    flexDirection: "row" as const,
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.extraLightGray,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  modalCancelBtnText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  modalSubmitBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  modalSubmitBtnGradient: {
    paddingVertical: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  modalSubmitBtnText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: colors.white,
  },
  submitButton: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  submitButtonGradient: {
    padding: 18,
    alignItems: "center",
  },
  submitButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700" as const,
  },
});
