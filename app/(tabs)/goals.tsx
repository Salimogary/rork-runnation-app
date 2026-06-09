import { StyleSheet, View, Text, ScrollView, RefreshControl, Animated, TouchableOpacity, TextInput, Alert, Modal } from "react-native";
import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Target, TrendingDown, TrendingUp, Award, Calendar, Scale, Zap, X, Clock, ChevronRight, Plus, Heart, Moon, Droplets, Footprints, Users, ArrowUp, ArrowDown, Minus, Trophy, Flame } from "lucide-react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import SubscriptionGate from "@/components/SubscriptionGate";

interface UserGoal {
  user_goals_id: number;
  registration_id: string;
  goal: string;
}

interface WeightTargetGoal {
  id: number;
  registration_id: string;
  target_weight: number;
  target_date: string;
  created_at: string;
  updated_at: string;
}

interface WeightGoalEntry {
  id: number;
  registration_id: string;
  weight: number;
  date: string;
  created_at: string;
}

interface FitnessGoal {
  fitness_goal_id: number;
  registration_id: string;
  target_pace_min_per_km: number;
  target_date: string;
  created_at: string;
}

interface DailyRunGoal {
  daily_run_goal_id: number;
  registration_id: string;
  start_date: string;
  end_date: string;
  target_percent: number;
  created_at: string;
  updated_at: string;
}

interface HealthGoalEntry {
  health_id: number;
  registration_id: string;
  record_date: string;
  steps: number;
  heart_rate_bpm: number | null;
  sleep_hours: number | null;
  blood_oxygen_spo2: number | null;
  overall_health_score: number | null;
}

interface HealthProfile {
  dob: string | null;
}

interface HabitDeclaration {
  declaration_id: number;
  registration_id: string;
  activity_type: string;
  target_amount: number;
  unit: string;
  frequency: string;
  start_date: string;
  created_at: string;
  is_active: boolean;
}

interface GoalItem {
  goal_id: number;
  goal: string;
}

interface RecentActivity {
  pace_min_per_km: number;
  activity_date: string;
  start_time?: string | null;
  end_time?: string | null;
  pause_duration_seconds?: number | null;
}

interface DurationActivity {
  registration_id?: string;
  activity_date: string;
  start_time: string | null;
  end_time: string | null;
  pause_duration_seconds: number | null;
}

interface SmartFitGoalRank {
  rank: number;
  totalParticipants: number;
  ageGroup: string;
  healthScore: number;
  clubName: string;
}

interface CommunityRankData {
  registrationId: string;
  Name: string;
  AvgDistance: number;
  ActiveDays: number;
  AveragePace: number;
}

interface RankSummary {
  label: string;
  currentRank: number;
  totalParticipants: number;
  metricLabel: string;
  metricValue: string;
}

interface FamilyRankRow {
  registrationId: string;
  distance: number;
  activeDays: number;
  averagePace: number;
}

interface MedalRankRow {
  registrationId: string;
  totalMedals: number;
  points: number;
}

interface StoredRankSnapshot {
  rank: number;
  totalParticipants: number;
  timestamp: string;
}

interface MedalGoalData {
  totalEvents: number;
  enrolledEvents: number;
  medalsEarned: number;
  enrollmentRatio: number;
  medalRatio: number;
  events: {
    eventName: string;
    isEnrolled: boolean;
    isOnMedalList: boolean;
  }[];
}

interface ActivitySummary {
  totalDistance: number;
  totalTime: number;
  activeDays: number;
  avgDistance: number;
  avgPace: number;
  streakDays: number;
}

interface RegisteredEvent {
  eventId: string;
  eventName: string;
  startsAt: string;
  endsAt: string;
  isOnMedalList: boolean;
  status: "ongoing" | "upcoming" | "completed";
  medal_min_daily_distance: number | null;
  medal_min_cumulative_distance: number | null;
  currentDistance: number;
}

type GoalsSubPage = "overview" | "set" | "scorecard";
type MedalBand = "Ultra" | "50k" | "42K" | "25K" | "21K" | "10k" | "5k" | "3k";

const MEDAL_BANDS: { key: MedalBand; minKm: number; points: number }[] = [
  { key: "Ultra", minKm: 50.01, points: 8 },
  { key: "50k", minKm: 50, points: 7 },
  { key: "42K", minKm: 42, points: 6 },
  { key: "25K", minKm: 25, points: 5 },
  { key: "21K", minKm: 21, points: 4 },
  { key: "10k", minKm: 10, points: 3 },
  { key: "5k", minKm: 5, points: 2 },
  { key: "3k", minKm: 3, points: 1 },
];

const normalizePaceMinPerKm = (paceMinPerKm: number): number => {
  if (paceMinPerKm <= 0) return 0;
  return paceMinPerKm;
};

const formatPaceMinPerKm = (paceMinPerKm: number): string => {
  if (paceMinPerKm <= 0) return "--:--";
  const minutes = Math.floor(paceMinPerKm);
  const seconds = Math.round((paceMinPerKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const normalizePaceInputMinPerKm = (minPerKm: number): number => {
  if (minPerKm <= 0) return 0;
  return minPerKm;
};

const getAgeFromDob = (dob?: string | null): number | null => {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
};

const isJuniorAge = (dob?: string | null): boolean => {
  const age = getAgeFromDob(dob);
  return age !== null && age <= 15;
};

const usesParaEquipment = (registration: any): boolean =>
  registration?.has_disability === true && registration?.para_uses_equipment === true;

const getDateOnly = (value?: string | null): string => String(value || "").slice(0, 10);

const addDaysIso = (value: string, days: number): string => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const minIsoDate = (a: string, b: string): string => (a <= b ? a : b);

const getMedalBand = (distanceKm: number): (typeof MEDAL_BANDS)[number] | null =>
  MEDAL_BANDS.find((band) => distanceKm >= band.minKm) || null;

const getMedalBandForCompletedDistance = (
  completedDistanceKm: number,
  configuredDistances?: unknown
): (typeof MEDAL_BANDS)[number] | null => {
  const completedDistance = Number(completedDistanceKm) || 0;
  const distances = Array.isArray(configuredDistances)
    ? configuredDistances
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((a, b) => b - a)
    : [];
  const matchedDistance = distances.find((distance) => completedDistance + 0.01 >= distance);
  return getMedalBand(matchedDistance || completedDistance);
};

const getHealthRecommendations = (age: number | null) => {
  const stepTarget = age !== null && age >= 60 ? 2000 : 3000;
  const sleep = age !== null && age < 13
    ? "9-12h"
    : age !== null && age < 18
      ? "8-10h"
      : age !== null && age >= 65
        ? "7-8h"
        : "7-9h";
  const heartRate = age !== null && age < 12 ? "70-120 bpm" : "60-100 bpm";
  return {
    steps: `${stepTarget.toLocaleString()}+/day`,
    stepTarget,
    duration: "30+ min/day",
    heartRate,
    sleep,
    spo2: "95-100%",
  };
};

const getMinutesFromTime = (value?: string | null): number | null => {
  if (!value) return null;
  const [hours, minutes, seconds] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes + (Number.isFinite(seconds) ? seconds / 60 : 0);
};

const getActivityDurationMinutes = (activity: DurationActivity): number | null => {
  const startMinutes = getMinutesFromTime(activity.start_time);
  const endMinutes = getMinutesFromTime(activity.end_time);
  if (startMinutes === null || endMinutes === null) return null;
  let duration = endMinutes - startMinutes;
  if (duration < 0) duration += 24 * 60;
  duration -= Math.floor((activity.pause_duration_seconds || 0) / 60);
  return duration > 0 ? duration : null;
};

const formatDurationMinutes = (minutes: number): string => `${Math.round(minutes)} min`;

const SMARTFIT_SPECIAL_CLUB_CODE = "smartfit_club";

const normalizeSex = (value?: string | null): string => {
  const lower = String(value || "").trim().toLowerCase();
  if (lower.startsWith("m")) return "Male";
  if (lower.startsWith("f")) return "Female";
  return value ? String(value).trim() : "-";
};

const getSmartFitAgeGroup = (age: number | null): string => {
  if (age === null || age <= 19) return "19-";
  if (age <= 39) return "20-39";
  if (age <= 59) return "40-59";
  if (age <= 79) return "60-79";
  return "80+";
};

const getSmartFitStepTarget = (ageGroup: string, sex: string): number => {
  const isFemale = sex.toLowerCase().startsWith("f");
  if (ageGroup === "19-") return 12000;
  if (ageGroup === "20-39") return isFemale ? 9000 : 10000;
  if (ageGroup === "40-59") return isFemale ? 8000 : 8500;
  if (ageGroup === "60-79") return isFemale ? 6500 : 7000;
  return isFemale ? 4500 : 5000;
};

const getSmartFitSleepTarget = (ageGroup: string): { min: number; max: number } => {
  if (ageGroup === "19-") return { min: 8, max: 10 };
  if (ageGroup === "60-79" || ageGroup === "80+") return { min: 7, max: 8 };
  return { min: 7, max: 9 };
};

const scoreSmartFitHealth = (input: {
  avgSteps: number;
  avgHeartRate: number | null;
  avgSleep: number | null;
  avgSpo2: number | null;
  ageGroup: string;
  sex: string;
}): number => {
  const stepsScore = Math.min(100, (input.avgSteps / getSmartFitStepTarget(input.ageGroup, input.sex)) * 100);
  let heartRateScore = 60;
  if (input.avgHeartRate !== null) {
    const ideal = input.ageGroup === "60-79" || input.ageGroup === "80+" ? 72 : input.sex === "Female" ? 74 : 70;
    heartRateScore = Math.max(0, 100 - Math.abs(input.avgHeartRate - ideal) * 3);
  }
  let sleepScore = 60;
  if (input.avgSleep !== null) {
    const sleepTarget = getSmartFitSleepTarget(input.ageGroup);
    if (input.avgSleep >= sleepTarget.min && input.avgSleep <= sleepTarget.max) {
      sleepScore = 100;
    } else {
      const nearest = input.avgSleep < sleepTarget.min ? sleepTarget.min : sleepTarget.max;
      sleepScore = Math.max(0, 100 - Math.abs(input.avgSleep - nearest) * 18);
    }
  }
  let spo2Score = 70;
  if (input.avgSpo2 !== null) {
    spo2Score = input.avgSpo2 >= 95 ? 100 : input.avgSpo2 >= 90 ? 70 + (input.avgSpo2 - 90) * 6 : Math.max(0, input.avgSpo2 - 45);
  }
  return Math.round((stepsScore * 0.4) + (heartRateScore * 0.25) + (sleepScore * 0.25) + (spo2Score * 0.1));
};

export default function GoalsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors: themeColors } = useTheme();
  const { isSubscribed } = useSubscription();
  const queryClient = useQueryClient();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [targetPaceMin, setTargetPaceMin] = useState("");
  const [targetPaceSec, setTargetPaceSec] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [showDailyRunGoalForm, setShowDailyRunGoalForm] = useState(false);
  const [dailyRunStartDateInput, setDailyRunStartDateInput] = useState("");
  const [dailyRunEndDateInput, setDailyRunEndDateInput] = useState("");
  const [dailyRunTargetInput, setDailyRunTargetInput] = useState("");
  const [showWeightTargetForm, setShowWeightTargetForm] = useState(false);
  const [showWeightLogForm, setShowWeightLogForm] = useState(false);
  const [weightTargetInput, setWeightTargetInput] = useState("");
  const [weightTargetDateInput, setWeightTargetDateInput] = useState("");
  const [weightLogInput, setWeightLogInput] = useState("");
  const [showHealthForm, setShowHealthForm] = useState(false);
  const [healthStepsInput, setHealthStepsInput] = useState("");
  const [healthHeartRateInput, setHealthHeartRateInput] = useState("");
  const [healthSleepInput, setHealthSleepInput] = useState("");
  const [healthSpo2Input, setHealthSpo2Input] = useState("");
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [habitActivityType, setHabitActivityType] = useState<string>("Walk");
  const [habitAmount, setHabitAmount] = useState<string>("");
  const [habitUnit, setHabitUnit] = useState<string>("kilometers");
  const [habitFrequency, setHabitFrequency] = useState<string>("daily");
  const [habitStartDate, setHabitStartDate] = useState<string>("");
  const [previousRank, setPreviousRank] = useState<StoredRankSnapshot | null>(null);
  const [activeGoalsPage, setActiveGoalsPage] = useState<GoalsSubPage>("overview");

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const { data: goalOrder = [] } = useQuery<GoalItem[]>({
    queryKey: ["goalOrder"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("goals")
          .select("goal_id, goal")
          .order("goal_id", { ascending: true });
        if (error) {
          console.log("[Goals] Goal order table not available, using defaults:", JSON.stringify(error));
          return [];
        }
        console.log("[Goals] Goal order:", data);
        return (data as GoalItem[]) || [];
      } catch {
        console.log("[Goals] Goal order fetch failed, using defaults");
        return [];
      }
    },
    staleTime: 60000,
    retry: false,
  });

  const goalNameToKey = useCallback((goalName: string): string | null => {
    const name = goalName.toLowerCase().trim();
    if (name.includes("just want to run") || name.includes("daily run") || name.includes("keep active")) return "dailyRun";
    if (name.includes("fitness") || name.includes("pace")) return "fitness";
    if (name.includes("weight")) return "weight";
    if (name.includes("health")) return "health";
    if (
      name.includes("habit") ||
      name.includes("discipline") ||
      name.includes("training plan") ||
      name.includes("planned runs")
    ) return "dailyRun";
    if (name.includes("medal")) return "medals";
    if (name.includes("community") || name.includes("compete")) return "community";
    if (name.includes("event")) return "events";
    return null;
  }, []);

  const orderedGoalKeys = useMemo(() => {
    const keys: string[] = [];
    for (const g of goalOrder) {
      const key = g.goal_id === 7 ? "dailyRun" : goalNameToKey(g.goal);
      if (key && !keys.includes(key)) {
        keys.push(key);
      }
    }
    const allKeys = ["fitness", "dailyRun", "weight", "health", "medals", "community", "events"];
    for (const k of allKeys) {
      if (!keys.includes(k)) {
        keys.push(k);
      }
    }
    return keys;
  }, [goalOrder, goalNameToKey]);

  const { data: fitnessGoal, isLoading: fitnessGoalLoading, refetch: refetchFitnessGoal } = useQuery<FitnessGoal | null>({
    queryKey: ["fitnessGoal", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("fitness_goal")
        .select("*")
        .eq("registration_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[Goals] Error fetching fitness goal:", error);
        return null;
      }
      console.log("[Goals] Fitness goal:", data);
      return data as FitnessGoal | null;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const { data: dailyRunGoal, isLoading: dailyRunGoalLoading, refetch: refetchDailyRunGoal } = useQuery<DailyRunGoal | null>({
    queryKey: ["dailyRunGoal", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("daily_run_goal")
        .select("*")
        .eq("registration_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[Goals] Error fetching daily run goal:", error);
        return null;
      }
      return data as DailyRunGoal | null;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const { data: dailyRunActivities = [], refetch: refetchDailyRunActivities } = useQuery<{ activity_date: string }[]>({
    queryKey: ["dailyRunActivities", user?.id, dailyRunGoal?.start_date, dailyRunGoal?.end_date],
    queryFn: async () => {
      if (!user?.id || !dailyRunGoal) return [];
      const { data, error } = await supabase
        .from("activities")
        .select("activity_date")
        .eq("registration_id", user.id)
        .eq("exercise_type", "Run")
        .gte("activity_date", dailyRunGoal.start_date)
        .lte("activity_date", dailyRunGoal.end_date);
      if (error) {
        console.error("[Goals] Error fetching daily run activities:", error);
        return [];
      }
      return (data || []) as { activity_date: string }[];
    },
    enabled: !!user?.id && !!dailyRunGoal,
    staleTime: 30000,
  });

  const saveDailyRunGoalMutation = useMutation({
    mutationFn: async ({ startDate, endDate, targetPercent }: { startDate: string; endDate: string; targetPercent: number }) => {
      if (!user?.id) throw new Error("Not logged in");
      const payload = {
        registration_id: user.id,
        start_date: startDate,
        end_date: endDate,
        target_percent: targetPercent,
        updated_at: new Date().toISOString(),
      };

      if (dailyRunGoal) {
        const { data, error } = await supabase
          .from("daily_run_goal")
          .update(payload)
          .eq("daily_run_goal_id", dailyRunGoal.daily_run_goal_id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase
        .from("daily_run_goal")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dailyRunGoal", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["dailyRunActivities", user?.id] });
      setShowDailyRunGoalForm(false);
      setDailyRunStartDateInput("");
      setDailyRunEndDateInput("");
      setDailyRunTargetInput("");
      Alert.alert("Success", "Daily running goal saved!");
    },
    onError: (error: any) => {
      console.error("[Goals] Save daily run goal error:", error);
      Alert.alert("Error", error?.message || "Failed to save daily running goal");
    },
  });

  const { data: recentActivities = [], refetch: refetchRecent } = useQuery<RecentActivity[]>({
    queryKey: ["recentPaceActivities", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("activities")
        .select("pace_min_per_km, activity_date")
        .eq("registration_id", user.id)
        .order("activity_date", { ascending: false })
        .limit(5);
      if (error) {
        console.error("[Goals] Error fetching recent activities for pace:", error);
        return [];
      }
      console.log("[Goals] Recent activities for pace:", data?.length);
      return (data || []) as RecentActivity[];
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const { data: healthDurationActivities = [], refetch: refetchHealthDurationActivities } = useQuery<DurationActivity[]>({
    queryKey: ["healthDurationActivities", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("activities")
        .select("activity_date, start_time, end_time, pause_duration_seconds")
        .eq("registration_id", user.id)
        .not("start_time", "is", null)
        .not("end_time", "is", null)
        .order("activity_date", { ascending: false })
        .limit(30);
      if (error) {
        console.error("[Goals] Error fetching health duration activities:", error);
        return [];
      }
      return (data || []) as DurationActivity[];
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const saveFitnessGoalMutation = useMutation({
    mutationFn: async ({ paceMinPerKm, date }: { paceMinPerKm: number; date: string }) => {
      if (!user?.id) throw new Error("Not logged in");

      const { data, error } = await supabase
        .from("fitness_goal")
        .insert({
          registration_id: user.id,
          target_pace_min_per_km: paceMinPerKm,
          target_date: date,
        })
        .select()
        .single();
      if (error) {
        console.error("[Goals] Supabase insert error:", JSON.stringify(error));
        throw new Error(error.message || "Failed to save fitness goal");
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fitnessGoal", user?.id] });
      setShowGoalForm(false);
      setTargetPaceMin("");
      setTargetPaceSec("");
      setTargetDate("");
      Alert.alert("Success", "Fitness goal saved!");
    },
    onError: (error: any) => {
      console.error("[Goals] Save fitness goal error:", JSON.stringify(error));
      Alert.alert("Error", error?.message || "Failed to save fitness goal");
    },
  });

  const handleSaveFitnessGoal = useCallback(() => {
    const mins = parseInt(targetPaceMin, 10);
    const secs = parseInt(targetPaceSec || "0", 10);

    if (isNaN(mins) || mins < 0 || mins > 30) {
      Alert.alert("Error", "Please enter valid minutes (0-30)");
      return;
    }
    if (isNaN(secs) || secs < 0 || secs > 59) {
      Alert.alert("Error", "Please enter valid seconds (0-59)");
      return;
    }

    const totalMinPerKm = mins + secs / 60;
    if (totalMinPerKm <= 0) {
      Alert.alert("Error", "Pace must be greater than 0");
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(targetDate)) {
      Alert.alert("Error", "Please enter date in YYYY-MM-DD format");
      return;
    }

    const targetDateObj = new Date(targetDate + "T00:00:00");
    if (isNaN(targetDateObj.getTime())) {
      Alert.alert("Error", "Please enter a valid date");
      return;
    }

    const paceMinPerKm = normalizePaceInputMinPerKm(totalMinPerKm);
    saveFitnessGoalMutation.mutate({ paceMinPerKm, date: targetDate });
  }, [targetPaceMin, targetPaceSec, targetDate, saveFitnessGoalMutation]);

  const fitnessProgress = useMemo(() => {
    if (!fitnessGoal || recentActivities.length === 0) return null;

    const validActivities = recentActivities.filter((a) => a.pace_min_per_km > 0);
    if (validActivities.length === 0) return null;

    const avgpaceMinPerKm = validActivities.reduce((sum, a) => sum + a.pace_min_per_km, 0) / validActivities.length;
    const lastThreeActivities = validActivities.slice(0, 3);
    const lastThreeAvgpaceMinPerKm = lastThreeActivities.length > 0
      ? lastThreeActivities.reduce((sum, a) => sum + a.pace_min_per_km, 0) / lastThreeActivities.length
      : avgpaceMinPerKm;
    const targetpaceMinPerKm = fitnessGoal.target_pace_min_per_km;

    const avgMinPerKm = normalizePaceMinPerKm(avgpaceMinPerKm);
    const targetMinPerKm = normalizePaceMinPerKm(targetpaceMinPerKm);

    const progressPercent = targetMinPerKm > 0
      ? Math.min(100, Math.max(0, (targetMinPerKm / avgMinPerKm) * 100))
      : 0;

    const daysLeft = Math.max(0, Math.ceil((new Date(fitnessGoal.target_date + "T00:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

    const isAhead = avgpaceMinPerKm <= targetpaceMinPerKm;

    return {
      avgpaceMinPerKm,
      lastThreeAvgpaceMinPerKm,
      targetpaceMinPerKm,
      avgMinPerKm,
      targetMinPerKm,
      progressPercent,
      daysLeft,
      isAhead,
      activitiesUsed: validActivities.length,
      lastThreeActivitiesUsed: lastThreeActivities.length,
    };
  }, [fitnessGoal, recentActivities]);

  const { data: userGoals = [], isLoading: goalsLoading, refetch: refetchGoals } = useQuery<UserGoal[]>({
    queryKey: ["userGoals", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("user_goals")
        .select("*")
        .eq("registration_id", user.id);
      if (error) {
        console.error("[Goals] Error fetching user goals:", error);
        return [];
      }
      return (data as UserGoal[]) || [];
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const { data: weightTargetGoal, isLoading: weightTargetLoading, refetch: refetchWeightTarget } = useQuery<WeightTargetGoal | null>({
    queryKey: ["weightTargetGoal", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("weight_target_goal")
        .select("*")
        .eq("registration_id", user.id)
        .maybeSingle();
      if (error) {
        console.error("[Goals] Error fetching weight target goal:", error);
        return null;
      }
      console.log("[Goals] Weight target goal:", data);
      return data as WeightTargetGoal | null;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const { data: weightEntries = [], refetch: refetchWeightEntries } = useQuery<WeightGoalEntry[]>({
    queryKey: ["weightGoalEntries", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("weight_goal")
        .select("*")
        .eq("registration_id", user.id)
        .order("date", { ascending: true });
      if (error) {
        console.error("[Goals] Error fetching weight entries:", error);
        return [];
      }
      console.log("[Goals] Weight entries:", data?.length);
      return (data || []) as WeightGoalEntry[];
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const saveWeightTargetMutation = useMutation({
    mutationFn: async ({ targetWeight, targetDateStr }: { targetWeight: number; targetDateStr: string }) => {
      if (!user?.id) throw new Error("Not logged in");
      if (weightTargetGoal) {
        const { data, error } = await supabase
          .from("weight_target_goal")
          .update({
            target_weight: targetWeight,
            target_date: targetDateStr,
            updated_at: new Date().toISOString(),
          })
          .eq("registration_id", user.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("weight_target_goal")
          .insert({
            registration_id: user.id,
            target_weight: targetWeight,
            target_date: targetDateStr,
          })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["weightTargetGoal", user?.id] });
      setShowWeightTargetForm(false);
      setWeightTargetInput("");
      setWeightTargetDateInput("");
      Alert.alert("Success", "Weight target saved!");
    },
    onError: (error: any) => {
      console.error("[Goals] Save weight target error:", error);
      Alert.alert("Error", error?.message || "Failed to save weight target");
    },
  });

  const logWeightMutation = useMutation({
    mutationFn: async ({ weight }: { weight: number }) => {
      if (!user?.id) throw new Error("Not logged in");
      const today = new Date().toISOString().split("T")[0];
      const { data: existing } = await supabase
        .from("weight_goal")
        .select("id")
        .eq("registration_id", user.id)
        .eq("date", today)
        .maybeSingle();
      if (existing) {
        const { data, error } = await supabase
          .from("weight_goal")
          .update({ weight })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("weight_goal")
          .insert({
            registration_id: user.id,
            weight,
            date: today,
          })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["weightGoalEntries", user?.id] });
      setShowWeightLogForm(false);
      setWeightLogInput("");
      Alert.alert("Success", "Weight logged!");
    },
    onError: (error: any) => {
      console.error("[Goals] Log weight error:", error);
      Alert.alert("Error", error?.message || "Failed to log weight");
    },
  });

  const { data: healthEntries = [], isLoading: healthLoading, refetch: refetchHealth } = useQuery<HealthGoalEntry[]>({
    queryKey: ["healthGoalEntries", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("health_goal")
        .select("*")
        .eq("registration_id", user.id)
        .order("record_date", { ascending: false })
        .limit(7);
      if (error) {
        console.error("[Goals] Error fetching health entries:", error);
        return [];
      }
      console.log("[Goals] Health entries:", data?.length);
      return (data || []) as HealthGoalEntry[];
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const { data: healthProfile } = useQuery<HealthProfile | null>({
    queryKey: ["healthProfile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("registrations")
        .select("dob")
        .eq("registration_id", user.id)
        .maybeSingle();
      if (error) {
        console.error("[Goals] Error fetching health profile:", error);
        return null;
      }
      return data as HealthProfile | null;
    },
    enabled: !!user?.id,
    staleTime: 300000,
  });

  const logHealthMutation = useMutation({
    mutationFn: async ({ steps, heartRateBpm, sleepHours, bloodOxygenSpo2 }: { steps: number; heartRateBpm: number | null; sleepHours: number | null; bloodOxygenSpo2: number | null }) => {
      if (!user?.id) throw new Error("Not logged in");
      const today = new Date().toISOString().split("T")[0];
      const { data: existing } = await supabase
        .from("health_goal")
        .select("health_id")
        .eq("registration_id", user.id)
        .eq("record_date", today)
        .maybeSingle();
      if (existing) {
        const { data, error } = await supabase
          .from("health_goal")
          .update({ steps, heart_rate_bpm: heartRateBpm, sleep_hours: sleepHours, blood_oxygen_spo2: bloodOxygenSpo2 })
          .eq("health_id", existing.health_id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("health_goal")
          .insert({
            registration_id: user.id,
            record_date: today,
            steps,
            heart_rate_bpm: heartRateBpm,
            sleep_hours: sleepHours,
            blood_oxygen_spo2: bloodOxygenSpo2,
          })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["healthGoalEntries", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["smartfit-club"] });
      void queryClient.invalidateQueries({ queryKey: ["smartfit-goal-rank", user?.id] });
      setShowHealthForm(false);
      setHealthStepsInput("");
      setHealthHeartRateInput("");
      setHealthSleepInput("");
      setHealthSpo2Input("");
      Alert.alert("Success", "Health data logged!");
    },
    onError: (error: any) => {
      console.error("[Goals] Log health error:", error);
      Alert.alert("Error", error?.message || "Failed to log health data");
    },
  });

  const healthScore = useMemo(() => {
    if (healthEntries.length === 0) return null;
    const recent = healthEntries[0];
    const age = getAgeFromDob(healthProfile?.dob);
    const recommended = getHealthRecommendations(age);
    const durationEntries = healthDurationActivities
      .map((activity) => ({
        activityDate: activity.activity_date,
        minutes: getActivityDurationMinutes(activity),
      }))
      .filter((entry): entry is { activityDate: string; minutes: number } => entry.minutes !== null);
    const recentDuration = durationEntries[0] ?? null;
    const avgDuration = durationEntries.length > 0
      ? durationEntries.reduce((sum, entry) => sum + entry.minutes, 0) / durationEntries.length
      : null;

    let stepsTotal = 0;
    let heartRateTotal = 0;
    let heartRateCount = 0;
    let sleepTotal = 0;
    let sleepCount = 0;
    let spo2Total = 0;
    let spo2Count = 0;

    healthEntries.forEach((entry) => {
      stepsTotal += entry.steps || 0;
      if (entry.heart_rate_bpm !== null && entry.heart_rate_bpm > 0) {
        heartRateTotal += entry.heart_rate_bpm;
        heartRateCount++;
      }
      if (entry.sleep_hours !== null && entry.sleep_hours > 0) {
        sleepTotal += entry.sleep_hours;
        sleepCount++;
      }
      if (entry.blood_oxygen_spo2 !== null && entry.blood_oxygen_spo2 > 0) {
        spo2Total += entry.blood_oxygen_spo2;
        spo2Count++;
      }
    });

    const count = healthEntries.length;
    const avgSteps = stepsTotal / count;
    const avgHeartRate = heartRateCount > 0 ? heartRateTotal / heartRateCount : null;
    const avgSleep = sleepCount > 0 ? sleepTotal / sleepCount : null;
    const avgSpo2 = spo2Count > 0 ? spo2Total / spo2Count : null;

    const stepsScore = Math.min(100, (avgSteps / recommended.stepTarget) * 100);

    let heartRateScore = 50;
    if (avgHeartRate !== null) {
      if (avgHeartRate >= 60 && avgHeartRate <= 100) {
        const midPoint = 70;
        const distance = Math.abs(avgHeartRate - midPoint);
        heartRateScore = Math.max(0, 100 - (distance * 2.5));
      } else if (avgHeartRate < 60) {
        heartRateScore = Math.max(20, 100 - ((60 - avgHeartRate) * 3));
      } else {
        heartRateScore = Math.max(0, 100 - ((avgHeartRate - 100) * 5));
      }
    }

    let sleepScore = 50;
    if (avgSleep !== null) {
      if (avgSleep >= 7 && avgSleep <= 9) {
        sleepScore = 100;
      } else if (avgSleep >= 6 && avgSleep < 7) {
        sleepScore = 70;
      } else if (avgSleep > 9 && avgSleep <= 10) {
        sleepScore = 80;
      } else if (avgSleep >= 5 && avgSleep < 6) {
        sleepScore = 40;
      } else if (avgSleep > 10) {
        sleepScore = 50;
      } else {
        sleepScore = Math.max(0, avgSleep * 8);
      }
    }

    let spo2Score = 50;
    if (avgSpo2 !== null) {
      if (avgSpo2 >= 95) {
        spo2Score = 100;
      } else if (avgSpo2 >= 90) {
        spo2Score = 70 + ((avgSpo2 - 90) / 5) * 30;
      } else if (avgSpo2 >= 85) {
        spo2Score = 40 + ((avgSpo2 - 85) / 5) * 30;
      } else {
        spo2Score = Math.max(0, avgSpo2 - 45);
      }
    }

    let totalScore = stepsScore * 0.25;
    if (avgHeartRate !== null) {
      totalScore += heartRateScore * 0.25;
    }
    if (avgSleep !== null) {
      totalScore += sleepScore * 0.25;
    }
    if (avgSpo2 !== null) {
      totalScore += spo2Score * 0.25;
    }

    const dimensionCount = 1 + (avgHeartRate !== null ? 1 : 0) + (avgSleep !== null ? 1 : 0) + (avgSpo2 !== null ? 1 : 0);
    const normalizedScore = dimensionCount > 0 ? (totalScore / dimensionCount) * 4 : 0;
    const overallScore = Math.min(100, Math.round(normalizedScore));

    return {
      overall: overallScore,
      steps: {
        score: Math.round(stepsScore),
        recent: `${(recent.steps || 0).toLocaleString()} steps`,
        avg: `${Math.round(avgSteps).toLocaleString()}/day`,
        recommended: recommended.steps,
      },
      duration: avgDuration !== null && recentDuration !== null ? {
        recent: formatDurationMinutes(recentDuration.minutes),
        avg: `${formatDurationMinutes(avgDuration)}/exercise`,
        recommended: recommended.duration,
      } : null,
      heartRate: avgHeartRate !== null ? {
        score: Math.round(heartRateScore),
        recent: recent.heart_rate_bpm ? `${recent.heart_rate_bpm} bpm` : "-",
        avg: `${Math.round(avgHeartRate)} bpm`,
        recommended: recommended.heartRate,
      } : null,
      sleep: avgSleep !== null ? {
        score: Math.round(sleepScore),
        recent: recent.sleep_hours ? `${recent.sleep_hours}h` : "-",
        avg: `${parseFloat(avgSleep.toFixed(1))}h`,
        recommended: recommended.sleep,
      } : null,
      spo2: avgSpo2 !== null ? {
        score: Math.round(spo2Score),
        recent: recent.blood_oxygen_spo2 ? `${recent.blood_oxygen_spo2}%` : "-",
        avg: `${parseFloat(avgSpo2.toFixed(1))}%`,
        recommended: recommended.spo2,
      } : null,
      entriesUsed: count,
    };
  }, [healthDurationActivities, healthEntries, healthProfile?.dob]);

  const { data: smartFitGoalRank, refetch: refetchSmartFitGoalRank } = useQuery<SmartFitGoalRank | null>({
    queryKey: ["smartfit-goal-rank", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data: clubs, error: clubsError } = await supabase
        .from("clubs")
        .select("club_id, club_name, coordinator_id")
        .eq("special_club_code", SMARTFIT_SPECIAL_CLUB_CODE);
      if (clubsError) {
        console.error("[Goals] SmartFit club lookup error:", clubsError);
        return null;
      }

      const clubRows = clubs || [];
      const clubIds = clubRows.map((club: any) => club.club_id).filter(Boolean);
      const coordinatorIds = clubRows.map((club: any) => club.coordinator_id).filter(Boolean);
      if (clubIds.length === 0 && coordinatorIds.length === 0) return null;

      const membershipRequestsPromise = clubIds.length > 0
        ? supabase
          .from("club_membership_request")
          .select("registration_id")
          .in("club_id", clubIds)
          .eq("request_type", "membership")
          .in("status", ["pending", "approved"])
        : Promise.resolve({ data: [], error: null });
      const legacyMembersPromise = coordinatorIds.length > 0
        ? supabase
          .from("club_members")
          .select("registration_id")
          .in("coordinator_id", coordinatorIds)
        : Promise.resolve({ data: [], error: null });

      const [
        { data: membershipRequests, error: membershipError },
        { data: legacyMembers, error: legacyError },
      ] = await Promise.all([membershipRequestsPromise, legacyMembersPromise]);
      if (membershipError) {
        console.error("[Goals] SmartFit membership lookup error:", membershipError);
        return null;
      }
      if (legacyError) {
        console.error("[Goals] SmartFit legacy membership lookup error:", legacyError);
        return null;
      }

      const memberIds = Array.from(new Set([
        ...(membershipRequests || []).map((row: any) => row.registration_id).filter(Boolean),
        ...(legacyMembers || []).map((row: any) => row.registration_id).filter(Boolean),
      ]));
      if (!memberIds.includes(user.id)) return null;
      if (memberIds.length === 0) return null;

      const [
        { data: healthData, error: healthError },
        { data: registrations, error: registrationError },
        { data: activities, error: activityError },
      ] = await Promise.all([
        supabase
          .from("health_goal")
          .select("registration_id, record_date, steps, heart_rate_bpm, sleep_hours, blood_oxygen_spo2")
          .in("registration_id", memberIds),
        supabase
          .from("registrations")
          .select("registration_id, sex, dob")
          .in("registration_id", memberIds),
        supabase
          .from("activities")
          .select("registration_id, activity_date, start_time, end_time, pause_duration_seconds")
          .in("registration_id", memberIds),
      ]);
      if (healthError) {
        console.error("[Goals] SmartFit health lookup error:", healthError);
        return null;
      }
      if (registrationError) {
        console.error("[Goals] SmartFit registration lookup error:", registrationError);
        return null;
      }
      if (activityError) {
        console.error("[Goals] SmartFit activity lookup error:", activityError);
        return null;
      }

      const profileMap = new Map((registrations || []).map((profile: any) => [profile.registration_id, profile]));
      const healthByUser = new Map<string, any[]>();
      (healthData || []).forEach((entry: any) => {
        if (!entry.registration_id) return;
        const rows = healthByUser.get(entry.registration_id) || [];
        rows.push(entry);
        healthByUser.set(entry.registration_id, rows);
      });

      const activityTimeByUser = new Map<string, { totalTime: number; days: Set<string> }>();
      (activities || []).forEach((activity: DurationActivity) => {
        if (!activity.registration_id) return;
        const existing = activityTimeByUser.get(activity.registration_id) || { totalTime: 0, days: new Set<string>() };
        existing.totalTime += getActivityDurationMinutes(activity) || 0;
        const activityDate = String(activity.activity_date || "").slice(0, 10);
        if (activityDate) existing.days.add(activityDate);
        activityTimeByUser.set(activity.registration_id, existing);
      });

      const rows = [...healthByUser.entries()].map(([registrationId, entries]) => {
        const profile = profileMap.get(registrationId) || {};
        const days = new Set(entries.map((entry) => String(entry.record_date || "").slice(0, 10)).filter(Boolean)).size || entries.length;
        const avgSteps = entries.reduce((sum, entry) => sum + Number(entry.steps || 0), 0) / Math.max(days, 1);
        const heartRates = entries.map((entry) => Number(entry.heart_rate_bpm)).filter((value) => Number.isFinite(value) && value > 0);
        const sleepHours = entries.map((entry) => Number(entry.sleep_hours)).filter((value) => Number.isFinite(value) && value > 0);
        const spo2Values = entries.map((entry) => Number(entry.blood_oxygen_spo2)).filter((value) => Number.isFinite(value) && value > 0);
        const sex = normalizeSex(profile.sex);
        const ageGroup = getSmartFitAgeGroup(getAgeFromDob(profile.dob));
        const activityStats = activityTimeByUser.get(registrationId);
        const activityDays = activityStats?.days.size || 0;
        const healthScoreValue = scoreSmartFitHealth({
          avgSteps,
          avgHeartRate: heartRates.length ? heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length : null,
          avgSleep: sleepHours.length ? sleepHours.reduce((sum, value) => sum + value, 0) / sleepHours.length : null,
          avgSpo2: spo2Values.length ? spo2Values.reduce((sum, value) => sum + value, 0) / spo2Values.length : null,
          ageGroup,
          sex,
        });
        return {
          registrationId,
          ageGroup,
          avgSteps: Math.round(avgSteps),
          avgTime: activityStats && activityDays > 0 ? activityStats.totalTime / activityDays : 0,
          days,
          healthScore: healthScoreValue,
        };
      });

      const userRow = rows.find((row) => row.registrationId === user.id);
      if (!userRow) return null;
      const groupRows = rows
        .filter((row) => row.ageGroup === userRow.ageGroup)
        .sort((a, b) =>
          b.healthScore - a.healthScore ||
          b.avgSteps - a.avgSteps ||
          b.avgTime - a.avgTime ||
          b.days - a.days
        );
      const rankIndex = groupRows.findIndex((row) => row.registrationId === user.id);
      if (rankIndex < 0) return null;

      return {
        rank: rankIndex + 1,
        totalParticipants: groupRows.length,
        ageGroup: userRow.ageGroup,
        healthScore: userRow.healthScore,
        clubName: clubRows[0]?.club_name || "SmartFit Club",
      };
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const handleLogHealth = useCallback(() => {
    const steps = parseInt(healthStepsInput, 10);
    if (isNaN(steps) || steps < 0) {
      Alert.alert("Error", "Please enter valid steps (0 or more)");
      return;
    }
    const heartRateBpm = healthHeartRateInput.trim() ? parseInt(healthHeartRateInput, 10) : null;
    if (heartRateBpm !== null && (isNaN(heartRateBpm) || heartRateBpm < 20 || heartRateBpm > 250)) {
      Alert.alert("Error", "Please enter a valid heart rate (20-250 bpm)");
      return;
    }
    const sleepHours = healthSleepInput.trim() ? parseFloat(healthSleepInput) : null;
    if (sleepHours !== null && (isNaN(sleepHours) || sleepHours < 0 || sleepHours > 24)) {
      Alert.alert("Error", "Please enter valid sleep hours (0-24)");
      return;
    }
    const bloodOxygenSpo2 = healthSpo2Input.trim() ? parseFloat(healthSpo2Input) : null;
    if (bloodOxygenSpo2 !== null && (isNaN(bloodOxygenSpo2) || bloodOxygenSpo2 < 50 || bloodOxygenSpo2 > 100)) {
      Alert.alert("Error", "Please enter valid SpO2 (50-100%)");
      return;
    }
    logHealthMutation.mutate({ steps, heartRateBpm, sleepHours, bloodOxygenSpo2 });
  }, [healthStepsInput, healthHeartRateInput, healthSleepInput, healthSpo2Input, logHealthMutation]);

  const getHealthScoreColor = (score: number): string => {
    if (score >= 80) return "#10B981";
    if (score >= 60) return "#F59E0B";
    if (score >= 40) return "#FF6B35";
    return "#EF4444";
  };

  const getHealthScoreLabel = (score: number): string => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Needs Work";
  };

  const { data: habitDeclaration, isLoading: habitDeclarationLoading, refetch: refetchHabit } = useQuery<HabitDeclaration | null>({
    queryKey: ["habitDeclaration", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("habit_declarations")
        .select("*")
        .eq("registration_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[Goals] Error fetching habit declaration:", error);
        return null;
      }
      console.log("[Goals] Habit declaration:", data);
      return data as HabitDeclaration | null;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const { data: habitActivities = [] } = useQuery<any[]>({
    queryKey: ["habitActivities", user?.id, habitDeclaration?.declaration_id],
    queryFn: async () => {
      if (!user?.id || !habitDeclaration) return [];
      if (habitDeclaration.unit === "steps") {
        const { data, error } = await supabase
          .from("health_goal")
          .select("record_date, steps")
          .eq("registration_id", user.id)
          .gte("record_date", habitDeclaration.start_date);
        if (error) {
          console.error("[Goals] Error fetching habit steps:", error);
          return [];
        }
        return data || [];
      } else {
        const { data, error } = await supabase
          .from("activities")
          .select("activity_date, distance_km, exercise_type")
          .eq("registration_id", user.id)
          .gte("activity_date", habitDeclaration.start_date);
        if (error) {
          console.error("[Goals] Error fetching habit activities:", error);
          return [];
        }
        return (data || []).filter((a: any) =>
          a.exercise_type?.toLowerCase() === habitDeclaration.activity_type.toLowerCase()
        );
      }
    },
    enabled: !!user?.id && !!habitDeclaration,
    staleTime: 30000,
  });

  const saveHabitMutation = useMutation({
    mutationFn: async (declaration: {
      activity_type: string;
      target_amount: number;
      unit: string;
      frequency: string;
      start_date: string;
    }) => {
      if (!user?.id) throw new Error("Not logged in");
      await supabase
        .from("habit_declarations")
        .update({ is_active: false })
        .eq("registration_id", user.id)
        .eq("is_active", true);
      const { data, error } = await supabase
        .from("habit_declarations")
        .insert({
          registration_id: user.id,
          ...declaration,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["habitDeclaration", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["habitActivities", user?.id] });
      setShowHabitModal(false);
      resetHabitForm();
      Alert.alert("Success", "Your training plan has been saved!");
    },
    onError: (error: any) => {
      console.error("[Goals] Save habit declaration error:", error);
      Alert.alert("Error", error?.message || "Failed to save declaration");
    },
  });

  const resetHabitForm = useCallback(() => {
    setHabitActivityType("Walk");
    setHabitAmount("");
    setHabitUnit("kilometers");
    setHabitFrequency("daily");
    setHabitStartDate("");
  }, []);

  const handleSaveHabit = useCallback(() => {
    const amount = parseFloat(habitAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Error", "Please enter a valid target amount");
      return;
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(habitStartDate)) {
      Alert.alert("Error", "Please enter date in YYYY-MM-DD format");
      return;
    }
    const dateObj = new Date(habitStartDate + "T00:00:00");
    if (isNaN(dateObj.getTime())) {
      Alert.alert("Error", "Please enter a valid date");
      return;
    }
    saveHabitMutation.mutate({
      activity_type: habitActivityType,
      target_amount: amount,
      unit: habitUnit,
      frequency: habitFrequency,
      start_date: habitStartDate,
    });
  }, [habitActivityType, habitAmount, habitUnit, habitFrequency, habitStartDate, saveHabitMutation]);

  const habitCommitment = useMemo(() => {
    if (!habitDeclaration) return null;

    const start = new Date(habitDeclaration.start_date + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (today < start) {
      return { percent: 0, periodsElapsed: 0, periodsMet: 0 };
    }

    const isSteps = habitDeclaration.unit === "steps";
    const target = habitDeclaration.target_amount;

    const valueByDate = new Map<string, number>();
    habitActivities.forEach((entry: any) => {
      if (isSteps) {
        const date = entry.record_date;
        valueByDate.set(date, (valueByDate.get(date) || 0) + (entry.steps || 0));
      } else {
        const date = entry.activity_date?.split?.("T")?.[0] || entry.activity_date;
        valueByDate.set(date, (valueByDate.get(date) || 0) + (entry.distance_km || 0));
      }
    });

    const diffDays = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    let periodsElapsed = 0;
    let periodsMet = 0;

    if (habitDeclaration.frequency === "daily") {
      periodsElapsed = diffDays;
      for (let i = 0; i < diffDays; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];
        if ((valueByDate.get(dateStr) || 0) >= target) periodsMet++;
      }
    } else if (habitDeclaration.frequency === "weekly") {
      const totalWeeks = Math.ceil(diffDays / 7);
      periodsElapsed = totalWeeks;
      for (let w = 0; w < totalWeeks; w++) {
        let weekTotal = 0;
        for (let d = 0; d < 7; d++) {
          const dayIndex = w * 7 + d;
          if (dayIndex >= diffDays) break;
          const date = new Date(start);
          date.setDate(date.getDate() + dayIndex);
          const dateStr = date.toISOString().split("T")[0];
          weekTotal += valueByDate.get(dateStr) || 0;
        }
        if (weekTotal >= target) periodsMet++;
      }
    } else if (habitDeclaration.frequency === "monthly") {
      let current = new Date(start.getFullYear(), start.getMonth(), 1);
      while (current <= today) {
        periodsElapsed++;
        const monthStart = new Date(Math.max(current.getTime(), start.getTime()));
        const nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        const monthEnd = new Date(Math.min(nextMonth.getTime() - 86400000, today.getTime()));
        let monthTotal = 0;
        const iter = new Date(monthStart);
        while (iter <= monthEnd) {
          const dateStr = iter.toISOString().split("T")[0];
          monthTotal += valueByDate.get(dateStr) || 0;
          iter.setDate(iter.getDate() + 1);
        }
        if (monthTotal >= target) periodsMet++;
        current = nextMonth;
      }
    } else if (habitDeclaration.frequency === "yearly") {
      let currentYear = start.getFullYear();
      while (currentYear <= today.getFullYear()) {
        periodsElapsed++;
        const yearStart = new Date(Math.max(new Date(currentYear, 0, 1).getTime(), start.getTime()));
        const yearEnd = new Date(Math.min(new Date(currentYear, 11, 31).getTime(), today.getTime()));
        let yearTotal = 0;
        const iter = new Date(yearStart);
        while (iter <= yearEnd) {
          const dateStr = iter.toISOString().split("T")[0];
          yearTotal += valueByDate.get(dateStr) || 0;
          iter.setDate(iter.getDate() + 1);
        }
        if (yearTotal >= target) periodsMet++;
        currentYear++;
      }
    }

    const percent = periodsElapsed > 0 ? Math.round((periodsMet / periodsElapsed) * 100) : 0;
    return { percent, periodsElapsed, periodsMet };
  }, [habitDeclaration, habitActivities]);

  const openEditHabit = useCallback(() => {
    if (habitDeclaration) {
      setHabitActivityType(habitDeclaration.activity_type);
      setHabitAmount(habitDeclaration.target_amount.toString());
      setHabitUnit(habitDeclaration.unit);
      setHabitFrequency(habitDeclaration.frequency);
      setHabitStartDate(habitDeclaration.start_date);
    } else {
      resetHabitForm();
    }
    setShowHabitModal(true);
  }, [habitDeclaration, resetHabitForm]);

  const getCommitmentColor = (percent: number): string => {
    if (percent >= 70) return "#0D9488";
    if (percent >= 40) return "#F59E0B";
    return "#EF4444";
  };

  const getCommitmentLabel = (percent: number): string => {
    if (percent >= 80) return "Excellent";
    if (percent >= 60) return "Good";
    if (percent >= 40) return "Fair";
    return "Needs Work";
  };

  const getFrequencyPeriodLabel = (frequency: string): string => {
    if (frequency === "daily") return "days";
    if (frequency === "weekly") return "weeks";
    if (frequency === "monthly") return "months";
    return "years";
  };

  const { data: activitySummary, refetch: refetchActivity } = useQuery<ActivitySummary>({
    queryKey: ["goalActivitySummary", user?.id],
    queryFn: async () => {
      if (!user?.id) return { totalDistance: 0, totalTime: 0, activeDays: 0, avgDistance: 0, avgPace: 0, streakDays: 0 };
      const { data, error } = await supabase
        .from("activities")
        .select("activity_date, distance_km, start_time, end_time, pace_min_per_km")
        .eq("registration_id", user.id);

      if (error) {
        console.error("[Goals] Error fetching activities:", error);
        return { totalDistance: 0, totalTime: 0, activeDays: 0, avgDistance: 0, avgPace: 0, streakDays: 0 };
      }

      const activities = data || [];
      let totalDistance = 0;
      let totalTime = 0;
      let paceSum = 0;
      const daySet = new Set<string>();

      activities.forEach((a: any) => {
        totalDistance += a.distance_km || 0;
        paceSum += a.pace_min_per_km || 0;
        const dateKey = a.activity_date?.split?.("T")?.[0] || a.activity_date;
        if (dateKey) daySet.add(dateKey);
        const startParts = (a.start_time || "0:0:0").split(":");
        const endParts = (a.end_time || "0:0:0").split(":");
        const startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
        const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
        let dur = endMin - startMin;
        if (dur < 0) dur += 24 * 60;
        totalTime += dur;
      });

      const activeDays = daySet.size;
      const avgDistance = activeDays > 0 ? totalDistance / activeDays : 0;
      const avgPace = activities.length > 0 ? paceSum / activities.length : 0;

      const sortedDates = Array.from(daySet).sort().reverse();
      let streakDays = 0;
      if (sortedDates.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let checkDate = new Date(today);
        const latestActivity = new Date(sortedDates[0] + "T00:00:00");
        const diffDays = Math.floor((today.getTime() - latestActivity.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 1) {
          streakDays = 0;
        } else {
          if (diffDays === 1) {
            checkDate = new Date(latestActivity);
          }
          for (const d of sortedDates) {
            const dateStr = checkDate.toISOString().split("T")[0];
            if (d === dateStr) {
              streakDays++;
              checkDate.setDate(checkDate.getDate() - 1);
            } else {
              break;
            }
          }
        }
      }

      return { totalDistance, totalTime, activeDays, avgDistance, avgPace, streakDays };
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });



  const resolveCanonicalRegistrationIds = useCallback(async (registrationIds: string[]) => {
    const uniqueRegistrationIds = Array.from(new Set(registrationIds.filter(Boolean)));
    if (uniqueRegistrationIds.length === 0) return new Map<string, string>();

    const [byAuthIdResult, byRegistrationIdResult] = await Promise.all([
      supabase.from("profiles").select("profile_id, registration_id").in("profile_id", uniqueRegistrationIds),
      supabase.from("profiles").select("profile_id, registration_id").in("registration_id", uniqueRegistrationIds),
    ]);

    if (byAuthIdResult.error) throw byAuthIdResult.error;
    if (byRegistrationIdResult.error) throw byRegistrationIdResult.error;

    const resolved = new Map<string, string>();
    uniqueRegistrationIds.forEach((id) => resolved.set(id, id));
    [...(byAuthIdResult.data || []), ...(byRegistrationIdResult.data || [])].forEach((profile: any) => {
      const authId = String(profile.profile_id || "").trim();
      const registrationId = String(profile.registration_id || "").trim();
      if (authId && registrationId) {
        resolved.set(authId, registrationId);
        resolved.set(registrationId, registrationId);
      }
    });

    return resolved;
  }, []);

  const { data: communityRankData, isLoading: communityRankLoading, refetch: refetchCommunityRank } = useQuery<CommunityRankData[]>({
    queryKey: ["goalCommunityRank"],
    queryFn: async () => {
      try {
        const { data: activities, error: activityError } = await supabase
          .from("activities")
          .select("registration_id, activity_date, distance_km, start_time, end_time, pace_min_per_km");
        if (activityError) {
          console.error("[Goals] Community rank activity fetch error:", JSON.stringify(activityError));
          throw activityError;
        }
        const { data: registrations, error: regError } = await supabase
          .from("registrations")
          .select('registration_id, first_name, other_names, has_disability, para_uses_equipment');
        if (regError) {
          console.error("[Goals] Community rank registration fetch error:", JSON.stringify(regError));
          throw regError;
        }
        const regMap = new Map(registrations?.map((r: any) => [r.registration_id, r]));
        const userStats = new Map<string, {
          totalDistance: number;
          paceSum: number;
          activityCount: number;
          activeDays: Set<string>;
        }>();
        activities?.forEach((activity: any) => {
          const regId = activity.registration_id;
          if (!regId) return;
          const existing = userStats.get(regId) || {
            totalDistance: 0, paceSum: 0, activityCount: 0, activeDays: new Set<string>(),
          };
          existing.totalDistance += activity.distance_km || 0;
          existing.paceSum += activity.pace_min_per_km || 0;
          existing.activityCount += 1;
          existing.activeDays.add(activity.activity_date);
          userStats.set(regId, existing);
        });
        const result: CommunityRankData[] = [];
        userStats.forEach((stats, regId) => {
          const registration = regMap.get(regId) as any;
          if (!registration) return;
          if (registration.has_disability === true && registration.para_uses_equipment === true) return;
          const firstName = registration.first_name || "";
          const otherNames = registration.other_names || "";
          const fullName = [firstName, otherNames].filter((n: string) => n).join(" ") || "Unknown";
          const activeDays = stats.activeDays.size;
          result.push({
            registrationId: regId,
            Name: fullName,
            AvgDistance: activeDays > 0 ? stats.totalDistance / activeDays : 0,
            ActiveDays: activeDays,
            AveragePace: stats.activityCount > 0 ? stats.paceSum / stats.activityCount : 0,
          });
        });
        console.log("[Goals] Community rank data processed:", result.length, "users");
        return result;
      } catch (error: any) {
        console.error("[Goals] Community rank query failed:", JSON.stringify(error));
        throw error;
      }
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const { data: familyRanking, isLoading: familyRankLoading, refetch: refetchFamilyRank } = useQuery<RankSummary | null>({
    queryKey: ["goalFamilyRank", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const canonicalMap = await resolveCanonicalRegistrationIds([user.id]);
      const ownerRegistrationId = canonicalMap.get(user.id) || user.id;

      const { data: memberships, error: membershipError } = await supabase
        .from("family_members")
        .select("member_registration_id")
        .eq("owner_registration_id", ownerRegistrationId);
      if (membershipError) throw membershipError;

      const familyIds = Array.from(new Set([ownerRegistrationId, ...(memberships || []).map((row: any) => row.member_registration_id)].filter(Boolean)));
      if (familyIds.length === 0) return null;

      const { data: activities, error: activityError } = await supabase
        .from("activities")
        .select("registration_id, activity_date, distance_km, pace_min_per_km")
        .in("registration_id", familyIds);
      if (activityError) throw activityError;

      const rowsById = new Map<string, { distance: number; activeDays: Set<string>; paceSum: number; activityCount: number }>();
      familyIds.forEach((id) => rowsById.set(id, { distance: 0, activeDays: new Set<string>(), paceSum: 0, activityCount: 0 }));
      (activities || []).forEach((activity: any) => {
        const regId = activity.registration_id;
        if (!regId) return;
        const existing = rowsById.get(regId) || { distance: 0, activeDays: new Set<string>(), paceSum: 0, activityCount: 0 };
        existing.distance += Number(activity.distance_km) || 0;
        existing.activeDays.add(getDateOnly(activity.activity_date));
        existing.paceSum += Number(activity.pace_min_per_km) || 0;
        existing.activityCount += 1;
        rowsById.set(regId, existing);
      });

      const rows: FamilyRankRow[] = Array.from(rowsById.entries()).map(([registrationId, row]) => ({
        registrationId,
        distance: row.distance,
        activeDays: row.activeDays.size,
        averagePace: row.activityCount > 0 ? row.paceSum / row.activityCount : 0,
      }));

      const sorted = rows.sort((a, b) => b.distance - a.distance || b.activeDays - a.activeDays || a.averagePace - b.averagePace);
      const userIndex = sorted.findIndex((row) => row.registrationId === ownerRegistrationId);
      if (userIndex === -1 || sorted[userIndex].distance <= 0) return null;

      return {
        label: "Family",
        currentRank: userIndex + 1,
        totalParticipants: sorted.length,
        metricLabel: "Distance",
        metricValue: `${sorted[userIndex].distance.toFixed(1)} km`,
      };
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const communityRanking = useMemo(() => {
    if (!communityRankData || !user?.id) return null;
    const sorted = [...communityRankData].sort((a, b) => {
      const distDiff = b.AvgDistance - a.AvgDistance;
      if (distDiff !== 0) return distDiff;
      const daysDiff = b.ActiveDays - a.ActiveDays;
      if (daysDiff !== 0) return daysDiff;
      return a.AveragePace - b.AveragePace;
    });
    const userIndex = sorted.findIndex((item) => item.registrationId === user.id);
    if (userIndex === -1) return null;
    const currentRank = userIndex + 1;
    const totalParticipants = sorted.length;
    const userData = sorted[userIndex];
    return {
      currentRank,
      totalParticipants,
      name: userData.Name,
      avgDistance: userData.AvgDistance,
      activeDays: userData.ActiveDays,
      avgPace: userData.AveragePace,
    };
  }, [communityRankData, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const loadPreviousRank = async () => {
      try {
        const stored = await AsyncStorage.getItem(`community_rank_${user.id}`);
        if (stored) {
          const parsed = JSON.parse(stored) as StoredRankSnapshot;
          console.log("[Goals] Loaded previous rank:", parsed);
          setPreviousRank(parsed);
        }
      } catch (error) {
        console.error("[Goals] Error loading previous rank:", error);
      }
    };
    void loadPreviousRank();
  }, [user?.id]);

  useEffect(() => {
    if (!communityRanking || !user?.id) return;
    const saveCurrentRank = async () => {
      try {
        const now = new Date();
        const todayKey = now.toISOString().split("T")[0];
        const previousStored = await AsyncStorage.getItem(`community_rank_${user.id}`);
        if (previousStored) {
          const parsed = JSON.parse(previousStored) as StoredRankSnapshot;
          const storedDate = parsed.timestamp.split("T")[0];
          if (storedDate === todayKey) {
            return;
          }
          setPreviousRank(parsed);
        }
        const snapshot: StoredRankSnapshot = {
          rank: communityRanking.currentRank,
          totalParticipants: communityRanking.totalParticipants,
          timestamp: now.toISOString(),
        };
        await AsyncStorage.setItem(`community_rank_${user.id}`, JSON.stringify(snapshot));
        console.log("[Goals] Saved rank snapshot:", snapshot);
      } catch (error) {
        console.error("[Goals] Error saving rank snapshot:", error);
      }
    };
    void saveCurrentRank();
  }, [communityRanking, user?.id]);

  const rankChange = useMemo(() => {
    if (!communityRanking || !previousRank) return null;
    const diff = previousRank.rank - communityRanking.currentRank;
    return {
      diff,
      isImproving: diff > 0,
      isDeclining: diff < 0,
      isSame: diff === 0,
      previousRank: previousRank.rank,
      lastChecked: previousRank.timestamp,
    };
  }, [communityRanking, previousRank]);

  const communityActivityRankSummary = useMemo<RankSummary | null>(() => {
    if (!communityRanking) return null;
    return {
      label: "Activity",
      currentRank: communityRanking.currentRank,
      totalParticipants: communityRanking.totalParticipants,
      metricLabel: "Avg km/day",
      metricValue: communityRanking.avgDistance.toFixed(1),
    };
  }, [communityRanking]);

  const { data: medalGoalData, isLoading: medalGoalLoading, refetch: refetchMedalGoal } = useQuery<MedalGoalData | null>({
    queryKey: ["medalGoalData", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      try {
        const { data: allEvents, error: eventsError } = await supabase
          .from("events")
          .select("event_id, event_name, starts_at, ends_at, medal_min_cumulative_distance, medal_date_start, medal_date_end");
        if (eventsError) {
          console.error("[Goals] Medal goal - events fetch error:", JSON.stringify(eventsError));
          return null;
        }
        if (!allEvents || allEvents.length === 0) return null;

        const { data: participantData, error: partError } = await supabase
          .from("events_participants")
          .select("event_id")
          .eq("registration_id", user.id);
        if (partError) {
          console.error("[Goals] Medal goal - participants fetch error:", JSON.stringify(partError));
          return null;
        }

        const enrolledEventIds = new Set((participantData || []).map((p: any) => p.event_id));
        const totalEvents = allEvents.length;
        const enrolledEvents = enrolledEventIds.size;

        let medalsEarned = 0;
        const eventsDetail: MedalGoalData["events"] = [];

        for (const event of allEvents) {
          const isEnrolled = enrolledEventIds.has(event.event_id);
          let isOnMedalList = false;

          if (isEnrolled) {
            const medalStart = event.medal_date_start || event.starts_at;
            const medalEnd = event.medal_date_end || event.ends_at;

            if (medalStart && event.medal_min_cumulative_distance) {
              const { data: acts } = await supabase
                .from("activities")
                .select("distance_km")
                .eq("registration_id", user.id)
                .gte("activity_date", medalStart)
                .lte("activity_date", medalEnd);

              const totalDist = (acts || []).reduce((sum: number, a: any) => sum + (a.distance_km || 0), 0);
              isOnMedalList = totalDist >= event.medal_min_cumulative_distance;
            } else if (isEnrolled && !event.medal_min_cumulative_distance) {
              isOnMedalList = true;
            }

            if (isOnMedalList) medalsEarned++;
          }

          eventsDetail.push({
            eventName: event.event_name || "Unnamed Event",
            isEnrolled,
            isOnMedalList,
          });
        }

        const enrollmentRatio = totalEvents > 0 ? (enrolledEvents / totalEvents) * 100 : 0;
        const medalRatio = enrolledEvents > 0 ? (medalsEarned / enrolledEvents) * 100 : 0;

        console.log("[Goals] Medal goal data:", { totalEvents, enrolledEvents, medalsEarned, enrollmentRatio, medalRatio });
        return { totalEvents, enrolledEvents, medalsEarned, enrollmentRatio, medalRatio, events: eventsDetail };
      } catch (error) {
        console.error("[Goals] Medal goal query failed:", JSON.stringify(error));
        return null;
      }
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const { data: communityMedalRanking, isLoading: communityMedalRankLoading, refetch: refetchCommunityMedalRank } = useQuery<RankSummary | null>({
    queryKey: ["goalCommunityMedalRank", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const now = new Date();
      const currentYear = now.getFullYear();
      const yearStart = `${currentYear}-01-01`;
      const yearEnd = `${currentYear}-12-31`;
      const todayIso = now.toISOString().slice(0, 10);
      const yesterdayIso = addDaysIso(todayIso, -1);

      const { data: events, error: eventsError } = await supabase
        .from("events")
        .select("event_id, starts_at, ends_at, has_medal, approval_status, available_distances_km, medal_min_daily_distance, medal_min_cumulative_distance, medal_date_start, medal_date_end")
        .eq("has_medal", true)
        .eq("approval_status", "approved")
        .gte("ends_at", yearStart)
        .lte("starts_at", yearEnd);
      if (eventsError) throw eventsError;

      const eventIds = (events || []).map((event: any) => event.event_id).filter(Boolean);
      if (eventIds.length === 0) return null;

      const { data: participants, error: participantsError } = await supabase
        .from("events_participants")
        .select("event_id, registration_id, distance_km")
        .in("event_id", eventIds);
      if (participantsError) throw participantsError;

      const rawRegistrationIds = Array.from(new Set((participants || []).map((participant: any) => participant.registration_id).filter(Boolean)));
      if (rawRegistrationIds.length === 0) return null;

      const resolvedRegistrationIds = await resolveCanonicalRegistrationIds([...rawRegistrationIds, user.id]);
      const userCanonicalId = resolvedRegistrationIds.get(user.id) || user.id;
      const canonicalRegistrationIds = Array.from(new Set(rawRegistrationIds.map((id) => resolvedRegistrationIds.get(id) || id).filter(Boolean)));
      const activityLookupIds = Array.from(new Set([...rawRegistrationIds, ...canonicalRegistrationIds]));

      const [{ data: registrations, error: registrationError }, { data: activities, error: activityError }] = await Promise.all([
        supabase
          .from("registrations")
          .select("registration_id, dob, has_disability, para_uses_equipment")
          .in("registration_id", canonicalRegistrationIds),
        supabase
          .from("activities")
          .select("registration_id, activity_date, distance_km")
          .in("registration_id", activityLookupIds)
          .gte("activity_date", yearStart)
          .lte("activity_date", todayIso),
      ]);
      if (registrationError) throw registrationError;
      if (activityError) throw activityError;

      const registrationMap = new Map((registrations || []).map((registration: any) => [registration.registration_id, registration]));
      const eventMap = new Map((events || []).map((event: any) => [event.event_id, event]));
      const activityDistanceByRegDate = new Map<string, number>();
      (activities || []).forEach((activity: any) => {
        const canonicalId = resolvedRegistrationIds.get(activity.registration_id) || activity.registration_id;
        const activityDate = getDateOnly(activity.activity_date);
        if (!canonicalId || !activityDate) return;
        const key = `${canonicalId}:${activityDate}`;
        activityDistanceByRegDate.set(key, (activityDistanceByRegDate.get(key) || 0) + (Number(activity.distance_km) || 0));
      });

      const rowsByRegistration = new Map<string, MedalRankRow>();
      (participants || []).forEach((participant: any) => {
        const event = eventMap.get(participant.event_id);
        const canonicalId = resolvedRegistrationIds.get(participant.registration_id) || participant.registration_id;
        const registration = registrationMap.get(canonicalId);
        if (!event || !canonicalId || !registration) return;
        if (isJuniorAge(registration.dob) || usesParaEquipment(registration)) return;

        const medalStart = getDateOnly(event.medal_date_start) || getDateOnly(event.starts_at);
        const medalEnd = getDateOnly(event.medal_date_end) || getDateOnly(event.ends_at);
        const participantDistance = Number(participant.distance_km) || 0;
        const minDailyDistance = Number(event.medal_min_daily_distance) || 0;
        const minCumulativeDistance = Number(event.medal_min_cumulative_distance) || 0;

        let totalDistance = participantDistance;
        let qualified = participantDistance > 0 && (minDailyDistance <= 0 || participantDistance >= minDailyDistance);
        if (medalStart && medalEnd) {
          const cutoff = minIsoDate(medalEnd, medalEnd < todayIso ? medalEnd : yesterdayIso);
          if (cutoff >= medalStart) {
            totalDistance = 0;
            let dailyQualified = true;
            let cursor = medalStart;
            while (cursor <= cutoff) {
              const dayDistance = activityDistanceByRegDate.get(`${canonicalId}:${cursor}`) || 0;
              totalDistance += dayDistance;
              if (minDailyDistance > 0 && dayDistance < minDailyDistance) dailyQualified = false;
              cursor = addDaysIso(cursor, 1);
            }
            qualified = dailyQualified && (minCumulativeDistance <= 0 || totalDistance >= minCumulativeDistance);
          }
        }
        if (!qualified) return;

        const band = getMedalBandForCompletedDistance(totalDistance, event.available_distances_km);
        if (!band) return;

        const existing = rowsByRegistration.get(canonicalId) || { registrationId: canonicalId, totalMedals: 0, points: 0 };
        existing.totalMedals += 1;
        existing.points += band.points;
        rowsByRegistration.set(canonicalId, existing);
      });

      const sorted = Array.from(rowsByRegistration.values()).sort((a, b) => b.points - a.points || b.totalMedals - a.totalMedals);
      const userIndex = sorted.findIndex((row) => row.registrationId === userCanonicalId);
      if (userIndex === -1) return null;
      const userRow = sorted[userIndex];

      return {
        label: "Medals",
        currentRank: userIndex + 1,
        totalParticipants: sorted.length,
        metricLabel: "Medals",
        metricValue: `${userRow.totalMedals} earned`,
      };
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const communityGoalRanks = useMemo(
    () => [familyRanking, communityActivityRankSummary, communityMedalRanking].filter(Boolean) as RankSummary[],
    [communityActivityRankSummary, communityMedalRanking, familyRanking]
  );

  const { data: eventGoals = [], refetch: refetchEvents } = useQuery<RegisteredEvent[]>({
    queryKey: ["goalEvents", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        const { data: participantData } = await supabase
          .from("events_participants")
          .select("event_id")
          .eq("registration_id", user.id);

        if (!participantData || participantData.length === 0) return [];

        const eventIds = participantData.map((p: any) => p.event_id);
        const { data: eventsData } = await supabase
          .from("events")
          .select("event_id, event_name, starts_at, ends_at, medal_min_daily_distance, medal_min_cumulative_distance, medal_date_start, medal_date_end")
          .in("event_id", eventIds);

        if (!eventsData) return [];

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const results: RegisteredEvent[] = await Promise.all(
          eventsData.map(async (event: any) => {
            const startDate = new Date(event.starts_at);
            const endDate = new Date(event.ends_at);
            let status: RegisteredEvent["status"] = "upcoming";
            if (today >= startDate && today <= endDate) status = "ongoing";
            else if (today > endDate) status = "completed";

            let currentDistance = 0;
            const medalStart = event.medal_date_start || event.starts_at;
            const medalEnd = event.medal_date_end || event.ends_at;

            if (medalStart) {
              const { data: acts } = await supabase
                .from("activities")
                .select("distance_km")
                .eq("registration_id", user.id)
                .gte("activity_date", medalStart)
                .lte("activity_date", medalEnd);

              currentDistance = (acts || []).reduce((sum: number, a: any) => sum + (a.distance_km || 0), 0);
            }

            let isOnMedalList = true;
            if (event.medal_min_cumulative_distance && currentDistance < event.medal_min_cumulative_distance) {
              isOnMedalList = false;
            }

            return {
              eventId: event.event_id,
              eventName: event.event_name || "Unnamed Event",
              startsAt: event.starts_at,
              endsAt: event.ends_at,
              isOnMedalList,
              status,
              medal_min_daily_distance: event.medal_min_daily_distance,
              medal_min_cumulative_distance: event.medal_min_cumulative_distance,
              currentDistance,
            };
          })
        );

        return results;
      } catch (error) {
        console.error("[Goals] Event goals fetch error:", JSON.stringify(error));
        return [];
      }
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const isRefreshing = goalsLoading;

  const handleRefresh = () => {
    void refetchGoals();
    void refetchWeightTarget();
    void refetchWeightEntries();
    void refetchActivity();
    void refetchEvents();
    void refetchFitnessGoal();
    void refetchDailyRunGoal();
    void refetchDailyRunActivities();
    void refetchRecent();
    void refetchHealthDurationActivities();
    void refetchHealth();
    void refetchSmartFitGoalRank();
    void refetchHabit();
    void refetchCommunityRank();
    void refetchFamilyRank();
    void refetchMedalGoal();
    void refetchCommunityMedalRank();
  };

  const dailyRunProgress = useMemo(() => {
    if (!dailyRunGoal) return null;

    const start = new Date(dailyRunGoal.start_date + "T00:00:00");
    const end = new Date(dailyRunGoal.end_date + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return null;

    const runDateSet = new Set(
      dailyRunActivities
        .map((activity) => String(activity.activity_date || "").split("T")[0])
        .filter(Boolean)
    );
    const days = [];
    const iter = new Date(start);
    while (iter <= end) {
      const date = iter.toISOString().split("T")[0];
      const isFuture = iter > today;
      const hasRun = runDateSet.has(date);
      days.push({ date, day: iter.getDate(), isFuture, hasRun });
      iter.setDate(iter.getDate() + 1);
    }

    const runDays = days.filter((day) => day.hasRun).length;
    const elapsedDays = days.filter((day) => !day.isFuture).length;
    const totalDays = days.length;
    const scorePercent = elapsedDays > 0 ? Math.round((runDays / elapsedDays) * 100) : 0;
    const missedDays = days.filter((day) => !day.isFuture && !day.hasRun).length;
    const targetRunsToDate = elapsedDays > 0 ? Math.ceil((elapsedDays * dailyRunGoal.target_percent) / 100) : 0;

    return {
      totalDays,
      runDays,
      elapsedDays,
      missedDays,
      scorePercent,
      targetPercent: dailyRunGoal.target_percent,
      targetRunsToDate,
      isOnTrack: runDays >= targetRunsToDate,
      days,
    };
  }, [dailyRunActivities, dailyRunGoal]);

  const openDailyRunGoalForm = useCallback(() => {
    if (dailyRunGoal) {
      setDailyRunStartDateInput(dailyRunGoal.start_date);
      setDailyRunEndDateInput(dailyRunGoal.end_date);
      setDailyRunTargetInput(dailyRunGoal.target_percent.toString());
    } else {
      setDailyRunStartDateInput("");
      setDailyRunEndDateInput("");
      setDailyRunTargetInput("");
    }
    setShowDailyRunGoalForm(true);
  }, [dailyRunGoal]);

  const handleSaveDailyRunGoal = useCallback(() => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dailyRunStartDateInput) || !dateRegex.test(dailyRunEndDateInput)) {
      Alert.alert("Error", "Please enter dates in YYYY-MM-DD format");
      return;
    }
    const start = new Date(dailyRunStartDateInput + "T00:00:00");
    const end = new Date(dailyRunEndDateInput + "T00:00:00");
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      Alert.alert("Error", "Please enter valid dates");
      return;
    }
    if (end < start) {
      Alert.alert("Error", "End date must be after start date");
      return;
    }
    const targetPercent = parseFloat(dailyRunTargetInput);
    if (isNaN(targetPercent) || targetPercent < 1 || targetPercent > 100) {
      Alert.alert("Error", "Target percentage must be between 1 and 100");
      return;
    }
    saveDailyRunGoalMutation.mutate({
      startDate: dailyRunStartDateInput,
      endDate: dailyRunEndDateInput,
      targetPercent,
    });
  }, [dailyRunEndDateInput, dailyRunStartDateInput, dailyRunTargetInput, saveDailyRunGoalMutation]);

  const weightProgress = useMemo(() => {
    if (!weightTargetGoal) return null;

    const target = weightTargetGoal.target_weight;
    const targetDateStr = weightTargetGoal.target_date;

    const latestEntry = weightEntries.length > 0 ? weightEntries[weightEntries.length - 1] : null;
    const firstEntry = weightEntries.length > 0 ? weightEntries[0] : null;
    const current = latestEntry?.weight ?? null;
    const activityDistance = activitySummary?.totalDistance || 0;
    const activityHours = (activitySummary?.totalTime || 0) / 60;
    const activityDays = activitySummary?.activeDays || 0;

    if (current === null) {
      return {
        current: null,
        target,
        targetDate: targetDateStr,
        diff: 0,
        isLosing: true,
        progressPercent: 0,
        entries: weightEntries,
        firstEntry,
        latestEntry,
        daysLeft: 0,
        lostSoFar: 0,
        activityDistance,
        activityHours,
        activityDays,
        lossPerKm: null,
        lossPerHour: null,
        lossPerDay: null,
      };
    }

    const startWeight = firstEntry?.weight ?? current;
    const totalToLose = startWeight - target;
    const lostSoFar = startWeight - current;
    const isLosing = current > target;
    const progressPercent = totalToLose > 0
      ? Math.min(100, Math.max(0, (lostSoFar / totalToLose) * 100))
      : current <= target ? 100 : 0;

    const daysLeft = Math.max(0, Math.ceil((new Date(targetDateStr + "T00:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    const effectiveLoss = Math.max(0, lostSoFar);

    return {
      current,
      target,
      targetDate: targetDateStr,
      diff: Math.abs(current - target),
      isLosing,
      progressPercent,
      entries: weightEntries,
      firstEntry,
      latestEntry,
      daysLeft,
      lostSoFar: effectiveLoss,
      activityDistance,
      activityHours,
      activityDays,
      lossPerKm: activityDistance > 0 ? effectiveLoss / activityDistance : null,
      lossPerHour: activityHours > 0 ? effectiveLoss / activityHours : null,
      lossPerDay: activityDays > 0 ? effectiveLoss / activityDays : null,
    };
  }, [activitySummary, weightTargetGoal, weightEntries]);

  const handleSaveWeightTarget = useCallback(() => {
    const weight = parseFloat(weightTargetInput);
    if (isNaN(weight) || weight <= 0 || weight > 500) {
      Alert.alert("Error", "Please enter a valid target weight (1-500 kg)");
      return;
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(weightTargetDateInput)) {
      Alert.alert("Error", "Please enter date in YYYY-MM-DD format");
      return;
    }
    const dateObj = new Date(weightTargetDateInput + "T00:00:00");
    if (isNaN(dateObj.getTime())) {
      Alert.alert("Error", "Please enter a valid date");
      return;
    }
    saveWeightTargetMutation.mutate({ targetWeight: weight, targetDateStr: weightTargetDateInput });
  }, [weightTargetInput, weightTargetDateInput, saveWeightTargetMutation]);

  const handleLogWeight = useCallback(() => {
    const weight = parseFloat(weightLogInput);
    if (isNaN(weight) || weight <= 0 || weight > 500) {
      Alert.alert("Error", "Please enter a valid weight (1-500 kg)");
      return;
    }
    logWeightMutation.mutate({ weight });
  }, [weightLogInput, logWeightMutation]);

  const openEditWeightTarget = useCallback(() => {
    if (weightTargetGoal) {
      setWeightTargetInput(weightTargetGoal.target_weight.toString());
      setWeightTargetDateInput(weightTargetGoal.target_date);
    } else {
      setWeightTargetInput("");
      setWeightTargetDateInput("");
    }
    setShowWeightTargetForm(true);
  }, [weightTargetGoal]);

  const formatGoalDate = (dateString: string): string => {
    const date = new Date(dateString + "T00:00:00");
    const day = date.getDate();
    const month = date.toLocaleDateString("en-US", { month: "short" });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const ongoingEvents = eventGoals.filter((e) => e.status === "ongoing");

  const openEditGoalForm = useCallback(() => {
    if (fitnessGoal) {
      const minPerKm = normalizePaceMinPerKm(fitnessGoal.target_pace_min_per_km);
      const mins = Math.floor(minPerKm);
      const secs = Math.round((minPerKm - mins) * 60);
      setTargetPaceMin(mins.toString());
      setTargetPaceSec(secs.toString().padStart(2, "0"));
      setTargetDate(fitnessGoal.target_date);
    } else {
      setTargetPaceMin("");
      setTargetPaceSec("");
      setTargetDate("");
    }
    setShowGoalForm(true);
  }, [fitnessGoal]);

  const hasNoGoals = userGoals.length === 0 && !weightTargetGoal && ongoingEvents.length === 0 && !fitnessGoal && !dailyRunGoal && !fitnessGoalLoading && !dailyRunGoalLoading && !weightTargetLoading && healthEntries.length === 0 && !healthLoading && !habitDeclaration && !habitDeclarationLoading && communityGoalRanks.length === 0 && !communityRankLoading && !familyRankLoading && !communityMedalRankLoading && !medalGoalData && !medalGoalLoading;
  const hasRunningGoal = !!dailyRunGoal || !!habitDeclaration;
  const selectedGoalKeys = useMemo(() => {
    const keys = new Set<string>();
    userGoals.forEach((goal) => {
      const key = goalNameToKey(goal.goal);
      if (key) {
        keys.add(key);
      }
    });
    return keys;
  }, [goalNameToKey, userGoals]);
  const hasSelectedGoal = useCallback((goalKey: string): boolean => selectedGoalKeys.has(goalKey), [selectedGoalKeys]);

  const allGoalTypesMap = useMemo(() => {
    const map: Record<string, { key: string; label: string; isTracked: boolean; icon: "zap" | "calendar" | "scale" | "heart" | "flame" | "trophy" | "users"; overview: string; measuredBy: string }> = {
      fitness: {
        key: "fitness",
        label: "Improve Fitness",
        isTracked: !!fitnessGoal,
        icon: "zap",
        overview: "Set a target pace and date, then compare it with the pace you actually run.",
        measuredBy: "Measured by target pace against your average pace and the average pace from your last 3 runs.",
      },
      dailyRun: {
        key: "dailyRun",
        label: "Keep active",
        isTracked: hasRunningGoal,
        icon: "calendar",
        overview: "This keeps the goal simple: decide how often you want to run, then check whether you are keeping that commitment.",
        measuredBy: "Measured by actual run days between the start date and today against the target runs expected by today.",
      },
      weight: {
        key: "weight",
        label: "Weight Loss",
        isTracked: !!weightTargetGoal,
        icon: "scale",
        overview: "This is linked to the Weight Loss Club and focuses on actual weight change plus the effort behind it.",
        measuredBy: "Measured by actual weight loss, workout efficiency per 100 km or 100 hours, and future Weight Loss community ranking.",
      },
      health: {
        key: "health",
        label: "General Health",
        isTracked: healthEntries.length > 0,
        icon: "heart",
        overview: "Track Your Health uses smartwatch-style readings to show whether your daily movement is improving.",
        measuredBy: "Measured by average steps per day and health score. SmartFit Club rankings appear under Reports > My Club.",
      },
      medals: {
        key: "medals",
        label: "Earn Medals",
        isTracked: (!!medalGoalData && medalGoalData.enrolledEvents > 0) || !!communityMedalRanking,
        icon: "trophy",
        overview: "Earn Medals follows your medal race participation and how many medals you actually earn.",
        measuredBy: "Measured by medal races enrolled as a share of eligible local medal races, medals earned against yearly target, and future Community Medals ranking.",
      },
      community: {
        key: "community",
        label: "Compete in Community",
        isTracked: communityGoalRanks.length > 0,
        icon: "users",
        overview: "Compete in Community brings together rankings from the clubs and community tables you belong to.",
        measuredBy: "Measured by available community and club rankings from your memberships.",
      },
    };
    return map;
  }, [communityGoalRanks.length, communityMedalRanking, fitnessGoal, hasRunningGoal, healthEntries, medalGoalData, weightTargetGoal]);

  const allGoalTypes = useMemo(() => {
    const goalKeys = orderedGoalKeys.filter(k => k !== "events");
    return goalKeys.map(k => allGoalTypesMap[k]).filter(Boolean);
  }, [orderedGoalKeys, allGoalTypesMap]);

  const trackedGoals = useMemo(() => allGoalTypes.filter(g => hasSelectedGoal(g.key)), [allGoalTypes, hasSelectedGoal]);
  const untrackedGoals = useMemo(() => allGoalTypes.filter(g => !hasSelectedGoal(g.key)), [allGoalTypes, hasSelectedGoal]);
  const trackedGoalsCount = trackedGoals.length;
  const hasGoalScore = useCallback((goalKey: string): boolean => {
    if (goalKey === "fitness") return !!fitnessGoal;
    if (goalKey === "dailyRun") return hasRunningGoal;
    if (goalKey === "weight") return !!weightTargetGoal;
    if (goalKey === "health") return healthEntries.length > 0;
    if (goalKey === "medals") return !!medalGoalData || !!communityMedalRanking;
    if (goalKey === "community") return communityGoalRanks.length > 0;
    if (goalKey === "events") return ongoingEvents.length > 0;
    return false;
  }, [communityGoalRanks.length, communityMedalRanking, fitnessGoal, hasRunningGoal, healthEntries.length, medalGoalData, ongoingEvents.length, weightTargetGoal]);
  const goalsSubPages: { key: GoalsSubPage; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "set", label: "Set Goals" },
    { key: "scorecard", label: "Score Card" },
  ];
  const openGoalSetup = useCallback((goalKey: string) => {
    if (goalKey === "dailyRun") {
      openDailyRunGoalForm();
      return;
    }
    if (goalKey === "fitness") {
      openEditGoalForm();
      return;
    }
    if (goalKey === "weight") {
      openEditWeightTarget();
      return;
    }
    if (goalKey === "health") {
      setShowHealthForm(true);
      return;
    }
    if (goalKey === "medals") {
      router.push("/events" as any);
      return;
    }
    setActiveGoalsPage("set");
  }, [openDailyRunGoalForm, openEditGoalForm, openEditWeightTarget, router]);
  const renderTrainingPlanCard = () => {
    if (habitDeclaration) {
      return (
        <View style={[styles.habitCard, styles.combinedHabitCard]}>
          <View style={styles.habitDeclarationRow}>
            <Text style={styles.habitDeclarationText}>
              I <Text style={styles.habitHighlight}>{habitDeclaration.activity_type}</Text>{" "}
              <Text style={styles.habitHighlight}>{habitDeclaration.target_amount}</Text>{" "}
              <Text style={styles.habitHighlight}>{habitDeclaration.unit}</Text>{" "}
              <Text style={styles.habitHighlight}>{habitDeclaration.frequency}</Text>
            </Text>
          </View>

          <View style={styles.habitDateRow}>
            <Calendar size={14} color={colors.textSecondary} />
            <Text style={styles.habitDateText}>Since {formatGoalDate(habitDeclaration.start_date)}</Text>
          </View>

          {habitCommitment ? (
            <>
              <View style={styles.habitCommitmentHeader}>
                <View style={[styles.habitCommitmentPill, { backgroundColor: getCommitmentColor(habitCommitment.percent) + "18" }]}>
                  <Text style={[styles.habitCommitmentPillText, { color: getCommitmentColor(habitCommitment.percent) }]}>
                    {getCommitmentLabel(habitCommitment.percent)}
                  </Text>
                </View>
              </View>
              <View style={styles.fitnessProgressSection}>
                <View style={styles.fitnessProgressInfo}>
                  <Text style={styles.fitnessProgressLabel}>Training plan commitment</Text>
                  <Text style={styles.fitnessProgressPercent}>{habitCommitment.percent}%</Text>
                </View>
                <View style={styles.fitnessProgressTrack}>
                  <LinearGradient
                    colors={habitCommitment.percent >= 70 ? ["#0D9488", "#14B8A6"] : habitCommitment.percent >= 40 ? ["#F59E0B", "#FBBF24"] : ["#EF4444", "#F87171"]}
                    style={[styles.fitnessProgressFill, { width: `${Math.max(2, habitCommitment.percent)}%` }]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  />
                </View>
              </View>
              <Text style={styles.habitCommitmentDetail}>
                {habitCommitment.periodsMet} of {habitCommitment.periodsElapsed} {getFrequencyPeriodLabel(habitDeclaration.frequency)} met
              </Text>
            </>
          ) : (
            <View style={styles.noActivitiesInfo}>
              <Flame size={24} color={colors.textLight} />
              <Text style={styles.noActivitiesText}>Start logging activities to track your training progress</Text>
            </View>
          )}
        </View>
      );
    }

    if (activeGoalsPage === "scorecard" || habitDeclarationLoading) return null;

    return (
      <TouchableOpacity style={[styles.setupGoalCard, styles.combinedHabitCard]} onPress={openEditHabit} activeOpacity={0.8}>
        <LinearGradient colors={["#0D9488", "#14B8A6"]} style={styles.setupGoalGradient}>
          <Flame size={32} color={colors.white} />
          <Text style={styles.setupGoalTitle}>Add planned runs</Text>
          <Text style={styles.setupGoalSubtext}>Declare a training amount and track consistency under Keep active.</Text>
          <View style={styles.setupGoalButton}>
            <Text style={[styles.setupGoalButtonText, { color: "#0D9488" }]}>Set planned runs</Text>
            <ChevronRight size={16} color="#0D9488" />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  if (!isSubscribed) {
    return (
      <SubscriptionGate featureName="Goals">
        <></>
      </SubscriptionGate>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim, backgroundColor: themeColors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        <View style={styles.streakSection}>
          <LinearGradient colors={["#FF6B35", "#FF8C42"]} style={styles.streakCard}>
            <View style={styles.streakTop}>
              <Text style={styles.streakNumber}>{trackedGoalsCount}</Text>
              <Text style={styles.streakLabel}>{trackedGoalsCount === 1 ? "Goal Being Tracked" : "Goals Being Tracked"}</Text>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.goalsPageTabs}>
          {goalsSubPages.map((page) => (
            <TouchableOpacity
              key={page.key}
              style={[styles.goalsPageTab, activeGoalsPage === page.key && styles.goalsPageTabActive]}
              onPress={() => setActiveGoalsPage(page.key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.goalsPageTabText, activeGoalsPage === page.key && styles.goalsPageTabTextActive]}>
                {page.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeGoalsPage === "overview" && (
          <>
            <View style={styles.section}>
              <View style={styles.compactOverviewCard}>
                <Text style={styles.compactOverviewTitle}>Goals are simple progress markers.</Text>
                <Text style={styles.compactOverviewText}>
                  Pick the areas you care about, then RunNation measures them from your runs, events, health logs, or weight entries. Score Card is where the detailed numbers live.
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.compactSectionTitle}>Goals Being Tracked</Text>
              {trackedGoals.length > 0 ? (
                <View style={styles.overviewList}>
                  {trackedGoals.map((goal) => (
                    <View key={`tracked-${goal.key}`} style={styles.overviewGoalRow}>
                      <View style={styles.overviewGoalInfo}>
                        <Text style={styles.overviewGoalTitle}>{goal.label}</Text>
                        <Text style={styles.overviewGoalText}>{goal.overview}</Text>
                        <Text style={styles.overviewMeasuredText}>{goal.measuredBy}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.overviewEmptyText}>No goals are being tracked yet.</Text>
              )}
            </View>

            {untrackedGoals.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.compactSectionTitle}>Goals Not Selected</Text>
                <View style={styles.overviewList}>
                  {untrackedGoals.map((goal) => (
                    <View key={`untracked-${goal.key}`} style={styles.overviewGoalRow}>
                      <View style={styles.overviewGoalInfo}>
                        <Text style={styles.overviewGoalTitle}>{goal.label}</Text>
                        <Text style={styles.overviewGoalText}>{goal.overview}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.overviewStartButton}
                        onPress={() => openGoalSetup(goal.key)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.overviewStartButtonText}>Start</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {activeGoalsPage === "set" && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Target size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Set Goals</Text>
            </View>
            <View style={styles.setGoalsGrid}>
              {hasSelectedGoal("dailyRun") && (
                <TouchableOpacity style={styles.setGoalActionCard} onPress={openDailyRunGoalForm} activeOpacity={0.85}>
                  <Calendar size={22} color="#0EA5E9" />
                  <View style={styles.setGoalActionInfo}>
                    <Text style={styles.setGoalActionTitle}>Keep active</Text>
                    <Text style={styles.setGoalActionText}>
                      {dailyRunGoal ? "Update your running days target." : "Set your running days target."}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.textLight} />
                </TouchableOpacity>
              )}

              {hasSelectedGoal("dailyRun") && (
                <TouchableOpacity
                  style={styles.setGoalActionCard}
                  onPress={() => {
                    openEditHabit();
                  }}
                  activeOpacity={0.85}
                >
                  <Flame size={22} color="#0D9488" />
                  <View style={styles.setGoalActionInfo}>
                    <Text style={styles.setGoalActionTitle}>Have planned runs</Text>
                    <Text style={styles.setGoalActionText}>
                      {habitDeclaration ? "Update your planned runs declaration." : "Add planned runs to this goal."}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.textLight} />
                </TouchableOpacity>
              )}

              {hasSelectedGoal("fitness") && (
                <TouchableOpacity style={styles.setGoalActionCard} onPress={openEditGoalForm} activeOpacity={0.85}>
                  <Zap size={22} color={colors.primary} />
                  <View style={styles.setGoalActionInfo}>
                    <Text style={styles.setGoalActionTitle}>Improve Fitness</Text>
                    <Text style={styles.setGoalActionText}>{fitnessGoal ? "Update your pace target." : "Set a pace target."}</Text>
                  </View>
                  <ChevronRight size={16} color={colors.textLight} />
                </TouchableOpacity>
              )}

              {hasSelectedGoal("weight") && (
                <TouchableOpacity style={styles.setGoalActionCard} onPress={openEditWeightTarget} activeOpacity={0.85}>
                  <Scale size={22} color="#10B981" />
                  <View style={styles.setGoalActionInfo}>
                    <Text style={styles.setGoalActionTitle}>Weight Loss</Text>
                    <Text style={styles.setGoalActionText}>{weightTargetGoal ? "Update your target weight." : "Set a target weight."}</Text>
                  </View>
                  <ChevronRight size={16} color={colors.textLight} />
                </TouchableOpacity>
              )}

              {hasSelectedGoal("health") && (
                <TouchableOpacity style={styles.setGoalActionCard} onPress={() => setShowHealthForm(true)} activeOpacity={0.85}>
                  <Heart size={22} color="#EF4444" />
                  <View style={styles.setGoalActionInfo}>
                    <Text style={styles.setGoalActionTitle}>General Health</Text>
                    <Text style={styles.setGoalActionText}>Log health readings for your score.</Text>
                  </View>
                  <ChevronRight size={16} color={colors.textLight} />
                </TouchableOpacity>
              )}

              {hasSelectedGoal("medals") && (
                <TouchableOpacity style={styles.setGoalActionCard} onPress={() => router.push("/events" as any)} activeOpacity={0.85}>
                  <Trophy size={22} color="#D97706" />
                  <View style={styles.setGoalActionInfo}>
                    <Text style={styles.setGoalActionTitle}>Earn Medals</Text>
                    <Text style={styles.setGoalActionText}>Enroll in eligible races and track medal progress.</Text>
                  </View>
                  <ChevronRight size={16} color={colors.textLight} />
                </TouchableOpacity>
              )}

              {hasSelectedGoal("community") && (
                <TouchableOpacity style={styles.setGoalActionCard} onPress={() => router.push("/activity" as any)} activeOpacity={0.85}>
                  <Users size={22} color="#0EA5E9" />
                  <View style={styles.setGoalActionInfo}>
                    <Text style={styles.setGoalActionTitle}>Compete in Community</Text>
                    <Text style={styles.setGoalActionText}>Review your available community and club rankings.</Text>
                  </View>
                  <ChevronRight size={16} color={colors.textLight} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {orderedGoalKeys.map((goalKey) => {
          if (activeGoalsPage !== "scorecard") return null;
          if (!hasSelectedGoal(goalKey)) return null;
          if (activeGoalsPage === "scorecard" && !hasGoalScore(goalKey)) return null;
          if (goalKey === "fitness") {
            return fitnessGoal && fitnessProgress ? (
              <View key="fitness" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Zap size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>Improve Fitness</Text>
                  <TouchableOpacity onPress={openEditGoalForm} style={styles.editButton} activeOpacity={0.7}>
                    <Text style={styles.editButtonText}>Edit</Text>
                    <ChevronRight size={14} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.fitnessCard}>
                  <View style={styles.paceComparisonRow}>
                    <View style={styles.paceBlock}>
                      <Text style={styles.paceBlockLabel}>Current Avg</Text>
                      <Text style={[styles.paceBlockValue, fitnessProgress.isAhead ? styles.paceGood : styles.paceBehind]}>
                        {formatPaceMinPerKm(fitnessProgress.avgpaceMinPerKm)}
                      </Text>
                      <Text style={styles.paceBlockUnit}>min/km</Text>
                    </View>
                    <View style={styles.paceArrowContainer}>
                      {fitnessProgress.isAhead ? (
                        <View style={styles.statusPillGood}>
                          <TrendingUp size={14} color="#10B981" />
                          <Text style={styles.statusPillTextGood}>On Track</Text>
                        </View>
                      ) : (
                        <View style={styles.statusPillBehind}>
                          <TrendingDown size={14} color="#EF4444" />
                          <Text style={styles.statusPillTextBehind}>Behind</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.paceBlock}>
                      <Text style={styles.paceBlockLabel}>Target</Text>
                      <Text style={styles.paceBlockValueTarget}>
                        {formatPaceMinPerKm(fitnessProgress.targetpaceMinPerKm)}
                      </Text>
                      <Text style={styles.paceBlockUnit}>min/km</Text>
                    </View>
                  </View>

                  <View style={styles.scoreGuideRow}>
                    <View style={styles.scoreGuideItem}>
                      <Text style={styles.scoreGuideValue}>{formatPaceMinPerKm(fitnessProgress.lastThreeAvgpaceMinPerKm)}</Text>
                      <Text style={styles.scoreGuideLabel}>Last 3 runs avg pace</Text>
                    </View>
                    <View style={styles.scoreGuideItem}>
                      <Text style={styles.scoreGuideValue}>{fitnessProgress.lastThreeActivitiesUsed}</Text>
                      <Text style={styles.scoreGuideLabel}>Runs used</Text>
                    </View>
                  </View>

                  <View style={styles.fitnessProgressSection}>
                    <View style={styles.fitnessProgressInfo}>
                      <Text style={styles.fitnessProgressLabel}>Progress</Text>
                      <Text style={styles.fitnessProgressPercent}>{Math.round(fitnessProgress.progressPercent)}%</Text>
                    </View>
                    <View style={styles.fitnessProgressTrack}>
                      <LinearGradient
                        colors={fitnessProgress.isAhead ? ["#10B981", "#34D399"] : ["#F59E0B", "#FBBF24"]}
                        style={[styles.fitnessProgressFill, { width: `${fitnessProgress.progressPercent}%` }]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      />
                    </View>
                  </View>

                  <View style={styles.fitnessMetaRow}>
                    <View style={styles.fitnessMetaItem}>
                      <Clock size={12} color={colors.textSecondary} />
                      <Text style={styles.fitnessMetaText}>
                        {fitnessProgress.daysLeft > 0 ? `${fitnessProgress.daysLeft} days left` : "Target date passed"}
                      </Text>
                    </View>
                    <View style={styles.fitnessMetaItem}>
                      <Calendar size={12} color={colors.textSecondary} />
                      <Text style={styles.fitnessMetaText}>
                        By {formatGoalDate(fitnessGoal.target_date)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.fitnessFootnote}>
                    Target pace is compared with your overall average pace and the average pace of your last 3 runs.
                  </Text>
                </View>
              </View>
            ) : fitnessGoal && recentActivities.length === 0 ? (
              <View key="fitness" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Zap size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>Improve Fitness</Text>
                  <TouchableOpacity onPress={openEditGoalForm} style={styles.editButton} activeOpacity={0.7}>
                    <Text style={styles.editButtonText}>Edit</Text>
                    <ChevronRight size={14} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.fitnessCard}>
                  <View style={styles.noActivitiesInfo}>
                    <Zap size={28} color={colors.textLight} />
                    <Text style={styles.noActivitiesTitle}>No Activities Yet</Text>
                    <Text style={styles.noActivitiesText}>
                      Complete your first activity to start tracking your pace against your target of {formatPaceMinPerKm(fitnessGoal.target_pace_min_per_km)} min/km
                    </Text>
                  </View>
                </View>
              </View>
            ) : !fitnessGoal && !fitnessGoalLoading ? (
              <View key="fitness" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Zap size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>Improve Fitness</Text>
                </View>
                <TouchableOpacity style={styles.setupGoalCard} onPress={openEditGoalForm} activeOpacity={0.8}>
                  <LinearGradient colors={["#FF6B35", "#FF8C42"]} style={styles.setupGoalGradient}>
                    <Zap size={32} color={colors.white} />
                    <Text style={styles.setupGoalTitle}>Set Your Pace Goal</Text>
                    <Text style={styles.setupGoalSubtext}>
                      Track your average pace against a target to improve your fitness over time
                    </Text>
                    <View style={styles.setupGoalButton}>
                      <Text style={styles.setupGoalButtonText}>Get Started</Text>
                      <ChevronRight size={16} color={colors.primary} />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : null;
          }

          if (goalKey === "dailyRun") {
            return dailyRunGoal && dailyRunProgress ? (
              <View key="dailyRun" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Calendar size={18} color="#0EA5E9" />
                  <Text style={styles.sectionTitle}>Keep active</Text>
                  <TouchableOpacity onPress={openDailyRunGoalForm} style={styles.editButton} activeOpacity={0.7}>
                    <Text style={styles.editButtonText}>Edit</Text>
                    <ChevronRight size={14} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.dailyRunCard}>
                  <View style={styles.dailyRunScoreRow}>
                    <View>
                      <Text style={[styles.dailyRunScore, dailyRunProgress.isOnTrack ? styles.paceGood : styles.paceBehind]}>
                        {dailyRunProgress.scorePercent}%
                      </Text>
                      <Text style={styles.dailyRunScoreLabel}>Run days score</Text>
                    </View>
                    <View style={[styles.dailyRunTargetPill, dailyRunProgress.isOnTrack ? styles.statusPillGood : styles.statusPillBehind]}>
                      <Text style={dailyRunProgress.isOnTrack ? styles.statusPillTextGood : styles.statusPillTextBehind}>
                        Target {dailyRunProgress.targetRunsToDate} runs
                      </Text>
                    </View>
                  </View>

                  <View style={styles.communityStatsRow}>
                    <View style={styles.communityStatItem}>
                      <Text style={styles.communityStatValue}>{dailyRunProgress.runDays}</Text>
                      <Text style={styles.communityStatLabel}>Run Days</Text>
                    </View>
                    <View style={styles.communityStatDivider} />
                    <View style={styles.communityStatItem}>
                      <Text style={styles.communityStatValue}>{dailyRunProgress.targetRunsToDate}</Text>
                      <Text style={styles.communityStatLabel}>Target Runs</Text>
                    </View>
                    <View style={styles.communityStatDivider} />
                    <View style={styles.communityStatItem}>
                      <Text style={styles.communityStatValue}>{dailyRunProgress.elapsedDays}</Text>
                      <Text style={styles.communityStatLabel}>Days to Date</Text>
                    </View>
                  </View>

                  <View style={styles.dailyRunCalendarGrid}>
                    {dailyRunProgress.days.map((day) => (
                      <View
                        key={day.date}
                        style={[
                          styles.dailyRunDayCell,
                          day.hasRun && styles.dailyRunDayDone,
                          !day.isFuture && !day.hasRun && styles.dailyRunDayMissed,
                        ]}
                      >
                        <Text style={styles.dailyRunDayNumber}>{day.day}</Text>
                        <Text style={[
                          styles.dailyRunDayMark,
                          day.hasRun && styles.dailyRunDayMarkDone,
                          !day.isFuture && !day.hasRun && styles.dailyRunDayMarkMissed,
                        ]}>
                          {day.isFuture ? "" : day.hasRun ? "✓" : "×"}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <Text style={styles.fitnessFootnote}>
                    Commitment is measured up to today: actual run days compared with the target runs expected by now.
                  </Text>
                </View>
                {renderTrainingPlanCard()}
              </View>
            ) : habitDeclaration ? (
              <View key="dailyRun" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Calendar size={18} color="#0EA5E9" />
                  <Text style={styles.sectionTitle}>Keep active</Text>
                  <TouchableOpacity onPress={openEditHabit} style={styles.editButton} activeOpacity={0.7}>
                    <Text style={styles.editButtonText}>Edit</Text>
                    <ChevronRight size={14} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                {renderTrainingPlanCard()}
                {activeGoalsPage !== "scorecard" && (
                  <TouchableOpacity style={[styles.setupGoalCard, styles.combinedHabitCard]} onPress={openDailyRunGoalForm} activeOpacity={0.8}>
                    <LinearGradient colors={["#0EA5E9", "#38BDF8"]} style={styles.setupGoalGradient}>
                      <Calendar size={32} color={colors.white} />
                      <Text style={styles.setupGoalTitle}>Add Running Days</Text>
                      <Text style={styles.setupGoalSubtext}>
                        Add a date range and run-day target to complete this goal.
                      </Text>
                      <View style={styles.setupGoalButton}>
                        <Text style={[styles.setupGoalButtonText, { color: "#0EA5E9" }]}>Set Running Days</Text>
                        <ChevronRight size={16} color="#0EA5E9" />
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
            ) : !dailyRunGoalLoading ? (
              <View key="dailyRun" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Calendar size={18} color="#0EA5E9" />
                  <Text style={styles.sectionTitle}>Keep active</Text>
                </View>
                <TouchableOpacity style={styles.setupGoalCard} onPress={openDailyRunGoalForm} activeOpacity={0.8}>
                  <LinearGradient colors={["#0EA5E9", "#38BDF8"]} style={styles.setupGoalGradient}>
                    <Calendar size={32} color={colors.white} />
                    <Text style={styles.setupGoalTitle}>Set Your Running Days Goal</Text>
                    <Text style={styles.setupGoalSubtext}>
                      Choose a date range and target percentage, then track daily run consistency.
                    </Text>
                    <View style={styles.setupGoalButton}>
                      <Text style={[styles.setupGoalButtonText, { color: "#0EA5E9" }]}>Get Started</Text>
                      <ChevronRight size={16} color="#0EA5E9" />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
                {renderTrainingPlanCard()}
              </View>
            ) : null;
          }

          if (goalKey === "weight") {
            return weightTargetGoal && weightProgress ? (
              <View key="weight" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Scale size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>Weight Loss</Text>
                  <TouchableOpacity onPress={openEditWeightTarget} style={styles.editButton} activeOpacity={0.7}>
                    <Text style={styles.editButtonText}>Edit</Text>
                    <ChevronRight size={14} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.weightCard}>
                  <View style={styles.weightRow}>
                    <View style={styles.weightItem}>
                      <Text style={[styles.weightValue, weightProgress.current !== null && weightProgress.current <= weightProgress.target ? styles.paceGood : styles.paceBehind]}>
                        {weightProgress.current !== null ? weightProgress.current.toFixed(1) : "--"}
                      </Text>
                      <Text style={styles.weightLabel}>Current (kg)</Text>
                    </View>
                    <View style={styles.weightArrow}>
                      {weightProgress.current !== null && weightProgress.progressPercent >= 50 ? (
                        <View style={styles.statusPillGood}>
                          <TrendingDown size={14} color="#10B981" />
                          <Text style={styles.statusPillTextGood}>On Track</Text>
                        </View>
                      ) : weightProgress.current !== null ? (
                        <View style={styles.statusPillBehind}>
                          <TrendingUp size={14} color="#EF4444" />
                          <Text style={styles.statusPillTextBehind}>Behind</Text>
                        </View>
                      ) : (
                        <Scale size={24} color={colors.textLight} />
                      )}
                    </View>
                    <View style={styles.weightItem}>
                      <Text style={styles.weightValueTarget}>{weightProgress.target.toFixed(1)}</Text>
                      <Text style={styles.weightLabel}>Target (kg)</Text>
                    </View>
                  </View>

                  {weightProgress.current !== null && (
                    <View style={styles.fitnessProgressSection}>
                      <View style={styles.fitnessProgressInfo}>
                        <Text style={styles.fitnessProgressLabel}>Progress</Text>
                        <Text style={styles.fitnessProgressPercent}>{Math.round(weightProgress.progressPercent)}%</Text>
                      </View>
                      <View style={styles.fitnessProgressTrack}>
                        <LinearGradient
                          colors={weightProgress.progressPercent >= 50 ? ["#10B981", "#34D399"] : ["#F59E0B", "#FBBF24"]}
                          style={[styles.fitnessProgressFill, { width: `${weightProgress.progressPercent}%` }]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                        />
                      </View>
                    </View>
                  )}

                  <View style={styles.fitnessMetaRow}>
                    <View style={styles.fitnessMetaItem}>
                      <Clock size={12} color={colors.textSecondary} />
                      <Text style={styles.fitnessMetaText}>
                        {weightProgress.daysLeft > 0 ? `${weightProgress.daysLeft} days left` : "Target date passed"}
                      </Text>
                    </View>
                    <View style={styles.fitnessMetaItem}>
                      <Calendar size={12} color={colors.textSecondary} />
                      <Text style={styles.fitnessMetaText}>
                        By {formatGoalDate(weightProgress.targetDate)}
                      </Text>
                    </View>
                  </View>

                  {weightProgress.current !== null && (
                    <Text style={styles.weightDiff}>
                      {weightProgress.diff.toFixed(1)} kg {weightProgress.isLosing ? "to lose" : "reached target!"}
                    </Text>
                  )}

                  {weightProgress.current !== null && (
                    <View style={styles.weightEffectivenessSection}>
                      <Text style={styles.weightHistoryTitle}>Weight Loss Club Score</Text>
                      <View style={styles.weightEffectivenessGrid}>
                        <View style={styles.weightEffectivenessTile}>
                          <Text style={styles.weightEffectivenessValue}>{weightProgress.lostSoFar.toFixed(1)}</Text>
                          <Text style={styles.weightEffectivenessLabel}>kg lost</Text>
                        </View>
                        <View style={styles.weightEffectivenessTile}>
                          <Text style={styles.weightEffectivenessValue}>
                            {weightProgress.lossPerKm !== null ? (weightProgress.lossPerKm * 100).toFixed(2) : "--"}
                          </Text>
                          <Text style={styles.weightEffectivenessLabel}>kg / 100 km</Text>
                        </View>
                        <View style={styles.weightEffectivenessTile}>
                          <Text style={styles.weightEffectivenessValue}>
                            {weightProgress.lossPerHour !== null ? (weightProgress.lossPerHour * 100).toFixed(2) : "--"}
                          </Text>
                          <Text style={styles.weightEffectivenessLabel}>kg / 100 hrs</Text>
                        </View>
                      </View>
                      <View style={styles.weightEfficiencyRow}>
                        <View style={styles.weightEfficiencyItem}>
                          <Text style={styles.weightEfficiencyValue}>{weightProgress.activityDistance.toFixed(1)}</Text>
                          <Text style={styles.weightEfficiencyLabel}>workout km</Text>
                        </View>
                        <View style={styles.weightEfficiencyItem}>
                          <Text style={styles.weightEfficiencyValue}>{weightProgress.activityHours.toFixed(1)}</Text>
                          <Text style={styles.weightEfficiencyLabel}>workout hrs</Text>
                        </View>
                        <View style={styles.weightEfficiencyItem}>
                          <Text style={styles.weightEfficiencyValue}>Soon</Text>
                          <Text style={styles.weightEfficiencyLabel}>community rank</Text>
                        </View>
                      </View>
                      <Text style={styles.weightEffectivenessHint}>
                        Measures actual weight loss, workout efficiency, and future commitment ranking in the Weight Loss community.
                      </Text>
                    </View>
                  )}

                  {weightProgress.entries.length > 1 && (
                    <View style={styles.weightHistorySection}>
                      <Text style={styles.weightHistoryTitle}>Recent Entries</Text>
                      {weightProgress.entries.slice(-5).reverse().map((entry) => (
                        <View key={entry.id} style={styles.weightHistoryRow}>
                          <Text style={styles.weightHistoryDate}>{formatGoalDate(entry.date)}</Text>
                          <Text style={styles.weightHistoryValue}>{entry.weight.toFixed(1)} kg</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {weightProgress.current === null && (
                    <View style={styles.noActivitiesInfo}>
                      <Scale size={28} color={colors.textLight} />
                      <Text style={styles.noActivitiesTitle}>No Weight Logged Yet</Text>
                      <Text style={styles.noActivitiesText}>
                        Log your first weight entry to start tracking your progress toward {weightProgress.target.toFixed(1)} kg
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.logWeightButton}
                    onPress={() => setShowWeightLogForm(true)}
                    activeOpacity={0.8}
                  >
                    <Plus size={16} color={colors.white} />
                    <Text style={styles.logWeightButtonText}>Log Weight</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : !weightTargetGoal && !weightTargetLoading ? (
              <View key="weight" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Scale size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>Weight Loss</Text>
                </View>
                <TouchableOpacity style={styles.setupGoalCard} onPress={openEditWeightTarget} activeOpacity={0.8}>
                  <LinearGradient colors={["#10B981", "#34D399"]} style={styles.setupGoalGradient}>
                    <Scale size={32} color={colors.white} />
                    <Text style={styles.setupGoalTitle}>Set Your Weight Goal</Text>
                    <Text style={styles.setupGoalSubtext}>
                      Track your weight loss by logging your weight weekly and measuring progress toward your target
                    </Text>
                    <View style={styles.setupGoalButton}>
                      <Text style={[styles.setupGoalButtonText, { color: "#10B981" }]}>Get Started</Text>
                      <ChevronRight size={16} color="#10B981" />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : null;
          }

          if (goalKey === "health") {
            return healthScore ? (
              <View key="health" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Heart size={18} color="#E11D48" />
                  <Text style={styles.sectionTitle}>General Health</Text>
                  <TouchableOpacity onPress={() => setShowHealthForm(true)} style={styles.editButton} activeOpacity={0.7}>
                    <Text style={styles.editButtonText}>Log</Text>
                    <Plus size={14} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.healthCard}>
                  <View style={styles.healthScoreCircleContainer}>
                    <View style={[styles.healthScoreCircle, { borderColor: getHealthScoreColor(healthScore.overall) }]}>
                      <Text style={[styles.healthScoreNumber, { color: getHealthScoreColor(healthScore.overall) }]}>
                        {healthScore.overall}
                      </Text>
                      <Text style={styles.healthScoreOutOf}>/100</Text>
                    </View>
                    <View style={[styles.healthScorePill, { backgroundColor: getHealthScoreColor(healthScore.overall) + "18" }]}>
                      <Text style={[styles.healthScorePillText, { color: getHealthScoreColor(healthScore.overall) }]}>
                        {getHealthScoreLabel(healthScore.overall)}
                      </Text>
                    </View>
                  </View>

                  {smartFitGoalRank && (
                    <View style={styles.goalClubRankRow}>
                      <View style={styles.goalClubRankInfo}>
                        <Text style={styles.goalClubRankLabel}>{smartFitGoalRank.clubName}</Text>
                        <Text style={styles.goalClubRankSubtext}>Age group {smartFitGoalRank.ageGroup} • health score {smartFitGoalRank.healthScore}</Text>
                      </View>
                      <View style={styles.goalClubRankPill}>
                        <Text style={styles.goalClubRankValue}>#{smartFitGoalRank.rank}</Text>
                        <Text style={styles.goalClubRankOf}>of {smartFitGoalRank.totalParticipants}</Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.healthBreakdown}>
                    <View style={styles.healthMetricSummaryHeader}>
                      <Text style={[styles.healthMetricSummaryHeaderText, styles.healthMetricSummaryLabelCell]}>Metric</Text>
                      <Text style={styles.healthMetricSummaryHeaderText}>Recent</Text>
                      <Text style={styles.healthMetricSummaryHeaderText}>Average</Text>
                      <Text style={styles.healthMetricSummaryHeaderText}>Recommended</Text>
                    </View>
                    <View style={styles.healthMetricRow}>
                      <View style={styles.healthMetricNameCell}>
                        <View style={styles.healthMetricIcon}>
                          <Footprints size={16} color="#4A90E2" />
                        </View>
                        <Text style={styles.healthMetricLabel} numberOfLines={1}>Steps</Text>
                      </View>
                      <Text style={styles.healthMetricValue} numberOfLines={1}>{healthScore.steps.recent}</Text>
                      <Text style={styles.healthMetricValue} numberOfLines={1}>{healthScore.steps.avg}</Text>
                      <Text style={styles.healthMetricRecommendedValue} numberOfLines={1}>{healthScore.steps.recommended}</Text>
                    </View>

                    {healthScore.duration && (
                      <View style={styles.healthMetricRow}>
                        <View style={styles.healthMetricNameCell}>
                          <View style={styles.healthMetricIcon}>
                            <Clock size={16} color="#F59E0B" />
                          </View>
                          <Text style={styles.healthMetricLabel} numberOfLines={1}>Duration</Text>
                        </View>
                        <Text style={styles.healthMetricValue} numberOfLines={1}>{healthScore.duration.recent}</Text>
                        <Text style={styles.healthMetricValue} numberOfLines={1}>{healthScore.duration.avg}</Text>
                        <Text style={styles.healthMetricRecommendedValue} numberOfLines={1}>{healthScore.duration.recommended}</Text>
                      </View>
                    )}

                    {healthScore.heartRate && (
                      <View style={styles.healthMetricRow}>
                        <View style={styles.healthMetricNameCell}>
                          <View style={styles.healthMetricIcon}>
                            <Heart size={16} color="#E11D48" />
                          </View>
                          <Text style={styles.healthMetricLabel} numberOfLines={1}>Heart Rate</Text>
                        </View>
                        <Text style={styles.healthMetricValue} numberOfLines={1}>{healthScore.heartRate.recent}</Text>
                        <Text style={styles.healthMetricValue} numberOfLines={1}>{healthScore.heartRate.avg}</Text>
                        <Text style={styles.healthMetricRecommendedValue} numberOfLines={1}>{healthScore.heartRate.recommended}</Text>
                      </View>
                    )}

                    {healthScore.sleep && (
                      <View style={styles.healthMetricRow}>
                        <View style={styles.healthMetricNameCell}>
                          <View style={styles.healthMetricIcon}>
                            <Moon size={16} color="#8B5CF6" />
                          </View>
                          <Text style={styles.healthMetricLabel} numberOfLines={1}>Sleep</Text>
                        </View>
                        <Text style={styles.healthMetricValue} numberOfLines={1}>{healthScore.sleep.recent}</Text>
                        <Text style={styles.healthMetricValue} numberOfLines={1}>{healthScore.sleep.avg}</Text>
                        <Text style={styles.healthMetricRecommendedValue} numberOfLines={1}>{healthScore.sleep.recommended}</Text>
                      </View>
                    )}

                    {healthScore.spo2 && (
                      <View style={styles.healthMetricRow}>
                        <View style={styles.healthMetricNameCell}>
                          <View style={styles.healthMetricIcon}>
                            <Droplets size={16} color="#0EA5E9" />
                          </View>
                          <Text style={styles.healthMetricLabel} numberOfLines={1}>Blood O₂</Text>
                        </View>
                        <Text style={styles.healthMetricValue} numberOfLines={1}>{healthScore.spo2.recent}</Text>
                        <Text style={styles.healthMetricValue} numberOfLines={1}>{healthScore.spo2.avg}</Text>
                        <Text style={styles.healthMetricRecommendedValue} numberOfLines={1}>{healthScore.spo2.recommended}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ) : !healthLoading ? (
              <View key="health" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Heart size={18} color="#E11D48" />
                  <Text style={styles.sectionTitle}>General Health</Text>
                </View>
                <TouchableOpacity style={styles.setupGoalCard} onPress={() => setShowHealthForm(true)} activeOpacity={0.8}>
                  <LinearGradient colors={["#E11D48", "#F43F5E"]} style={styles.setupGoalGradient}>
                    <Heart size={32} color={colors.white} />
                    <Text style={styles.setupGoalTitle}>Track Your Health</Text>
                    <Text style={styles.setupGoalSubtext}>
                      Enter daily data from your smartwatch to get an overall health score based on steps, heart rate, sleep, and blood oxygen
                    </Text>
                    <View style={styles.setupGoalButton}>
                      <Text style={[styles.setupGoalButtonText, { color: "#E11D48" }]}>Log Today</Text>
                      <ChevronRight size={16} color="#E11D48" />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : null;
          }

          if (goalKey === "habit") {
            return habitDeclaration ? (
              <View key="habit" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Flame size={18} color="#0D9488" />
                  <Text style={styles.sectionTitle}>Have planned runs</Text>
                  <TouchableOpacity onPress={openEditHabit} style={styles.editButton} activeOpacity={0.7}>
                    <Text style={styles.editButtonText}>Edit</Text>
                    <ChevronRight size={14} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.habitCard}>
                  <View style={styles.habitDeclarationRow}>
                    <Text style={styles.habitDeclarationText}>
                      I <Text style={styles.habitHighlight}>{habitDeclaration.activity_type}</Text>{" "}
                      <Text style={styles.habitHighlight}>{habitDeclaration.target_amount}</Text>{" "}
                      <Text style={styles.habitHighlight}>{habitDeclaration.unit}</Text>{" "}
                      <Text style={styles.habitHighlight}>{habitDeclaration.frequency}</Text>
                    </Text>
                  </View>

                  <View style={styles.habitDateRow}>
                    <Calendar size={12} color={colors.textSecondary} />
                    <Text style={styles.habitDateText}>
                      Since {formatGoalDate(habitDeclaration.start_date)}
                    </Text>
                  </View>

                  {habitCommitment ? (
                    <>
                      <View style={styles.habitCommitmentHeader}>
                        <View style={[styles.habitCommitmentPill, { backgroundColor: getCommitmentColor(habitCommitment.percent) + "18" }]}>
                          <Text style={[styles.habitCommitmentPillText, { color: getCommitmentColor(habitCommitment.percent) }]}>
                            {getCommitmentLabel(habitCommitment.percent)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.fitnessProgressSection}>
                        <View style={styles.fitnessProgressInfo}>
                          <Text style={styles.fitnessProgressLabel}>Commitment</Text>
                          <Text style={styles.fitnessProgressPercent}>{habitCommitment.percent}%</Text>
                        </View>
                        <View style={styles.fitnessProgressTrack}>
                          <LinearGradient
                            colors={habitCommitment.percent >= 70 ? ["#0D9488", "#14B8A6"] : habitCommitment.percent >= 40 ? ["#F59E0B", "#FBBF24"] : ["#EF4444", "#F87171"]}
                            style={[styles.fitnessProgressFill, { width: `${Math.max(2, habitCommitment.percent)}%` }]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                          />
                        </View>
                      </View>

                      <Text style={styles.habitCommitmentDetail}>
                        {habitCommitment.periodsMet} of {habitCommitment.periodsElapsed} {getFrequencyPeriodLabel(habitDeclaration.frequency)} met
                      </Text>
                    </>
                  ) : (
                    <View style={styles.noActivitiesInfo}>
                      <Flame size={24} color={colors.textLight} />
                      <Text style={styles.noActivitiesText}>
                        Start logging activities to track your training progress
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ) : !habitDeclarationLoading ? (
              <View key="habit" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Flame size={18} color="#0D9488" />
                  <Text style={styles.sectionTitle}>Have planned runs</Text>
                </View>
                <TouchableOpacity style={styles.setupGoalCard} onPress={() => { resetHabitForm(); setShowHabitModal(true); }} activeOpacity={0.8}>
                  <LinearGradient colors={["#0D9488", "#14B8A6"]} style={styles.setupGoalGradient}>
                    <Flame size={32} color={colors.white} />
                    <Text style={styles.setupGoalTitle}>Have planned runs</Text>
                    <Text style={styles.setupGoalSubtext}>
                      Declare your planned runs and track your consistency
                    </Text>
                    <View style={styles.setupGoalButton}>
                      <Text style={[styles.setupGoalButtonText, { color: "#0D9488" }]}>Set planned runs</Text>
                      <ChevronRight size={16} color="#0D9488" />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : null;
          }

          if (goalKey === "medals") {
            return medalGoalData ? (
              <View key="medals" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Trophy size={18} color="#D97706" />
                  <Text style={styles.sectionTitle}>Earn Medals</Text>
                </View>
                <View style={styles.medalGoalCard}>
                  <View style={styles.medalRatiosRow}>
                    <View style={styles.medalRatioBlock}>
                      <View style={styles.medalRatioCircle}>
                        <Text style={styles.medalRatioNumber}>{medalGoalData.enrolledEvents}</Text>
                        <Text style={styles.medalRatioOf}>/ {medalGoalData.totalEvents}</Text>
                      </View>
                      <Text style={styles.medalRatioLabel}>Eligible Races Enrolled</Text>
                      <View style={styles.medalRatioBarTrack}>
                        <View style={[styles.medalRatioBarFill, { width: `${medalGoalData.enrollmentRatio}%`, backgroundColor: "#D97706" }]} />
                      </View>
                      <Text style={styles.medalRatioPercent}>{Math.round(medalGoalData.enrollmentRatio)}%</Text>
                    </View>

                    <View style={styles.medalRatioDivider} />

                    <View style={styles.medalRatioBlock}>
                      <View style={styles.medalRatioCircle}>
                        <Text style={[styles.medalRatioNumber, { color: "#059669" }]}>{medalGoalData.medalsEarned}</Text>
                        <Text style={styles.medalRatioOf}>/ {medalGoalData.enrolledEvents}</Text>
                      </View>
                      <Text style={styles.medalRatioLabel}>Medals Earned / Target</Text>
                      <View style={styles.medalRatioBarTrack}>
                        <View style={[styles.medalRatioBarFill, { width: `${medalGoalData.medalRatio}%`, backgroundColor: "#059669" }]} />
                      </View>
                      <Text style={styles.medalRatioPercent}>{Math.round(medalGoalData.medalRatio)}%</Text>
                    </View>
                  </View>

                  {medalGoalData.events.filter(e => e.isEnrolled).length > 0 && (
                    <View style={styles.medalEventsList}>
                      <Text style={styles.weightHistoryTitle}>Enrolled Events</Text>
                      {medalGoalData.events.filter(e => e.isEnrolled).map((event, index) => (
                        <View key={index} style={styles.medalEventRow}>
                          <View style={styles.medalEventInfo}>
                            <Text style={styles.medalEventName} numberOfLines={1}>{event.eventName}</Text>
                          </View>
                          <View style={[
                            styles.medalEventBadge,
                            event.isOnMedalList ? styles.medalEventBadgeEarned : styles.medalEventBadgePending,
                          ]}>
                            <Award size={12} color={event.isOnMedalList ? "#D97706" : colors.textLight} />
                            <Text style={[
                              styles.medalEventBadgeText,
                              event.isOnMedalList ? styles.medalEventBadgeTextEarned : styles.medalEventBadgeTextPending,
                            ]}>
                              {event.isOnMedalList ? "Earned" : "Pending"}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {medalGoalData.enrolledEvents === 0 && (
                    <View style={styles.noActivitiesInfo}>
                      <Trophy size={24} color={colors.textLight} />
                      <Text style={styles.noActivitiesText}>
                        Enroll in races from the Events tab to start earning medals
                      </Text>
                    </View>
                  )}

                  <Text style={styles.fitnessFootnote}>
                    Enrollment is measured against eligible medal races. Individual medal rank follows the Community Medals table.
                  </Text>
                  {communityMedalRanking ? (
                    <View style={styles.goalRankList}>
                      <View style={styles.goalRankRow}>
                        <View style={styles.goalRankInfo}>
                          <Text style={styles.goalRankLabel}>Medals Individual Rank</Text>
                          <Text style={styles.goalRankSubtext}>{communityMedalRanking.metricValue}</Text>
                        </View>
                        <View style={styles.goalRankPill}>
                          <Text style={styles.goalRankValue}>#{communityMedalRanking.currentRank}</Text>
                          <Text style={styles.goalRankOf}>of {communityMedalRanking.totalParticipants}</Text>
                        </View>
                      </View>
                    </View>
                  ) : communityMedalRankLoading ? (
                    <View style={styles.scoreComingSoonRow}>
                      <Text style={styles.scoreComingSoonLabel}>Medals Individual Rank</Text>
                      <Text style={styles.scoreComingSoonPill}>Loading</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : !medalGoalLoading ? (
              <View key="medals" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Trophy size={18} color="#D97706" />
                  <Text style={styles.sectionTitle}>Earn Medals</Text>
                </View>
                <View style={styles.medalGoalCard}>
                  <View style={styles.noActivitiesInfo}>
                    <Trophy size={28} color={colors.textLight} />
                    <Text style={styles.noActivitiesTitle}>No Races Available</Text>
                    <Text style={styles.noActivitiesText}>
                      When races are added, you can track your enrollment and medal progress here
                    </Text>
                  </View>
                </View>
              </View>
            ) : null;
          }

          if (goalKey === "community") {
            return communityGoalRanks.length > 0 ? (
              <View key="community" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Users size={18} color="#0EA5E9" />
                  <Text style={styles.sectionTitle}>Compete in Community</Text>
                </View>
                <View style={styles.communityCard}>
                  <View style={styles.goalRankList}>
                    {communityGoalRanks.map((rank) => (
                      <View key={rank.label} style={styles.goalRankRow}>
                        <View style={styles.goalRankInfo}>
                          <Text style={styles.goalRankLabel}>{rank.label}</Text>
                          <Text style={styles.goalRankSubtext}>{rank.metricLabel}: {rank.metricValue}</Text>
                        </View>
                        <View style={styles.goalRankPill}>
                          <Text style={styles.goalRankValue}>#{rank.currentRank}</Text>
                          <Text style={styles.goalRankOf}>of {rank.totalParticipants}</Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  {communityRanking ? (
                    <View style={styles.communityStatsRow}>
                      <View style={styles.communityStatItem}>
                        <Text style={styles.communityStatValue}>{communityRanking.avgDistance.toFixed(1)}</Text>
                        <Text style={styles.communityStatLabel}>Avg km/day</Text>
                      </View>
                      <View style={styles.communityStatDivider} />
                      <View style={styles.communityStatItem}>
                        <Text style={styles.communityStatValue}>{communityRanking.activeDays}</Text>
                        <Text style={styles.communityStatLabel}>Active Days</Text>
                      </View>
                      <View style={styles.communityStatDivider} />
                      <View style={styles.communityStatItem}>
                        <Text style={styles.communityStatValue}>
                          {communityRanking.avgPace > 0 ? formatPaceMinPerKm(communityRanking.avgPace) : "--"}
                        </Text>
                        <Text style={styles.communityStatLabel}>Avg Pace</Text>
                      </View>
                    </View>
                  ) : null}

                  {rankChange && rankChange.previousRank > 0 && (
                    <View style={styles.communityHistoryRow}>
                      <Text style={styles.communityHistoryLabel}>Previous rank</Text>
                      <Text style={styles.communityHistoryValue}>#{rankChange.previousRank}</Text>
                    </View>
                  )}

                  <Text style={styles.fitnessFootnote}>
                    Pulls individual ranks from Family, Community Activity, and Community Medals.
                  </Text>
                </View>
              </View>
            ) : !communityRankLoading && !familyRankLoading && !communityMedalRankLoading ? (
              <View key="community" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Users size={18} color="#0EA5E9" />
                  <Text style={styles.sectionTitle}>Compete in Community</Text>
                </View>
                <View style={styles.communityCard}>
                  <View style={styles.noActivitiesInfo}>
                    <Users size={28} color={colors.textLight} />
                    <Text style={styles.noActivitiesTitle}>Not Ranked Yet</Text>
                    <Text style={styles.noActivitiesText}>
                      Complete your first activity to appear on the community leaderboard and start tracking your rank
                    </Text>
                  </View>
                </View>
              </View>
            ) : null;
          }

          if (goalKey === "events") {
            return ongoingEvents.length > 0 ? (
              <View key="events" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Award size={18} color={colors.text} />
                  <Text style={styles.sectionTitle}>Event Goals</Text>
                </View>
                {ongoingEvents.map((event) => (
                  <View key={event.eventId} style={styles.eventGoalCard}>
                    <View style={styles.eventGoalHeader}>
                      <Calendar size={14} color={colors.primary} />
                      <Text style={styles.eventGoalName} numberOfLines={1}>{event.eventName}</Text>
                      <View style={[styles.medalBadge, event.isOnMedalList ? styles.medalBadgeOn : styles.medalBadgeOff]}>
                        <Award size={12} color={event.isOnMedalList ? "#FFD700" : colors.lightGray} />
                        <Text style={[styles.medalBadgeText, event.isOnMedalList ? styles.medalTextOn : styles.medalTextOff]}>
                          {event.isOnMedalList ? "On Track" : "Behind"}
                        </Text>
                      </View>
                    </View>
                    {event.medal_min_cumulative_distance && event.medal_min_cumulative_distance > 0 && (
                      <View style={styles.eventProgress}>
                        <View style={styles.eventProgressInfo}>
                          <Text style={styles.eventProgressText}>
                            {event.currentDistance.toFixed(1)} / {event.medal_min_cumulative_distance} km
                          </Text>
                        </View>
                        <View style={styles.eventProgressTrack}>
                          <LinearGradient
                            colors={event.isOnMedalList ? ["#FFD700", "#FFA500"] : ["#EF4444", "#F87171"]}
                            style={[
                              styles.eventProgressFill,
                              { width: `${Math.min(100, (event.currentDistance / event.medal_min_cumulative_distance) * 100)}%` },
                            ]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                          />
                        </View>
                      </View>
                    )}
                    {event.medal_min_daily_distance && event.medal_min_daily_distance > 0 && (
                      <Text style={styles.eventDailyTarget}>
                        Daily target: {event.medal_min_daily_distance} km/day
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ) : null;
          }

          return null;
        })}



        {hasNoGoals && activeGoalsPage === "set" && (
          <View style={styles.emptyContainer}>
            <Target size={48} color={colors.lightGray} />
            <Text style={styles.emptyTitle}>No Goals Set Yet</Text>
            <Text style={styles.emptySubtext}>
              Visit your Profile to set fitness goals, weight targets, and join events to track your progress here.
            </Text>
          </View>
        )}

        {untrackedGoals.length > 0 && !hasNoGoals && (activeGoalsPage === "set" || activeGoalsPage === "scorecard") && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Target size={18} color={colors.textLight} />
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Goals Not Selected</Text>
            </View>
            <View style={styles.untrackedContainer}>
              {untrackedGoals.map((goal) => (
                <View key={goal.key} style={styles.untrackedChip}>
                  {goal.icon === "zap" && <Zap size={14} color={colors.textLight} />}
                  {goal.icon === "calendar" && <Calendar size={14} color={colors.textLight} />}
                  {goal.icon === "scale" && <Scale size={14} color={colors.textLight} />}
                  {goal.icon === "heart" && <Heart size={14} color={colors.textLight} />}
                  {goal.icon === "flame" && <Flame size={14} color={colors.textLight} />}
                  {goal.icon === "trophy" && <Trophy size={14} color={colors.textLight} />}
                  {goal.icon === "users" && <Users size={14} color={colors.textLight} />}
                  <Text style={styles.untrackedChipText}>{goal.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showDailyRunGoalForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDailyRunGoalForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient colors={["#0EA5E9", "#38BDF8"]} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {dailyRunGoal ? "Update Running Days Goal" : "Set Running Days Goal"}
              </Text>
              <TouchableOpacity onPress={() => setShowDailyRunGoalForm(false)}>
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalSubtitle}>
                Pick a date range and the percentage of days you want to run.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Start Date *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  value={dailyRunStartDateInput}
                  onChangeText={setDailyRunStartDateInput}
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>End Date *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  value={dailyRunEndDateInput}
                  onChangeText={setDailyRunEndDateInput}
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target (%) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 80"
                  value={dailyRunTargetInput}
                  onChangeText={setDailyRunTargetInput}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textLight}
                />
                <Text style={styles.inputHint}>Example: 80 means run on 80% of days in the date range.</Text>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, saveDailyRunGoalMutation.isPending && styles.saveButtonDisabled]}
                onPress={handleSaveDailyRunGoal}
                disabled={saveDailyRunGoalMutation.isPending}
                activeOpacity={0.8}
              >
                <LinearGradient colors={["#0EA5E9", "#38BDF8"]} style={styles.saveButtonGradient}>
                  <Text style={styles.saveButtonText}>
                    {saveDailyRunGoalMutation.isPending ? "Saving..." : dailyRunGoal ? "Update Goal" : "Save Goal"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showWeightTargetForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowWeightTargetForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient colors={["#10B981", "#34D399"]} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {weightTargetGoal ? "Update Weight Goal" : "Set Weight Goal"}
              </Text>
              <TouchableOpacity onPress={() => setShowWeightTargetForm(false)}>
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalSubtitle}>
                Set your target weight and the date you want to achieve it by
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target Weight (kg) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 70"
                  value={weightTargetInput}
                  onChangeText={setWeightTargetInput}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target Date *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD (e.g. 2026-06-30)"
                  value={weightTargetDateInput}
                  onChangeText={setWeightTargetDateInput}
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <TouchableOpacity
                style={[styles.saveButton, saveWeightTargetMutation.isPending && styles.saveButtonDisabled]}
                onPress={handleSaveWeightTarget}
                disabled={saveWeightTargetMutation.isPending}
                activeOpacity={0.8}
              >
                <LinearGradient colors={["#10B981", "#34D399"]} style={styles.saveButtonGradient}>
                  <Text style={styles.saveButtonText}>
                    {saveWeightTargetMutation.isPending ? "Saving..." : weightTargetGoal ? "Update Goal" : "Save Goal"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showWeightLogForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowWeightLogForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient colors={["#10B981", "#34D399"]} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Your Weight</Text>
              <TouchableOpacity onPress={() => setShowWeightLogForm(false)}>
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalSubtitle}>
                Enter your current weight. Log weekly for best tracking.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Weight (kg) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 75.5"
                  value={weightLogInput}
                  onChangeText={setWeightLogInput}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textLight}
                />
                <Text style={styles.inputHint}>Today&apos;s date will be used automatically</Text>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, logWeightMutation.isPending && styles.saveButtonDisabled]}
                onPress={handleLogWeight}
                disabled={logWeightMutation.isPending}
                activeOpacity={0.8}
              >
                <LinearGradient colors={["#10B981", "#34D399"]} style={styles.saveButtonGradient}>
                  <Text style={styles.saveButtonText}>
                    {logWeightMutation.isPending ? "Saving..." : "Log Weight"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showGoalForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGoalForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient colors={colors.gradient.orange} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {fitnessGoal ? "Update Pace Goal" : "Set Pace Goal"}
              </Text>
              <TouchableOpacity onPress={() => setShowGoalForm(false)}>
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalSubtitle}>
                Set your target pace and the date you want to achieve it by
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target Pace (min/km) *</Text>
                <View style={styles.paceInputRow}>
                  <View style={styles.paceInputBlock}>
                    <TextInput
                      style={styles.paceInput}
                      placeholder="5"
                      value={targetPaceMin}
                      onChangeText={setTargetPaceMin}
                      keyboardType="number-pad"
                      maxLength={2}
                      placeholderTextColor={colors.textLight}
                    />
                    <Text style={styles.paceInputLabel}>min</Text>
                  </View>
                  <Text style={styles.paceColon}>:</Text>
                  <View style={styles.paceInputBlock}>
                    <TextInput
                      style={styles.paceInput}
                      placeholder="30"
                      value={targetPaceSec}
                      onChangeText={setTargetPaceSec}
                      keyboardType="number-pad"
                      maxLength={2}
                      placeholderTextColor={colors.textLight}
                    />
                    <Text style={styles.paceInputLabel}>sec</Text>
                  </View>
                </View>
                <Text style={styles.inputHint}>e.g. 5:30 means 5 minutes 30 seconds per km</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target Date *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD (e.g. 2026-06-30)"
                  value={targetDate}
                  onChangeText={setTargetDate}
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <TouchableOpacity
                style={[styles.saveButton, saveFitnessGoalMutation.isPending && styles.saveButtonDisabled]}
                onPress={handleSaveFitnessGoal}
                disabled={saveFitnessGoalMutation.isPending}
                activeOpacity={0.8}
              >
                <LinearGradient colors={colors.gradient.orange} style={styles.saveButtonGradient}>
                  <Text style={styles.saveButtonText}>
                    {saveFitnessGoalMutation.isPending ? "Saving..." : fitnessGoal ? "Update Goal" : "Save Goal"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showHabitModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowHabitModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient colors={["#0D9488", "#14B8A6"]} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>My Declaration</Text>
              <TouchableOpacity onPress={() => setShowHabitModal(false)}>
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalSubtitle}>
                Define what you do as a runner. Make your declaration.
              </Text>

              <View style={styles.habitPreview}>
                <Text style={styles.habitPreviewText}>
                  I{" "}
                  <Text style={styles.habitPreviewHighlight}>{habitActivityType}</Text>{" "}
                  <Text style={styles.habitPreviewHighlight}>{habitAmount || "___"}</Text>{" "}
                  <Text style={styles.habitPreviewHighlight}>{habitUnit}</Text>{" "}
                  <Text style={styles.habitPreviewHighlight}>{habitFrequency}</Text>
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Activity Type *</Text>
                <View style={styles.habitChipRow}>
                  {["Walk", "Run", "Cycle"].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.habitChip, habitActivityType === type && styles.habitChipActive]}
                      onPress={() => setHabitActivityType(type)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.habitChipText, habitActivityType === type && styles.habitChipTextActive]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target Amount *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 3"
                  value={habitAmount}
                  onChangeText={setHabitAmount}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Unit *</Text>
                <View style={styles.habitChipRow}>
                  {["steps", "kilometers"].map((u) => (
                    <TouchableOpacity
                      key={u}
                      style={[styles.habitChip, habitUnit === u && styles.habitChipActive]}
                      onPress={() => setHabitUnit(u)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.habitChipText, habitUnit === u && styles.habitChipTextActive]}>
                        {u.charAt(0).toUpperCase() + u.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Frequency *</Text>
                <View style={styles.habitChipRow}>
                  {["daily", "weekly", "monthly", "yearly"].map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[styles.habitChip, habitFrequency === f && styles.habitChipActive]}
                      onPress={() => setHabitFrequency(f)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.habitChipText, habitFrequency === f && styles.habitChipTextActive]}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Starting Date *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD (e.g. 2026-03-10)"
                  value={habitStartDate}
                  onChangeText={setHabitStartDate}
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <TouchableOpacity
                style={[styles.saveButton, saveHabitMutation.isPending && styles.saveButtonDisabled]}
                onPress={handleSaveHabit}
                disabled={saveHabitMutation.isPending}
                activeOpacity={0.8}
              >
                <LinearGradient colors={["#0D9488", "#14B8A6"]} style={styles.saveButtonGradient}>
                  <Text style={styles.saveButtonText}>
                    {saveHabitMutation.isPending ? "Saving..." : "Save Declaration"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showHealthForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowHealthForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient colors={["#E11D48", "#F43F5E"]} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Health Data</Text>
              <TouchableOpacity onPress={() => setShowHealthForm(false)}>
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalSubtitle}>
                Enter today&apos;s data from your smartwatch. Steps are required, other fields are optional.
              </Text>

              <View style={styles.inputGroup}>
                <View style={styles.healthInputHeader}>
                  <Footprints size={16} color="#4A90E2" />
                  <Text style={styles.inputLabel}>Steps *</Text>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 8500"
                  value={healthStepsInput}
                  onChangeText={setHealthStepsInput}
                  keyboardType="number-pad"
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.healthInputHeader}>
                  <Heart size={16} color="#E11D48" />
                  <Text style={styles.inputLabel}>Resting Heart Rate (bpm)</Text>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 68"
                  value={healthHeartRateInput}
                  onChangeText={setHealthHeartRateInput}
                  keyboardType="number-pad"
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.healthInputHeader}>
                  <Moon size={16} color="#8B5CF6" />
                  <Text style={styles.inputLabel}>Sleep Hours</Text>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 7.5"
                  value={healthSleepInput}
                  onChangeText={setHealthSleepInput}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.healthInputHeader}>
                  <Droplets size={16} color="#0EA5E9" />
                  <Text style={styles.inputLabel}>Blood Oxygen SpO2 (%)</Text>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 97.5"
                  value={healthSpo2Input}
                  onChangeText={setHealthSpo2Input}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textLight}
                />
                <Text style={styles.inputHint}>Today&apos;s date will be used automatically</Text>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, logHealthMutation.isPending && styles.saveButtonDisabled]}
                onPress={handleLogHealth}
                disabled={logHealthMutation.isPending}
                activeOpacity={0.8}
              >
                <LinearGradient colors={["#E11D48", "#F43F5E"]} style={styles.saveButtonGradient}>
                  <Text style={styles.saveButtonText}>
                    {logHealthMutation.isPending ? "Saving..." : "Log Health Data"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  streakSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  streakCard: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  streakTop: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  streakNumber: {
    fontSize: 28,
    fontWeight: "900" as const,
    color: colors.white,
  },
  streakLabel: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: colors.white,
    opacity: 0.9,
  },
  streakStats: {
    flexDirection: "row" as const,
    justifyContent: "space-around" as const,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    paddingVertical: 12,
  },
  streakStatItem: {
    alignItems: "center" as const,
    flex: 1,
  },
  streakStatValue: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: colors.white,
  },
  streakStatLabel: {
    fontSize: 11,
    color: colors.white,
    opacity: 0.85,
    marginTop: 2,
  },
  streakDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  goalsPageTabs: {
    flexDirection: "row" as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  goalsPageTab: {
    flex: 1,
    minHeight: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 10,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
  },
  goalsPageTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  goalsPageTabText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: colors.textSecondary,
  },
  goalsPageTabTextActive: {
    color: colors.white,
  },
  section: {
    paddingHorizontal: 12,
    marginTop: 12,
  },
  sectionHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.text,
    flex: 1,
  },
  editButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 2,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: colors.primary,
  },
  compactOverviewCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  compactOverviewTitle: {
    fontSize: 15,
    fontWeight: "800" as const,
    color: colors.text,
  },
  compactOverviewText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 5,
  },
  compactSectionTitle: {
    fontSize: 14,
    fontWeight: "800" as const,
    color: colors.text,
    marginBottom: 8,
  },
  overviewList: {
    gap: 8,
  },
  overviewGoalRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  overviewGoalInfo: {
    flex: 1,
    minWidth: 0,
  },
  overviewGoalTitle: {
    fontSize: 14,
    fontWeight: "800" as const,
    color: colors.text,
  },
  overviewGoalText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 3,
  },
  overviewMeasuredText: {
    fontSize: 11,
    color: colors.textLight,
    lineHeight: 15,
    marginTop: 4,
  },
  overviewEmptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  overviewStartButton: {
    minWidth: 64,
    minHeight: 32,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
  },
  overviewStartButtonText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: colors.white,
  },
  setGoalsGrid: {
    gap: 10,
  },
  setGoalActionCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  setGoalActionInfo: {
    flex: 1,
    minWidth: 0,
  },
  setGoalActionTitle: {
    fontSize: 15,
    fontWeight: "800" as const,
    color: colors.text,
  },
  setGoalActionText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  fitnessCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  paceComparisonRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 10,
  },
  paceBlock: {
    alignItems: "center" as const,
    flex: 1,
  },
  paceBlockLabel: {
    fontSize: 9,
    fontWeight: "600" as const,
    color: colors.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0,
    marginBottom: 4,
  },
  paceBlockValue: {
    fontSize: 20,
    fontWeight: "800" as const,
  },
  paceGood: {
    color: "#10B981",
  },
  paceBehind: {
    color: "#EF4444",
  },
  paceBlockValueTarget: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: colors.text,
  },
  paceBlockUnit: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  paceArrowContainer: {
    paddingHorizontal: 4,
  },
  statusPillGood: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillTextGood: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "#10B981",
  },
  statusPillBehind: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillTextBehind: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "#EF4444",
  },
  fitnessProgressSection: {
    marginBottom: 8,
  },
  fitnessProgressInfo: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 6,
  },
  fitnessProgressLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: colors.textSecondary,
  },
  fitnessProgressPercent: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: colors.text,
  },
  fitnessProgressTrack: {
    height: 8,
    backgroundColor: colors.extraLightGray,
    borderRadius: 4,
    overflow: "hidden" as const,
  },
  fitnessProgressFill: {
    height: "100%",
    borderRadius: 4,
  },
  fitnessMetaRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginBottom: 10,
  },
  fitnessMetaItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  fitnessMetaText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  fitnessFootnote: {
    fontSize: 11,
    color: colors.textLight,
    textAlign: "center" as const,
    fontStyle: "italic" as const,
  },
  scoreGuideRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginBottom: 14,
  },
  scoreGuideItem: {
    flex: 1,
    backgroundColor: colors.extraLightGray,
    borderRadius: 12,
    padding: 10,
    alignItems: "center" as const,
  },
  scoreGuideValue: {
    fontSize: 16,
    fontWeight: "800" as const,
    color: colors.text,
  },
  scoreGuideLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: colors.textSecondary,
    marginTop: 3,
    textAlign: "center" as const,
  },
  scoreComingSoonRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  scoreComingSoonLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  scoreComingSoonPill: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: "#92400E",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  noActivitiesInfo: {
    alignItems: "center" as const,
    paddingVertical: 16,
    gap: 8,
  },
  noActivitiesTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: colors.text,
  },
  noActivitiesText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center" as const,
    lineHeight: 18,
  },
  setupGoalCard: {
    borderRadius: 16,
    overflow: "hidden" as const,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  setupGoalGradient: {
    padding: 24,
    alignItems: "center" as const,
  },
  setupGoalTitle: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: colors.white,
    marginTop: 12,
  },
  setupGoalSubtext: {
    fontSize: 13,
    color: colors.white,
    opacity: 0.9,
    textAlign: "center" as const,
    marginTop: 8,
    lineHeight: 18,
  },
  setupGoalButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    marginTop: 16,
    gap: 4,
  },
  setupGoalButtonText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: colors.primary,
  },
  weightCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  weightRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 16,
  },
  weightItem: {
    alignItems: "center" as const,
    flex: 1,
  },
  weightValue: {
    fontSize: 28,
    fontWeight: "800" as const,
    color: colors.text,
  },
  weightLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  weightArrow: {
    paddingHorizontal: 12,
  },
  weightProgressBar: {
    marginBottom: 8,
  },
  weightProgressTrack: {
    height: 8,
    backgroundColor: colors.extraLightGray,
    borderRadius: 4,
    overflow: "hidden" as const,
  },
  weightProgressFill: {
    height: "100%",
    borderRadius: 4,
  },
  weightValueTarget: {
    fontSize: 28,
    fontWeight: "800" as const,
    color: colors.text,
  },
  weightDiff: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center" as const,
    marginTop: 8,
  },
  weightHistorySection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
  },
  weightEffectivenessSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
  },
  weightEffectivenessGrid: {
    flexDirection: "row" as const,
    gap: 8,
    marginBottom: 10,
  },
  weightEffectivenessTile: {
    flex: 1,
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center" as const,
  },
  weightEffectivenessValue: {
    fontSize: 17,
    fontWeight: "800" as const,
    color: "#059669",
  },
  weightEffectivenessLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: "600" as const,
  },
  weightEfficiencyRow: {
    flexDirection: "row" as const,
    gap: 8,
  },
  weightEfficiencyItem: {
    flex: 1,
    backgroundColor: colors.extraLightGray,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center" as const,
  },
  weightEfficiencyValue: {
    fontSize: 16,
    fontWeight: "800" as const,
    color: colors.text,
  },
  weightEfficiencyLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: "700" as const,
  },
  weightEffectivenessHint: {
    fontSize: 11,
    color: colors.textLight,
    lineHeight: 15,
    marginTop: 8,
  },
  weightHistoryTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  weightHistoryRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingVertical: 6,
  },
  weightHistoryDate: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  weightHistoryValue: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: colors.text,
  },
  logWeightButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    backgroundColor: "#10B981",
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  logWeightButtonText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.white,
  },
  goalsContainer: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  goalChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: colors.cardBackground,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  goalChipText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: colors.text,
  },
  eventGoalCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  eventGoalHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 10,
  },
  eventGoalName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.text,
  },
  medalBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  medalBadgeOn: {
    backgroundColor: "#FFF8E1",
  },
  medalBadgeOff: {
    backgroundColor: "#FEE2E2",
  },
  medalBadgeText: {
    fontSize: 11,
    fontWeight: "700" as const,
  },
  medalTextOn: {
    color: "#B8860B",
  },
  medalTextOff: {
    color: "#EF4444",
  },
  eventProgress: {
    marginBottom: 6,
  },
  eventProgressInfo: {
    marginBottom: 6,
  },
  eventProgressText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: colors.textSecondary,
  },
  eventProgressTrack: {
    height: 6,
    backgroundColor: colors.extraLightGray,
    borderRadius: 3,
    overflow: "hidden" as const,
  },
  eventProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  eventDailyTarget: {
    fontSize: 12,
    color: colors.textLight,
    marginTop: 6,
  },
  avgRow: {
    flexDirection: "row" as const,
    gap: 12,
  },
  avgCard: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: "center" as const,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  avgValue: {
    fontSize: 24,
    fontWeight: "800" as const,
    color: colors.white,
  },
  avgLabel: {
    fontSize: 12,
    color: colors.white,
    opacity: 0.9,
    marginTop: 4,
    fontWeight: "600" as const,
  },
  emptyContainer: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center" as const,
    marginTop: 8,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end" as const,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: colors.white,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: colors.text,
    marginBottom: 8,
  },
  paceInputRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  paceInputBlock: {
    flex: 1,
    alignItems: "center" as const,
  },
  paceInput: {
    backgroundColor: colors.extraLightGray,
    borderRadius: 12,
    padding: 14,
    fontSize: 24,
    fontWeight: "700" as const,
    color: colors.text,
    textAlign: "center" as const,
    width: "100%",
  },
  paceInputLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  paceColon: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: colors.text,
    marginTop: -16,
  },
  inputHint: {
    fontSize: 12,
    color: colors.textLight,
    marginTop: 6,
  },
  input: {
    backgroundColor: colors.extraLightGray,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: colors.text,
  },
  saveButton: {
    borderRadius: 14,
    overflow: "hidden" as const,
    marginTop: 8,
    marginBottom: 24,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonGradient: {
    paddingVertical: 16,
    alignItems: "center" as const,
    borderRadius: 14,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: colors.white,
  },
  healthCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  healthScoreCircleContainer: {
    alignItems: "center" as const,
    marginBottom: 6,
  },
  healthScoreCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 10,
  },
  healthScoreNumber: {
    fontSize: 26,
    fontWeight: "900" as const,
  },
  healthScoreOutOf: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: -4,
  },
  healthScorePill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 16,
  },
  healthScorePillText: {
    fontSize: 13,
    fontWeight: "700" as const,
  },
  goalClubRankRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  goalClubRankInfo: {
    flex: 1,
    minWidth: 0,
  },
  goalClubRankLabel: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: colors.text,
  },
  goalClubRankSubtext: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: colors.textSecondary,
    marginTop: 2,
  },
  goalClubRankPill: {
    minWidth: 54,
    alignItems: "center" as const,
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  goalClubRankValue: {
    fontSize: 15,
    fontWeight: "900" as const,
    color: "#16A34A",
    lineHeight: 17,
  },
  goalClubRankOf: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  healthBreakdown: {
    gap: 0,
  },
  healthMetricSummaryHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  healthMetricSummaryHeaderText: {
    flex: 0.9,
    fontSize: 9,
    fontWeight: "800" as const,
    color: colors.textLight,
    textAlign: "right" as const,
    textTransform: "uppercase" as const,
  },
  healthMetricSummaryLabelCell: {
    flex: 1.35,
    textAlign: "left" as const,
  },
  healthMetricRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  healthMetricNameCell: {
    flex: 1.35,
    minWidth: 0,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
  },
  healthMetricIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: colors.extraLightGray,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  healthMetricInfo: {
    flex: 0.95,
    minWidth: 0,
  },
  healthMetricLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "800" as const,
    color: colors.text,
  },
  healthMetricValue: {
    flex: 0.9,
    fontSize: 9,
    fontWeight: "700" as const,
    color: colors.textSecondary,
    textAlign: "right" as const,
  },
  healthMetricRecommendedValue: {
    flex: 0.9,
    fontSize: 9,
    fontWeight: "800" as const,
    color: colors.text,
    textAlign: "right" as const,
  },
  healthMetricBarContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    width: 100,
  },
  healthMetricBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.extraLightGray,
    borderRadius: 3,
    overflow: "hidden" as const,
  },
  healthMetricBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  healthMetricScore: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: colors.textSecondary,
    width: 24,
    textAlign: "right" as const,
  },
  healthHistorySection: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
  },
  healthHistoryRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingVertical: 6,
  },
  smartFitSection: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
  },
  smartFitAgeGroup: {
    marginBottom: 12,
  },
  smartFitAgeTitle: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  smartFitTable: {
    minWidth: 620,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: "hidden" as const,
  },
  smartFitTableHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: colors.extraLightGray,
    paddingVertical: 8,
  },
  smartFitTableRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.cardBackground,
  },
  smartFitCurrentUserRow: {
    backgroundColor: "#FFF7ED",
  },
  smartFitHeaderText: {
    fontSize: 10,
    fontWeight: "900" as const,
    color: colors.textSecondary,
    textTransform: "uppercase" as const,
    paddingHorizontal: 6,
  },
  smartFitCellText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: colors.text,
    paddingHorizontal: 6,
  },
  smartFitRankCell: {
    width: 58,
  },
  smartFitNameCell: {
    width: 130,
  },
  smartFitSexCell: {
    width: 46,
  },
  smartFitDaysCell: {
    width: 52,
  },
  smartFitStepsCell: {
    width: 86,
  },
  smartFitScoreCell: {
    width: 98,
  },
  smartFitRemarksCell: {
    width: 100,
  },
  healthHistoryStats: {
    alignItems: "flex-end" as const,
  },
  healthHistoryStat: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: colors.text,
  },
  healthHistoryStatSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  healthInputHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginBottom: 8,
  },
  disciplineCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  disciplineGoalRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 12,
  },
  disciplineGoalBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  disciplineGoalIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#EEF2FF",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  disciplineGoalInfo: {
    flex: 1,
  },
  disciplineGoalName: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: colors.text,
  },
  disciplineGoalDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  disciplineStatsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-around" as const,
    backgroundColor: "#F5F3FF",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 14,
    marginBottom: 10,
  },
  disciplineStat: {
    alignItems: "center" as const,
    flex: 1,
  },
  disciplineStatValue: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: "#6366F1",
  },
  disciplineStatLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  disciplineStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#DDD6FE",
  },
  disciplineSelectionCount: {
    alignSelf: "center" as const,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
  },
  disciplineSelectionCountText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#6366F1",
  },
  disciplineOptionCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    backgroundColor: colors.extraLightGray,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },
  disciplineOptionSelected: {
    backgroundColor: "#EEF2FF",
    borderColor: "#6366F1",
  },
  disciplineOptionDisabled: {
    opacity: 0.45,
  },
  disciplineOptionCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.lightGray,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  disciplineOptionCheckActive: {
    backgroundColor: "#6366F1",
    borderColor: "#6366F1",
  },
  disciplineOptionInfo: {
    flex: 1,
  },
  disciplineOptionName: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.text,
  },
  disciplineOptionNameActive: {
    color: "#6366F1",
  },
  disciplineOptionDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
    lineHeight: 16,
  },
  disciplineRemoveBtn: {
    padding: 6,
  },
  communityCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  goalRankList: {
    gap: 8,
    marginBottom: 10,
  },
  goalRankRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  goalRankInfo: {
    flex: 1,
    minWidth: 0,
  },
  goalRankLabel: {
    fontSize: 12,
    fontWeight: "900" as const,
    color: colors.text,
  },
  goalRankSubtext: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  goalRankPill: {
    minWidth: 56,
    alignItems: "center" as const,
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  goalRankValue: {
    fontSize: 15,
    fontWeight: "900" as const,
    color: "#0EA5E9",
    lineHeight: 17,
  },
  goalRankOf: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  communityRankCenter: {
    alignItems: "center" as const,
    marginBottom: 10,
  },
  communityRankCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 4,
    borderColor: "#0EA5E9",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 8,
    backgroundColor: "#F0F9FF",
  },
  communityRankNumber: {
    fontSize: 23,
    fontWeight: "900" as const,
    color: "#0EA5E9",
  },
  communityRankOf: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: -2,
  },
  rankChangePill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  rankChangePillUp: {
    backgroundColor: "#ECFDF5",
  },
  rankChangePillDown: {
    backgroundColor: "#FEF2F2",
  },
  rankChangePillSame: {
    backgroundColor: "#FFFBEB",
  },
  rankChangeText: {
    fontSize: 13,
    fontWeight: "700" as const,
  },
  rankChangeTextUp: {
    color: "#10B981",
  },
  rankChangeTextDown: {
    color: "#EF4444",
  },
  rankChangeTextSame: {
    color: "#F59E0B",
  },
  communityStatsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-around" as const,
    backgroundColor: "#F0F9FF",
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 12,
  },
  communityStatItem: {
    alignItems: "center" as const,
    flex: 1,
  },
  communityStatValue: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: "#0EA5E9",
  },
  communityStatLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  communityStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#BAE6FD",
  },
  communityHistoryRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingVertical: 8,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
  },
  communityHistoryLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  communityHistoryValue: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.text,
  },
  dailyRunCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  dailyRunScoreRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 8,
  },
  dailyRunScore: {
    fontSize: 27,
    fontWeight: "900" as const,
    lineHeight: 30,
  },
  dailyRunScoreLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: "700" as const,
    marginTop: 2,
  },
  dailyRunTargetPill: {
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dailyRunCalendarGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 4,
    marginTop: 4,
    marginBottom: 8,
  },
  dailyRunDayCell: {
    width: 32,
    height: 36,
    borderRadius: 7,
    backgroundColor: colors.extraLightGray,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  dailyRunDayDone: {
    backgroundColor: "#ECFDF5",
    borderColor: "#10B981",
  },
  dailyRunDayMissed: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
  },
  dailyRunDayNumber: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "700" as const,
  },
  dailyRunDayMark: {
    fontSize: 18,
    fontWeight: "900" as const,
    minHeight: 20,
    color: colors.textLight,
  },
  dailyRunDayMarkDone: {
    color: "#10B981",
  },
  dailyRunDayMarkMissed: {
    color: "#EF4444",
  },
  medalGoalCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  medalRatiosRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    marginBottom: 10,
  },
  medalRatioBlock: {
    flex: 1,
    alignItems: "center" as const,
  },
  medalRatioCircle: {
    alignItems: "center" as const,
    marginBottom: 4,
  },
  medalRatioNumber: {
    fontSize: 22,
    fontWeight: "900" as const,
    color: "#D97706",
  },
  medalRatioOf: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: -4,
  },
  medalRatioLabel: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: colors.textSecondary,
    marginBottom: 5,
  },
  medalRatioBarTrack: {
    width: "80%" as const,
    height: 6,
    backgroundColor: colors.extraLightGray,
    borderRadius: 3,
    overflow: "hidden" as const,
    marginBottom: 4,
  },
  medalRatioBarFill: {
    height: "100%" as const,
    borderRadius: 3,
  },
  medalRatioPercent: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  medalRatioDivider: {
    width: 1,
    height: 58,
    backgroundColor: colors.divider,
    alignSelf: "center" as const,
  },
  medalEventsList: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 8,
    marginBottom: 10,
  },
  medalEventRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 8,
  },
  medalEventInfo: {
    flex: 1,
    marginRight: 10,
  },
  medalEventName: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: colors.text,
  },
  medalEventBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  medalEventBadgeEarned: {
    backgroundColor: "#FEF3C7",
  },
  medalEventBadgePending: {
    backgroundColor: colors.extraLightGray,
  },
  medalEventBadgeText: {
    fontSize: 11,
    fontWeight: "700" as const,
  },
  medalEventBadgeTextEarned: {
    color: "#B45309",
  },
  medalEventBadgeTextPending: {
    color: colors.textLight,
  },
  habitCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  combinedHabitCard: {
    marginTop: 12,
  },
  habitDeclarationRow: {
    backgroundColor: "#F0FDFA",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#0D9488",
  },
  habitDeclarationText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: colors.text,
    lineHeight: 19,
  },
  habitHighlight: {
    fontWeight: "800" as const,
    color: "#0D9488",
  },
  habitDateRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginBottom: 8,
  },
  habitDateText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  habitCommitmentHeader: {
    alignItems: "center" as const,
    marginBottom: 12,
  },
  habitCommitmentPill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 16,
  },
  habitCommitmentPillText: {
    fontSize: 13,
    fontWeight: "700" as const,
  },
  habitCommitmentDetail: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center" as const,
    marginTop: 4,
  },
  habitChipRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  habitChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.extraLightGray,
    borderWidth: 2,
    borderColor: "transparent",
  },
  habitChipActive: {
    backgroundColor: "#F0FDFA",
    borderColor: "#0D9488",
  },
  habitChipText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: colors.textSecondary,
  },
  habitChipTextActive: {
    color: "#0D9488",
    fontWeight: "700" as const,
  },
  habitPreview: {
    backgroundColor: "#F0FDFA",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#0D9488",
  },
  habitPreviewText: {
    fontSize: 17,
    fontWeight: "600" as const,
    color: colors.text,
    lineHeight: 24,
  },
  habitPreviewHighlight: {
    fontWeight: "800" as const,
    color: "#0D9488",
  },
  untrackedContainer: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  untrackedChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: colors.extraLightGray,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.divider,
    borderStyle: "dashed" as const,
  },
  untrackedChipText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: colors.textLight,
  },
});
