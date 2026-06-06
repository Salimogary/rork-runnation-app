import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Platform, Modal, TextInput, Alert, Image, AppState, AppStateStatus, AccessibilityInfo, Share } from "react-native";
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Play, Pause, Square, Footprints, Dumbbell, Upload, X, Timer, Gauge, Watch, Smartphone, ChevronRight, Heart, Activity, Droplets, Flame, Stethoscope, Bike, ArrowLeft } from "lucide-react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as ImagePicker from "expo-image-picker";
import * as Speech from "expo-speech";
import MapView, { Circle, Polyline } from "react-native-maps";
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
import { useSubscription } from "@/contexts/SubscriptionContext";
import SubscriptionGate from "@/components/SubscriptionGate";
import { getServerClient } from "@/lib/server-client";
import { trpc } from "@/lib/trpc";
import { getActivityVoiceAssistantEnabled } from "@/utils/activityVoice";
import MyWorkouts from "@/components/MyWorkouts";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type RunState = "idle" | "running" | "paused" | "finished";
type ExerciseType = "Walk" | "Run" | "Cycle" | "Treadmill" | null;
type WorkoutTab = "record" | "event" | "sources";

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

const GPS_ACCURACY_THRESHOLD = 25;
const MAX_SPEED_KMH_RUN = 45;
const MAX_SPEED_KMH_WALK = 15;
const MAX_SPEED_KMH_CYCLE = 70;
const MIN_DISTANCE_BETWEEN_POINTS = 0.002;
const MIN_DISTANCE_ACTIVITY = 0.5;
const MIN_DISTANCE_WALK = MIN_DISTANCE_ACTIVITY;
const MIN_DISTANCE_RUN = MIN_DISTANCE_ACTIVITY;
const MIN_ACTIVITY_DURATION_MINUTES = 5;
const MAX_DAILY_ACTIVITIES = 5;
const KM_VOICE_ANNOUNCEMENT_INTERVAL = 1;
const AUTO_PAUSE_STATIONARY_SECONDS = 90;
const AUTO_PAUSE_MAX_SPEED_KMH = 1.2;
const AUTO_RESUME_MIN_SPEED_KMH = 3;
const AUTO_RESUME_MIN_DISTANCE_KM = 0.015;
const BACKGROUND_LOCATION_TASK = "runnation-background-location";
const ACTIVE_WORKOUT_SESSION_KEY = "runnation_active_workout_session";
const WORKOUT_COUNTDOWN_MS = 3200;
const RUNNATION_ANDROID_APK_LINK = "https://expo.dev/artifacts/eas/27LbCHM76M74izfEPYt1pN.apk";

type BackgroundLocationPayload = {
  locations?: Location.LocationObject[];
};

type PersistedWorkoutStatus = "pending" | "running" | "paused" | "finished";

type PersistedWorkoutSession = {
  id: string;
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
  distance: number;
  coords: Coordinates[];
  lastValidPoint: LocationPoint | null;
  lastProcessedLocationTimestamp: number | null;
  filteredPointCount: number;
  updatedAt: number;
};

let backgroundLocationHandler: ((location: Location.LocationObject) => void) | null = null;

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
  try {
    await AsyncStorage.setItem(ACTIVE_WORKOUT_SESSION_KEY, JSON.stringify({ ...session, updatedAt: Date.now() }));
  } catch (error) {
    console.warn("[Workout Persistence] Could not persist active workout:", error);
  }
}

async function clearPersistedWorkoutSession(): Promise<void> {
  try {
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

  if (!isValidPersistedPoint(session, point)) {
    session.filteredPointCount += 1;
    session.lastProcessedLocationTimestamp = location.timestamp;
    await setPersistedWorkoutSession(session);
    return;
  }

  const coord = { latitude: point.latitude, longitude: point.longitude };
  if (session.autoPaused) {
    if (session.pauseStartTimestamp !== null) {
      session.totalPauseDuration += Math.max(0, location.timestamp - session.pauseStartTimestamp);
    }
    session.pauseStartTimestamp = null;
    session.runningStartTimestamp = location.timestamp;
    session.autoPaused = false;
  }

  if (session.lastValidPoint) {
    session.distance += calculateDistance(
      { latitude: session.lastValidPoint.latitude, longitude: session.lastValidPoint.longitude },
      coord
    );
  }

  session.status = "running";
  session.lastValidPoint = point;
  session.lastProcessedLocationTimestamp = location.timestamp;
  session.coords = [...session.coords, coord].slice(-5000);
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
      backgroundLocationHandler?.(location);
      if (!backgroundLocationHandler) {
        await processPersistedBackgroundLocation(location);
      }
    }
  });
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

export default function ExerciseScreen() {
  const router = useRouter();
  const { user, registrationId } = useAuth();
  const insets = useSafeAreaInsets();
  const trpcUtils = trpc.useUtils();
  const effectiveRegistrationId = registrationId || user?.id || "";
  const { colors: themeColors } = useTheme();
  const { isSubscribed } = useSubscription();

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
    exerciseType: "Run" as "Run" | "Walk" | "Cycle" | "Treadmill",
    startTime: "",
    duration: "",
    distanceKm: "",
  });
  const [otherSportsEvidenceImage, setOtherSportsEvidenceImage] = useState<string | null>(null);
  const [isSubmittingOtherSports, setIsSubmittingOtherSports] = useState(false);
  const completeEventRunMutation = trpc.activities.completeEventRun.useMutation();
  const { data: registeredEvents = [], refetch: refetchRegisteredEvents } = trpc.events.getRegisteredEvents.useQuery(
    { registrationId: effectiveRegistrationId },
    {
      enabled: !!effectiveRegistrationId,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnReconnect: true,
    }
  );

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeWorkoutSessionId = useRef<string | null>(null);
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
  const runStateRef = useRef<RunState>("idle");
  const distanceRef = useRef(0);
  const durationRef = useRef(0);
  const pauseDurationSecondsRef = useRef(0);
  const coordsRef = useRef<Coordinates[]>([]);
  const exerciseTypeRef = useRef<ExerciseType>(null);
  const selectedEventRunRef = useRef<RegisteredEventRun | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const androidBottomInset = Platform.OS === "android" ? Math.max(insets.bottom, 48) : insets.bottom;
  const workoutBottomPadding = runState === "finished" ? androidBottomInset + 48 : androidBottomInset + 24;
  const runDetailsActionsBottomPadding = androidBottomInset + 14;

  useEffect(() => {
    runStateRef.current = runState;
  }, [runState]);

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
      distance: distanceRef.current,
      coords: coordsRef.current.slice(-5000),
      lastValidPoint: lastValidPoint.current,
      lastProcessedLocationTimestamp: lastProcessedLocationTimestamp.current,
      filteredPointCount: filteredPointCount.current,
      updatedAt: Date.now(),
    });
  }, []);

  useEffect(() => {
    void requestLocationPermission();
    void getActivityVoiceAssistantEnabled().then(setActivityVoiceAssistantEnabled);

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[Timer] App came to foreground, recalculating duration');
        updateDuration();
      } else if (nextAppState.match(/inactive|background/)) {
        void persistActiveWorkoutSession(runStateRef.current === "paused" ? "paused" : "running");
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

  const autoPauseWorkout = useCallback(() => {
    if (autoPaused.current || runningStartTimestamp.current === null) {
      return;
    }

    const now = Date.now();
    elapsedBeforePause.current += Math.max(0, Math.floor((now - runningStartTimestamp.current) / 1000));
    durationRef.current = elapsedBeforePause.current;
    setDuration(elapsedBeforePause.current);
    runningStartTimestamp.current = null;
    pauseStartTimestamp.current = now;
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

  const evaluateAutoPause = useCallback((point: LocationPoint, movementDistanceKm: number, speedKmh: number | null) => {
    if (runStateRef.current !== "running" && !autoPaused.current) {
      return;
    }

    const isMoving =
      movementDistanceKm >= AUTO_RESUME_MIN_DISTANCE_KM ||
      (speedKmh !== null && speedKmh >= AUTO_RESUME_MIN_SPEED_KMH);

    if (isMoving) {
      stationaryStartTimestamp.current = null;
      autoPauseAnchorPoint.current = point;
      if (autoPaused.current) {
        autoResumeWorkout();
      }
      return;
    }

    if (autoPaused.current || runStateRef.current !== "running") {
      return;
    }

    const isStationary =
      movementDistanceKm < AUTO_RESUME_MIN_DISTANCE_KM &&
      (speedKmh === null || speedKmh <= AUTO_PAUSE_MAX_SPEED_KMH);

    if (!isStationary) {
      stationaryStartTimestamp.current = null;
      autoPauseAnchorPoint.current = point;
      return;
    }

    if (stationaryStartTimestamp.current === null) {
      stationaryStartTimestamp.current = point.timestamp;
      autoPauseAnchorPoint.current = point;
      return;
    }

    const stationarySeconds = (point.timestamp - stationaryStartTimestamp.current) / 1000;
    if (stationarySeconds >= AUTO_PAUSE_STATIONARY_SECONDS) {
      autoPauseWorkout();
    }
  }, [autoPauseWorkout, autoResumeWorkout]);

  const announceKilometerSplitIfNeeded = useCallback((nextDistanceKm: number) => {
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

  const handleLocationUpdate = useCallback((location: Location.LocationObject, exerciseT: ExerciseType) => {
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

    if (lastValidPoint.current && (newPoint.accuracy === null || newPoint.accuracy <= GPS_ACCURACY_THRESHOLD)) {
      const movementDistanceKm = calculateDistance(
        { latitude: lastValidPoint.current.latitude, longitude: lastValidPoint.current.longitude },
        newCoord
      );
      const movementHours = (newPoint.timestamp - lastValidPoint.current.timestamp) / (1000 * 3600);
      const speedKmh = movementHours > 0 ? movementDistanceKm / movementHours : null;
      evaluateAutoPause(newPoint, movementDistanceKm, speedKmh);
    }

    if (isResuming.current) {
      console.log('[GPS] First point after resume — skipping distance, updating anchor');
      lastValidPoint.current = newPoint;
      isResuming.current = false;
      setCoords((prev) => {
        const next = [...prev, newCoord];
        coordsRef.current = next;
        return next;
      });
      void persistActiveWorkoutSession("running");
      return;
    }

    if (!isValidGpsPoint(newPoint, exerciseT)) {
      void persistActiveWorkoutSession(runStateRef.current === "paused" ? "paused" : "running");
      return;
    }

    if (lastValidPoint.current) {
      const dist = calculateDistance(
        { latitude: lastValidPoint.current.latitude, longitude: lastValidPoint.current.longitude },
        newCoord
      );
      console.log('[GPS] Valid point, distance delta:', (dist * 1000).toFixed(1), 'm, accuracy:', newPoint.accuracy?.toFixed(1), 'm');
      setDistance((prevDist) => {
        const next = prevDist + dist;
        distanceRef.current = next;
        announceKilometerSplitIfNeeded(next);
        return next;
      });
    }

    lastValidPoint.current = newPoint;
    setCoords((prev) => {
      const next = [...prev, newCoord];
      coordsRef.current = next;
      return next;
    });
    void persistActiveWorkoutSession("running");
  }, [announceKilometerSplitIfNeeded, evaluateAutoPause, isValidGpsPoint, persistActiveWorkoutSession]);

  const startBackgroundLocationWatch = useCallback(async (exerciseT: ExerciseType) => {
    if (Platform.OS === "web" || !exerciseT) {
      return;
    }

    try {
      const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
      if (backgroundPermission.status !== "granted") {
        console.warn("[Background Location] Permission not granted; lock-screen tracking may pause.");
        return;
      }

      const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (alreadyStarted) {
        return;
      }

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 5,
        timeInterval: 3000,
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
    } catch (error) {
      console.warn("[Background Location] Could not start background tracking:", error);
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

    backgroundLocationHandler = (location) => {
      handleLocationUpdate(location, exerciseT);
    };

    try {
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval: 3000,
        },
        (location) => {
          handleLocationUpdate(location, exerciseT);
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
      elapsedBeforePause.current = session.elapsedBeforePause;
      runningStartTimestamp.current = session.runningStartTimestamp;
      totalPauseDuration.current = session.totalPauseDuration;
      pauseStartTimestamp.current = session.pauseStartTimestamp;
      lastValidPoint.current = session.lastValidPoint;
      lastProcessedLocationTimestamp.current = session.lastProcessedLocationTimestamp;
      filteredPointCount.current = session.filteredPointCount;
      distanceRef.current = session.distance;
      coordsRef.current = session.coords;
      exerciseTypeRef.current = session.exerciseType;
      selectedEventRunRef.current = session.eventRun;
      startTimeRef.current = startDate;
      pauseDurationSecondsRef.current = session.pauseDurationSeconds;
      autoPaused.current = session.autoPaused === true;
      lastAnnouncedKilometer.current = Math.floor(session.distance / KM_VOICE_ANNOUNCEMENT_INTERVAL);

      setExerciseType(session.exerciseType);
      setSelectedEventRun(session.eventRun);
      setStartTime(startDate);
      setDistance(session.distance);
      setCoords(session.coords);
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
  }, [startLocationWatch, startWorkoutTimer]);

  const startTracking = useCallback(async (type: ExerciseType, eventRun: RegisteredEventRun | null = null, scheduledStartTimestamp = Date.now()) => {
    if (!type) return;

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

    setCoords([]);
    coordsRef.current = [];
    setDistance(0);
    distanceRef.current = 0;
    setDuration(0);
    durationRef.current = 0;
    setPauseDurationSeconds(0);
    pauseDurationSecondsRef.current = 0;
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
    elapsedBeforePause.current = 0;
    const sessionId = uuidv4();
    const startDate = new Date(scheduledStartTimestamp);
    activeWorkoutSessionId.current = sessionId;
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
      status: scheduledStartTimestamp > Date.now() ? "pending" : "running",
      exerciseType: type,
      eventRun,
      startTimeIso: startDate.toISOString(),
      startTimestamp: scheduledStartTimestamp,
      runningStartTimestamp: scheduledStartTimestamp,
      elapsedBeforePause: 0,
      pauseStartTimestamp: null,
      totalPauseDuration: 0,
      pauseDurationSeconds: 0,
      autoPaused: false,
      distance: 0,
      coords: [],
      lastValidPoint: null,
      lastProcessedLocationTimestamp: null,
      filteredPointCount: 0,
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
  }, [canUseCycleWorkout, cycleWorkoutOnly, ensureForegroundLocationPermission, startLocationWatch, startWorkoutTimer, stopBackgroundLocationWatch]);

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

    setIsCountdownActive(true);
    try {
      const officialStartTimestamp = Date.now() + WORKOUT_COUNTDOWN_MS;
      await startTracking(type, eventRun, officialStartTimestamp);
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
  }, [canUseCycleWorkout, cycleWorkoutOnly, isCountdownActive, playCountdownCue, runState, startTracking, waitForCountdownStep]);

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

    if (!user || !startTime) {
      console.log('[Tracking] No user or startTime, skipping save');
      return;
    }

    const durationMinutes = finalDuration / 60;
    const requiredDistance = exerciseType === "Walk" ? MIN_DISTANCE_WALK : MIN_DISTANCE_RUN;
    const needsDistance = (exerciseType === "Walk" || exerciseType === "Run" || exerciseType === "Cycle") && distance < requiredDistance;
    const needsTime = (exerciseType === "Walk" || exerciseType === "Run" || exerciseType === "Cycle") && durationMinutes < MIN_ACTIVITY_DURATION_MINUTES;
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
        `Recordable workouts need at least ${requiredDistance} km and ${MIN_ACTIVITY_DURATION_MINUTES} minutes. You have ${distance.toFixed(2)} km and ${Math.floor(durationMinutes)} minutes so far.`,
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

    if (!user || !startTime) {
      Alert.alert("Error", "Missing activity details. Please try again.");
      return;
    }

    const finalDuration = duration;
    setIsSaving(true);
    try {
      const today = startTime.toISOString().split('T')[0];
      const { count, error: countError } = await supabase
        .from("activities")
        .select("*", { count: "exact", head: true })
        .eq("registration_id", user.id)
        .eq("activity_date", today);

      if (countError) {
        console.error('[ActivityLimit] Count error:', countError);
      }

      let error: { message?: string } | null = null;

      if ((count || 0) >= MAX_DAILY_ACTIVITIES) {
        if (selectedEventRun) {
          error = {
            message: `Daily activity limit reached. The event result will still be saved, but the regular activity log entry will be skipped.`,
          };
        } else {
          Alert.alert(
            "Daily Limit Reached",
            `You can only save a maximum of ${MAX_DAILY_ACTIVITIES} activities per day. This activity was not saved.`
          );
          setIsSaving(false);
          return;
        }
      }

      if (!error) {
        const calculatedPace = finalDuration > 0 && distance > 0 ? (finalDuration / 60) / distance : 0;

        const actualEndTime = new Date(startTime.getTime() + ((finalDuration + pauseDurationSeconds) * 1000));

        const startTimeStr = startTime.toISOString().split('T')[1].split('.')[0];
        const endTimeStr = actualEndTime.toISOString().split('T')[1].split('.')[0];

        const nextActivityId = uuidv4();

        console.log('[Tracking] Saving activity:', {
          id: nextActivityId,
          type: exerciseType,
          distance: distance.toFixed(3),
          duration: finalDuration,
          pace: calculatedPace.toFixed(2),
          startTime: startTimeStr,
          endTime: endTimeStr,
        });

        const insertResult = await supabase.from("activities").insert({
          activity_id: nextActivityId,
          registration_id: user.id,
          activity_date: today,
          exercise_type: exerciseType || "Run",
          distance_km: parseFloat(distance.toFixed(2)),
          pause_duration_seconds: pauseDurationSeconds,
          start_time: startTimeStr,
          end_time: endTimeStr,
          pace_min_per_km: parseFloat(calculatedPace.toFixed(2)),
        });

        error = insertResult.error;

        if (error) {
          console.error("[Tracking] Error saving activity:", error);
        } else {
          console.log("[Tracking] Activity saved successfully with ID:", nextActivityId);
        }
      }

      let eventResultSaved = false;
      let eventResultError = "";

      if (selectedEventRun && effectiveRegistrationId) {
        try {
          const eventIds = selectedEventRun.eventIds?.length ? selectedEventRun.eventIds : [selectedEventRun.eventId];
          await Promise.all(
            eventIds.map((eventId) =>
              completeEventRunMutation.mutateAsync({
                eventId,
                registrationId: effectiveRegistrationId,
                distanceKm: parseFloat(distance.toFixed(2)),
                timeSeconds: finalDuration,
              })
            )
          );
          eventResultSaved = true;
        } catch (eventError: any) {
          eventResultError = eventError?.message || "Failed to save your event result.";
        }
      }

      if (!error && selectedEventRun && eventResultSaved) {
        setActivitySaved(true);
        Alert.alert("Success", "Activity and event result saved successfully!");
        speakActivityMessage("Congratulations, activity completed");
      } else if (!error && selectedEventRun && !eventResultSaved) {
        setActivitySaved(true);
        Alert.alert("Saved with Caution", `Your activity was saved, but the event result could not be updated.\n\n${eventResultError}`);
        speakActivityMessage("Congratulations, activity completed");
      } else if (!error) {
        setActivitySaved(true);
        Alert.alert("Success", "Activity saved successfully!");
        speakActivityMessage("Congratulations, activity completed");
      } else if (selectedEventRun && eventResultSaved) {
        setActivitySaved(true);
        Alert.alert("Event Saved", "Your event result was saved, but the normal activity log could not be added.");
        speakActivityMessage("Congratulations, activity completed");
      } else {
        Alert.alert("Error", "Failed to save activity");
      }
    } catch (err) {
      console.error("[Tracking] Unexpected error saving:", err);
      Alert.alert("Error", "Something went wrong while saving your activity.");
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
    setCoords([]);
    coordsRef.current = [];
    setStartTime(null);
    startTimeRef.current = null;
    setExerciseType(null);
    exerciseTypeRef.current = null;
    setSelectedEventRun(null);
    selectedEventRunRef.current = null;
    setWorkoutLocation(null);
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

  const getRunShareMessage = () => {
    const runnerName = runnerProfile?.name || user?.username || "RunNation Runner";
    const eventLine = selectedEventRun ? `\nEvent: ${selectedEventRun.eventName}` : "";
    const dateLine = startTime ? startTime.toLocaleDateString() : new Date().toLocaleDateString();
    const startLine = startTime ? startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";

    return [
      `${runnerName} completed a ${exerciseType || "Run"} on RunNation.`,
      `Distance: ${distance.toFixed(2)} km`,
      `Time: ${formatTime(duration)}`,
      `Pace: ${formatPaceMinPerKm()} /km`,
      `Date: ${dateLine}`,
      `Start: ${startLine}${eventLine}`,
      "RunNation - Where runners belong",
      "",
      Platform.OS === "ios"
        ? "Get RunNation on iOS: coming soon"
        : `Get RunNation Android APK: ${RUNNATION_ANDROID_APK_LINK}`,
    ].join("\n");
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

    if (month === 11 || month === 0 || month === 1) return "❄️ Snow";
    if (month >= 2 && month <= 4) return "🌦️ Rainy";
    if (hour >= 18 || hour < 6) return "🌙 Cool";
    return "☀️ Sunny";
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

    if (!otherSportsForm.activityDate || !otherSportsForm.startTime || !otherSportsForm.duration || !otherSportsForm.distanceKm) {
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

    const distanceNum = parseFloat(otherSportsForm.distanceKm);
    if (isNaN(distanceNum) || distanceNum <= 0) {
      Alert.alert("Error", "Please enter a valid distance");
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
        distanceKm: distanceNum,
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
      });
      setOtherSportsEvidenceImage(null);
    } catch (error: any) {
      console.error("[Submit Other Sports] Error:", error);
      Alert.alert("Error", "Something went wrong. Please try again.");
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

  if (!isSubscribed) {
    return (
      <SubscriptionGate featureName="Workout">
        <></>
      </SubscriptionGate>
    );
  }

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
              <Text style={styles.statLabel}>Distance</Text>
              <Text style={styles.statValue}>{distance.toFixed(2)}</Text>
              <Text style={styles.statUnit}>km</Text>
            </LinearGradient>
            <LinearGradient colors={colors.gradient.teal} style={styles.statCardLarge}>
              <Timer size={18} color={colors.white} style={styles.statIcon} />
              <Text style={styles.statLabel}>Time</Text>
              <Text style={styles.statValue}>{formatTime(duration)}</Text>
            </LinearGradient>
            <LinearGradient colors={colors.gradient.blue} style={styles.statCardSmall}>
              <Gauge size={18} color={colors.white} style={styles.statIcon} />
              <Text style={styles.statLabel}>Pace</Text>
              <Text style={styles.statValue}>{formatPaceMinPerKm()}</Text>
              <Text style={styles.statUnit}>/km</Text>
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
                  <LinearGradient colors={["#111827", "#FF6B35"]} style={styles.workoutWelcomeCard}>
                    <View style={styles.workoutWelcomeCopy}>
                      <Text style={styles.workoutWelcomeKicker}>Workout</Text>
                      <Text style={styles.workoutWelcomeTitle}>Ready to move</Text>
                    </View>
                    <View style={styles.workoutWelcomeIcon}>
                      <Activity size={28} color={colors.white} />
                    </View>
                  </LinearGradient>
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
              
              <TouchableOpacity style={styles.actionButton} onPress={stopTracking} disabled={isSaving} activeOpacity={0.8}>
                <LinearGradient colors={['#EF4444', '#F87171']} style={styles.actionButtonGradient}>
                  <Square size={28} color={colors.white} />
                  <Text style={styles.actionButtonText}>{isSaving ? "Saving..." : "Finish"}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {runState === "paused" && (
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.actionButton} onPress={resumeTracking} activeOpacity={0.8}>
                <LinearGradient colors={colors.gradient.teal} style={styles.actionButtonGradient}>
                  <Play size={28} color={colors.white} />
                  <Text style={styles.actionButtonText}>Resume</Text>
                </LinearGradient>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.actionButton} onPress={stopTracking} disabled={isSaving} activeOpacity={0.8}>
                <LinearGradient colors={['#EF4444', '#F87171']} style={styles.actionButtonGradient}>
                  <Square size={28} color={colors.white} />
                  <Text style={styles.actionButtonText}>{isSaving ? "Saving..." : "Finish"}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {runState === "finished" && (
            <View style={styles.finishedContainer}>
              <LinearGradient colors={colors.gradient.sunset} style={styles.finishedCard}>
                <Text style={styles.finishedEmoji}>🎉</Text>
                <Text style={styles.finishedTitle}>{selectedEventRun ? "Workout Event Complete!" : `${exerciseType} Complete!`}</Text>
                {selectedEventRun ? (
                  <Text style={styles.finishedSubtitle}>{selectedEventRun.eventName}</Text>
                ) : null}
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Distance</Text>
                    <Text style={styles.summaryValue}>{distance.toFixed(2)} km</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Time</Text>
                    <Text style={styles.summaryValue}>{formatTime(duration)}</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Pace</Text>
                    <Text style={styles.summaryValue}>{formatPaceMinPerKm()} /km</Text>
                  </View>
                </View>
              </LinearGradient>

              <TouchableOpacity style={styles.resetButton} onPress={() => setShowRunDetailsModal(true)} activeOpacity={0.8}>
                <LinearGradient colors={colors.gradient.blue} style={styles.resetButtonGradient}>
                  <Text style={styles.resetButtonText}>{activitySaved ? "View Share Card" : "Review / Save Activity"}</Text>
                </LinearGradient>
              </TouchableOpacity>
              
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
          <View style={[styles.runDetailsShell, { backgroundColor: themeColors.surface }]}>
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
                  <View style={styles.shareTopRow}>
                    <View style={styles.shareRunnerBlock}>
                      {runnerProfile?.photoUrl ? (
                        <Image source={{ uri: runnerProfile.photoUrl }} style={styles.shareAvatar} resizeMode="cover" />
                      ) : (
                        <View style={styles.shareAvatarFallback}>
                          <Text style={styles.shareAvatarInitial}>
                            {(runnerProfile?.name || user?.username || "R").charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <Text style={[styles.shareRunnerName, runCardTheme === "dark" ? styles.shareTextLight : styles.shareTextDark]} numberOfLines={1}>
                        {runnerProfile?.name || user?.username || "RunNation Runner"}
                      </Text>
                      <Text style={[styles.shareRunnerMeta, runCardTheme === "dark" ? styles.shareTextMutedDark : styles.shareTextMutedLight]} numberOfLines={2}>
                        {getRunDetailsMeta() || "Workout location"}
                      </Text>
                    </View>
                    <View style={styles.shareDistanceBlock}>
                      {selectedEventRun ? <Text style={styles.shareMedalSymbol}>🏅</Text> : null}
                      <View style={styles.shareDistanceRow}>
                        <Text style={[styles.shareDistanceValue, runCardTheme === "dark" ? styles.shareTextLight : styles.shareTextDark]}>{distance.toFixed(2)}</Text>
                        <Text style={[styles.shareDistanceUnit, runCardTheme === "dark" ? styles.shareTextMutedDark : styles.shareTextMutedLight]}>km</Text>
                      </View>
                    </View>
                  </View>

                  <Text style={[styles.shareDateText, runCardTheme === "dark" ? styles.shareTextMutedDark : styles.shareTextMutedLight]}>
                    {startTime
                      ? `${startTime.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}, ${startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "-"}
                  </Text>

                    <View style={styles.shareMetricsGrid}>
                    <View style={[styles.shareMetric, styles.shareMetricWide]}>
                      <Text style={[styles.shareMetricValue, runCardTheme === "dark" ? styles.shareTextLight : styles.shareTextDark]}>{formatTime(duration)}</Text>
                      <Text style={styles.shareMetricLabel}>Workout Duration</Text>
                    </View>
                    <View style={[styles.shareMetric, styles.shareMetricWide]}>
                      <Text style={[styles.shareMetricValue, runCardTheme === "dark" ? styles.shareTextLight : styles.shareTextDark]}>{formatPaceMinPerKm()}</Text>
                      <Text style={styles.shareMetricLabel}>Avg pace/km</Text>
                    </View>
                    <View style={styles.shareMetric}>
                      <Text style={[styles.shareMetricValue, runCardTheme === "dark" ? styles.shareTextLight : styles.shareTextDark]}>{formatTime(pauseDurationSeconds)}</Text>
                      <Text style={styles.shareMetricLabel}>Pause Time</Text>
                    </View>
                    <View style={styles.shareMetric}>
                      <Text style={[styles.shareMetricValue, runCardTheme === "dark" ? styles.shareTextLight : styles.shareTextDark]}>{exerciseType || "Run"}</Text>
                      <Text style={styles.shareMetricLabel}>Activity type</Text>
                    </View>
                    <View style={styles.shareMetric}>
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
              </View>
            </ScrollView>

            <View style={[styles.runDetailsActions, { borderTopColor: themeColors.border, paddingBottom: runDetailsActionsBottomPadding }]}>
              <TouchableOpacity
                style={[styles.runDetailsActionButton, styles.runDetailsCloseButton]}
                onPress={() => setShowRunDetailsModal(false)}
              >
                <Text style={styles.runDetailsCloseText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.runDetailsActionButton, styles.runDetailsShareButton]} onPress={shareRunDetails}>
                <Text style={styles.runDetailsActionText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.runDetailsActionButton, styles.runDetailsSaveButton, (isSaving || activitySaved) && styles.runDetailsDisabledButton]}
                onPress={saveFinishedActivity}
                disabled={isSaving || activitySaved}
              >
                <Text style={styles.runDetailsActionText}>{activitySaved ? "Saved" : isSaving ? "Saving..." : "Save"}</Text>
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
                📸 Your submission will be reviewed by an admin
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
                  {(["Run", "Walk", "Cycle"] as const).map((type) => {
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
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Distance (km) *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  placeholder="e.g., 5.5"
                  keyboardType="numeric"
                  value={otherSportsForm.distanceKm}
                  onChangeText={(text) => setOtherSportsForm((prev) => ({ ...prev, distanceKm: text }))}
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
  actionButtonGradient: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700" as const,
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
  },
  runDetailsScroll: {
    padding: 0,
    gap: 14,
  },
  shareCard: {
    overflow: "hidden" as const,
    minHeight: 670,
    backgroundColor: "#E5E7EB",
  },
  shareMapHero: {
    height: 360,
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
    marginTop: -34,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingTop: 12,
    minHeight: 330,
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
  shareRunnerBlock: {
    flex: 1,
  },
  shareAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    marginTop: 0,
    marginBottom: 6,
  },
  shareAvatarFallback: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "#F97316",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    marginTop: 0,
    marginBottom: 6,
  },
  shareAvatarInitial: {
    color: colors.white,
    fontSize: 24,
    fontWeight: "900" as const,
  },
  shareRunnerInfo: {
    flex: 1,
  },
  shareRunnerName: {
    fontSize: 23,
    fontWeight: "500" as const,
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
    fontSize: 54,
    fontWeight: "400" as const,
    lineHeight: 58,
  },
  shareDistanceUnit: {
    fontSize: 20,
    fontWeight: "500" as const,
    marginBottom: 7,
  },
  shareMetricsGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    rowGap: 18,
    marginTop: 20,
  },
  shareMetric: {
    width: "33.33%",
    alignItems: "center" as const,
    paddingHorizontal: 4,
  },
  shareMetricWide: {
    width: "50%",
  },
  shareMetricLabel: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "500" as const,
    textAlign: "center" as const,
    marginTop: 4,
  },
  shareMetricValue: {
    fontSize: 22,
    fontWeight: "500" as const,
    textAlign: "center" as const,
  },
  shareDateText: {
    fontSize: 14,
    fontWeight: "500" as const,
    marginTop: 4,
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
    flexDirection: "row" as const,
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
  },
  runDetailsActionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center" as const,
  },
  runDetailsCloseButton: {
    backgroundColor: "#E5E7EB",
  },
  runDetailsShareButton: {
    backgroundColor: "#2563EB",
  },
  runDetailsSaveButton: {
    backgroundColor: "#10B981",
  },
  runDetailsDisabledButton: {
    opacity: 0.65,
  },
  runDetailsActionText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "900" as const,
  },
  runDetailsCloseText: {
    color: "#374151",
    fontSize: 15,
    fontWeight: "900" as const,
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
  finishedEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  finishedTitle: {
    fontSize: 32,
    fontWeight: "800" as const,
    color: colors.white,
    marginBottom: 24,
  },
  finishedSubtitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "rgba(255,255,255,0.92)",
    marginTop: -10,
    marginBottom: 20,
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
    gap: 10,
  },
  typeChip: {
    flex: 1,
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
