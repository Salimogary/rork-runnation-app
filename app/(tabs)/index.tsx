import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Platform, Modal, TextInput, Alert, Image, AppState, AppStateStatus } from "react-native";
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Square, Footprints, Dumbbell, Upload, X, Timer, Gauge, Watch, Smartphone, ChevronRight, Heart, Activity, Droplets, Flame, Stethoscope } from "lucide-react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import MapView, { Polyline } from "react-native-maps";
import { LinearGradient } from "expo-linear-gradient";
import { Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import colors from "@/constants/colors";
import { useSubscription } from "@/contexts/SubscriptionContext";
import SubscriptionGate from "@/components/SubscriptionGate";

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

type ImportanceLevel = "VERY HIGH" | "HIGH" | "MEDIUM" | "LOW";

interface SmartWatchField {
  key: string;
  label: string;
  placeholder: string;
  importance: ImportanceLevel;
  keyboardType: "numeric" | "default";
  icon: React.ReactNode;
}

const GPS_ACCURACY_THRESHOLD = 25;
const MAX_SPEED_KMH_RUN = 45;
const MAX_SPEED_KMH_WALK = 15;
const MIN_DISTANCE_BETWEEN_POINTS = 0.002;
const MIN_DISTANCE_WALK = 0.25;
const MIN_DISTANCE_RUN = 0.45;
const MAX_DAILY_ACTIVITIES = 5;

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
  const { user } = useAuth();
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
  const [otherSportsForm, setOtherSportsForm] = useState({
    activityDate: "",
    exerciseType: "Run" as "Run" | "Walk" | "Treadmill",
    startTime: "",
    duration: "",
    distanceKm: "",
  });
  const [isSubmittingOtherSports, setIsSubmittingOtherSports] = useState(false);

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

  const updateDuration = useCallback(() => {
    if (runningStartTimestamp.current !== null) {
      const now = Date.now();
      const currentSegment = Math.floor((now - runningStartTimestamp.current) / 1000);
      setDuration(elapsedBeforePause.current + currentSegment);
    }
  }, []);

  useEffect(() => {
    void requestLocationPermission();

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
    };
  }, [updateDuration]);

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

  const startTracking = async (type: ExerciseType) => {
    if (!type) return;

    if (type === "Treadmill") {
      setShowTreadmillModal(true);
      return;
    }

    if (Platform.OS === 'web') {
      return;
    }

    setExerciseType(type);
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
  };

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
    if ((exerciseType === "Walk" || exerciseType === "Run") && durationMinutes < 10) {
      Alert.alert("Activity Not Saved", `A ${exerciseType} must be at least 10 minutes. Your activity was ${Math.floor(durationMinutes)} minutes.`);
      return;
    }

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

      if ((count || 0) >= MAX_DAILY_ACTIVITIES) {
        Alert.alert(
          "Daily Limit Reached",
          `You can only save a maximum of ${MAX_DAILY_ACTIVITIES} activities per day. This activity was not saved.`
        );
        setIsSaving(false);
        return;
      }

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

      const { error } = await supabase.from("activities").insert({
        activity_id: nextActivityId,
        registration_id: user.id,
        activity_date: today,
        exercise_type: exerciseType || "Run",
        distance_km: parseFloat(distance.toFixed(2)),
        start_time: startTimeStr,
        end_time: endTimeStr,
        pace_km_h: parseFloat(calculatedPace.toFixed(2)),
      });

      if (error) {
        console.error("[Tracking] Error saving activity:", error);
        Alert.alert("Error", "Failed to save activity");
      } else {
        console.log("[Tracking] Activity saved successfully with ID:", nextActivityId);
        Alert.alert("Success", "Activity saved successfully!");
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
    elapsedBeforePause.current = 0;
    runningStartTimestamp.current = null;
    lastValidPoint.current = null;
    isResuming.current = false;
    totalPauseDuration.current = 0;
    pauseStartTimestamp.current = null;
    filteredPointCount.current = 0;
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

    const timeInterval = `${Math.floor(timeMinutes / 60)}:${Math.floor(timeMinutes % 60)}:00`;

    if (!user) {
      Alert.alert("Error", "You must be logged in to submit activities");
      return;
    }

    const { error } = await supabase.from("pending_activities").insert({
      registration_id: user.id,
      exercise_type: "Treadmill",
      distance_entered: distanceKm,
      distance_unit: "km",
      time_entered: timeInterval,
      photo_path: treadmillImage,
      status: "pending",
    });

    if (error) {
      console.error("Error submitting treadmill activity:", error);
      Alert.alert("Error", "Failed to submit activity");
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
      if (distanceNum < 0.25) {
        Alert.alert("Activity Not Saved", "A Walk must be at least 0.25 km to be saved.");
        return;
      }
      if (durationMinutes < 10) {
        Alert.alert("Activity Not Saved", "A Walk must be at least 10 minutes to be saved.");
        return;
      }
    } else if (otherSportsForm.exerciseType === "Run") {
      if (distanceNum < 0.45) {
        Alert.alert("Activity Not Saved", "A Run must be at least 0.45 km to be saved.");
        return;
      }
      if (durationMinutes < 10) {
        Alert.alert("Activity Not Saved", "A Run must be at least 10 minutes to be saved.");
        return;
      }
    }

    setIsSubmittingOtherSports(true);

    try {
      const { count, error: countError } = await supabase
        .from("External Activity Submissions")
        .select("*", { count: "exact", head: true })
        .eq("registration_id", user.id)
        .eq("activity_date", otherSportsForm.activityDate);

      const { count: existingCount, error: existingError } = await supabase
        .from("activities")
        .select("*", { count: "exact", head: true })
        .eq("registration_id", user.id)
        .eq("activity_date", otherSportsForm.activityDate);

      if (countError) console.error("[ActivityLimit] Submissions count error:", countError);
      if (existingError) console.error("[ActivityLimit] Activities count error:", existingError);

      const totalToday = (count || 0) + (existingCount || 0);
      console.log("[ActivityLimit] Total activities for", otherSportsForm.activityDate, ":", totalToday);

      if (totalToday >= 5) {
        Alert.alert(
          "Daily Limit Reached",
          "You can only save a maximum of 5 activities per day. This activity was not saved."
        );
        setIsSubmittingOtherSports(false);
        return;
      }
    } catch (err: any) {
      console.error("[ActivityLimit] Error checking daily limit:", err);
    }

    try {
      console.log("[Submit Other Sports] Submitting data:", {
        registration_id: user.id,
        activity_date: otherSportsForm.activityDate,
        exercise_type: otherSportsForm.exerciseType,
        start_time: otherSportsForm.startTime + ":00",
        Duration: otherSportsForm.duration,
        distance_km: distanceNum,
      });

      const { data, error } = await supabase
        .from("External Activity Submissions")
        .insert({
          RegistrationID: user.id,
          Activity_Date: otherSportsForm.activityDate,
          Exercise_Type: otherSportsForm.exerciseType,
          Start_Time: otherSportsForm.startTime + ":00",
          Duration: otherSportsForm.duration,
          distance_km: distanceNum,
        })
        .select()
        .single();

      if (error) {
        console.error("[Submit Other Sports] Error:", error);
        Alert.alert("Error", error.message || "Failed to submit activity");
        return;
      }

      console.log("[Submit Other Sports] Success:", data);
      Alert.alert("Success", "Your activity has been submitted successfully!");

      setShowOtherSportsModal(false);
      setOtherSportsForm({
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

  const toRad = (value: number): number => {
    return (value * Math.PI) / 180;
  };

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
                  <Text style={[styles.categoryTitle, { color: themeColors.text }]}>Exercise</Text>
                </View>
                <Text style={[styles.categorySubtitle, { color: themeColors.textSecondary }]}>GPS-tracked outdoor activities</Text>

                <View style={styles.exerciseRow}>
                  <TouchableOpacity
                    style={styles.exerciseCard}
                    onPress={() => startTracking("Walk")}
                    activeOpacity={0.7}
                    testID="exercise-walk"
                  >
                    <LinearGradient
                      colors={['#8B5CF6', '#A78BFA']}
                      style={styles.exerciseCardGradient}
                    >
                      <Footprints size={28} color={colors.white} />
                      <Text style={styles.exerciseCardTitle}>Walk</Text>
                      <Text style={styles.exerciseCardSub}>Outdoor</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.exerciseCard}
                    onPress={() => startTracking("Run")}
                    activeOpacity={0.7}
                    testID="exercise-run"
                  >
                    <LinearGradient
                      colors={colors.gradient.orange}
                      style={styles.exerciseCardGradient}
                    >
                      <Play size={28} color={colors.white} />
                      <Text style={styles.exerciseCardTitle}>Run</Text>
                      <Text style={styles.exerciseCardSub}>Outdoor</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.categorySeparator} />

              <View style={styles.categorySection}>
                <View style={styles.categoryHeaderRow}>
                  <View style={[styles.categoryDot, { backgroundColor: colors.secondary }]} />
                  <Text style={[styles.categoryTitle, { color: themeColors.text }]}>Add Activity</Text>
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
                <Text style={styles.finishedTitle}>{exerciseType} Complete!</Text>
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
