import { StyleSheet, View, Text, ScrollView, RefreshControl, Animated, TouchableOpacity, TextInput, Alert, Modal } from "react-native";
import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Target, TrendingDown, TrendingUp, Award, Calendar, Scale, Zap, X, Clock, ChevronRight, Plus, Heart, Moon, Droplets, Footprints, Users, ArrowUp, ArrowDown, Minus, Trophy, Flame } from "lucide-react-native";
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
  target_pace: number;
  target_date: string;
  created_at: string;
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
  Goal: string;
}

interface RecentActivity {
  pace_km_h: number;
  activity_date: string;
}

interface CommunityRankData {
  registrationId: string;
  Name: string;
  AvgDistance: number;
  ActiveDays: number;
  AveragePace: number;
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

const convertKmhToMinPerKm = (kmh: number): number => {
  if (kmh <= 0) return 0;
  return 60 / kmh;
};

const formatPaceMinPerKm = (kmh: number): string => {
  if (kmh <= 0) return "--:--";
  const minPerKm = 60 / kmh;
  const minutes = Math.floor(minPerKm);
  const seconds = Math.round((minPerKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const convertMinPerKmToKmh = (minPerKm: number): number => {
  if (minPerKm <= 0) return 0;
  return 60 / minPerKm;
};

export default function GoalsScreen() {
  const { user } = useAuth();
  const { colors: themeColors } = useTheme();
  const { isSubscribed } = useSubscription();

  if (!isSubscribed) {
    return (
      <SubscriptionGate featureName="Goals">
        <></>
      </SubscriptionGate>
    );
  }
  const queryClient = useQueryClient();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [targetPaceMin, setTargetPaceMin] = useState("");
  const [targetPaceSec, setTargetPaceSec] = useState("");
  const [targetDate, setTargetDate] = useState("");
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
          .select("goal_id, Goal")
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
    if (name.includes("fitness") || name.includes("pace")) return "fitness";
    if (name.includes("weight")) return "weight";
    if (name.includes("health")) return "health";
    if (name.includes("habit") || name.includes("discipline")) return "habit";
    if (name.includes("medal")) return "medals";
    if (name.includes("community") || name.includes("compete")) return "community";
    if (name.includes("event")) return "events";
    return null;
  }, []);

  const orderedGoalKeys = useMemo(() => {
    const keys: string[] = [];
    for (const g of goalOrder) {
      const key = goalNameToKey(g.Goal);
      if (key && !keys.includes(key)) {
        keys.push(key);
      }
    }
    const allKeys = ["fitness", "weight", "health", "habit", "medals", "community", "events"];
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

  const { data: recentActivities = [], refetch: refetchRecent } = useQuery<RecentActivity[]>({
    queryKey: ["recentPaceActivities", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("activities")
        .select("pace_km_h, activity_date")
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

  const saveFitnessGoalMutation = useMutation({
    mutationFn: async ({ paceKmh, date }: { paceKmh: number; date: string }) => {
      if (!user?.id) throw new Error("Not logged in");

      const { data, error } = await supabase
        .from("fitness_goal")
        .insert({
          registration_id: user.id,
          target_pace: paceKmh,
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

    const paceKmh = convertMinPerKmToKmh(totalMinPerKm);
    saveFitnessGoalMutation.mutate({ paceKmh, date: targetDate });
  }, [targetPaceMin, targetPaceSec, targetDate, saveFitnessGoalMutation]);

  const fitnessProgress = useMemo(() => {
    if (!fitnessGoal || recentActivities.length === 0) return null;

    const validActivities = recentActivities.filter((a) => a.pace_km_h > 0);
    if (validActivities.length === 0) return null;

    const avgPaceKmh = validActivities.reduce((sum, a) => sum + a.pace_km_h, 0) / validActivities.length;
    const targetPaceKmh = fitnessGoal.target_pace;

    const avgMinPerKm = convertKmhToMinPerKm(avgPaceKmh);
    const targetMinPerKm = convertKmhToMinPerKm(targetPaceKmh);

    const progressPercent = targetMinPerKm > 0
      ? Math.min(100, Math.max(0, (targetMinPerKm / avgMinPerKm) * 100))
      : 0;

    const daysLeft = Math.max(0, Math.ceil((new Date(fitnessGoal.target_date + "T00:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

    const isAhead = avgPaceKmh >= targetPaceKmh;

    return {
      avgPaceKmh,
      targetPaceKmh,
      avgMinPerKm,
      targetMinPerKm,
      progressPercent,
      daysLeft,
      isAhead,
      activitiesUsed: validActivities.length,
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

    const stepsScore = Math.min(100, (avgSteps / 10000) * 100);

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
      steps: { score: Math.round(stepsScore), avg: Math.round(avgSteps) },
      heartRate: avgHeartRate !== null ? { score: Math.round(heartRateScore), avg: Math.round(avgHeartRate) } : null,
      sleep: avgSleep !== null ? { score: Math.round(sleepScore), avg: parseFloat(avgSleep.toFixed(1)) } : null,
      spo2: avgSpo2 !== null ? { score: Math.round(spo2Score), avg: parseFloat(avgSpo2.toFixed(1)) } : null,
      entriesUsed: count,
    };
  }, [healthEntries]);

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
      Alert.alert("Success", "Your habit declaration has been saved!");
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

  const { refetch: refetchActivity } = useQuery<ActivitySummary>({
    queryKey: ["goalActivitySummary", user?.id],
    queryFn: async () => {
      if (!user?.id) return { totalDistance: 0, totalTime: 0, activeDays: 0, avgDistance: 0, avgPace: 0, streakDays: 0 };
      const { data, error } = await supabase
        .from("activities")
        .select("activity_date, distance_km, start_time, end_time, pace_km_h")
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
        paceSum += a.pace_km_h || 0;
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



  const { data: communityRankData, isLoading: communityRankLoading, refetch: refetchCommunityRank } = useQuery<CommunityRankData[]>({
    queryKey: ["goalCommunityRank"],
    queryFn: async () => {
      try {
        const { data: activities, error: activityError } = await supabase
          .from("activities")
          .select("registration_id, activity_date, distance_km, start_time, end_time, pace_km_h");
        if (activityError) {
          console.error("[Goals] Community rank activity fetch error:", JSON.stringify(activityError));
          throw activityError;
        }
        const { data: registrations, error: regError } = await supabase
          .from("registrations")
          .select('registration_id, first_name, other_names');
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
          existing.paceSum += activity.pace_km_h || 0;
          existing.activityCount += 1;
          existing.activeDays.add(activity.activity_date);
          userStats.set(regId, existing);
        });
        const result: CommunityRankData[] = [];
        userStats.forEach((stats, regId) => {
          const registration = regMap.get(regId) as any;
          if (!registration) return;
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
    void refetchRecent();
    void refetchHealth();
    void refetchHabit();
    void refetchCommunityRank();
    void refetchMedalGoal();
  };

  const weightProgress = useMemo(() => {
    if (!weightTargetGoal) return null;

    const target = weightTargetGoal.target_weight;
    const targetDateStr = weightTargetGoal.target_date;

    const latestEntry = weightEntries.length > 0 ? weightEntries[weightEntries.length - 1] : null;
    const firstEntry = weightEntries.length > 0 ? weightEntries[0] : null;
    const current = latestEntry?.weight ?? null;

    if (current === null) {
      return { current: null, target, targetDate: targetDateStr, diff: 0, isLosing: true, progressPercent: 0, entries: weightEntries, firstEntry, latestEntry, daysLeft: 0 };
    }

    const startWeight = firstEntry?.weight ?? current;
    const totalToLose = startWeight - target;
    const lostSoFar = startWeight - current;
    const isLosing = current > target;
    const progressPercent = totalToLose > 0
      ? Math.min(100, Math.max(0, (lostSoFar / totalToLose) * 100))
      : current <= target ? 100 : 0;

    const daysLeft = Math.max(0, Math.ceil((new Date(targetDateStr + "T00:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

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
    };
  }, [weightTargetGoal, weightEntries]);

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
      const minPerKm = convertKmhToMinPerKm(fitnessGoal.target_pace);
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

  const hasNoGoals = userGoals.length === 0 && !weightTargetGoal && ongoingEvents.length === 0 && !fitnessGoal && !fitnessGoalLoading && !weightTargetLoading && healthEntries.length === 0 && !healthLoading && !habitDeclaration && !habitDeclarationLoading && !communityRanking && !communityRankLoading && !medalGoalData && !medalGoalLoading;

  const allGoalTypesMap = useMemo(() => {
    const map: Record<string, { key: string; label: string; isTracked: boolean; icon: "zap" | "scale" | "heart" | "flame" | "trophy" | "users" }> = {
      fitness: { key: "fitness", label: "Improve Fitness", isTracked: !!fitnessGoal, icon: "zap" },
      weight: { key: "weight", label: "Weight Loss", isTracked: !!weightTargetGoal, icon: "scale" },
      health: { key: "health", label: "General Health", isTracked: healthEntries.length > 0, icon: "heart" },
      habit: { key: "habit", label: "Build My Habit", isTracked: !!habitDeclaration, icon: "flame" },
      medals: { key: "medals", label: "Earn Medals", isTracked: !!medalGoalData && medalGoalData.enrolledEvents > 0, icon: "trophy" },
      community: { key: "community", label: "Compete in Community", isTracked: !!communityRanking, icon: "users" },
    };
    return map;
  }, [fitnessGoal, weightTargetGoal, healthEntries, habitDeclaration, medalGoalData, communityRanking]);

  const allGoalTypes = useMemo(() => {
    const goalKeys = orderedGoalKeys.filter(k => k !== "events");
    return goalKeys.map(k => allGoalTypesMap[k]).filter(Boolean);
  }, [orderedGoalKeys, allGoalTypesMap]);

  const trackedGoalsCount = useMemo(() => allGoalTypes.filter(g => g.isTracked).length, [allGoalTypes]);
  const untrackedGoals = useMemo(() => allGoalTypes.filter(g => !g.isTracked), [allGoalTypes]);

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

        {orderedGoalKeys.map((goalKey) => {
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
                        {formatPaceMinPerKm(fitnessProgress.avgPaceKmh)}
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
                        {formatPaceMinPerKm(fitnessProgress.targetPaceKmh)}
                      </Text>
                      <Text style={styles.paceBlockUnit}>min/km</Text>
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
                    Based on last {fitnessProgress.activitiesUsed} {fitnessProgress.activitiesUsed === 1 ? "activity" : "activities"}
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
                      Complete your first activity to start tracking your pace against your target of {formatPaceMinPerKm(fitnessGoal.target_pace)} min/km
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

                  <View style={styles.healthBreakdown}>
                    <View style={styles.healthMetricRow}>
                      <View style={styles.healthMetricIcon}>
                        <Footprints size={16} color="#4A90E2" />
                      </View>
                      <View style={styles.healthMetricInfo}>
                        <Text style={styles.healthMetricLabel}>Steps</Text>
                        <Text style={styles.healthMetricValue}>{healthScore.steps.avg.toLocaleString()}/day</Text>
                      </View>
                      <View style={styles.healthMetricBarContainer}>
                        <View style={styles.healthMetricBarTrack}>
                          <View style={[styles.healthMetricBarFill, { width: `${healthScore.steps.score}%`, backgroundColor: "#4A90E2" }]} />
                        </View>
                        <Text style={styles.healthMetricScore}>{healthScore.steps.score}</Text>
                      </View>
                    </View>

                    {healthScore.heartRate && (
                      <View style={styles.healthMetricRow}>
                        <View style={styles.healthMetricIcon}>
                          <Heart size={16} color="#E11D48" />
                        </View>
                        <View style={styles.healthMetricInfo}>
                          <Text style={styles.healthMetricLabel}>Heart Rate</Text>
                          <Text style={styles.healthMetricValue}>{healthScore.heartRate.avg} bpm</Text>
                        </View>
                        <View style={styles.healthMetricBarContainer}>
                          <View style={styles.healthMetricBarTrack}>
                            <View style={[styles.healthMetricBarFill, { width: `${healthScore.heartRate.score}%`, backgroundColor: "#E11D48" }]} />
                          </View>
                          <Text style={styles.healthMetricScore}>{healthScore.heartRate.score}</Text>
                        </View>
                      </View>
                    )}

                    {healthScore.sleep && (
                      <View style={styles.healthMetricRow}>
                        <View style={styles.healthMetricIcon}>
                          <Moon size={16} color="#8B5CF6" />
                        </View>
                        <View style={styles.healthMetricInfo}>
                          <Text style={styles.healthMetricLabel}>Sleep</Text>
                          <Text style={styles.healthMetricValue}>{healthScore.sleep.avg}h/night</Text>
                        </View>
                        <View style={styles.healthMetricBarContainer}>
                          <View style={styles.healthMetricBarTrack}>
                            <View style={[styles.healthMetricBarFill, { width: `${healthScore.sleep.score}%`, backgroundColor: "#8B5CF6" }]} />
                          </View>
                          <Text style={styles.healthMetricScore}>{healthScore.sleep.score}</Text>
                        </View>
                      </View>
                    )}

                    {healthScore.spo2 && (
                      <View style={styles.healthMetricRow}>
                        <View style={styles.healthMetricIcon}>
                          <Droplets size={16} color="#0EA5E9" />
                        </View>
                        <View style={styles.healthMetricInfo}>
                          <Text style={styles.healthMetricLabel}>Blood Oxygen</Text>
                          <Text style={styles.healthMetricValue}>{healthScore.spo2.avg}% SpO2</Text>
                        </View>
                        <View style={styles.healthMetricBarContainer}>
                          <View style={styles.healthMetricBarTrack}>
                            <View style={[styles.healthMetricBarFill, { width: `${healthScore.spo2.score}%`, backgroundColor: "#0EA5E9" }]} />
                          </View>
                          <Text style={styles.healthMetricScore}>{healthScore.spo2.score}</Text>
                        </View>
                      </View>
                    )}
                  </View>

                  <Text style={styles.fitnessFootnote}>
                    Based on last {healthScore.entriesUsed} {healthScore.entriesUsed === 1 ? "day" : "days"}
                  </Text>

                  {healthEntries.length > 0 && (
                    <View style={styles.healthHistorySection}>
                      <Text style={styles.weightHistoryTitle}>Recent Entries</Text>
                      {healthEntries.slice(0, 5).map((entry) => (
                        <View key={entry.health_id} style={styles.healthHistoryRow}>
                          <Text style={styles.weightHistoryDate}>{formatGoalDate(entry.record_date)}</Text>
                          <View style={styles.healthHistoryStats}>
                            <Text style={styles.healthHistoryStat}>{entry.steps?.toLocaleString() ?? "-"} steps</Text>
                            {entry.heart_rate_bpm ? <Text style={styles.healthHistoryStatSub}>{entry.heart_rate_bpm} bpm</Text> : null}
                            {entry.blood_oxygen_spo2 ? <Text style={styles.healthHistoryStatSub}>{entry.blood_oxygen_spo2}% SpO2</Text> : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
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
                  <Text style={styles.sectionTitle}>Build My Habit</Text>
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
                        Start logging activities to track your commitment
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ) : !habitDeclarationLoading ? (
              <View key="habit" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Flame size={18} color="#0D9488" />
                  <Text style={styles.sectionTitle}>Build My Habit</Text>
                </View>
                <TouchableOpacity style={styles.setupGoalCard} onPress={() => { resetHabitForm(); setShowHabitModal(true); }} activeOpacity={0.8}>
                  <LinearGradient colors={["#0D9488", "#14B8A6"]} style={styles.setupGoalGradient}>
                    <Flame size={32} color={colors.white} />
                    <Text style={styles.setupGoalTitle}>Build My Habit</Text>
                    <Text style={styles.setupGoalSubtext}>
                      Make your declaration and track your commitment
                    </Text>
                    <View style={styles.setupGoalButton}>
                      <Text style={[styles.setupGoalButtonText, { color: "#0D9488" }]}>Make Declaration</Text>
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
                      <Text style={styles.medalRatioLabel}>Races Enrolled</Text>
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
                      <Text style={styles.medalRatioLabel}>Medals Earned</Text>
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
                    {medalGoalData.totalEvents} {medalGoalData.totalEvents === 1 ? "race" : "races"} available
                  </Text>
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
            return communityRanking ? (
              <View key="community" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Users size={18} color="#0EA5E9" />
                  <Text style={styles.sectionTitle}>Compete in Community</Text>
                </View>
                <View style={styles.communityCard}>
                  <View style={styles.communityRankCenter}>
                    <View style={styles.communityRankCircle}>
                      <Text style={styles.communityRankNumber}>#{communityRanking.currentRank}</Text>
                      <Text style={styles.communityRankOf}>of {communityRanking.totalParticipants}</Text>
                    </View>
                    {rankChange ? (
                      <View style={[
                        styles.rankChangePill,
                        rankChange.isImproving && styles.rankChangePillUp,
                        rankChange.isDeclining && styles.rankChangePillDown,
                        rankChange.isSame && styles.rankChangePillSame,
                      ]}>
                        {rankChange.isImproving ? (
                          <ArrowUp size={13} color="#10B981" />
                        ) : rankChange.isDeclining ? (
                          <ArrowDown size={13} color="#EF4444" />
                        ) : (
                          <Minus size={13} color="#F59E0B" />
                        )}
                        <Text style={[
                          styles.rankChangeText,
                          rankChange.isImproving && styles.rankChangeTextUp,
                          rankChange.isDeclining && styles.rankChangeTextDown,
                          rankChange.isSame && styles.rankChangeTextSame,
                        ]}>
                          {rankChange.isImproving
                            ? `Up ${Math.abs(rankChange.diff)} ${Math.abs(rankChange.diff) === 1 ? "place" : "places"}`
                            : rankChange.isDeclining
                            ? `Down ${Math.abs(rankChange.diff)} ${Math.abs(rankChange.diff) === 1 ? "place" : "places"}`
                            : "No change"}
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.rankChangePill, styles.rankChangePillSame]}>
                        <Text style={[styles.rankChangeText, styles.rankChangeTextSame]}>First check-in</Text>
                      </View>
                    )}
                  </View>

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

                  {rankChange && rankChange.previousRank > 0 && (
                    <View style={styles.communityHistoryRow}>
                      <Text style={styles.communityHistoryLabel}>Previous rank</Text>
                      <Text style={styles.communityHistoryValue}>#{rankChange.previousRank}</Text>
                    </View>
                  )}

                  <Text style={styles.fitnessFootnote}>
                    Ranked by average daily distance
                  </Text>
                </View>
              </View>
            ) : !communityRankLoading ? (
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



        {hasNoGoals && (
          <View style={styles.emptyContainer}>
            <Target size={48} color={colors.lightGray} />
            <Text style={styles.emptyTitle}>No Goals Set Yet</Text>
            <Text style={styles.emptySubtext}>
              Visit your Profile to set fitness goals, weight targets, and join events to track your progress here.
            </Text>
          </View>
        )}

        {untrackedGoals.length > 0 && !hasNoGoals && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Target size={18} color={colors.textLight} />
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Goals Not Being Tracked</Text>
            </View>
            <View style={styles.untrackedContainer}>
              {untrackedGoals.map((goal) => (
                <View key={goal.key} style={styles.untrackedChip}>
                  {goal.icon === "zap" && <Zap size={14} color={colors.textLight} />}
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
                <Text style={styles.inputHint}>Today's date will be used automatically</Text>
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
                  {["Walk", "Run", "Treadmill"].map((type) => (
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
                Enter today's data from your smartwatch. Steps are required, other fields are optional.
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
                <Text style={styles.inputHint}>Today's date will be used automatically</Text>
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
  section: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
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
    marginBottom: 20,
  },
  paceBlock: {
    alignItems: "center" as const,
    flex: 1,
  },
  paceBlockLabel: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: colors.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  paceBlockValue: {
    fontSize: 26,
    fontWeight: "800" as const,
  },
  paceGood: {
    color: "#10B981",
  },
  paceBehind: {
    color: "#EF4444",
  },
  paceBlockValueTarget: {
    fontSize: 26,
    fontWeight: "800" as const,
    color: colors.text,
  },
  paceBlockUnit: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  paceArrowContainer: {
    paddingHorizontal: 8,
  },
  statusPillGood: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusPillTextGood: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#10B981",
  },
  statusPillBehind: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusPillTextBehind: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#EF4444",
  },
  fitnessProgressSection: {
    marginBottom: 14,
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
    borderRadius: 16,
    padding: 20,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
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
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
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
    borderRadius: 16,
    padding: 20,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  healthScoreCircleContainer: {
    alignItems: "center" as const,
    marginBottom: 20,
  },
  healthScoreCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 5,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 10,
  },
  healthScoreNumber: {
    fontSize: 36,
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
  healthBreakdown: {
    gap: 14,
    marginBottom: 14,
  },
  healthMetricRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  healthMetricIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.extraLightGray,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  healthMetricInfo: {
    flex: 1,
  },
  healthMetricLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: colors.text,
  },
  healthMetricValue: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
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
    fontSize: 15,
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
    borderRadius: 16,
    padding: 20,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  communityRankCenter: {
    alignItems: "center" as const,
    marginBottom: 20,
  },
  communityRankCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 5,
    borderColor: "#0EA5E9",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 12,
    backgroundColor: "#F0F9FF",
  },
  communityRankNumber: {
    fontSize: 32,
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
  medalGoalCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  medalRatiosRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    marginBottom: 16,
  },
  medalRatioBlock: {
    flex: 1,
    alignItems: "center" as const,
  },
  medalRatioCircle: {
    alignItems: "center" as const,
    marginBottom: 8,
  },
  medalRatioNumber: {
    fontSize: 32,
    fontWeight: "900" as const,
    color: "#D97706",
  },
  medalRatioOf: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: -4,
  },
  medalRatioLabel: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: colors.textSecondary,
    marginBottom: 8,
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
    height: 80,
    backgroundColor: colors.divider,
    alignSelf: "center" as const,
  },
  medalEventsList: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
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
    borderRadius: 16,
    padding: 20,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  habitDeclarationRow: {
    backgroundColor: "#F0FDFA",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#0D9488",
  },
  habitDeclarationText: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: colors.text,
    lineHeight: 26,
  },
  habitHighlight: {
    fontWeight: "800" as const,
    color: "#0D9488",
  },
  habitDateRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginBottom: 16,
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
