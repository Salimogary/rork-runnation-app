import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import {
  Activity,
  Battery,
  Bike,
  Bluetooth,
  ChevronRight,
  Footprints,
  HeartPulse,
  List,
  LogOut,
  Music,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Square,
  Timer,
  Trophy,
  UploadCloud,
  Volume2,
  Watch,
  Wifi,
  WifiOff,
} from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { getActivityVoiceAssistantEnabled, setActivityVoiceAssistantEnabled as saveActivityVoiceAssistantEnabled } from "@/utils/activityVoice";
import { getWorkoutAutoPauseEnabled, setWorkoutAutoPauseEnabled as saveWorkoutAutoPauseEnabled } from "@/utils/workoutPreferences";

type WorkoutState = "idle" | "running" | "paused" | "summary";
type WatchActivityType = "Walk" | "Run" | "Cycle" | "Stairs" | "Event Run";
type MenuSection = "menu" | "settings" | "recent" | "music" | "health" | "sync";

interface WatchWorkout {
  activityId: string;
  registrationId: string;
  startedAt: string;
  endedAt: string;
  distanceKm: number;
  durationSec: number;
  paceKmh: number;
  heartRate: number | null;
  exerciseType: WatchActivityType;
  eventName?: string | null;
  synced: boolean;
}

interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

interface RegisteredWatchEvent {
  eventId: string;
  eventName: string;
}

interface BatteryManagerLike {
  level: number;
  addEventListener?: (event: "levelchange", callback: () => void) => void;
  removeEventListener?: (event: "levelchange", callback: () => void) => void;
}


const STORAGE_KEY = "watch_run_workouts";
const KEEP_SCREEN_ON_KEY = "watch_keep_screen_on";
const SHOW_BATTERY_PERCENT_KEY = "watch_show_battery_percent";
const GPS_ACCURACY_THRESHOLD = 35;
const TIME_ZONE_COUNTRY_CODES: Record<string, string> = {
  "Africa/Nairobi": "KE",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Phoenix": "US",
  "America/Anchorage": "US",
  "Pacific/Honolulu": "US",
  "Europe/London": "GB",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA",
  "Asia/Kolkata": "IN",
};

const WATCH_ACTIVITIES: { type: WatchActivityType; label: string; hint: string }[] = [
  { type: "Walk", label: "Walk", hint: "easy outdoor effort" },
  { type: "Run", label: "Run", hint: "distance + time" },
  { type: "Cycle", label: "Cycle", hint: "GPS ride timer" },
  { type: "Event Run", label: "Event Run", hint: "registered event" },
];

function formatElapsed(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function calculateDistance(from: LocationPoint, to: LocationPoint) {
  const earthRadiusKm = 6371;
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

async function getStoredWorkouts() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as WatchWorkout[];
  } catch {
    return [];
  }
}

async function setStoredWorkouts(workouts: WatchWorkout[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
}

function countryCodeToFlag(countryCode: string) {
  const normalized = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "";

  return String.fromCodePoint(...normalized.split("").map((letter) => 127397 + letter.charCodeAt(0)));
}

function formatCountryDisplay(countryCode?: string | null, countryName?: string | null) {
  const normalizedCode = countryCode?.toUpperCase();
  const flag = normalizedCode ? countryCodeToFlag(normalizedCode) : "";

  if (flag && normalizedCode) return `${flag} ${normalizedCode}`;
  return countryName || normalizedCode || "Location";
}

function getInitialCountryDisplay() {
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  const locale = Platform.OS === "web" && typeof navigator !== "undefined" ? navigator.language : resolved.locale;
  const localeCountry = locale.match(/[-_]([A-Z]{2})\b/i)?.[1];

  return formatCountryDisplay(localeCountry || TIME_ZONE_COUNTRY_CODES[resolved.timeZone]);
}

function formatWatchDateTime(date: Date) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}  ${hours}:${minutes}`;
}

function buildPairCode() {
  return Math.random().toString(36).slice(2, 5).toUpperCase() + "-" + Math.floor(100 + Math.random() * 900);
}

function WatchBrandMark() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.brandMark} pointerEvents="none">
      <View style={styles.brandLine}>
        <Text style={styles.brandMarkText} adjustsFontSizeToFit numberOfLines={1}>RunNation</Text>
      </View>
      <Text style={styles.brandDateTime} numberOfLines={1}>
        {formatWatchDateTime(now)}
      </Text>
    </View>
  );
}

function PairCodeGrid({ code }: { code: string }) {
  const cells = useMemo(() => {
    let hash = 0;
    for (let index = 0; index < code.length; index += 1) {
      hash = (hash << 5) - hash + code.charCodeAt(index);
      hash |= 0;
    }

    return Array.from({ length: 49 }, (_, index) => {
      const edge = index < 7 || index > 41 || index % 7 === 0 || index % 7 === 6;
      return edge || ((hash >> (index % 24)) & 1) === 1 || (index + hash) % 5 === 0;
    });
  }, [code]);

  return (
    <View style={styles.pairGrid}>
      {cells.map((filled, index) => (
        <View key={`${code}-${index}`} style={[styles.pairCell, filled && styles.pairCellFilled]} />
      ))}
    </View>
  );
}

export default function WatchRunExperience() {
  const { width } = useWindowDimensions();
  const { user, isLoading, signIn, signOut } = useAuth();
  const [authMode, setAuthMode] = useState<"pair" | "login">("pair");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [pairCode, setPairCode] = useState(buildPairCode);

  const [workoutState, setWorkoutState] = useState<WorkoutState>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [selectedActivity, setSelectedActivity] = useState<WatchActivityType>("Run");
  const [lastWorkout, setLastWorkout] = useState<WatchWorkout | null>(null);
  const [recentWorkouts, setRecentWorkouts] = useState<WatchWorkout[]>([]);
  const [registeredEvents, setRegisteredEvents] = useState<RegisteredWatchEvent[]>([]);
  const [selectedEventName, setSelectedEventName] = useState<string | null>(null);
  const [keepScreenOn, setKeepScreenOn] = useState(false);
  const [voiceAssistantEnabled, setVoiceAssistantEnabled] = useState(true);
  const [autoPauseEnabled, setAutoPauseEnabled] = useState(true);
  const [showBatteryPercent, setShowBatteryPercent] = useState(true);
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [countryDisplay, setCountryDisplay] = useState(getInitialCountryDisplay);
  const [isOnline, setIsOnline] = useState(true);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuSection, setMenuSection] = useState<MenuSection>("menu");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("Ready");

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const startedAt = useRef<Date | null>(null);
  const runningStartedAtMs = useRef<number | null>(null);
  const elapsedBeforePause = useRef(0);
  const lastPoint = useRef<LocationPoint | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const pendingCount = useMemo(
    () => recentWorkouts.filter((workout) => !workout.synced).length,
    [recentWorkouts]
  );

  const metricPageWidth = Math.max(180, width);
  const activeWorkoutTitle = selectedActivity === "Event Run" ? selectedEventName || "Event Run" : selectedActivity;
  const nextEventName = registeredEvents[0]?.eventName ?? "Choose on phone";
  const canSaveReviewWorkout = lastWorkout ? workoutQualifiesForSave(lastWorkout) : false;

  const loadRecent = useCallback(async () => {
    if (!user) return;
    const stored = await getStoredWorkouts();
    const userWorkouts = stored
      .filter((workout) => workout.registrationId === user.id)
      .map((workout) => ({ ...workout, exerciseType: workout.exerciseType ?? "Run", eventName: workout.eventName ?? null }))
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    setRecentWorkouts(userWorkouts);
  }, [user]);

  const syncWorkouts = useCallback(async () => {
    if (!user) return;

    setIsSyncing(true);
    setSyncMessage("Syncing");
    try {
      const stored = await getStoredWorkouts();
      const updated = [...stored];
      const pending = updated
        .filter((workout) => workout.registrationId === user.id && !workout.synced)
        .map((workout) => ({ ...workout, exerciseType: workout.exerciseType ?? "Run", eventName: workout.eventName ?? null }));

      for (const workout of pending) {
        const start = new Date(workout.startedAt);
        const end = new Date(workout.endedAt);
        const { error } = await supabase.from("activities").insert({
          activity_id: workout.activityId,
          registration_id: workout.registrationId,
          activity_date: start.toISOString().split("T")[0],
          exercise_type: workout.exerciseType === "Event Run" ? "Run" : workout.exerciseType,
          distance_km: parseFloat(workout.distanceKm.toFixed(2)),
          start_time: start.toISOString().split("T")[1].split(".")[0],
          end_time: end.toISOString().split("T")[1].split(".")[0],
          pace_km_h: parseFloat(workout.paceKmh.toFixed(2)),
        });

        if (!error) {
          const match = updated.find((item) => item.activityId === workout.activityId);
          if (match) match.synced = true;
        }
      }

      await setStoredWorkouts(updated);
      const remaining = updated.filter((workout) => workout.registrationId === user.id && !workout.synced).length;
      setSyncMessage(remaining === 0 ? "All synced" : `${remaining} pending`);
      await loadRecent();
    } catch (error) {
      console.error("[WatchRun] Sync failed:", error);
      setSyncMessage("Offline");
    } finally {
      setIsSyncing(false);
    }
  }, [loadRecent, user]);

  useEffect(() => {
    if (!user) return;
    void loadRecent();
    void syncWorkouts();
  }, [loadRecent, syncWorkouts, user]);

  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      const [keepScreenValue, showBatteryValue, voiceEnabled, autoPauseValue] = await Promise.all([
        AsyncStorage.getItem(KEEP_SCREEN_ON_KEY),
        AsyncStorage.getItem(SHOW_BATTERY_PERCENT_KEY),
        getActivityVoiceAssistantEnabled(),
        getWorkoutAutoPauseEnabled(),
      ]);

      if (!mounted) return;
      setKeepScreenOn(keepScreenValue === "true");
      setShowBatteryPercent(showBatteryValue !== "false");
      setVoiceAssistantEnabled(voiceEnabled);
      setAutoPauseEnabled(autoPauseValue);
    };

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    const loadEvents = async () => {
      try {
        const { data, error } = await supabase
          .from("events_participants")
          .select("event_id, events!events_participants_event_id_fkey(event_name)")
          .eq("registration_id", user.id);

        if (error) {
          console.warn("[WatchRun] Event lookup failed:", error.message);
          return;
        }

        const events = (data || [])
          .map((row: any) => ({
            eventId: String(row.event_id || ""),
            eventName: String(row.events?.event_name || "Event Run"),
          }))
          .filter((event) => event.eventId && event.eventName);

        if (mounted) {
          setRegisteredEvents(events);
        }
      } catch (error) {
        console.warn("[WatchRun] Event lookup failed:", error);
      }
    };

    void loadEvents();

    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let cancelled = false;

    const applyWakeLock = async () => {
      try {
        if (wakeLockRef.current) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        }

        const wakeNavigator = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
        if (keepScreenOn && wakeNavigator.wakeLock?.request) {
          const lock = await wakeNavigator.wakeLock.request("screen");
          if (cancelled) {
            await lock.release();
            return;
          }
          wakeLockRef.current = lock;
        }
      } catch (error) {
        console.warn("[WatchRun] Wake lock unavailable:", error);
      }
    };

    void applyWakeLock();

    return () => {
      cancelled = true;
      if (wakeLockRef.current) {
        void wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, [keepScreenOn]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || typeof navigator === "undefined") {
      setIsOnline(true);
      return;
    }

    const updateConnectivity = () => setIsOnline(navigator.onLine !== false);
    updateConnectivity();
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);

    return () => {
      window.removeEventListener("online", updateConnectivity);
      window.removeEventListener("offline", updateConnectivity);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadCountryFromKnownLocation = async () => {
      setCountryDisplay(getInitialCountryDisplay());

      if (Platform.OS === "web") return;

      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== "granted") return;

        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest });
        const [place] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        if (mounted && place) {
          setCountryDisplay(formatCountryDisplay(place.isoCountryCode, place.country));
        }
      } catch {
        if (mounted) setCountryDisplay(getInitialCountryDisplay());
      }
    };

    void loadCountryFromKnownLocation();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || !showBatteryPercent) {
      setBatteryPercent(null);
      return;
    }

    let battery: BatteryManagerLike | null = null;
    let mounted = true;

    const updateBattery = () => {
      if (battery && mounted) {
        setBatteryPercent(Math.round(battery.level * 100));
      }
    };

    const loadBattery = async () => {
      const batteryNavigator = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
      if (!batteryNavigator.getBattery) return;
      battery = await batteryNavigator.getBattery();
      updateBattery();
      battery.addEventListener?.("levelchange", updateBattery);
    };

    void loadBattery().catch(() => setBatteryPercent(null));

    return () => {
      mounted = false;
      battery?.removeEventListener?.("levelchange", updateBattery);
    };
  }, [showBatteryPercent]);


  useEffect(() => {
    const interval = setInterval(() => setPairCode(buildPairCode()), 90000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (workoutState !== "running") return;

    const interval = setInterval(() => {
      if (runningStartedAtMs.current !== null) {
        setElapsedSec(elapsedBeforePause.current + Math.floor((Date.now() - runningStartedAtMs.current) / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [workoutState]);

  useEffect(() => {
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setAuthError("Enter email and password");
      return;
    }

    setIsSigningIn(true);
    setAuthError("");
    const result = await signIn(email.trim(), password);
    setIsSigningIn(false);

    if (result.error) {
      setAuthError(result.error.message);
    }
  };

  const startLocation = useCallback(async () => {
    if (Platform.OS === "web") return;

    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      setSyncMessage("GPS off");
      return;
    }

    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 5,
        timeInterval: 3000,
      },
      (location) => {
        const nextPoint: LocationPoint = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
        };

        if (nextPoint.accuracy !== null && nextPoint.accuracy > GPS_ACCURACY_THRESHOLD) return;

        if (lastPoint.current) {
          const deltaKm = calculateDistance(lastPoint.current, nextPoint);
          if (autoPauseEnabled && deltaKm < 0.002) {
            lastPoint.current = nextPoint;
            return;
          }
          if (deltaKm >= 0.002 && deltaKm <= 0.25) {
            setDistanceKm((current) => current + deltaKm);
          }
        }

        lastPoint.current = nextPoint;
      }
    );
  }, [autoPauseEnabled]);

  const startWorkout = async (activityType: WatchActivityType) => {
    const eventName = activityType === "Event Run" ? nextEventName : null;
    setSelectedActivity(activityType);
    setSelectedEventName(eventName);
    startedAt.current = new Date();
    runningStartedAtMs.current = Date.now();
    elapsedBeforePause.current = 0;
    lastPoint.current = null;
    setElapsedSec(0);
    setDistanceKm(0);
    setLastWorkout(null);
    setWorkoutState("running");
    await startLocation();
  };

  const pauseRun = () => {
    if (runningStartedAtMs.current !== null) {
      elapsedBeforePause.current += Math.floor((Date.now() - runningStartedAtMs.current) / 1000);
    }
    runningStartedAtMs.current = null;
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    setWorkoutState("paused");
    setElapsedSec(elapsedBeforePause.current);
  };

  const resumeRun = async () => {
    runningStartedAtMs.current = Date.now();
    lastPoint.current = null;
    setWorkoutState("running");
    await startLocation();
  };

  const stopRun = async () => {
    if (!user || !startedAt.current) return;

    const finalElapsed =
      runningStartedAtMs.current !== null
        ? elapsedBeforePause.current + Math.floor((Date.now() - runningStartedAtMs.current) / 1000)
        : elapsedBeforePause.current;
    const endedAt = new Date();
    const workout: WatchWorkout = {
      activityId: uuidv4(),
      registrationId: user.id,
      startedAt: startedAt.current.toISOString(),
      endedAt: endedAt.toISOString(),
      distanceKm,
      durationSec: finalElapsed,
      paceKmh: finalElapsed > 0 ? distanceKm / (finalElapsed / 3600) : 0,
      heartRate: null,
      exerciseType: selectedActivity,
      eventName: selectedActivity === "Event Run" ? selectedEventName : null,
      synced: false,
    };

    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    setLastWorkout(workout);
    setWorkoutState("summary");
    setElapsedSec(finalElapsed);
    runningStartedAtMs.current = null;
    elapsedBeforePause.current = finalElapsed;
  };

  const resetToHome = () => {
    startedAt.current = null;
    runningStartedAtMs.current = null;
    elapsedBeforePause.current = 0;
    lastPoint.current = null;
    setWorkoutState("idle");
    setElapsedSec(0);
    setDistanceKm(0);
    setSelectedEventName(null);
  };

  const openMenu = (section: MenuSection = "menu") => {
    setMenuSection(section);
    setIsMenuOpen(true);
  };

  const toggleKeepScreenOn = async () => {
    const next = !keepScreenOn;
    setKeepScreenOn(next);
    await AsyncStorage.setItem(KEEP_SCREEN_ON_KEY, next ? "true" : "false");
  };

  const toggleVoiceAssistant = async () => {
    const next = !voiceAssistantEnabled;
    setVoiceAssistantEnabled(next);
    await saveActivityVoiceAssistantEnabled(next);
  };

  const toggleAutoPause = async () => {
    const next = !autoPauseEnabled;
    setAutoPauseEnabled(next);
    await saveWorkoutAutoPauseEnabled(next);
  };

  const toggleBatteryPercent = async () => {
    const next = !showBatteryPercent;
    setShowBatteryPercent(next);
    await AsyncStorage.setItem(SHOW_BATTERY_PERCENT_KEY, next ? "true" : "false");
  };

  const saveReviewWorkout = async () => {
    if (!lastWorkout || !workoutQualifiesForSave(lastWorkout)) return;
    const stored = await getStoredWorkouts();
    await setStoredWorkouts([{ ...lastWorkout, synced: false }, ...stored]);
    await loadRecent();
    void syncWorkouts();
    resetToHome();
  };

  const resumeReviewWorkout = async () => {
    if (!lastWorkout) return;
    setSelectedActivity(lastWorkout.exerciseType);
    setSelectedEventName(lastWorkout.eventName ?? null);
    setDistanceKm(lastWorkout.distanceKm);
    setElapsedSec(lastWorkout.durationSec);
    elapsedBeforePause.current = lastWorkout.durationSec;
    runningStartedAtMs.current = Date.now();
    lastPoint.current = null;
    setLastWorkout(null);
    setWorkoutState("running");
    await startLocation();
  };

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <WatchBrandMark />
        <View style={styles.centerContent}>
          <ActivityIndicator color="#E5FF5A" />
        </View>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.authScreen}>
        <WatchBrandMark />
        <Text style={styles.watchLabel}>Watch</Text>

        <View style={styles.authSwitch}>
          <TouchableOpacity
            style={[styles.authSwitchButton, authMode === "pair" && styles.authSwitchButtonActive]}
            onPress={() => setAuthMode("pair")}
          >
            <Bluetooth size={14} color={authMode === "pair" ? "#0B0F0E" : "#B8C2BD"} />
            <Text style={[styles.authSwitchText, authMode === "pair" && styles.authSwitchTextActive]}>Pair</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.authSwitchButton, authMode === "login" && styles.authSwitchButtonActive]}
            onPress={() => setAuthMode("login")}
          >
            <Watch size={14} color={authMode === "login" ? "#0B0F0E" : "#B8C2BD"} />
            <Text style={[styles.authSwitchText, authMode === "login" && styles.authSwitchTextActive]}>Login</Text>
          </TouchableOpacity>
        </View>

        {authMode === "pair" ? (
          <View style={styles.pairPanel}>
            <PairCodeGrid code={pairCode} />
            <Text style={styles.pairCode}>{pairCode}</Text>
            <Text style={styles.authHint}>Use the phone app to pair an existing account. New accounts must be created on phone.</Text>
          </View>
        ) : (
          <View style={styles.loginPanel}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="email"
              placeholderTextColor="#6F7773"
              autoCapitalize="none"
              style={styles.authInput}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="password"
              placeholderTextColor="#6F7773"
              secureTextEntry
              style={styles.authInput}
            />
            {authError ? <Text style={styles.authError}>{authError}</Text> : null}
            <TouchableOpacity style={styles.authButton} onPress={handleLogin} disabled={isSigningIn}>
              <Text style={styles.authButtonText}>{isSigningIn ? "Checking" : "Sign in"}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <WatchBrandMark />
      {workoutState === "idle" ? (
        <View style={styles.home}>
          <View style={styles.topRow}>
            <TouchableOpacity style={styles.iconButton} onPress={() => openMenu()}>
              <List size={20} color="#F8FAF9" />
            </TouchableOpacity>
            <View style={styles.statusPill}>
              {isOnline ? <Wifi size={12} color="#E5FF5A" /> : <WifiOff size={12} color="#FF6B6B" />}
              <Text style={styles.statusText}>{showBatteryPercent && batteryPercent !== null ? `${batteryPercent}%` : isOnline ? pendingCount > 0 ? `${pendingCount} pending` : syncMessage : "offline"}</Text>
            </View>
          </View>

          <View style={styles.activityHeader}>
            <View style={styles.greetingRow}>
              <Text style={styles.greeting} numberOfLines={1}>{user.username}</Text>
              <View style={styles.countryPill}>
                <Text style={styles.countryText} numberOfLines={1}>{countryDisplay}</Text>
              </View>
            </View>
            <Text style={styles.activityTitle}>Choose activity</Text>
          </View>

          {selectedActivity === "Event Run" && selectedEventName ? (
            <Text style={styles.eventWorkoutName} numberOfLines={1}>{selectedEventName}</Text>
          ) : null}

          <ScrollView style={styles.activityPicker} contentContainerStyle={styles.activityPickerContent} showsVerticalScrollIndicator={false}>
            {WATCH_ACTIVITIES.map((activity) => {
              const hint = activity.type === "Event Run" ? nextEventName : activity.hint;
              return (
              <TouchableOpacity
                key={activity.type}
                style={styles.activityOption}
                onPress={() => startWorkout(activity.type)}
                activeOpacity={0.82}
              >
                <View style={styles.activityOptionIcon}>{renderActivityIcon(activity.type)}</View>
                <View style={styles.activityOptionCopy}>
                  <Text style={styles.activityOptionLabel}>{activity.label}</Text>
                  <Text style={styles.activityOptionHint}>{hint}</Text>
                </View>
                <ChevronRight size={17} color="#E5FF5A" />
              </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.homeMetric}>
            {recentWorkouts[0] ? `${recentWorkouts[0].distanceKm.toFixed(2)} km last ${recentWorkouts[0].exerciseType.toLowerCase()}` : "Ready"}
          </Text>
        </View>
      ) : null}

      {workoutState === "running" || workoutState === "paused" ? (
        <View style={styles.workout}>
          <View style={styles.workoutHeader}>
            <Text style={styles.workoutState} numberOfLines={1}>{workoutState === "running" ? activeWorkoutTitle.toUpperCase() : "PAUSED"}</Text>
            <Text style={styles.gpsText}>{syncMessage === "GPS off" ? "GPS OFF" : "GPS"}</Text>
          </View>

          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.metricPager}
            contentContainerStyle={styles.metricPagerContent}
          >
            <MetricPage pageWidth={metricPageWidth} icon={<Activity size={24} color="#4DE3B2" />} value={distanceKm.toFixed(2)} label="km" />
            <MetricPage pageWidth={metricPageWidth} icon={<Timer size={24} color="#E5FF5A" />} value={formatElapsed(elapsedSec)} label="time" />
          </ScrollView>

          <View style={styles.controls}>
            {workoutState === "running" ? (
              <TouchableOpacity style={styles.controlButton} onPress={pauseRun}>
                <Pause size={30} color="#0B0F0E" fill="#0B0F0E" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.controlButton} onPress={resumeRun}>
                <Play size={30} color="#0B0F0E" fill="#0B0F0E" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.controlButton, styles.stopButton]} onLongPress={stopRun} delayLongPress={700}>
              <Square size={22} color="#FFFFFF" fill="#FFFFFF" />
              <Text style={styles.stopHint}>Hold</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {workoutState === "summary" && lastWorkout ? (
        <View style={styles.summaryScreen}>
          <Text style={styles.summaryTitle}>{canSaveReviewWorkout ? "Review" : "Too Short"}</Text>
          <View style={styles.summaryGrid}>
            <SummaryMetric value={lastWorkout.distanceKm.toFixed(2)} label="km" />
            <SummaryMetric value={formatElapsed(lastWorkout.durationSec)} label="time" />
            <SummaryMetric value={lastWorkout.eventName || lastWorkout.exerciseType} label={lastWorkout.exerciseType === "Event Run" ? "event" : "type"} />
            <SummaryMetric value={canSaveReviewWorkout ? "ready" : "resume"} label="save" />
          </View>
          <View style={styles.reviewActions}>
            <TouchableOpacity style={styles.discardButton} onPress={resetToHome}>
              <RotateCcw size={17} color="#F8FAF9" />
              <Text style={styles.discardButtonText}>Discard</Text>
            </TouchableOpacity>
            {canSaveReviewWorkout ? (
              <TouchableOpacity style={styles.saveButton} onPress={saveReviewWorkout}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.saveButton} onPress={resumeReviewWorkout}>
                <Play size={17} color="#0B0F0E" fill="#0B0F0E" />
                <Text style={styles.saveButtonText}>Resume</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : null}

      <Modal visible={isMenuOpen} transparent animationType="slide" onRequestClose={() => setIsMenuOpen(false)}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setIsMenuOpen(false)}>
          <View style={styles.menuPanel}>
            {menuSection !== "menu" ? (
              <TouchableOpacity style={styles.menuBack} onPress={() => setMenuSection("menu")}>
                <Text style={styles.menuBackText}>Back</Text>
              </TouchableOpacity>
            ) : null}
            {menuSection === "menu" ? (
              <>
                <Text style={styles.menuTitle}>RunNation</Text>
                <MenuRow icon={<Settings size={16} color="#E5FF5A" />} label="Settings" onPress={() => setMenuSection("settings")} />
                <MenuRow icon={<Activity size={16} color="#E5FF5A" />} label="Recent" onPress={() => setMenuSection("recent")} />
                <MenuRow icon={<Music size={16} color="#E5FF5A" />} label="Music Player" onPress={() => setMenuSection("music")} />
                <MenuRow icon={<HeartPulse size={16} color="#E5FF5A" />} label="Health" onPress={() => setMenuSection("health")} />
                <MenuRow icon={<UploadCloud size={16} color="#E5FF5A" />} label="Sync" onPress={() => setMenuSection("sync")} />
              </>
            ) : null}
            {menuSection === "settings" ? (
              <SettingsPanel
                username={user.username}
                keepScreenOn={keepScreenOn}
                voiceAssistantEnabled={voiceAssistantEnabled}
                showBatteryPercent={showBatteryPercent}
                autoPauseEnabled={autoPauseEnabled}
                batteryPercent={batteryPercent}
                onToggleKeepScreenOn={toggleKeepScreenOn}
                onToggleVoiceAssistant={toggleVoiceAssistant}
                onToggleAutoPause={toggleAutoPause}
                onToggleBatteryPercent={toggleBatteryPercent}
                onSignOut={() => void signOut()}
              />
            ) : null}
            {menuSection === "recent" ? <RecentPanel workouts={recentWorkouts} /> : null}
            {menuSection === "music" ? <MusicPanel isPlaying={musicPlaying} onToggle={() => setMusicPlaying((current) => !current)} /> : null}
            {menuSection === "health" ? <HealthPanel batteryPercent={batteryPercent} syncMessage={syncMessage} /> : null}
            {menuSection === "sync" ? (
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Sync to Backend</Text>
                <Text style={styles.menuValue}>{pendingCount} pending</Text>
                <Text style={styles.menuMuted}>{syncMessage}</Text>
                <TouchableOpacity style={styles.menuAction} onPress={syncWorkouts} disabled={isSyncing}>
                  <Text style={styles.menuActionText}>{isSyncing ? "Syncing" : "Sync now"}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function workoutQualifiesForSave(workout: WatchWorkout) {
  if (workout.exerciseType === "Run" || workout.exerciseType === "Event Run") {
    return workout.distanceKm >= 0.45 && workout.durationSec >= 10 * 60;
  }

  return workout.durationSec > 0;
}

function renderActivityIcon(activityType: WatchActivityType) {
  switch (activityType) {
    case "Walk":
      return <Footprints size={21} color="#0B0F0E" />;
    case "Cycle":
      return <Bike size={21} color="#0B0F0E" />;
    case "Stairs":
      return <Activity size={21} color="#0B0F0E" />;
    case "Event Run":
      return <Trophy size={21} color="#0B0F0E" />;
    case "Run":
    default:
      return <Play size={20} color="#0B0F0E" fill="#0B0F0E" />;
  }
}

function MetricPage({ pageWidth, icon, value, label }: { pageWidth: number; icon: React.ReactNode; value: string; label: string }) {
  return (
    <View style={[styles.metricPage, { width: pageWidth }]}>
      {icon}
      <Text style={styles.metricValue} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SummaryMetric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryValue} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function MenuRow({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress}>
      {icon}
      <Text style={styles.menuRowText}>{label}</Text>
      <ChevronRight size={14} color="#88918C" />
    </TouchableOpacity>
  );
}

function MusicPanel({ isPlaying, onToggle }: { isPlaying: boolean; onToggle: () => void }) {
  return (
    <View style={styles.menuContent}>
      <Text style={styles.menuTitle}>Music</Text>
      <Text style={styles.musicTrack} numberOfLines={2}>RunNation Mix</Text>
      <Text style={styles.menuMuted}>Phone audio controls</Text>
      <TouchableOpacity style={styles.menuAction} onPress={onToggle}>
        {isPlaying ? <Pause size={14} color="#0B0F0E" fill="#0B0F0E" /> : <Play size={14} color="#0B0F0E" fill="#0B0F0E" />}
        <Text style={styles.menuActionText}>{isPlaying ? "Pause" : "Play"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SettingsPanel({
  keepScreenOn,
  voiceAssistantEnabled,
  showBatteryPercent,
  autoPauseEnabled,
  batteryPercent,
  username,
  onToggleKeepScreenOn,
  onToggleVoiceAssistant,
  onToggleAutoPause,
  onToggleBatteryPercent,
  onSignOut,
}: {
  username: string;
  keepScreenOn: boolean;
  voiceAssistantEnabled: boolean;
  showBatteryPercent: boolean;
  autoPauseEnabled: boolean;
  batteryPercent: number | null;
  onToggleKeepScreenOn: () => void;
  onToggleVoiceAssistant: () => void;
  onToggleAutoPause: () => void;
  onToggleBatteryPercent: () => void;
  onSignOut: () => void;
}) {
  return (
    <View style={styles.menuContent}>
      <Text style={styles.menuTitle}>Settings</Text>
      <Text style={styles.menuMuted}>Account: {username}</Text>
      <ToggleRow icon={<Watch size={15} color="#E5FF5A" />} label="Keep screen on" value={keepScreenOn} onPress={onToggleKeepScreenOn} />
      <ToggleRow icon={<Volume2 size={15} color="#E5FF5A" />} label="Voice assistant" value={voiceAssistantEnabled} onPress={onToggleVoiceAssistant} />
      <ToggleRow icon={<Timer size={15} color="#E5FF5A" />} label="Auto pause" value={autoPauseEnabled} onPress={onToggleAutoPause} />
      <ToggleRow icon={<Battery size={15} color="#E5FF5A" />} label={batteryPercent !== null ? `Battery ${batteryPercent}%` : "Battery %"} value={showBatteryPercent} onPress={onToggleBatteryPercent} />
      <TouchableOpacity style={styles.menuAction} onPress={onSignOut}>
        <LogOut size={14} color="#0B0F0E" />
        <Text style={styles.menuActionText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

function HealthPanel({ batteryPercent, syncMessage }: { batteryPercent: number | null; syncMessage: string }) {
  return (
    <View style={styles.menuContent}>
      <Text style={styles.menuTitle}>Health</Text>
      <Text style={styles.menuValue}>Heart rate</Text>
      <Text style={styles.menuMuted}>Waiting for watch sensor</Text>
      <Text style={styles.menuValue}>Battery {batteryPercent !== null ? `${batteryPercent}%` : "unknown"}</Text>
      <Text style={styles.menuValue}>{syncMessage === "GPS off" ? "GPS off" : "GPS ready"}</Text>
      <Text style={styles.menuMuted}>Motion sensor ready</Text>
    </View>
  );
}

function ToggleRow({ icon, label, value, onPress }: { icon: React.ReactNode; label: string; value: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.toggleRow} onPress={onPress}>
      {icon}
      <Text style={styles.toggleLabel} numberOfLines={1}>{label}</Text>
      <View style={[styles.toggleTrack, value && styles.toggleTrackActive]}>
        <View style={[styles.toggleKnob, value && styles.toggleKnobActive]} />
      </View>
    </TouchableOpacity>
  );
}

function RecentPanel({ workouts }: { workouts: WatchWorkout[] }) {
  return (
    <View style={styles.menuContent}>
      <Text style={styles.menuTitle}>Workout History</Text>
      {workouts.length === 0 ? <Text style={styles.menuMuted}>No activities yet</Text> : null}
      {workouts.slice(0, 4).map((workout) => (
        <View key={workout.activityId} style={styles.recentRow}>
          <Text style={styles.recentMain}>{workout.eventName || workout.exerciseType} - {workout.distanceKm.toFixed(2)} km</Text>
          <Text style={styles.recentSub}>{formatElapsed(workout.durationSec)}</Text>
          <Text style={styles.recentSync}>{workout.synced ? "synced" : "pending"}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#050806",
  },
  brandMark: {
    minHeight: 58,
    paddingTop: 5,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  brandLine: {
    alignItems: "center",
    justifyContent: "center",
    width: "64%",
  },
  brandDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E5FF5A",
  },
  brandMarkText: {
    color: "#F8FAF9",
    fontSize: 40,
    fontWeight: "900",
    textAlign: "center",
    width: "100%",
  },
  brandDateTime: {
    color: "#97A39D",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 1,
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  centerScreen: {
    flex: 1,
    backgroundColor: "#050806",
    alignItems: "center",
    justifyContent: "center",
  },
  authScreen: {
    flex: 1,
    backgroundColor: "#050806",
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  brand: {
    color: "#F8FAF9",
    fontSize: 23,
    fontWeight: "800",
    textAlign: "center",
  },
  watchLabel: {
    color: "#E5FF5A",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 1,
  },
  authSwitch: {
    flexDirection: "row",
    backgroundColor: "#111815",
    borderRadius: 8,
    padding: 3,
    marginTop: 12,
  },
  authSwitchButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  authSwitchButtonActive: {
    backgroundColor: "#E5FF5A",
  },
  authSwitchText: {
    color: "#B8C2BD",
    fontSize: 12,
    fontWeight: "800",
  },
  authSwitchTextActive: {
    color: "#0B0F0E",
  },
  pairPanel: {
    alignItems: "center",
    marginTop: 12,
  },
  pairGrid: {
    width: 98,
    height: 98,
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#F8FAF9",
    padding: 7,
  },
  pairCell: {
    width: 12,
    height: 12,
    backgroundColor: "#F8FAF9",
  },
  pairCellFilled: {
    backgroundColor: "#0B0F0E",
  },
  pairCode: {
    color: "#F8FAF9",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 8,
  },
  authHint: {
    color: "#9AA39F",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 15,
    marginTop: 6,
  },
  loginPanel: {
    marginTop: 12,
    gap: 8,
  },
  authInput: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "#111815",
    borderWidth: 1,
    borderColor: "#24302B",
    color: "#F8FAF9",
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 12,
  },
  authError: {
    color: "#FF6B6B",
    fontSize: 11,
    textAlign: "center",
  },
  authButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: "#E5FF5A",
    alignItems: "center",
    justifyContent: "center",
  },
  authButtonText: {
    color: "#0B0F0E",
    fontSize: 16,
    fontWeight: "900",
  },
  home: {
    flex: 1,
    padding: 14,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#111815",
    alignItems: "center",
    justifyContent: "center",
  },
  statusPill: {
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: "#111815",
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  statusText: {
    color: "#D7DFDB",
    fontSize: 11,
    fontWeight: "800",
  },
  activityHeader: {
    paddingTop: 14,
    paddingBottom: 8,
    gap: 3,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  countryPill: {
    minHeight: 19,
    borderRadius: 10,
    backgroundColor: "#111815",
    paddingHorizontal: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  countryText: {
    color: "#E5FF5A",
    fontSize: 10,
    fontWeight: "900",
  },
  activityTitle: {
    color: "#F8FAF9",
    fontSize: 22,
    fontWeight: "900",
  },
  activityPicker: {
    flex: 1,
  },
  activityPickerContent: {
    gap: 9,
    paddingVertical: 8,
  },
  activityOption: {
    minHeight: 64,
    borderRadius: 10,
    backgroundColor: "#111815",
    borderWidth: 1,
    borderColor: "#24302B",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  activityOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E5FF5A",
    alignItems: "center",
    justifyContent: "center",
  },
  activityOptionCopy: {
    flex: 1,
    minWidth: 0,
  },
  activityOptionLabel: {
    color: "#F8FAF9",
    fontSize: 17,
    fontWeight: "900",
  },
  activityOptionHint: {
    color: "#9AA39F",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },

  homeCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  greeting: {
    color: "#B8C2BD",
    fontSize: 13,
    fontWeight: "800",
    maxWidth: "58%",
  },
  startButton: {
    width: 136,
    height: 136,
    borderRadius: 68,
    overflow: "hidden",
  },
  startGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  startText: {
    color: "#0B0F0E",
    fontSize: 22,
    fontWeight: "900",
  },
  homeMetric: {
    color: "#F8FAF9",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  workout: {
    flex: 1,
    paddingVertical: 12,
  },
  workoutHeader: {
    height: 32,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  workoutState: {
    color: "#E5FF5A",
    fontSize: 13,
    fontWeight: "900",
    flex: 1,
    marginRight: 8,
  },
  gpsText: {
    color: "#9AA39F",
    fontSize: 11,
    fontWeight: "800",
  },
  eventWorkoutName: {
    color: "#F8FAF9",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  metricPager: {
    flex: 1,
  },
  metricPagerContent: {
    alignItems: "center",
  },
  metricPage: {
    width: 220,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  metricValue: {
    color: "#F8FAF9",
    fontSize: 52,
    fontWeight: "900",
    marginTop: 8,
  },
  metricLabel: {
    color: "#9AA39F",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  controls: {
    height: 82,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
  },
  controlButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#E5FF5A",
    alignItems: "center",
    justifyContent: "center",
  },
  stopHint: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
    marginTop: 2,
    textTransform: "uppercase",
  },
  stopButton: {
    backgroundColor: "#E04444",
  },
  summaryScreen: {
    flex: 1,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: {
    color: "#E5FF5A",
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 12,
  },
  summaryGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryMetric: {
    width: "47%",
    minHeight: 64,
    borderRadius: 8,
    backgroundColor: "#111815",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  summaryValue: {
    color: "#F8FAF9",
    fontSize: 21,
    fontWeight: "900",
  },
  summaryLabel: {
    color: "#9AA39F",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  reviewActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  discardButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: "#1D2521",
    borderWidth: 1,
    borderColor: "#34413B",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  discardButtonText: {
    color: "#F8FAF9",
    fontSize: 14,
    fontWeight: "900",
  },
  saveButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: "#E5FF5A",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  saveButtonText: {
    color: "#0B0F0E",
    fontSize: 15,
    fontWeight: "900",
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.48)",
    alignItems: "flex-start",
  },
  menuPanel: {
    width: 178,
    height: "100%",
    backgroundColor: "#090E0C",
    borderRightWidth: 1,
    borderRightColor: "#1C2823",
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  menuTitle: {
    color: "#F8FAF9",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },
  menuRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  menuRowText: {
    color: "#D7DFDB",
    fontSize: 12,
    fontWeight: "800",
    flex: 1,
  },
  menuBack: {
    minHeight: 28,
    justifyContent: "center",
  },
  menuBackText: {
    color: "#E5FF5A",
    fontSize: 12,
    fontWeight: "900",
  },
  menuContent: {
    gap: 8,
  },
  menuValue: {
    color: "#F8FAF9",
    fontSize: 15,
    fontWeight: "900",
  },
  menuMuted: {
    color: "#9AA39F",
    fontSize: 12,
    fontWeight: "700",
  },
  menuAction: {
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: "#E5FF5A",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  menuActionText: {
    color: "#0B0F0E",
    fontSize: 13,
    fontWeight: "900",
  },
  musicTrack: {
    color: "#F8FAF9",
    fontSize: 16,
    fontWeight: "900",
  },
  toggleRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    backgroundColor: "#111815",
    paddingHorizontal: 8,
  },
  toggleLabel: {
    color: "#D7DFDB",
    fontSize: 12,
    fontWeight: "800",
    flex: 1,
  },
  toggleTrack: {
    width: 34,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#2A3430",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleTrackActive: {
    backgroundColor: "#E5FF5A",
  },
  toggleKnob: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#9AA39F",
  },
  toggleKnobActive: {
    backgroundColor: "#0B0F0E",
    alignSelf: "flex-end",
  },
  recentRow: {
    borderRadius: 8,
    backgroundColor: "#111815",
    padding: 8,
    marginBottom: 6,
  },
  recentMain: {
    color: "#F8FAF9",
    fontSize: 15,
    fontWeight: "900",
  },
  recentSub: {
    color: "#D7DFDB",
    fontSize: 12,
    fontWeight: "800",
  },
  recentSync: {
    color: "#9AA39F",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
});
