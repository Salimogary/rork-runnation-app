import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Platform, Modal, TextInput, Alert, Image, AppState, AppStateStatus, AccessibilityInfo, Share } from "react-native";
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Square, Footprints, Dumbbell, Upload, X, Timer, Gauge, Watch, Smartphone, ChevronRight, Heart, Activity, Droplets, Flame, Stethoscope } from "lucide-react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as Speech from "expo-speech";
import MapView, { Polyline } from "react-native-maps";
import { LinearGradient } from "expo-linear-gradient";
import { Stack } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
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

type RunState = "idle" | "running" | "paused" | "finished";
type ExerciseType = "Walk" | "Run" | "Treadmill" | null;

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
  eventName: string;
  startsAt: string | null;
  endsAt: string | null;
  distanceKm?: number | null;
  timeSeconds?: number | null;
}

interface RunnerProfile {
  name: string;
  town: string;
  country: string;
  countryFlag: string;
  photoUrl: string | null;
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
const MIN_DISTANCE_BETWEEN_POINTS = 0.002;
const MIN_DISTANCE_ACTIVITY = 0.1;
const MIN_DISTANCE_WALK = MIN_DISTANCE_ACTIVITY;
const MIN_DISTANCE_RUN = MIN_DISTANCE_ACTIVITY;
const MIN_ACTIVITY_DURATION_MINUTES = 3;
const MAX_DAILY_ACTIVITIES = 5;

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
  const { user, registrationId } = useAuth();
  const trpcUtils = trpc.useUtils();
  const effectiveRegistrationId = registrationId || user?.id || "";
  const { colors: themeColors } = useTheme();
  const { isSubscribed } = useSubscription();

  const [runState, setRunState] = useState<RunState>("idle");
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [pace, setPace] = useState(0);
  const [coords, setCoords] = useState<Coordinates[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [exerciseType, setExerciseType] = useState<ExerciseType>(null);
  const [countdownValue, setCountdownValue] = useState<string | null>(null);
  const [isCountdownActive, setIsCountdownActive] = useState(false);
  const [activityVoiceAssistantEnabled, setActivityVoiceAssistantEnabled] = useState(true);
  const [showRunDetailsModal, setShowRunDetailsModal] = useState(false);
  const [activitySaved, setActivitySaved] = useState(false);
  const [runnerProfile, setRunnerProfile] = useState<RunnerProfile | null>(null);
  const [runCardTheme, setRunCardTheme] = useState<"light" | "dark">("dark");
  const [runCardBackgroundImage, setRunCardBackgroundImage] = useState<string | null>(null);
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
  const [isSubmittingSmartWatch, setIsSubmittingSmartWatch] = useState(false);

  const [showOtherSportsModal, setShowOtherSportsModal] = useState(false);
  const [showEventRunModal, setShowEventRunModal] = useState(false);
  const [selectedEventRun, setSelectedEventRun] = useState<RegisteredEventRun | null>(null);
  const [otherSportsForm, setOtherSportsForm] = useState({
    sportsApp: "",
    activityDate: "",
    exerciseType: "Run" as "Run" | "Walk" | "Treadmill",
    startTime: "",
    duration: "",
    distanceKm: "",
  });
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
  const elapsedBeforePause = useRef<number>(0);
  const runningStartTimestamp = useRef<number | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastValidPoint = useRef<LocationPoint | null>(null);
  const isResuming = useRef<boolean>(false);
  const totalPauseDuration = useRef<number>(0);
  const pauseStartTimestamp = useRef<number | null>(null);
  const filteredPointCount = useRef<number>(0);
  const countdownTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const updateDuration = useCallback(() => {
    if (runningStartTimestamp.current !== null) {
      const now = Date.now();
      const currentSegment = Math.floor((now - runningStartTimestamp.current) / 1000);
      setDuration(elapsedBeforePause.current + currentSegment);
    }
  }, []);

  useEffect(() => {
    void requestLocationPermission();
    void getActivityVoiceAssistantEnabled().then(setActivityVoiceAssistantEnabled);

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[Timer] App came to foreground, recalculating duration');
        updateDuration();
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
  }, [updateDuration]);

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

  useEffect(() => {
    if (!user?.id) {
      setRunnerProfile(null);
      return;
    }

    const loadRunnerProfile = async () => {
      try {
        const [{ data: registration }, { data: photo }] = await Promise.all([
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
        ]);

        const name =
          [registration?.first_name, registration?.other_names].filter(Boolean).join(" ").trim() ||
          registration?.username ||
          user.username ||
          "RunNation Runner";
        const country = formatCountryName(registration?.country) || registration?.country || "";

        setRunnerProfile({
          name,
          town: registration?.city_town_district || "",
          country,
          countryFlag: countryFlagFromCountry(registration?.country || country),
          photoUrl: photo?.file_path || null,
        });
      } catch (error) {
        console.error("[Run Details] Failed to load runner profile:", error);
        setRunnerProfile({
          name: user.username || "RunNation Runner",
          town: "",
          country: "",
          countryFlag: "",
          photoUrl: null,
        });
      }
    };

    void loadRunnerProfile();
  }, [user?.id, user?.username]);

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
      const maxSpeed = exerciseT === "Walk" ? MAX_SPEED_KMH_WALK : MAX_SPEED_KMH_RUN;

      if (speedKmh > maxSpeed) {
        console.log('[GPS Filter] Rejected: unrealistic speed:', speedKmh.toFixed(1), 'km/h (max:', maxSpeed, ')');
        filteredPointCount.current++;
        return false;
      }
    }

    return true;
  }, []);

  const handleLocationUpdate = useCallback((location: Location.LocationObject, exerciseT: ExerciseType) => {
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

    if (isResuming.current) {
      console.log('[GPS] First point after resume — skipping distance, updating anchor');
      lastValidPoint.current = newPoint;
      isResuming.current = false;
      setCoords((prev) => [...prev, newCoord]);
      return;
    }

    if (!isValidGpsPoint(newPoint, exerciseT)) {
      return;
    }

    if (lastValidPoint.current) {
      const dist = calculateDistance(
        { latitude: lastValidPoint.current.latitude, longitude: lastValidPoint.current.longitude },
        newCoord
      );
      console.log('[GPS] Valid point, distance delta:', (dist * 1000).toFixed(1), 'm, accuracy:', newPoint.accuracy?.toFixed(1), 'm');
      setDistance((prevDist) => prevDist + dist);
    }

    lastValidPoint.current = newPoint;
    setCoords((prev) => [...prev, newCoord]);
  }, [isValidGpsPoint]);

  const startLocationWatch = useCallback(async (exerciseT: ExerciseType) => {
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
  }, [handleLocationUpdate]);

  const startTracking = useCallback(async (type: ExerciseType, eventRun: RegisteredEventRun | null = null) => {
    if (!type) return;

    if (type === "Treadmill") {
      setShowTreadmillModal(true);
      return;
    }

    if (Platform.OS === 'web') {
      return;
    }

    setExerciseType(type);
    setSelectedEventRun(eventRun);
    setRunState("running");
    setStartTime(new Date());
    setCoords([]);
    setDistance(0);
    setDuration(0);
    lastValidPoint.current = null;
    isResuming.current = false;
    totalPauseDuration.current = 0;
    pauseStartTimestamp.current = null;
    filteredPointCount.current = 0;
    elapsedBeforePause.current = 0;
    runningStartTimestamp.current = Date.now();

    console.log('[Tracking] Started', type, 'at', new Date().toISOString());

    timerInterval.current = setInterval(() => {
      if (runningStartTimestamp.current !== null) {
        const now = Date.now();
        const currentSegment = Math.floor((now - runningStartTimestamp.current) / 1000);
        setDuration(elapsedBeforePause.current + currentSegment);
      }
    }, 1000) as any;

    await startLocationWatch(type);
  }, [startLocationWatch]);

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

    setIsCountdownActive(true);
    try {
      for (const value of ["3", "2", "1", "START"]) {
        setCountdownValue(value);
        playCountdownCue(value);
        await waitForCountdownStep(value === "START" ? 500 : 900);
      }
      setCountdownValue(null);
      await startTracking(type, eventRun);
    } finally {
      setCountdownValue(null);
      setIsCountdownActive(false);
      countdownTimeouts.current = [];
    }
  }, [isCountdownActive, playCountdownCue, runState, startTracking, waitForCountdownStep]);

  const pauseTracking = () => {
    if (runningStartTimestamp.current !== null) {
      const now = Date.now();
      elapsedBeforePause.current += Math.floor((now - runningStartTimestamp.current) / 1000);
      runningStartTimestamp.current = null;
    }
    pauseStartTimestamp.current = Date.now();
    setRunState("paused");
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    if (locationSubscription.current) {
      locationSubscription.current.remove();
    }
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
    setRunState("running");
    runningStartTimestamp.current = Date.now();

    timerInterval.current = setInterval(() => {
      if (runningStartTimestamp.current !== null) {
        const now = Date.now();
        const currentSegment = Math.floor((now - runningStartTimestamp.current) / 1000);
        setDuration(elapsedBeforePause.current + currentSegment);
      }
    }, 1000) as any;

    await startLocationWatch(exerciseType);
  };

  const stopTracking = async () => {
    if (runningStartTimestamp.current !== null) {
      const now = Date.now();
      elapsedBeforePause.current += Math.floor((now - runningStartTimestamp.current) / 1000);
      runningStartTimestamp.current = null;
    }
    const finalDuration = elapsedBeforePause.current;
    setDuration(finalDuration);
    setRunState("finished");
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    if (locationSubscription.current) {
      locationSubscription.current.remove();
    }

    console.log('[Tracking] Stopped. Final distance:', distance.toFixed(3), 'km, duration:', finalDuration, 's, filtered points:', filteredPointCount.current);

    if (!user || !startTime) {
      console.log('[Tracking] No user or startTime, skipping save');
      return;
    }

    const durationMinutes = finalDuration / 60;
    if (exerciseType === "Walk" && distance < MIN_DISTANCE_WALK) {
      Alert.alert("Activity Not Saved", `A Walk must be at least ${MIN_DISTANCE_WALK} km to be saved. You covered ${distance.toFixed(2)} km.`);
      return;
    }
    if (exerciseType === "Run" && distance < MIN_DISTANCE_RUN) {
      Alert.alert("Activity Not Saved", `A Run must be at least ${MIN_DISTANCE_RUN} km to be saved. You covered ${distance.toFixed(2)} km.`);
      return;
    }
    if ((exerciseType === "Walk" || exerciseType === "Run") && durationMinutes < MIN_ACTIVITY_DURATION_MINUTES) {
      Alert.alert("Activity Not Saved", `A ${exerciseType} must be at least ${MIN_ACTIVITY_DURATION_MINUTES} minutes. Your activity was ${Math.floor(durationMinutes)} minutes.`);
      return;
    }

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
        const calculatedPace = finalDuration > 0 ? (distance / (finalDuration / 3600)) : 0;

        const actualEndTime = new Date(startTime.getTime() + (finalDuration * 1000));

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
          start_time: startTimeStr,
          end_time: endTimeStr,
          pace_km_h: parseFloat(calculatedPace.toFixed(2)),
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
          await completeEventRunMutation.mutateAsync({
            eventId: selectedEventRun.eventId,
            registrationId: effectiveRegistrationId,
            distanceKm: parseFloat(distance.toFixed(2)),
            timeSeconds: finalDuration,
          });
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
    setRunState("idle");
    setDistance(0);
    setDuration(0);
    setPace(0);
    setCoords([]);
    setStartTime(null);
    setExerciseType(null);
    setSelectedEventRun(null);
    setShowRunDetailsModal(false);
    setActivitySaved(false);
    setRunCardBackgroundImage(null);
    elapsedBeforePause.current = 0;
    runningStartTimestamp.current = null;
    lastValidPoint.current = null;
    isResuming.current = false;
    totalPauseDuration.current = 0;
    pauseStartTimestamp.current = null;
    filteredPointCount.current = 0;
    countdownTimeouts.current.forEach(clearTimeout);
    countdownTimeouts.current = [];
    setCountdownValue(null);
    setIsCountdownActive(false);
    Speech.stop();
  };

  const pickRunCardBackground = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission Required", "Permission to access your photos is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      setRunCardBackgroundImage(result.assets[0].uri);
    }
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
      `Pace: ${pace.toFixed(1)} km/h`,
      `Date: ${dateLine}`,
      `Start: ${startLine}${eventLine}`,
      "RunNation - Where runners belong",
    ].join("\n");
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
      const imageBase64 = await FileSystem.readAsStringAsync(treadmillImage, {
        encoding: "base64",
      });
      const mimeType = treadmillImage.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";

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
    const spo2 = smartWatchValues.spo2.trim() ? parseFloat(smartWatchValues.spo2) : null;

    if (heartRate === null && steps === null && spo2 === null && !smartWatchValues.blood_pressure.trim()) {
      Alert.alert("Error", "Please fill in at least one metric");
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
    if (spo2 !== null && (isNaN(spo2) || spo2 < 50 || spo2 > 100)) {
      Alert.alert("Error", "Please enter valid SpO2 (50-100%)");
      return;
    }

    setIsSubmittingSmartWatch(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      console.log("[SmartWatch] Saving data for date:", today);

      const { data: existing } = await supabase
        .from("health_goal")
        .select("health_id")
        .eq("registration_id", user.id)
        .eq("record_date", today)
        .maybeSingle();

      const insertData: Record<string, any> = {
        steps: steps || 0,
        heart_rate_bpm: heartRate,
        blood_oxygen_spo2: spo2,
      };

      if (existing) {
        const { error } = await supabase
          .from("health_goal")
          .update(insertData)
          .eq("health_id", existing.health_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("health_goal")
          .insert({
            registration_id: user.id,
            record_date: today,
            ...insertData,
          });
        if (error) throw error;
      }

      console.log("[SmartWatch] Data saved successfully");
      Alert.alert("Success", "Smart watch data saved!");
      setShowSmartWatchModal(false);
      setSmartWatchValues({
        heart_rate: "",
        steps: "",
        distance_km: "",
        spo2: "",
        calories: "",
        blood_pressure: "",
      });
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

    const durationRegex = /^\d{2}:\d{2}:\d{2}$/;
    if (!durationRegex.test(otherSportsForm.duration)) {
      Alert.alert("Error", "Duration must be in HH:MM:SS format (e.g., 00:45:30)");
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
    } else if (otherSportsForm.exerciseType === "Run") {
      if (distanceNum < MIN_DISTANCE_RUN) {
        Alert.alert("Activity Not Saved", `A Run must be at least ${MIN_DISTANCE_RUN} km to be saved.`);
        return;
      }
      if (durationMinutes < MIN_ACTIVITY_DURATION_MINUTES) {
        Alert.alert("Activity Not Saved", `A Run must be at least ${MIN_ACTIVITY_DURATION_MINUTES} minutes to be saved.`);
        return;
      }
    }

    setIsSubmittingOtherSports(true);

    try {
      await getServerClient().activities.submitExternalActivity.mutate({
        registrationId: user.id,
        activityDate: otherSportsForm.activityDate,
        exerciseType: otherSportsForm.exerciseType,
        startTime: `${otherSportsForm.startTime}:00`,
        duration: otherSportsForm.duration,
        distanceKm: distanceNum,
      });
      Alert.alert("Success", "Your activity has been submitted successfully!");

      setShowOtherSportsModal(false);
      setOtherSportsForm({
        sportsApp: "",
        activityDate: "",
        exerciseType: "Run",
        startTime: "",
        duration: "",
        distanceKm: "",
      });
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

  const getEventWindow = (startsAt?: string | null, endsAt?: string | null) => {
    const now = Date.now();
    const startMs = startsAt ? new Date(startsAt).getTime() : 0;
    const endMs = endsAt ? new Date(endsAt).getTime() : 0;
    const msToStart = startMs - now;

    return {
      isEnded: !!endMs && now > endMs,
      isSoon: !!startMs && msToStart <= 24 * 60 * 60 * 1000,
      daysTo: startMs ? Math.max(0, Math.ceil(msToStart / (24 * 60 * 60 * 1000))) : null,
    };
  };

  useEffect(() => {
    if (duration > 0 && distance > 0) {
      const calculatedPace = distance / (duration / 3600);
      setPace(calculatedPace);
    }
  }, [distance, duration]);

  if (!isSubscribed) {
    return (
      <SubscriptionGate featureName="Exercise">
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
      <Stack.Screen options={{ title: "Exercise" }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
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
            <Text style={[styles.eventRunBannerLabel, { color: themeColors.textSecondary }]}>Exercise Event</Text>
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
              <Text style={styles.statValue}>{pace.toFixed(1)}</Text>
              <Text style={styles.statUnit}>km/h</Text>
            </LinearGradient>
          </View>
        )}

        <View style={styles.controlsContainer}>
          {runState === "idle" && (
            <View style={styles.categoriesContainer}>
              <View style={styles.categorySection}>
                <View style={styles.categoryHeaderRow}>
                  <View style={[styles.categoryDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.categoryTitle, { color: themeColors.text }]}>Record Exercise</Text>
                </View>
                <Text style={[styles.categorySubtitle, { color: themeColors.textSecondary }]}>GPS-tracked outdoor activities</Text>

                <View style={styles.exerciseRow}>
                  <TouchableOpacity
                    style={styles.exerciseCard}
                    onPress={() => void startTrackingWithCountdown("Walk")}
                    disabled={isCountdownActive}
                    activeOpacity={0.7}
                    testID="exercise-walk"
                  >
                    <LinearGradient
                      colors={['#8B5CF6', '#A78BFA']}
                      style={styles.exerciseCardGradient}
                    >
                      <Footprints size={28} color={colors.white} />
                      <Text style={styles.exerciseCardTitle}>Walk</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.exerciseCard}
                    onPress={() => void startTrackingWithCountdown("Run")}
                    disabled={isCountdownActive}
                    activeOpacity={0.7}
                    testID="exercise-run"
                  >
                    <LinearGradient
                      colors={colors.gradient.orange}
                      style={styles.exerciseCardGradient}
                    >
                      <Play size={28} color={colors.white} />
                      <Text style={styles.exerciseCardTitle}>Run</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.categorySeparator} />

              <View style={styles.categorySection}>
                <View style={styles.categoryHeaderRow}>
                  <View style={[styles.categoryDot, { backgroundColor: "#2563EB" }]} />
                  <Text style={[styles.categoryTitle, { color: themeColors.text }]}>Event Run</Text>
                </View>
                <Text style={[styles.categorySubtitle, { color: themeColors.textSecondary }]}>Run an event you are already registered for</Text>

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
                      {registeredEvents.length > 0
                        ? `${registeredEvents.length} registered event${registeredEvents.length === 1 ? "" : "s"} ready`
                        : "Choose from your registered events"}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={themeColors.textLight} />
                </TouchableOpacity>
              </View>

              <View style={styles.categorySeparator} />

              <View style={styles.categorySection}>
                <View style={styles.categoryHeaderRow}>
                  <View style={[styles.categoryDot, { backgroundColor: colors.secondary }]} />
                  <Text style={[styles.categoryTitle, { color: themeColors.text }]}>Add Exercise Recordings from Other Source</Text>
                </View>
                <Text style={[styles.categorySubtitle, { color: themeColors.textSecondary }]}>Import from other sources</Text>

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
                    <Text style={[styles.addActivitySub, { color: themeColors.textSecondary }]}>Indoor training with photo proof</Text>
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
                    <Text style={[styles.addActivitySub, { color: themeColors.textSecondary }]}>Import health metrics from your watch</Text>
                  </View>
                  <ChevronRight size={18} color={themeColors.textLight} />
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
                    <Text style={[styles.addActivitySub, { color: themeColors.textSecondary }]}>Import from running & fitness apps</Text>
                  </View>
                  <ChevronRight size={18} color={themeColors.textLight} />
                </TouchableOpacity>
              </View>
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
                <Text style={styles.finishedTitle}>{selectedEventRun ? "Exercise Event Complete!" : `${exerciseType} Complete!`}</Text>
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
                    <Text style={styles.summaryValue}>{pace.toFixed(1)} km/h</Text>
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
              <View style={[
                styles.shareCard,
                runCardTheme === "dark" ? styles.shareCardDark : styles.shareCardLight,
              ]}>
                {runCardBackgroundImage ? (
                  <Image source={{ uri: runCardBackgroundImage }} style={styles.shareCardBackground} resizeMode="cover" />
                ) : null}
                <View style={[
                  styles.shareCardTint,
                  runCardTheme === "dark" ? styles.shareCardTintDark : styles.shareCardTintLight,
                ]} />

                <View style={styles.shareBrandRow}>
                  <Text style={styles.shareBrand}>RunNation</Text>
                  <Text style={styles.shareTagline}>Where runners belong</Text>
                </View>

                <View style={styles.shareRunnerRow}>
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
                      {[runnerProfile?.town, runnerProfile?.countryFlag, runnerProfile?.country].filter(Boolean).join("  ")}
                    </Text>
                  </View>
                </View>

                <View style={styles.shareTitleRow}>
                  <Text style={[styles.shareActivityType, runCardTheme === "dark" ? styles.shareTextLight : styles.shareTextDark]}>
                    {exerciseType || "Run"}
                  </Text>
                  <Text style={styles.shareMedalBadge}>{selectedEventRun ? "Medal eligible" : "No medal"}</Text>
                </View>

                {selectedEventRun ? (
                  <Text style={[styles.shareEventName, runCardTheme === "dark" ? styles.shareTextMutedDark : styles.shareTextMutedLight]} numberOfLines={2}>
                    {selectedEventRun.eventName}
                  </Text>
                ) : null}

                <View style={styles.shareMetricsGrid}>
                  <View style={styles.shareMetric}>
                    <Text style={styles.shareMetricLabel}>Distance</Text>
                    <Text style={styles.shareMetricValue}>{distance.toFixed(2)} km</Text>
                  </View>
                  <View style={styles.shareMetric}>
                    <Text style={styles.shareMetricLabel}>Time</Text>
                    <Text style={styles.shareMetricValue}>{formatTime(duration)}</Text>
                  </View>
                  <View style={styles.shareMetric}>
                    <Text style={styles.shareMetricLabel}>Pace</Text>
                    <Text style={styles.shareMetricValue}>{pace.toFixed(1)} km/h</Text>
                  </View>
                </View>

                <View style={styles.shareDateRow}>
                  <Text style={styles.shareDateText}>{startTime ? startTime.toLocaleDateString() : "-"}</Text>
                  <Text style={styles.shareDateText}>
                    {startTime ? startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}
                  </Text>
                </View>

                <View style={styles.shareMapBox}>
                  {Platform.OS !== "web" && coords.length > 0 ? (
                    <MapView
                      style={styles.shareMap}
                      pointerEvents="none"
                      initialRegion={{
                        latitude: coords[0].latitude,
                        longitude: coords[0].longitude,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                      }}
                    >
                      <Polyline coordinates={coords} strokeColor="#F97316" strokeWidth={5} />
                    </MapView>
                  ) : (
                    <View style={styles.shareMapPlaceholder}>
                      <Text style={styles.shareMapPlaceholderText}>Route map</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.runDetailsOptions}>
                <Text style={[styles.runDetailsOptionTitle, { color: themeColors.text }]}>Card options</Text>
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
                  <TouchableOpacity style={styles.runDetailsChip} onPress={pickRunCardBackground}>
                    <Text style={styles.runDetailsChipText}>Background image</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            <View style={[styles.runDetailsActions, { borderTopColor: themeColors.border }]}>
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

              {registeredEvents.length === 0 ? (
                <View style={styles.eventRunEmptyState}>
                  <Text style={[styles.eventRunEmptyTitle, { color: themeColors.text }]}>No registered events yet</Text>
                  <Text style={[styles.eventRunEmptyText, { color: themeColors.textSecondary }]}>
                    Join an event first, then come back here to record your official event run.
                  </Text>
                </View>
              ) : (
                registeredEvents.map((eventItem) => {
                  if (!eventItem) {
                    return null;
                  }

                  const eventWindow = getEventWindow(eventItem.startsAt, eventItem.endsAt);
                  return (
                    <View key={eventItem.eventId} style={[styles.eventRunCard, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.border }]}>
                      <View style={styles.eventRunCardHeader}>
                        <Text style={[styles.eventRunCardTitle, { color: themeColors.text }]}>{eventItem.eventName}</Text>
                        {eventWindow.isSoon && !eventWindow.isEnded ? (
                          <View style={styles.eventRunReadyBadge}>
                            <Footprints size={14} color={colors.white} />
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.eventRunMeta, { color: themeColors.textSecondary }]}>
                        {eventItem.startsAt ? `Starts ${eventItem.startsAt}` : "Start date pending"}
                      </Text>
                      <Text style={[styles.eventRunCountdown, { color: themeColors.text }]}>
                        {eventWindow.isEnded
                          ? "Event closed"
                          : eventWindow.isSoon
                          ? "Run symbol active"
                          : `${eventWindow.daysTo ?? 0} day${eventWindow.daysTo === 1 ? "" : "s"} to go`}
                      </Text>
                      {eventWindow.isSoon && !eventWindow.isEnded ? (
                        <Text style={styles.eventRunCaution}>
                          Only start your event when the official event has been flagged off.
                        </Text>
                      ) : null}
                      <TouchableOpacity
                        style={[styles.eventRunStartButton, eventWindow.isEnded && styles.eventRunStartButtonDisabled]}
                        onPress={() => {
                          setShowEventRunModal(false);
                          void startTrackingWithCountdown("Run", eventItem);
                        }}
                        disabled={eventWindow.isEnded || isCountdownActive}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={eventWindow.isEnded ? ["#9CA3AF", "#9CA3AF"] : colors.gradient.orange}
                          style={styles.eventRunStartGradient}
                        >
                          <Play size={18} color={colors.white} />
                          <Text style={styles.eventRunStartText}>{eventWindow.isEnded ? "Ended" : "Start"}</Text>
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
                ⌚ Enter your smart watch readings
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
                📱 Import from other running apps
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
                  {(["Run", "Walk"] as const).map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeChip,
                        otherSportsForm.exerciseType === type && styles.typeChipActive,
                      ]}
                      onPress={() => setOtherSportsForm((prev) => ({ ...prev, exerciseType: type }))}
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
                  ))}
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
    paddingTop: 4,
    flex: 1,
    justifyContent: "center" as const,
  },
  categoriesContainer: {
    gap: 6,
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
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: -6,
    marginLeft: 16,
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
  exerciseCardGradient: {
    padding: 18,
    alignItems: "center" as const,
    gap: 8,
    minHeight: 110,
    justifyContent: "center" as const,
  },
  exerciseCardTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: colors.white,
  },
  exerciseCardSub: {
    fontSize: 12,
    color: colors.white,
    opacity: 0.85,
    fontWeight: "500" as const,
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
    padding: 16,
    gap: 14,
  },
  shareCard: {
    borderRadius: 18,
    overflow: "hidden" as const,
    padding: 18,
    gap: 14,
    minHeight: 620,
  },
  shareCardDark: {
    backgroundColor: "#111827",
  },
  shareCardLight: {
    backgroundColor: "#F8FAFC",
  },
  shareCardBackground: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  shareCardTint: {
    ...StyleSheet.absoluteFillObject,
  },
  shareCardTintDark: {
    backgroundColor: "rgba(17,24,39,0.72)",
  },
  shareCardTintLight: {
    backgroundColor: "rgba(248,250,252,0.82)",
  },
  shareBrandRow: {
    alignItems: "center" as const,
    gap: 2,
  },
  shareBrand: {
    color: "#F97316",
    fontSize: 24,
    fontWeight: "900" as const,
  },
  shareTagline: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "700" as const,
  },
  shareRunnerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    zIndex: 1,
  },
  shareAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: "#F97316",
  },
  shareAvatarFallback: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "#F97316",
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
    fontSize: 22,
    fontWeight: "900" as const,
  },
  shareRunnerMeta: {
    fontSize: 13,
    fontWeight: "600" as const,
    marginTop: 2,
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
  shareTitleRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    gap: 10,
    zIndex: 1,
  },
  shareActivityType: {
    fontSize: 30,
    fontWeight: "900" as const,
  },
  shareMedalBadge: {
    color: colors.white,
    backgroundColor: "#10B981",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "800" as const,
    overflow: "hidden" as const,
  },
  shareEventName: {
    fontSize: 15,
    fontWeight: "700" as const,
    zIndex: 1,
  },
  shareMetricsGrid: {
    flexDirection: "row" as const,
    gap: 8,
    zIndex: 1,
  },
  shareMetric: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "rgba(249,115,22,0.92)",
  },
  shareMetricLabel: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontWeight: "700" as const,
  },
  shareMetricValue: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "900" as const,
    marginTop: 4,
  },
  shareDateRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    zIndex: 1,
  },
  shareDateText: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "800" as const,
  },
  shareMapBox: {
    height: 230,
    borderRadius: 16,
    overflow: "hidden" as const,
    backgroundColor: "#E5E7EB",
    zIndex: 1,
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
