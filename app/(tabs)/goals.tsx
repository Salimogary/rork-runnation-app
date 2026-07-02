import { StyleSheet, View, Text, ScrollView, RefreshControl, Animated, TouchableOpacity, TextInput, Alert, Modal } from "react-native";
import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Target, TrendingDown, TrendingUp, Award, Calendar, Scale, Zap, X, Clock, ChevronRight, Plus, Heart, Moon, Droplets, Footprints, Users, Trophy, Flame } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { supabase } from "@/lib/supabase";
import { getServerClient } from "@/lib/server-client";
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
  start_date?: string | null;
  target_date: string;
  target_bands?: FitnessPaceBand[] | null;
  created_at: string;
}

interface FitnessPaceBand {
  distance_km: number;
  target_minutes: number;
  target_pace_min_per_km: number;
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

type GoalPauseType = "injury" | "sick";

interface GoalPausePeriod {
  pause_id: number;
  registration_id: string;
  pause_type: GoalPauseType;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
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
  distance_km?: number | null;
  exercise_type?: string | null;
  activity_date: string;
  start_time?: string | null;
  end_time?: string | null;
  pause_duration_seconds?: number | null;
}

interface FitnessGoalSlotInput {
  distanceKm: string;
  hours: string;
  minutes: string;
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

interface CommunityRankHistoryPoint {
  date: string;
  familyRank?: number;
  familyTotal?: number;
  clubRank?: number;
  clubTotal?: number;
  communityRank?: number;
  communityTotal?: number;
}

interface ExternalMedalForm {
  activityDate: string;
  distanceKm: string;
  duration: string;
  eventName: string;
  location: string;
}

interface MedalTargetGoal {
  medal_goal_id: number;
  registration_id: string;
  target_medals: number;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

interface MedalRaceSummary {
  eventId: string;
  eventName: string;
  country: string;
  dateLabel: string;
  isVirtual: boolean;
  isEnrolled: boolean;
  isEarned: boolean;
}

interface MedalGoalData {
  targetMedals: number;
  availableRaces: number;
  medalsEarned: number;
  medalRatio: number;
  internalMedalsEarned: number;
  externalMedalsEarned: number;
  countryRaces: MedalRaceSummary[];
  virtualRaces: MedalRaceSummary[];
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

const formatPaceMinPerKm = (paceMinPerKm: number): string => {
  if (paceMinPerKm <= 0) return "--:--";
  const minutes = Math.floor(paceMinPerKm);
  const seconds = Math.round((paceMinPerKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const formatPaceDecimal = (paceMinPerKm: number): string => {
  if (!Number.isFinite(paceMinPerKm) || paceMinPerKm <= 0) return "0";
  return paceMinPerKm.toFixed(2);
};

const formatDistanceDecimal = (distanceKm: number): string => {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return "0";
  return Number.isInteger(distanceKm) ? distanceKm.toFixed(0) : distanceKm.toFixed(1);
};

const DEFAULT_FITNESS_GOAL_SLOTS: FitnessGoalSlotInput[] = [
  { distanceKm: "10", hours: "1", minutes: "0" },
  { distanceKm: "21", hours: "2", minutes: "15" },
  { distanceKm: "42", hours: "5", minutes: "30" },
  { distanceKm: "80", hours: "12", minutes: "0" },
];

const getFitnessBands = (fitnessGoal?: FitnessGoal | null): FitnessPaceBand[] => {
  const storedBands = Array.isArray(fitnessGoal?.target_bands) ? fitnessGoal?.target_bands || [] : [];
  const validBands = storedBands
    .map((band) => ({
      distance_km: Number(band.distance_km),
      target_minutes: Number(band.target_minutes),
      target_pace_min_per_km: Number(band.target_pace_min_per_km),
    }))
    .filter((band) => band.distance_km > 0 && band.target_minutes > 0 && band.target_pace_min_per_km > 0)
    .sort((a, b) => a.distance_km - b.distance_km);

  if (validBands.length > 0) return validBands;
  if (fitnessGoal?.target_pace_min_per_km && fitnessGoal.target_pace_min_per_km > 0) {
    return [{
      distance_km: 10,
      target_minutes: fitnessGoal.target_pace_min_per_km * 10,
      target_pace_min_per_km: fitnessGoal.target_pace_min_per_km,
    }];
  }
  return [];
};

const getFitnessBandForDistance = (distanceKm: number, bands: FitnessPaceBand[]): FitnessPaceBand | null => {
  if (bands.length === 0) return null;
  if (distanceKm <= bands[0].distance_km) return bands[0];
  const matchingBand = bands.find((band) => distanceKm <= band.distance_km);
  return matchingBand || bands[bands.length - 1];
};

const formatFitnessBandSummary = (bands: FitnessPaceBand[]): string => {
  return bands.map((band, index) => {
    const distanceLabel = index === 0
      ? `0-${formatDistanceDecimal(band.distance_km)}k`
      : `${formatDistanceDecimal(band.distance_km)}k+`;
    return `${distanceLabel} (${formatPaceDecimal(band.target_pace_min_per_km)} min/km)`;
  }).join(", ");
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

const getLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDaysIso = (value: string, days: number): string => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const minIsoDate = (a: string, b: string): string => (a <= b ? a : b);

const formatCompactDateRange = (start?: string | null, end?: string | null): string => {
  const startKey = getDateOnly(start);
  const endKey = getDateOnly(end);
  if (!startKey && !endKey) return "Date TBA";
  if (startKey && (!endKey || startKey === endKey)) return startKey;
  return `${startKey || "TBA"} - ${endKey || "TBA"}`;
};

const getGoalPauseForDate = (periods: GoalPausePeriod[], date: string): GoalPausePeriod | null => {
  return periods.find((period) =>
    date >= period.start_date &&
    (!period.end_date || date <= period.end_date)
  ) || null;
};

const getGoalPauseSymbol = (pauseType?: GoalPauseType | null): string => {
  if (pauseType === "injury") return "I";
  if (pauseType === "sick") return "S";
  return "";
};

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

const RANK_HISTORY_COLORS = {
  family: "#8B5CF6",
  club: "#10B981",
  community: "#0EA5E9",
};

function RankHistoryGraph({
  points,
  rankKey,
  totalKey,
  label,
  color,
  summary,
  backgroundColor = "#F8FAFC",
  borderColor,
}: {
  points: CommunityRankHistoryPoint[];
  rankKey: "familyRank" | "clubRank" | "communityRank";
  totalKey: "familyTotal" | "clubTotal" | "communityTotal";
  label: string;
  color: string;
  summary?: RankSummary | null;
  backgroundColor?: string;
  borderColor?: string;
}) {
  const width = 320;
  const height = 170;
  const paddingLeft = 34;
  const paddingRight = 14;
  const paddingTop = 18;
  const paddingBottom = 28;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const monthStartKey = getLocalDateKey(monthStart);
  const monthEndKey = getLocalDateKey(monthEnd);
  const monthSpanDays = Math.max(1, monthEnd.getDate() - 1);
  const eligiblePoints = points.filter((point) =>
    point.date >= monthStartKey &&
    point.date <= monthEndKey &&
    typeof point[rankKey] === "number" &&
    Number.isFinite(point[rankKey]) &&
    typeof point[totalKey] === "number" &&
    Number(point[totalKey]) >= 3
  );
  const rankValues = eligiblePoints
    .map((point) => point[rankKey])
    .filter((rank): rank is number => typeof rank === "number" && Number.isFinite(rank));
  if (eligiblePoints.length === 0 || rankValues.length === 0) return null;

  const minRank = Math.max(1, Math.min(...rankValues));
  const maxRank = Math.max(...rankValues, minRank + 1);
  const midRank = Math.round((minRank + maxRank) / 2);
  const xForDate = (dateString: string) => {
    const date = new Date(`${dateString}T00:00:00`);
    const dayIndex = Number.isNaN(date.getTime()) ? 0 : date.getDate() - 1;
    return paddingLeft + (dayIndex / monthSpanDays) * chartWidth;
  };
  const yForRank = (rank: number) => paddingTop + ((rank - minRank) / Math.max(1, maxRank - minRank)) * chartHeight;
  const middleDay = Math.ceil(monthEnd.getDate() / 2);
  const xAxisLabels = [
    { key: monthStartKey, label: "1" },
    { key: getLocalDateKey(new Date(today.getFullYear(), today.getMonth(), middleDay)), label: String(middleDay) },
    { key: monthEndKey, label: String(monthEnd.getDate()) },
  ];

  return (
    <View style={[styles.rankGraphBlock, { backgroundColor, borderColor: borderColor || color }]}>
      <View style={styles.rankGraphTitleRow}>
        <View style={styles.rankGraphTitleInfo}>
          <Text style={styles.rankGraphTitle}>{label}</Text>
          <Text style={styles.rankGraphSubtitle}>
            {summary ? `${summary.metricLabel}: ${summary.metricValue}` : "Activity rank"}
          </Text>
        </View>
        {summary ? (
          <View style={[styles.rankGraphPill, { borderColor: color }]}>
            <Text style={[styles.rankGraphPillValue, { color }]}>#{summary.currentRank}</Text>
            <Text style={styles.rankGraphPillOf}>of {summary.totalParticipants}</Text>
          </View>
        ) : (
          <Text style={styles.rankGraphSubtitle}>Activity rank</Text>
        )}
      </View>
      <View style={[styles.rankGraphFrame, { backgroundColor }]}>
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
          <Line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height - paddingBottom} stroke="#CBD5E1" strokeWidth="1.2" />
          <Line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="#CBD5E1" strokeWidth="1.2" />
          <Line x1={paddingLeft} y1={paddingTop} x2={width - paddingRight} y2={paddingTop} stroke="#F1F5F9" strokeWidth="1" />
          <Line x1={paddingLeft} y1={yForRank(midRank)} x2={width - paddingRight} y2={yForRank(midRank)} stroke="#F1F5F9" strokeWidth="1" />
          <SvgText x={6} y={12} fill="#64748B" fontSize="9" fontWeight="700">Rank</SvgText>
          <SvgText x={6} y={paddingTop + 4} fill="#64748B" fontSize="9" fontWeight="700">#{minRank}</SvgText>
          <SvgText x={6} y={yForRank(midRank) + 4} fill="#94A3B8" fontSize="9" fontWeight="700">#{midRank}</SvgText>
          <SvgText x={6} y={height - paddingBottom + 4} fill="#64748B" fontSize="9" fontWeight="700">#{maxRank}</SvgText>
          <SvgText x={width - 34} y={height - 5} fill="#64748B" fontSize="9" fontWeight="700">Date</SvgText>
          {xAxisLabels.map((item) => (
            <SvgText key={item.key} x={xForDate(item.key) - 3} y={height - 12} fill="#64748B" fontSize="9" fontWeight="700">
              {item.label}
            </SvgText>
          ))}
          <Polyline
            points={eligiblePoints
              .map((point) => `${xForDate(point.date)},${yForRank(point[rankKey] as number)}`)
              .join(" ")}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {eligiblePoints.map((point) =>
            (
              <Circle
                key={`${rankKey}-${point.date}`}
                cx={xForDate(point.date)}
                cy={yForRank(point[rankKey] as number)}
                r="3.5"
                fill={color}
                stroke="#FFFFFF"
                strokeWidth="1"
              />
            )
          )}
        </Svg>
      </View>
      <View style={styles.rankGraphDateRow}>
        <Text style={styles.rankGraphDateText}>{today.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</Text>
        <Text style={styles.rankGraphHintText}>lower rank is better</Text>
      </View>
    </View>
  );
}

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
  const { user } = useAuth();
  const { colors: themeColors } = useTheme();
  const { isSubscribed } = useSubscription();
  const queryClient = useQueryClient();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [fitnessStartDate, setFitnessStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [fitnessGoalSlots, setFitnessGoalSlots] = useState<FitnessGoalSlotInput[]>(DEFAULT_FITNESS_GOAL_SLOTS);
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
  const [habitActivityType, setHabitActivityType] = useState<string>("Run");
  const [habitAmount, setHabitAmount] = useState<string>("");
  const [habitUnit, setHabitUnit] = useState<string>("kilometers");
  const [habitFrequency, setHabitFrequency] = useState<string>("daily");
  const [habitStartDate, setHabitStartDate] = useState<string>("");
  const [showMedalGoalModal, setShowMedalGoalModal] = useState(false);
  const [medalTargetInput, setMedalTargetInput] = useState("");
  const [medalStartDateInput, setMedalStartDateInput] = useState("");
  const [medalEndDateInput, setMedalEndDateInput] = useState("");
  const [showExternalMedalModal, setShowExternalMedalModal] = useState(false);
  const [externalMedalForm, setExternalMedalForm] = useState<ExternalMedalForm>({
    activityDate: "",
    distanceKm: "",
    duration: "",
    eventName: "",
    location: "",
  });
  const [externalMedalImageBase64, setExternalMedalImageBase64] = useState<string | null>(null);
  const [externalMedalMimeType, setExternalMedalMimeType] = useState<string | null>(null);
  const [externalMedalImageName, setExternalMedalImageName] = useState<string>("");
  const [isSubmittingExternalMedal, setIsSubmittingExternalMedal] = useState(false);
  const [previousRank, setPreviousRank] = useState<StoredRankSnapshot | null>(null);
  const [communityRankHistory, setCommunityRankHistory] = useState<CommunityRankHistoryPoint[]>([]);
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
    ) return "habit";
    if (name.includes("medal")) return "medals";
    if (name.includes("community") || name.includes("compete")) return "community";
    if (name.includes("event")) return "events";
    return null;
  }, []);

  const orderedGoalKeys = useMemo(() => {
    const keys: string[] = [];
    for (const g of goalOrder) {
      const key = g.goal_id === 7 ? "habit" : goalNameToKey(g.goal);
      if (key && !keys.includes(key)) {
        keys.push(key);
      }
    }
    const allKeys = ["fitness", "dailyRun", "habit", "weight", "health", "medals", "community", "events"];
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

  const { data: dailyRunActivities = [], refetch: refetchDailyRunActivities } = useQuery<{ activity_date: string; distance_km?: number | null }[]>({
    queryKey: ["dailyRunActivities", user?.id, dailyRunGoal?.start_date, dailyRunGoal?.end_date],
    queryFn: async () => {
      if (!user?.id || !dailyRunGoal) return [];
      const { data, error } = await supabase
        .from("activities")
        .select("activity_date, distance_km")
        .eq("registration_id", user.id)
        .eq("exercise_type", "Run")
        .gte("activity_date", dailyRunGoal.start_date)
        .lte("activity_date", dailyRunGoal.end_date);
      if (error) {
        console.error("[Goals] Error fetching daily run activities:", error);
        return [];
      }
      return (data || []) as { activity_date: string; distance_km?: number | null }[];
    },
    enabled: !!user?.id && !!dailyRunGoal,
    staleTime: 30000,
  });

  const { data: goalPausePeriods = [], refetch: refetchGoalPausePeriods } = useQuery<GoalPausePeriod[]>({
    queryKey: ["goalPausePeriods", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("user_goal_pause_periods")
        .select("pause_id, registration_id, pause_type, start_date, end_date, is_active")
        .eq("registration_id", user.id)
        .order("start_date", { ascending: true });
      if (error) {
        console.warn("[Goals] Could not load injury/sick periods:", error);
        return [];
      }
      return (data || []) as GoalPausePeriod[];
    },
    enabled: !!user?.id,
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
        .select("pace_min_per_km, distance_km, exercise_type, activity_date")
        .eq("registration_id", user.id)
        .eq("exercise_type", "Run")
        .order("activity_date", { ascending: false })
        .limit(90);
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
    mutationFn: async ({ paceMinPerKm, startDate, endDate, bands }: { paceMinPerKm: number; startDate: string; endDate: string; bands: FitnessPaceBand[] }) => {
      if (!user?.id) throw new Error("Not logged in");

      const payload = {
        registration_id: user.id,
        target_pace_min_per_km: paceMinPerKm,
        start_date: startDate,
        target_date: endDate,
        target_bands: bands,
      };

      const query = fitnessGoal
        ? supabase
          .from("fitness_goal")
          .update(payload)
          .eq("fitness_goal_id", fitnessGoal.fitness_goal_id)
        : supabase
          .from("fitness_goal")
          .insert(payload);

      const { data, error } = await query.select().single();
      if (error) {
        console.error("[Goals] Supabase insert error:", JSON.stringify(error));
        throw new Error(error.message || "Failed to save fitness goal");
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fitnessGoal", user?.id] });
      setShowGoalForm(false);
      setFitnessStartDate("");
      setTargetDate("");
      setFitnessGoalSlots(DEFAULT_FITNESS_GOAL_SLOTS);
      Alert.alert("Success", "Fitness goal saved!");
    },
    onError: (error: any) => {
      console.error("[Goals] Save fitness goal error:", JSON.stringify(error));
      Alert.alert("Error", error?.message || "Failed to save fitness goal");
    },
  });

  const handleSaveFitnessGoal = useCallback(() => {
    const bands = fitnessGoalSlots.map((slot) => {
      const distanceKm = parseFloat(slot.distanceKm);
      const hours = parseInt(slot.hours || "0", 10);
      const minutes = parseInt(slot.minutes || "0", 10);
      const targetMinutes = hours * 60 + minutes;
      return {
        distance_km: distanceKm,
        target_minutes: targetMinutes,
        target_pace_min_per_km: distanceKm > 0 ? targetMinutes / distanceKm : 0,
      };
    }).filter((band) =>
      Number.isFinite(band.distance_km) &&
      Number.isFinite(band.target_minutes) &&
      band.distance_km > 0 &&
      band.target_minutes > 0 &&
      band.target_pace_min_per_km > 0
    ).sort((a, b) => a.distance_km - b.distance_km);

    if (bands.length === 0) {
      Alert.alert("Error", "Please enter at least one distance and time target");
      return;
    }

    if (bands.length > 4) {
      Alert.alert("Error", "You can save up to 4 fitness targets");
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fitnessStartDate) || !dateRegex.test(targetDate)) {
      Alert.alert("Error", "Please enter start and end dates in YYYY-MM-DD format");
      return;
    }

    const startDateObj = new Date(fitnessStartDate + "T00:00:00");
    const endDateObj = new Date(targetDate + "T00:00:00");
    if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime())) {
      Alert.alert("Error", "Please enter valid fitness goal dates");
      return;
    }
    if (endDateObj < startDateObj) {
      Alert.alert("Error", "End date must be after start date");
      return;
    }

    const paceMinPerKm = normalizePaceInputMinPerKm(bands[0].target_pace_min_per_km);
    saveFitnessGoalMutation.mutate({ paceMinPerKm, startDate: fitnessStartDate, endDate: targetDate, bands });
  }, [fitnessGoalSlots, fitnessStartDate, targetDate, saveFitnessGoalMutation]);

  const updateFitnessGoalSlot = useCallback((index: number, field: keyof FitnessGoalSlotInput, value: string) => {
    setFitnessGoalSlots((current) => current.map((slot, slotIndex) =>
      slotIndex === index ? { ...slot, [field]: value } : slot
    ));
  }, []);

  const fitnessCalendarProgress = useMemo(() => {
    if (!fitnessGoal) return null;
    const bands = getFitnessBands(fitnessGoal);
    if (bands.length === 0) return null;

    const startDate = fitnessGoal.start_date || fitnessGoal.created_at?.split?.("T")?.[0] || "";
    const endDate = fitnessGoal.target_date || "";
    const start = startDate ? new Date(startDate + "T00:00:00") : null;
    const end = endDate ? new Date(endDate + "T00:00:00") : null;

    const runsByDate = new Map<string, { totalDistance: number; weightedPaceSum: number; paceSum: number; count: number }>();
    recentActivities
      .filter((activity) => Number(activity.pace_min_per_km) > 0)
      .forEach((activity) => {
        const date = String(activity.activity_date || "").split("T")[0];
        if (!date) return;
        const pace = Number(activity.pace_min_per_km) || 0;
        const distanceKm = Number(activity.distance_km) || 0;
        const existing = runsByDate.get(date) || { totalDistance: 0, weightedPaceSum: 0, paceSum: 0, count: 0 };
        existing.totalDistance += distanceKm;
        existing.weightedPaceSum += pace * distanceKm;
        existing.paceSum += pace;
        existing.count += 1;
        runsByDate.set(date, existing);
      });

    const days = Array.from(runsByDate.entries())
      .map(([date, summary]) => {
        const distanceKm = summary.totalDistance > 0 ? summary.totalDistance : bands[0].distance_km;
        const band = getFitnessBandForDistance(distanceKm, bands);
        const pace = summary.totalDistance > 0
          ? summary.weightedPaceSum / summary.totalDistance
          : summary.paceSum / Math.max(1, summary.count);
        return {
          date,
          day: new Date(date + "T00:00:00").getDate(),
          pace,
          distanceKm,
          runCount: summary.count,
          targetPace: band?.target_pace_min_per_km || 0,
          isOnTarget: band ? pace <= band.target_pace_min_per_km : false,
        };
      })
      .filter((day) => day.date && Number.isFinite(day.day) && Number.isFinite(day.pace))
      .filter((day) => {
        const date = new Date(day.date + "T00:00:00");
        if (start && !Number.isNaN(start.getTime()) && date < start) return false;
        if (end && !Number.isNaN(end.getTime()) && date > end) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const runDays = days.length;
    const onTargetDays = days.filter((day) => day.isOnTarget).length;
    const scorePercent = runDays > 0 ? Math.round((onTargetDays / runDays) * 100) : 0;
    const fastestPace = days.reduce((best, day) => best === 0 ? day.pace : Math.min(best, day.pace), 0);
    const bandSummary = formatFitnessBandSummary(bands);

    return {
      bands,
      bandSummary,
      days,
      runDays,
      onTargetDays,
      scorePercent,
      fastestPace,
      isOnTrack: runDays > 0 && onTargetDays === runDays,
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
    setHabitActivityType("Run");
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

  const habitCalendarProgress = useMemo(() => {
    if (!habitDeclaration) return null;
    const start = new Date(habitDeclaration.start_date + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (Number.isNaN(start.getTime()) || today < start) return null;

    const targetDistance = habitDeclaration.unit === "kilometers" ? habitDeclaration.target_amount : 0;
    if (targetDistance <= 0) return null;

    const distanceByDate = new Map<string, number>();
    habitActivities.forEach((entry: any) => {
      const date = String(entry.activity_date || "").split("T")[0];
      if (!date) return;
      distanceByDate.set(date, (distanceByDate.get(date) || 0) + (Number(entry.distance_km) || 0));
    });

    const days = [];
    const iter = new Date(start);
    while (iter <= today) {
      const date = getLocalDateKey(iter);
      const distanceKm = distanceByDate.get(date) || 0;
      const pause = getGoalPauseForDate(goalPausePeriods, date);
      const isOnTarget = distanceKm >= targetDistance;
      days.push({
        date,
        day: iter.getDate(),
        distanceKm,
        isOnTarget,
        pauseType: pause?.pause_type || null,
        isExcused: !!pause && !isOnTarget,
      });
      iter.setDate(iter.getDate() + 1);
    }

    const plannedDays = days.filter((day) => !day.isExcused).length;
    const daysMet = days.filter((day) => day.isOnTarget).length;
    const scorePercent = plannedDays > 0 ? Math.round((daysMet / plannedDays) * 100) : 0;
    const totalDistance = days.reduce((sum, day) => sum + day.distanceKm, 0);

    return {
      targetDistance,
      days,
      plannedDays,
      daysMet,
      missedDays: plannedDays - daysMet,
      scorePercent,
      totalDistance,
      isOnTrack: daysMet >= plannedDays,
    };
  }, [goalPausePeriods, habitActivities, habitDeclaration]);

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
            const dateStr = getLocalDateKey(checkDate);
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

  const { data: userCanonicalRegistrationId } = useQuery<string | null>({
    queryKey: ["goalCanonicalRegistrationId", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const resolved = await resolveCanonicalRegistrationIds([user.id]);
      return resolved.get(user.id) || user.id;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const { data: medalTargetGoal, isLoading: medalTargetLoading, refetch: refetchMedalTargetGoal } = useQuery<MedalTargetGoal | null>({
    queryKey: ["medalTargetGoal", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("medal_goal")
        .select("*")
        .eq("registration_id", user.id)
        .maybeSingle();
      if (error) {
        console.error("[Goals] Error fetching medal target goal:", JSON.stringify(error));
        return null;
      }
      return data as MedalTargetGoal | null;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const { data: communityRankData, isLoading: communityRankLoading, refetch: refetchCommunityRank } = useQuery<CommunityRankData[]>({
    queryKey: ["goalCommunityRank", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        const activities: any[] = [];
        const pageSize = 1000;

        for (let offset = 0; ; offset += pageSize) {
          const { data: activityPage, error: activityError } = await supabase
            .from("activities")
            .select("activity_id, registration_id, activity_date, distance_km, start_time, end_time, pause_duration_seconds, pace_min_per_km")
            .order("activity_id", { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (activityError) {
            console.error("[Goals] Community rank activity fetch error:", JSON.stringify(activityError));
            throw activityError;
          }
          activities.push(...(activityPage || []));
          if (!activityPage || activityPage.length < pageSize) break;
        }

        const { data: registrations, error: regError } = await supabase
          .from("registrations")
          .select("registration_id, first_name, other_names, dob, has_disability, para_uses_equipment");
        if (regError) {
          console.error("[Goals] Community rank registration fetch error:", JSON.stringify(regError));
          throw regError;
        }

        const canonicalMap = await resolveCanonicalRegistrationIds([
          user.id,
          ...activities.map((activity: any) => activity.registration_id).filter(Boolean),
        ]);
        const eligibleRegistrations = (registrations || []).filter(
          (registration: any) => !isJuniorAge(registration.dob) && !usesParaEquipment(registration)
        );
        const eligibleRegistrationIds = new Set(eligibleRegistrations.map((registration: any) => registration.registration_id));
        const userStats = new Map<string, {
          totalDistance: number;
          totalTime: number;
          paceSum: number;
          activityCount: number;
          activeDays: Set<string>;
        }>();
        activities.forEach((activity: any) => {
          const regId = canonicalMap.get(activity.registration_id) || activity.registration_id;
          if (!regId) return;
          if (!eligibleRegistrationIds.has(regId)) return;
          const existing = userStats.get(regId) || {
            totalDistance: 0, totalTime: 0, paceSum: 0, activityCount: 0, activeDays: new Set<string>(),
          };
          existing.totalDistance += activity.distance_km || 0;
          existing.totalTime += getActivityDurationMinutes(activity) || 0;
          existing.paceSum += activity.pace_min_per_km || 0;
          existing.activityCount += 1;
          const activityDateKey = getDateOnly(activity.activity_date);
          if (activityDateKey) existing.activeDays.add(activityDateKey);
          userStats.set(regId, existing);
        });
        const result: CommunityRankData[] = [];
        eligibleRegistrations.forEach((registration: any) => {
          const regId = registration.registration_id;
          if (!regId) return;
          const stats = userStats.get(regId) || {
            totalDistance: 0,
            totalTime: 0,
            paceSum: 0,
            activityCount: 0,
            activeDays: new Set<string>(),
          };
          if (stats.totalDistance < 3 || stats.totalTime < 30) return;
          const firstName = registration.first_name || "";
          const otherNames = registration.other_names || "";
          const fullName = [firstName, otherNames].filter((n: string) => n).join(" ") || "Unknown";
          const activeDays = stats.activeDays.size;
          if (activeDays < 1) return;
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
      if ((memberships || []).length === 0) return null;

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

  const { data: clubRanking, isLoading: clubRankLoading, refetch: refetchClubRank } = useQuery<RankSummary | null>({
    queryKey: ["goalClubRank", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const canonicalMap = await resolveCanonicalRegistrationIds([user.id]);
      const ownerRegistrationId = canonicalMap.get(user.id) || user.id;

      const { data: memberships, error: membershipError } = await supabase
        .from("club_membership_request")
        .select("club_id, club")
        .eq("registration_id", ownerRegistrationId)
        .eq("request_type", "membership")
        .in("status", ["pending", "approved"]);
      if (membershipError) throw membershipError;

      const userClubIds = Array.from(new Set((memberships || []).map((row: any) => row.club_id).filter(Boolean)));
      if (userClubIds.length === 0) return null;

      const { data: clubRows, error: clubError } = await supabase
        .from("clubs")
        .select("club_id, club_name, coordinator_id, is_special_club, special_club_code")
        .in("club_id", userClubIds);
      if (clubError) throw clubError;

      const selectedClub = (clubRows || []).find((club: any) => !club.is_special_club && !club.special_club_code) || clubRows?.[0];
      if (!selectedClub?.club_id) return null;

      const [
        { data: clubMemberships, error: clubMembershipsError },
        legacyMembersResult,
      ] = await Promise.all([
        supabase
          .from("club_membership_request")
          .select("registration_id")
          .eq("club_id", selectedClub.club_id)
          .eq("request_type", "membership")
          .in("status", ["pending", "approved"]),
        selectedClub.coordinator_id
          ? supabase
              .from("club_members")
              .select("registration_id")
              .eq("coordinator_id", selectedClub.coordinator_id)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (clubMembershipsError) throw clubMembershipsError;
      if (legacyMembersResult.error) throw legacyMembersResult.error;

      const memberIds = Array.from(new Set([
        ownerRegistrationId,
        ...(clubMemberships || []).map((row: any) => row.registration_id).filter(Boolean),
        ...(legacyMembersResult.data || []).map((row: any) => row.registration_id).filter(Boolean),
      ]));
      if (memberIds.length === 0) return null;

      const { data: activities, error: activityError } = await supabase
        .from("activities")
        .select("registration_id, activity_date, distance_km, pace_min_per_km")
        .in("registration_id", memberIds);
      if (activityError) throw activityError;

      const rowsById = new Map<string, { distance: number; activeDays: Set<string>; paceSum: number; activityCount: number }>();
      memberIds.forEach((id) => rowsById.set(id, { distance: 0, activeDays: new Set<string>(), paceSum: 0, activityCount: 0 }));
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
        label: "Club",
        currentRank: userIndex + 1,
        totalParticipants: sorted.length,
        metricLabel: selectedClub.club_name || "Club",
        metricValue: `${sorted[userIndex].distance.toFixed(1)} km`,
      };
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const communityRanking = useMemo(() => {
    if (!communityRankData || !user?.id) return null;
    const currentRegistrationId = userCanonicalRegistrationId || user.id;
    const sorted = [...communityRankData].sort((a, b) => {
      const distDiff = b.AvgDistance - a.AvgDistance;
      if (distDiff !== 0) return distDiff;
      const daysDiff = b.ActiveDays - a.ActiveDays;
      if (daysDiff !== 0) return daysDiff;
      return a.AveragePace - b.AveragePace;
    });
    const userIndex = sorted.findIndex((item) => item.registrationId === currentRegistrationId || item.registrationId === user.id);
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
  }, [communityRankData, user?.id, userCanonicalRegistrationId]);

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
        const todayKey = getLocalDateKey(now);
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
      label: "Community",
      currentRank: communityRanking.currentRank,
      totalParticipants: communityRanking.totalParticipants,
      metricLabel: "Avg km/day",
      metricValue: communityRanking.avgDistance.toFixed(1),
    };
  }, [communityRanking]);

  useEffect(() => {
    if (!user?.id) {
      setCommunityRankHistory([]);
      return;
    }

    let active = true;
    void AsyncStorage.getItem(`community_goal_rank_history_${user.id}`)
      .then((stored) => {
        if (!active || !stored) return;
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCommunityRankHistory(parsed.filter((point) => point?.date).slice(-30));
        }
      })
      .catch((error) => {
        console.warn("[Goals] Could not load community rank history:", error);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || (!familyRanking && !clubRanking && !communityActivityRankSummary)) return;

    const today = getLocalDateKey(new Date());
    const nextPoint: CommunityRankHistoryPoint = {
      date: today,
      familyRank: familyRanking?.currentRank,
      familyTotal: familyRanking?.totalParticipants,
      clubRank: clubRanking?.currentRank,
      clubTotal: clubRanking?.totalParticipants,
      communityRank: communityActivityRankSummary?.currentRank,
      communityTotal: communityActivityRankSummary?.totalParticipants,
    };

    setCommunityRankHistory((current) => {
      const merged = [...current.filter((point) => point.date !== today), nextPoint].slice(-30);
      void AsyncStorage.setItem(`community_goal_rank_history_${user.id}`, JSON.stringify(merged)).catch((error) => {
        console.warn("[Goals] Could not save community rank history:", error);
      });
      return merged;
    });
  }, [clubRanking, communityActivityRankSummary, familyRanking, user?.id]);

  const { data: medalGoalData, isLoading: medalGoalLoading, refetch: refetchMedalGoal } = useQuery<MedalGoalData | null>({
    queryKey: ["medalGoalData", user?.id, medalTargetGoal?.start_date, medalTargetGoal?.end_date, medalTargetGoal?.target_medals],
    queryFn: async () => {
      if (!user?.id || !medalTargetGoal) return null;
      try {
        const goalStart = medalTargetGoal.start_date;
        const goalEnd = medalTargetGoal.end_date;
        const userRegistrationIds = Array.from(new Set([user.id, userCanonicalRegistrationId].filter(Boolean) as string[]));

        const { data: allEvents, error: eventsError } = await supabase
          .from("events")
          .select("event_id, event_name, starts_at, ends_at, country, country_code, is_virtual, has_medal, approval_status, available_distances_km, medal_min_daily_distance, medal_min_cumulative_distance, medal_date_start, medal_date_end, external_organizer_name")
          .eq("has_medal", true)
          .eq("approval_status", "approved")
          .lte("starts_at", goalEnd)
          .gte("ends_at", goalStart);
        if (eventsError) {
          console.error("[Goals] Medal goal - events fetch error:", JSON.stringify(eventsError));
          return null;
        }
        const events = allEvents || [];
        const eventIds = events.map((event: any) => event.event_id).filter(Boolean);

        const [{ data: participantData, error: partError }, { data: activities, error: activityError }] = await Promise.all([
          eventIds.length > 0
            ? supabase
              .from("events_participants")
              .select("event_id, registration_id, distance_km")
              .in("event_id", eventIds)
              .in("registration_id", userRegistrationIds)
            : Promise.resolve({ data: [], error: null } as any),
          supabase
            .from("activities")
            .select("activity_date, distance_km")
            .in("registration_id", userRegistrationIds)
            .gte("activity_date", goalStart)
            .lte("activity_date", goalEnd),
        ]);
        if (partError) throw partError;
        if (activityError) throw activityError;

        const participantByEvent = new Map<string, any>();
        (participantData || []).forEach((participant: any) => {
          if (participant?.event_id) participantByEvent.set(participant.event_id, participant);
        });
        const activityDistanceByDate = new Map<string, number>();
        (activities || []).forEach((activity: any) => {
          const date = getDateOnly(activity.activity_date);
          if (!date) return;
          activityDistanceByDate.set(date, (activityDistanceByDate.get(date) || 0) + (Number(activity.distance_km) || 0));
        });

        let medalsEarned = 0;
        let externalMedalsEarned = 0;
        const countryRaces: MedalRaceSummary[] = [];
        const virtualRaces: MedalRaceSummary[] = [];

        events.forEach((event: any) => {
          const participant = participantByEvent.get(event.event_id);
          const isEnrolled = !!participant;
          const medalStart = getDateOnly(event.medal_date_start) || getDateOnly(event.starts_at);
          const medalEnd = getDateOnly(event.medal_date_end) || getDateOnly(event.ends_at);
          const participantDistance = Number(participant?.distance_km) || 0;
          const minDailyDistance = Number(event.medal_min_daily_distance) || 0;
          const minCumulativeDistance = Number(event.medal_min_cumulative_distance) || 0;
          let isEarned = false;

          if (isEnrolled) {
            isEarned = participantDistance > 0 && (minDailyDistance <= 0 || participantDistance >= minDailyDistance);

            if (medalStart && medalEnd && (minDailyDistance > 0 || minCumulativeDistance > 0)) {
              let totalDistance = participantDistance;
              let dailyQualified = true;
              let cursor = medalStart;
              while (cursor <= medalEnd) {
                const dayDistance = activityDistanceByDate.get(cursor) || 0;
                totalDistance += dayDistance;
                if (minDailyDistance > 0 && dayDistance < minDailyDistance) dailyQualified = false;
                cursor = addDaysIso(cursor, 1);
              }
              isEarned = dailyQualified && (minCumulativeDistance <= 0 || totalDistance >= minCumulativeDistance);
            }

            if (!minDailyDistance && !minCumulativeDistance && participantDistance > 0) {
              isEarned = true;
            }
          }

          if (isEarned) {
            medalsEarned += 1;
            if (String(event.external_organizer_name || "").trim()) externalMedalsEarned += 1;
          }

          const raceSummary: MedalRaceSummary = {
            eventId: event.event_id,
            eventName: event.event_name || "Unnamed Event",
            country: event.is_virtual ? "Virtual" : (event.country || event.country_code || "Country"),
            dateLabel: formatCompactDateRange(event.starts_at, event.ends_at),
            isVirtual: event.is_virtual === true,
            isEnrolled,
            isEarned,
          };
          if (raceSummary.isVirtual) {
            virtualRaces.push(raceSummary);
          } else {
            countryRaces.push(raceSummary);
          }
        });

        const targetMedals = medalTargetGoal.target_medals;
        const medalRatio = targetMedals > 0 ? (medalsEarned / targetMedals) * 100 : 0;

        console.log("[Goals] Medal goal data:", { availableRaces: events.length, medalsEarned, targetMedals, medalRatio });
        return {
          targetMedals,
          availableRaces: events.length,
          medalsEarned,
          medalRatio,
          internalMedalsEarned: medalsEarned - externalMedalsEarned,
          externalMedalsEarned,
          countryRaces,
          virtualRaces,
        };
      } catch (error) {
        console.error("[Goals] Medal goal query failed:", JSON.stringify(error));
        return null;
      }
    },
    enabled: !!user?.id && !!medalTargetGoal,
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
    () => [familyRanking, clubRanking, communityActivityRankSummary].filter(Boolean) as RankSummary[],
    [clubRanking, communityActivityRankSummary, familyRanking]
  );
  const eligibleCommunityGoalRanks = useMemo(
    () => communityGoalRanks.filter((rank) => rank.totalParticipants >= 3),
    [communityGoalRanks]
  );

  const communityRankGraphPoints = useMemo(() => {
    const today = getLocalDateKey(new Date());
    const todayPoint: CommunityRankHistoryPoint = {
      date: today,
      familyRank: familyRanking?.currentRank,
      familyTotal: familyRanking?.totalParticipants,
      clubRank: clubRanking?.currentRank,
      clubTotal: clubRanking?.totalParticipants,
      communityRank: communityActivityRankSummary?.currentRank,
      communityTotal: communityActivityRankSummary?.totalParticipants,
    };
    const hasTodayRank = [todayPoint.familyRank, todayPoint.clubRank, todayPoint.communityRank]
      .some((rank) => typeof rank === "number");
    const base = communityRankHistory.filter((point) => point.date !== today);
    return (hasTodayRank ? [...base, todayPoint] : base).slice(-35);
  }, [clubRanking, communityActivityRankSummary, communityRankHistory, familyRanking]);

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
    void refetchGoalPausePeriods();
    void refetchRecent();
    void refetchHealthDurationActivities();
    void refetchHealth();
    void refetchSmartFitGoalRank();
    void refetchHabit();
    void refetchCommunityRank();
    void refetchFamilyRank();
    void refetchClubRank();
    void refetchMedalTargetGoal();
    void refetchMedalGoal();
    void refetchCommunityMedalRank();
  };

  const saveMedalGoalMutation = useMutation({
    mutationFn: async ({ targetMedals, startDate, endDate }: { targetMedals: number; startDate: string; endDate: string }) => {
      if (!user?.id) throw new Error("Not logged in");
      const payload = {
        registration_id: user.id,
        target_medals: targetMedals,
        start_date: startDate,
        end_date: endDate,
        updated_at: new Date().toISOString(),
      };

      const query = medalTargetGoal
        ? supabase
          .from("medal_goal")
          .update(payload)
          .eq("medal_goal_id", medalTargetGoal.medal_goal_id)
        : supabase
          .from("medal_goal")
          .insert(payload);

      const { data, error } = await query.select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["medalTargetGoal", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["medalGoalData", user?.id] });
      setShowMedalGoalModal(false);
      Alert.alert("Success", "Earn Medals goal saved!");
    },
    onError: (error: any) => {
      console.error("[Goals] Save medal goal error:", JSON.stringify(error));
      Alert.alert("Error", error?.message || "Failed to save Earn Medals goal");
    },
  });

  const openEditMedalGoal = useCallback(() => {
    if (medalTargetGoal) {
      setMedalTargetInput(String(medalTargetGoal.target_medals));
      setMedalStartDateInput(medalTargetGoal.start_date);
      setMedalEndDateInput(medalTargetGoal.end_date);
    } else {
      const today = getLocalDateKey(new Date());
      const yearEnd = `${new Date().getFullYear()}-12-31`;
      setMedalTargetInput("");
      setMedalStartDateInput(today);
      setMedalEndDateInput(yearEnd);
    }
    setShowMedalGoalModal(true);
  }, [medalTargetGoal]);

  const handleSaveMedalGoal = useCallback(() => {
    const targetMedals = Number.parseInt(medalTargetInput.trim(), 10);
    if (!Number.isFinite(targetMedals) || targetMedals <= 0) {
      Alert.alert("Error", "Enter a target number of medals greater than 0.");
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(medalStartDateInput) || !dateRegex.test(medalEndDateInput)) {
      Alert.alert("Error", "Please enter start and end dates in YYYY-MM-DD format.");
      return;
    }

    const start = new Date(`${medalStartDateInput}T00:00:00`);
    const end = new Date(`${medalEndDateInput}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      Alert.alert("Error", "End date must be on or after the start date.");
      return;
    }

    saveMedalGoalMutation.mutate({
      targetMedals,
      startDate: medalStartDateInput,
      endDate: medalEndDateInput,
    });
  }, [medalEndDateInput, medalStartDateInput, medalTargetInput, saveMedalGoalMutation]);

  const updateExternalMedalForm = (field: keyof ExternalMedalForm, value: string) => {
    setExternalMedalForm((current) => ({ ...current, [field]: value }));
  };

  const resetExternalMedalForm = () => {
    setExternalMedalForm({
      activityDate: "",
      distanceKm: "",
      duration: "",
      eventName: "",
      location: "",
    });
    setExternalMedalImageBase64(null);
    setExternalMedalMimeType(null);
    setExternalMedalImageName("");
  };

  const pickExternalMedalImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Required", "Please allow photo access to upload your medal picture.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert("Image Error", "Could not read the selected medal picture.");
      return;
    }
    setExternalMedalImageBase64(asset.base64);
    setExternalMedalMimeType(asset.mimeType || "image/jpeg");
    setExternalMedalImageName(asset.fileName || "Medal picture selected");
  };

  const handleSubmitExternalMedal = async () => {
    if (!user?.id) {
      Alert.alert("Sign In Required", "Please sign in before submitting an external medal.");
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(externalMedalForm.activityDate)) {
      Alert.alert("Date Required", "Enter the medal date in YYYY-MM-DD format.");
      return;
    }

    const distanceKm = Number.parseFloat(externalMedalForm.distanceKm.replace(/,/g, "").trim());
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      Alert.alert("Distance Required", "Enter a valid distance in kilometers.");
      return;
    }

    if (!/^\d{2}:\d{2}:\d{2}$/.test(externalMedalForm.duration.trim())) {
      Alert.alert("Time Required", "Enter time as HH:MM:SS, for example 01:02:30.");
      return;
    }

    if (!externalMedalForm.eventName.trim() || !externalMedalForm.location.trim()) {
      Alert.alert("Event Details Required", "Enter the external event name and location.");
      return;
    }

    if (!externalMedalImageBase64) {
      Alert.alert("Medal Picture Required", "Upload a medal picture for approval.");
      return;
    }

    setIsSubmittingExternalMedal(true);
    try {
      await getServerClient().activities.submitExternalActivity.mutate({
        registrationId: user.id,
        activityDate: externalMedalForm.activityDate,
        exerciseType: "Run",
        startTime: "00:00:00",
        duration: externalMedalForm.duration.trim(),
        distanceKm,
        sourceType: "medal_claim",
        sourceLabel: "External Medal",
        externalEventName: externalMedalForm.eventName.trim(),
        externalEventLocation: externalMedalForm.location.trim(),
        evidenceImageBase64: externalMedalImageBase64,
        evidenceMimeType: externalMedalMimeType || "image/jpeg",
      });

      Alert.alert("Submitted", "Your external medal has been sent for approval.");
      resetExternalMedalForm();
      setShowExternalMedalModal(false);
      void refetchMedalGoal();
      void refetchCommunityMedalRank();
    } catch (error: any) {
      Alert.alert("Could Not Submit", error?.message || "Please try again.");
    } finally {
      setIsSubmittingExternalMedal(false);
    }
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
    const distanceByDate = new Map<string, number>();
    dailyRunActivities.forEach((activity) => {
      const date = String(activity.activity_date || "").split("T")[0];
      if (!date) return;
      distanceByDate.set(date, (distanceByDate.get(date) || 0) + (Number(activity.distance_km) || 0));
    });
    const days = [];
    const iter = new Date(start);
    while (iter <= end) {
      const date = getLocalDateKey(iter);
      const isFuture = iter > today;
      const hasRun = runDateSet.has(date);
      const distanceKm = distanceByDate.get(date) || 0;
      const pause = getGoalPauseForDate(goalPausePeriods, date);
      const isExcused = !isFuture && !!pause && !hasRun;
      const isAccountable = !isFuture && (!pause || hasRun);
      days.push({
        date,
        day: iter.getDate(),
        isFuture,
        hasRun,
        distanceKm,
        pauseType: pause?.pause_type || null,
        isExcused,
        isAccountable,
      });
      iter.setDate(iter.getDate() + 1);
    }

    const runDays = days.filter((day) => day.hasRun).length;
    const elapsedDays = days.filter((day) => day.isAccountable).length;
    const totalDays = days.length;
    const scorePercent = elapsedDays > 0 ? Math.round((runDays / elapsedDays) * 100) : 0;
    const missedDays = days.filter((day) => !day.isFuture && !day.hasRun && !day.isExcused).length;
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
  }, [dailyRunActivities, dailyRunGoal, goalPausePeriods]);

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
      const bands = getFitnessBands(fitnessGoal);
      const slots = bands.slice(0, 4).map((band) => ({
        distanceKm: formatDistanceDecimal(band.distance_km),
        hours: Math.floor(band.target_minutes / 60).toString(),
        minutes: Math.round(band.target_minutes % 60).toString(),
      }));
      setFitnessGoalSlots(slots.length > 0 ? slots : DEFAULT_FITNESS_GOAL_SLOTS);
      setFitnessStartDate(fitnessGoal.start_date || fitnessGoal.created_at?.split?.("T")?.[0] || getLocalDateKey(new Date()));
      setTargetDate(fitnessGoal.target_date || getLocalDateKey(new Date()));
    } else {
      setFitnessStartDate(getLocalDateKey(new Date()));
      setTargetDate(getLocalDateKey(new Date()));
      setFitnessGoalSlots(DEFAULT_FITNESS_GOAL_SLOTS);
    }
    setShowGoalForm(true);
  }, [fitnessGoal]);

  const hasNoGoals = userGoals.length === 0 && !weightTargetGoal && ongoingEvents.length === 0 && !fitnessGoal && !dailyRunGoal && !fitnessGoalLoading && !dailyRunGoalLoading && !weightTargetLoading && healthEntries.length === 0 && !healthLoading && !habitDeclaration && !habitDeclarationLoading && eligibleCommunityGoalRanks.length === 0 && !communityRankLoading && !familyRankLoading && !clubRankLoading && !communityMedalRankLoading && !medalTargetGoal && !medalTargetLoading;
  const hasRunningGoal = !!dailyRunGoal;
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
        overview: "Declare distance/time targets, then see each run graded by pace for its distance band.",
        measuredBy: "Measured by each run day's pace against the target pace calculated from your distance slots.",
      },
      dailyRun: {
        key: "dailyRun",
        label: "Keep active",
        isTracked: hasRunningGoal,
        icon: "calendar",
        overview: "This keeps the goal simple: decide how often you want to run, then check whether you are keeping that commitment.",
        measuredBy: "Measured by actual run days between the start date and today against the target runs expected by today.",
      },
      habit: {
        key: "habit",
        label: "Have planned runs",
        isTracked: !!habitDeclaration,
        icon: "flame",
        overview: "Declare the distance you plan to run and track each committed day against that target.",
        measuredBy: "Measured by daily run distance against the planned run distance, with missed days recorded as 0 km.",
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
        isTracked: !!medalTargetGoal,
        icon: "trophy",
        overview: "Set a medal target for a date range, then track internal and approved external medals against it.",
        measuredBy: "Measured by approved medal races earned against your target. Progress can exceed 100% when you beat the target.",
      },
      community: {
        key: "community",
        label: "Compete in Community",
        isTracked: eligibleCommunityGoalRanks.length > 0,
        icon: "users",
        overview: "Compete in Community tracks how your rank changes across Family, Club, and Community.",
        measuredBy: "Measured by daily rank snapshots from Family, Club, and Community Activity tables when those groups are available.",
      },
    };
    return map;
  }, [eligibleCommunityGoalRanks.length, fitnessGoal, habitDeclaration, hasRunningGoal, healthEntries, medalTargetGoal, weightTargetGoal]);

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
    if (goalKey === "habit") return !!habitDeclaration;
    if (goalKey === "weight") return !!weightTargetGoal;
    if (goalKey === "health") return healthEntries.length > 0;
    if (goalKey === "medals") return !!medalTargetGoal;
    if (goalKey === "community") return eligibleCommunityGoalRanks.length > 0;
    if (goalKey === "events") return ongoingEvents.length > 0;
    return false;
  }, [eligibleCommunityGoalRanks.length, fitnessGoal, habitDeclaration, hasRunningGoal, healthEntries.length, medalTargetGoal, ongoingEvents.length, weightTargetGoal]);
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
    if (goalKey === "habit") {
      openEditHabit();
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
      openEditMedalGoal();
      return;
    }
    setActiveGoalsPage("set");
  }, [openDailyRunGoalForm, openEditGoalForm, openEditHabit, openEditMedalGoal, openEditWeightTarget]);
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

              {hasSelectedGoal("habit") && (
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
                <TouchableOpacity style={styles.setGoalActionCard} onPress={openEditMedalGoal} activeOpacity={0.85}>
                  <Trophy size={22} color="#D97706" />
                  <View style={styles.setGoalActionInfo}>
                    <Text style={styles.setGoalActionTitle}>Earn Medals</Text>
                    <Text style={styles.setGoalActionText}>
                      {medalTargetGoal ? "Update medal target and dates." : "Set target medals and date range."}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.textLight} />
                </TouchableOpacity>
              )}

              {hasSelectedGoal("community") && (
                <View style={[styles.setGoalActionCard, styles.setGoalActionCardDisabled]}>
                  <Users size={22} color={colors.textLight} />
                  <View style={styles.setGoalActionInfo}>
                    <Text style={[styles.setGoalActionTitle, styles.setGoalActionTitleDisabled]}>Compete in Community</Text>
                    <Text style={styles.setGoalActionText}>No target setup required. Rankings update automatically from eligible activities.</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {orderedGoalKeys.map((goalKey) => {
          if (activeGoalsPage !== "scorecard") return null;
          if (!hasSelectedGoal(goalKey)) return null;
          if (activeGoalsPage === "scorecard" && !hasGoalScore(goalKey)) return null;
          if (goalKey === "fitness") {
            return fitnessGoal && fitnessCalendarProgress ? (
              <View key="fitness" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Zap size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>Improve Fitness</Text>
                  <TouchableOpacity onPress={openEditGoalForm} style={styles.editButton} activeOpacity={0.7}>
                    <Text style={styles.editButtonText}>Edit</Text>
                    <ChevronRight size={14} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={[styles.dailyRunCard, styles.fitnessScorecard]}>
                  <View style={styles.dailyRunScoreRow}>
                    <View>
                      <Text style={[styles.dailyRunScore, fitnessCalendarProgress.isOnTrack ? styles.paceGood : styles.paceBehind]}>
                        {fitnessCalendarProgress.scorePercent}%
                      </Text>
                      <Text style={styles.dailyRunScoreLabel}>Pace score</Text>
                    </View>
                    <View style={[styles.dailyRunTargetPill, fitnessCalendarProgress.isOnTrack ? styles.statusPillGood : styles.statusPillBehind]}>
                      <Text style={fitnessCalendarProgress.isOnTrack ? styles.statusPillTextGood : styles.statusPillTextBehind}>
                        {fitnessCalendarProgress.onTargetDays} on target
                      </Text>
                    </View>
                  </View>

                  <View style={styles.communityStatsRow}>
                    <View style={styles.communityStatItem}>
                      <Text style={styles.communityStatValue}>{fitnessCalendarProgress.runDays}</Text>
                      <Text style={styles.communityStatLabel}>Run Days</Text>
                    </View>
                    <View style={styles.communityStatDivider} />
                    <View style={styles.communityStatItem}>
                      <Text style={styles.communityStatValue}>{fitnessCalendarProgress.onTargetDays}</Text>
                      <Text style={styles.communityStatLabel}>Within Target</Text>
                    </View>
                    <View style={styles.communityStatDivider} />
                    <View style={styles.communityStatItem}>
                      <Text style={styles.communityStatValue}>{formatPaceDecimal(fitnessCalendarProgress.fastestPace)}</Text>
                      <Text style={styles.communityStatLabel}>Best Pace</Text>
                    </View>
                  </View>

                  <View style={styles.dailyRunCalendarGrid}>
                    {fitnessCalendarProgress.days.map((day) => (
                      <View
                        key={`${day.date}-${day.pace}`}
                        style={[
                          styles.dailyRunDayCell,
                          styles.goalCalendarMetricCell,
                          day.isOnTarget ? styles.goalCalendarCellGood : styles.goalCalendarCellBad,
                        ]}
                      >
                        <Text style={styles.dailyRunDayNumber}>{day.day}</Text>
                        <Text style={[styles.dailyRunDayMark, styles.goalCalendarMetricText, day.isOnTarget ? styles.dailyRunDayMarkDone : styles.dailyRunDayMarkMissed]}>
                          {formatPaceDecimal(day.pace)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <Text style={styles.goalBandSummaryText}>
                    {fitnessCalendarProgress.bandSummary}
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
                          !day.isFuture && !day.hasRun && !day.isExcused && styles.dailyRunDayMissed,
                          day.isExcused && styles.goalCalendarCellExcused,
                        ]}
                      >
                        <Text style={styles.dailyRunDayNumber}>{day.day}</Text>
                        <Text style={[
                          styles.dailyRunDayMark,
                          day.hasRun && styles.dailyRunDayMarkDone,
                          !day.isFuture && !day.hasRun && !day.isExcused && styles.dailyRunDayMarkMissed,
                          day.isExcused && styles.goalCalendarExcusedText,
                        ]}>
                          {day.isFuture ? "" : day.hasRun ? "✓" : day.isExcused ? getGoalPauseSymbol(day.pauseType) : "×"}
                        </Text>
                        {day.hasRun && day.pauseType ? (
                          <Text style={styles.goalCalendarPauseBadge}>{getGoalPauseSymbol(day.pauseType)}</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>

                  <Text style={styles.fitnessFootnote}>
                    Injury/Sick days are marked I/S and are excused when missed. If you still run, the day counts as completed.
                  </Text>
                </View>
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
                <View style={[styles.dailyRunCard, styles.plannedRunScorecard]}>
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
                    <Text style={styles.habitDateText}>Since {formatGoalDate(habitDeclaration.start_date)}</Text>
                  </View>

                  {habitCalendarProgress ? (
                    <>
                      <View style={styles.dailyRunScoreRow}>
                        <View>
                          <Text style={[styles.dailyRunScore, habitCalendarProgress.isOnTrack ? styles.paceGood : styles.paceBehind]}>
                            {habitCalendarProgress.scorePercent}%
                          </Text>
                          <Text style={styles.dailyRunScoreLabel}>Distance score</Text>
                        </View>
                        <View style={[styles.dailyRunTargetPill, habitCalendarProgress.isOnTrack ? styles.statusPillGood : styles.statusPillBehind]}>
                          <Text style={habitCalendarProgress.isOnTrack ? styles.statusPillTextGood : styles.statusPillTextBehind}>
                            Target {formatDistanceDecimal(habitCalendarProgress.targetDistance)} km
                          </Text>
                        </View>
                      </View>

                      <View style={styles.communityStatsRow}>
                        <View style={styles.communityStatItem}>
                          <Text style={styles.communityStatValue}>{habitCalendarProgress.daysMet}</Text>
                          <Text style={styles.communityStatLabel}>Target Days</Text>
                        </View>
                        <View style={styles.communityStatDivider} />
                        <View style={styles.communityStatItem}>
                          <Text style={styles.communityStatValue}>{habitCalendarProgress.missedDays}</Text>
                          <Text style={styles.communityStatLabel}>Missed Days</Text>
                        </View>
                        <View style={styles.communityStatDivider} />
                        <View style={styles.communityStatItem}>
                          <Text style={styles.communityStatValue}>{formatDistanceDecimal(habitCalendarProgress.totalDistance)}</Text>
                          <Text style={styles.communityStatLabel}>Total Km</Text>
                        </View>
                      </View>

                      <View style={styles.dailyRunCalendarGrid}>
                        {habitCalendarProgress.days.map((day) => (
                          <View
                            key={day.date}
                            style={[
                              styles.dailyRunDayCell,
                              styles.goalCalendarMetricCell,
                              day.isOnTarget ? styles.goalCalendarCellGood : day.isExcused ? styles.goalCalendarCellExcused : styles.goalCalendarCellBad,
                            ]}
                          >
                            <Text style={styles.dailyRunDayNumber}>{day.day}</Text>
                            <Text style={[
                              styles.dailyRunDayMark,
                              styles.goalCalendarMetricText,
                              day.isOnTarget ? styles.dailyRunDayMarkDone : day.isExcused ? styles.goalCalendarExcusedText : styles.dailyRunDayMarkMissed,
                            ]}>
                              {day.isExcused ? getGoalPauseSymbol(day.pauseType) : formatDistanceDecimal(day.distanceKm)}
                            </Text>
                            {day.isOnTarget && day.pauseType ? (
                              <Text style={styles.goalCalendarPauseBadge}>{getGoalPauseSymbol(day.pauseType)}</Text>
                            ) : null}
                          </View>
                        ))}
                      </View>

                      <Text style={styles.fitnessFootnote}>
                        Injury/Sick days are marked I/S and are excused when missed. Completed days still count toward the target.
                      </Text>
                    </>
                  ) : (
                    <View style={styles.noActivitiesInfo}>
                      <Flame size={24} color={colors.textLight} />
                      <Text style={styles.noActivitiesText}>Set a running distance in kilometers to see your planned-run calendar.</Text>
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
            return medalTargetGoal ? (
              <View key="medals" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Trophy size={18} color="#D97706" />
                  <Text style={styles.sectionTitle}>Earn Medals</Text>
                  <TouchableOpacity onPress={openEditMedalGoal} style={styles.editButton} activeOpacity={0.7}>
                    <Text style={styles.editButtonText}>Edit</Text>
                    <ChevronRight size={14} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.medalGoalCard}>
                  <View style={styles.medalGoalHeaderRow}>
                    <View>
                      <Text style={styles.medalGoalScore}>{Math.round(medalGoalData?.medalRatio || 0)}%</Text>
                      <Text style={styles.dailyRunScoreLabel}>Medals earned</Text>
                    </View>
                    <View style={styles.medalTargetPill}>
                      <Text style={styles.medalTargetPillText}>
                        {medalGoalData?.medalsEarned || 0} / {medalTargetGoal.target_medals} medals
                      </Text>
                    </View>
                  </View>

                  <View style={styles.medalRatioBarTrackFull}>
                    <View
                      style={[
                        styles.medalRatioBarFill,
                        {
                          width: `${Math.min(100, Math.round(medalGoalData?.medalRatio || 0))}%`,
                          backgroundColor: (medalGoalData?.medalRatio || 0) >= 100 ? "#059669" : "#D97706",
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.medalGoalMetaRow}>
                    <Text style={styles.medalGoalMetaText}>
                      {formatGoalDate(medalTargetGoal.start_date)} to {formatGoalDate(medalTargetGoal.end_date)}
                    </Text>
                    <TouchableOpacity onPress={() => setShowExternalMedalModal(true)} style={styles.medalAddButton} activeOpacity={0.8}>
                      <Plus size={13} color="#92400E" />
                      <Text style={styles.medalAddButtonText}>External medal</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.medalBreakdownRow}>
                    <Text style={styles.medalBreakdownText}>Internal {medalGoalData?.internalMedalsEarned || 0}</Text>
                    <Text style={styles.medalBreakdownText}>External {medalGoalData?.externalMedalsEarned || 0}</Text>
                    <Text style={styles.medalBreakdownText}>Available {medalGoalData?.availableRaces || 0}</Text>
                  </View>

                  {medalGoalData && medalGoalData.countryRaces.length > 0 && (
                    <View style={styles.medalEventsList}>
                      <Text style={styles.weightHistoryTitle}>Country</Text>
                      {medalGoalData.countryRaces.map((event) => (
                        <View key={event.eventId} style={styles.medalEventRow}>
                          <View style={styles.medalEventInfo}>
                            <Text style={styles.medalEventName} numberOfLines={1}>{event.eventName}</Text>
                            <Text style={styles.medalEventMeta} numberOfLines={1}>{event.country} • {event.dateLabel}</Text>
                          </View>
                          <View style={[
                            styles.medalEventBadge,
                            event.isEarned ? styles.medalEventBadgeEarned : styles.medalEventBadgePending,
                          ]}>
                            <Award size={12} color={event.isEarned ? "#D97706" : colors.textLight} />
                            <Text style={[
                              styles.medalEventBadgeText,
                              event.isEarned ? styles.medalEventBadgeTextEarned : styles.medalEventBadgeTextPending,
                            ]}>
                              {event.isEarned ? "Earned" : event.isEnrolled ? "Pending" : "Open"}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {medalGoalData && medalGoalData.virtualRaces.length > 0 && (
                    <View style={styles.medalEventsList}>
                      <Text style={styles.weightHistoryTitle}>Virtual</Text>
                      {medalGoalData.virtualRaces.map((event) => (
                        <View key={event.eventId} style={styles.medalEventRow}>
                          <View style={styles.medalEventInfo}>
                            <Text style={styles.medalEventName} numberOfLines={1}>{event.eventName}</Text>
                            <Text style={styles.medalEventMeta} numberOfLines={1}>{event.dateLabel}</Text>
                          </View>
                          <View style={[
                            styles.medalEventBadge,
                            event.isEarned ? styles.medalEventBadgeEarned : styles.medalEventBadgePending,
                          ]}>
                            <Award size={12} color={event.isEarned ? "#D97706" : colors.textLight} />
                            <Text style={[
                              styles.medalEventBadgeText,
                              event.isEarned ? styles.medalEventBadgeTextEarned : styles.medalEventBadgeTextPending,
                            ]}>
                              {event.isEarned ? "Earned" : event.isEnrolled ? "Pending" : "Open"}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {!medalGoalLoading && (!medalGoalData || medalGoalData.availableRaces === 0) && (
                    <View style={styles.noActivitiesInfo}>
                      <Trophy size={24} color={colors.textLight} />
                      <Text style={styles.noActivitiesText}>No available medal races in this goal date range yet.</Text>
                    </View>
                  )}

                  <Text style={styles.fitnessFootnote}>
                    Approved internal and external medals count against your target. Progress can go above 100%.
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
            ) : !medalTargetLoading ? (
              <View key="medals" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Trophy size={18} color="#D97706" />
                  <Text style={styles.sectionTitle}>Earn Medals</Text>
                </View>
                <TouchableOpacity style={styles.setupGoalCard} onPress={openEditMedalGoal} activeOpacity={0.8}>
                  <LinearGradient colors={["#D97706", "#F59E0B"]} style={styles.setupGoalGradient}>
                    <Trophy size={32} color={colors.white} />
                    <Text style={styles.setupGoalTitle}>Set Earn Medals Goal</Text>
                    <Text style={styles.setupGoalSubtext}>Choose a medal target and date range to track internal and approved external medals.</Text>
                    <View style={styles.setupGoalButton}>
                      <Text style={[styles.setupGoalButtonText, { color: "#D97706" }]}>Set Goal</Text>
                      <ChevronRight size={16} color="#D97706" />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : null;
          }

          if (goalKey === "community") {
            return eligibleCommunityGoalRanks.length > 0 ? (
              <View key="community" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Users size={18} color="#0EA5E9" />
                  <Text style={styles.sectionTitle}>Compete in Community</Text>
                </View>
                <View style={styles.communityCard}>
                  <RankHistoryGraph
                    points={communityRankGraphPoints}
                    rankKey="familyRank"
                    totalKey="familyTotal"
                    label="Family"
                    color={RANK_HISTORY_COLORS.family}
                    summary={familyRanking}
                    backgroundColor="#F5F3FF"
                    borderColor="#DDD6FE"
                  />
                  <RankHistoryGraph
                    points={communityRankGraphPoints}
                    rankKey="clubRank"
                    totalKey="clubTotal"
                    label="Club"
                    color={RANK_HISTORY_COLORS.club}
                    summary={clubRanking}
                    backgroundColor="#F0FDF4"
                    borderColor="#BBF7D0"
                  />
                  <RankHistoryGraph
                    points={communityRankGraphPoints}
                    rankKey="communityRank"
                    totalKey="communityTotal"
                    label="Community"
                    color={RANK_HISTORY_COLORS.community}
                    summary={communityActivityRankSummary}
                    backgroundColor="#F0F9FF"
                    borderColor="#BAE6FD"
                  />

                  {rankChange && rankChange.previousRank > 0 && (
                    <View style={styles.communityHistoryRow}>
                      <Text style={styles.communityHistoryLabel}>Previous rank</Text>
                      <Text style={styles.communityHistoryValue}>#{rankChange.previousRank}</Text>
                    </View>
                  )}

                  <Text style={styles.fitnessFootnote}>
                    Rank history is saved locally each day. Graphs appear only for activity groups with at least 3 competitors.
                  </Text>
                </View>
              </View>
            ) : !communityRankLoading && !familyRankLoading && !clubRankLoading && !communityMedalRankLoading ? (
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
                      {(activitySummary?.totalDistance || 0) < 3 || (activitySummary?.totalTime || 0) < 30
                        ? `Community ranking starts after at least 3 km and 30 minutes of total workouts. You currently have ${(activitySummary?.totalDistance || 0).toFixed(1)} km and ${Math.round(activitySummary?.totalTime || 0)} minutes.`
                        : "Complete an eligible activity to appear on the community leaderboard and start tracking your rank."}
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
                {fitnessGoal ? "Update Fitness Goal" : "Set Fitness Goal"}
              </Text>
              <TouchableOpacity onPress={() => setShowGoalForm(false)}>
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalSubtitle}>
                Declare up to 4 distance targets. Pace is calculated automatically from the time you set.
              </Text>

              <View style={styles.dateInputRow}>
                <View style={styles.dateInputBlock}>
                  <Text style={styles.inputLabel}>Start Date *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    value={fitnessStartDate}
                    onChangeText={setFitnessStartDate}
                    placeholderTextColor={colors.textLight}
                  />
                </View>
                <View style={styles.dateInputBlock}>
                  <Text style={styles.inputLabel}>End Date *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    value={targetDate}
                    onChangeText={setTargetDate}
                    placeholderTextColor={colors.textLight}
                  />
                </View>
              </View>

              {fitnessGoalSlots.map((slot, index) => {
                const distanceKm = parseFloat(slot.distanceKm);
                const hours = parseInt(slot.hours || "0", 10);
                const minutes = parseInt(slot.minutes || "0", 10);
                const totalMinutes = (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
                const pace = distanceKm > 0 && totalMinutes > 0 ? totalMinutes / distanceKm : 0;
                return (
                  <View key={`fitness-slot-${index}`} style={styles.fitnessGoalSlot}>
                    <Text style={styles.inputLabel}>Goal {index + 1}</Text>
                    <View style={styles.fitnessDeclarationPreview}>
                      <Text style={styles.habitPreviewText}>
                        I want my <Text style={styles.fitnessPreviewHighlight}>{slot.distanceKm || "xx"}k</Text> runs under{" "}
                        <Text style={styles.fitnessPreviewHighlight}>
                          {(slot.hours || "0")}h {slot.minutes || "0"}m
                        </Text>{" "}
                        <Text style={styles.fitnessPacePreview}>({pace > 0 ? `${formatPaceDecimal(pace)} min/km` : "zz"})</Text>
                      </Text>
                    </View>
                    <View style={styles.fitnessGoalSlotInputs}>
                      <View style={styles.fitnessGoalSlotInputGroup}>
                        <Text style={styles.paceInputLabel}>km</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="10"
                          value={slot.distanceKm}
                          onChangeText={(value) => updateFitnessGoalSlot(index, "distanceKm", value)}
                          keyboardType="decimal-pad"
                          placeholderTextColor={colors.textLight}
                        />
                      </View>
                      <View style={styles.fitnessGoalSlotInputGroup}>
                        <Text style={styles.paceInputLabel}>hours</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="1"
                          value={slot.hours}
                          onChangeText={(value) => updateFitnessGoalSlot(index, "hours", value)}
                          keyboardType="number-pad"
                          placeholderTextColor={colors.textLight}
                        />
                      </View>
                      <View style={styles.fitnessGoalSlotInputGroup}>
                        <Text style={styles.paceInputLabel}>mins</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="0"
                          value={slot.minutes}
                          onChangeText={(value) => updateFitnessGoalSlot(index, "minutes", value)}
                          keyboardType="number-pad"
                          placeholderTextColor={colors.textLight}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}

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
        visible={showMedalGoalModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMedalGoalModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient colors={["#D97706", "#F59E0B"]} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Earn Medals Goal</Text>
              <TouchableOpacity onPress={() => setShowMedalGoalModal(false)}>
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target Medals *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 12"
                  value={medalTargetInput}
                  onChangeText={setMedalTargetInput}
                  keyboardType="number-pad"
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Start Date *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  value={medalStartDateInput}
                  onChangeText={setMedalStartDateInput}
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>End Date *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  value={medalEndDateInput}
                  onChangeText={setMedalEndDateInput}
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <TouchableOpacity
                style={[styles.saveButton, saveMedalGoalMutation.isPending && styles.saveButtonDisabled]}
                onPress={handleSaveMedalGoal}
                disabled={saveMedalGoalMutation.isPending}
                activeOpacity={0.8}
              >
                <LinearGradient colors={["#D97706", "#F59E0B"]} style={styles.saveButtonGradient}>
                  <Text style={styles.saveButtonText}>
                    {saveMedalGoalMutation.isPending ? "Saving..." : medalTargetGoal ? "Update Goal" : "Save Goal"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showExternalMedalModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowExternalMedalModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient colors={["#D97706", "#F59E0B"]} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add External Medal</Text>
              <TouchableOpacity onPress={() => setShowExternalMedalModal(false)}>
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalSubtitle}>
                Submit an external medal for admin approval. Approved medals feed Earn Medals and the Community Medals leaderboard.
              </Text>

              <View style={styles.externalMedalTable}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Date *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    value={externalMedalForm.activityDate}
                    onChangeText={(value) => updateExternalMedalForm("activityDate", value)}
                    placeholderTextColor={colors.textLight}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Distance (km) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 21.1"
                    value={externalMedalForm.distanceKm}
                    onChangeText={(value) => updateExternalMedalForm("distanceKm", value)}
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.textLight}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Time *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="HH:MM:SS"
                    value={externalMedalForm.duration}
                    onChangeText={(value) => updateExternalMedalForm("duration", value)}
                    placeholderTextColor={colors.textLight}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Event Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Kampala Half Marathon"
                    value={externalMedalForm.eventName}
                    onChangeText={(value) => updateExternalMedalForm("eventName", value)}
                    placeholderTextColor={colors.textLight}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Location *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="City, country or venue"
                    value={externalMedalForm.location}
                    onChangeText={(value) => updateExternalMedalForm("location", value)}
                    placeholderTextColor={colors.textLight}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Medal Picture *</Text>
                  <TouchableOpacity style={styles.medalPictureButton} onPress={pickExternalMedalImage} activeOpacity={0.8}>
                    <Award size={16} color="#D97706" />
                    <Text style={styles.medalPictureButtonText}>
                      {externalMedalImageName || "Choose picture"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, isSubmittingExternalMedal && styles.saveButtonDisabled]}
                onPress={handleSubmitExternalMedal}
                disabled={isSubmittingExternalMedal}
                activeOpacity={0.8}
              >
                <LinearGradient colors={["#D97706", "#F59E0B"]} style={styles.saveButtonGradient}>
                  <Text style={styles.saveButtonText}>
                    {isSubmittingExternalMedal ? "Submitting..." : "Submit for Approval"}
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
  setGoalActionCardDisabled: {
    backgroundColor: colors.extraLightGray,
    borderColor: colors.divider,
    opacity: 0.75,
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
  setGoalActionTitleDisabled: {
    color: colors.textSecondary,
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
  dateInputRow: {
    flexDirection: "row" as const,
    gap: 10,
    marginBottom: 12,
  },
  dateInputBlock: {
    flex: 1,
  },
  fitnessGoalSlot: {
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  fitnessDeclarationPreview: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  fitnessPreviewHighlight: {
    fontWeight: "800" as const,
    color: colors.primary,
  },
  fitnessPacePreview: {
    color: colors.textSecondary,
    fontWeight: "700" as const,
  },
  fitnessGoalSlotInputs: {
    flexDirection: "row" as const,
    gap: 8,
  },
  fitnessGoalSlotInputGroup: {
    flex: 1,
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
  fitnessScorecard: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
  },
  plannedRunScorecard: {
    backgroundColor: "#F0FDFA",
    borderColor: "#99F6E4",
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
    position: "relative" as const,
    width: 32,
    height: 36,
    borderRadius: 7,
    backgroundColor: colors.extraLightGray,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  goalCalendarMetricCell: {
    height: 38,
  },
  goalCalendarMetricText: {
    fontSize: 11,
    minHeight: 14,
    lineHeight: 14,
  },
  goalCalendarCellGood: {
    backgroundColor: "#ECFDF5",
    borderColor: "#10B981",
  },
  goalCalendarCellBad: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
  },
  goalCalendarCellExcused: {
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
  },
  goalCalendarExcusedText: {
    color: "#2563EB",
  },
  goalCalendarPauseBadge: {
    position: "absolute" as const,
    top: 1,
    right: 2,
    minWidth: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#DBEAFE",
    color: "#1D4ED8",
    fontSize: 7,
    fontWeight: "900" as const,
    lineHeight: 11,
    textAlign: "center" as const,
    overflow: "hidden" as const,
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
  goalBandSummaryText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: colors.textLight,
    textAlign: "center" as const,
    lineHeight: 15,
    marginTop: 2,
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
  medalGoalHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 8,
  },
  medalGoalScore: {
    fontSize: 28,
    fontWeight: "900" as const,
    color: "#D97706",
    lineHeight: 31,
  },
  medalTargetPill: {
    backgroundColor: "#FFFBEB",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  medalTargetPillText: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: "#92400E",
  },
  medalRatioBarTrackFull: {
    width: "100%" as const,
    height: 7,
    backgroundColor: colors.extraLightGray,
    borderRadius: 4,
    overflow: "hidden" as const,
    marginBottom: 8,
  },
  medalGoalMetaRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
    marginBottom: 8,
  },
  medalGoalMetaText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  medalAddButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    borderRadius: 14,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  medalAddButtonText: {
    fontSize: 10,
    fontWeight: "800" as const,
    color: "#92400E",
  },
  medalBreakdownRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
    marginBottom: 8,
  },
  medalBreakdownText: {
    fontSize: 10,
    fontWeight: "800" as const,
    color: "#92400E",
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  externalMedalTable: {
    gap: 10,
  },
  medalPictureButton: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 12,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  medalPictureButtonText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#92400E",
  },
  rankGraphBlock: {
    borderRadius: 9,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  rankGraphTitleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 6,
  },
  rankGraphTitleInfo: {
    flex: 1,
    minWidth: 0,
  },
  rankGraphTitle: {
    fontSize: 13,
    fontWeight: "800" as const,
    color: colors.text,
  },
  rankGraphSubtitle: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: colors.textLight,
  },
  rankGraphPill: {
    minWidth: 54,
    alignItems: "center" as const,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  rankGraphPillValue: {
    fontSize: 14,
    fontWeight: "900" as const,
    lineHeight: 16,
  },
  rankGraphPillOf: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  rankGraphFrame: {
    width: "100%" as const,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden" as const,
  },
  rankGraphLegend: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 10,
    marginTop: 8,
  },
  rankGraphLegendItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
  },
  rankGraphLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rankGraphLegendText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  rankGraphDateRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginTop: 6,
  },
  rankGraphDateText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: colors.textLight,
  },
  rankGraphHintText: {
    fontSize: 10,
    fontStyle: "italic" as const,
    color: colors.textLight,
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
  medalEventMeta: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700" as const,
    color: colors.textSecondary,
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
