import { StyleSheet, View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, Modal, TextInput, ActivityIndicator, useWindowDimensions } from "react-native";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { X, Calendar, Award, Download, Filter, Search, ChevronDown } from "lucide-react-native";

import { Platform } from 'react-native';
import colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Lock } from "lucide-react-native";
import { getServerClient } from "@/lib/server-client";
import { WORLD_COUNTRIES } from "@/constants/countries";


interface ActivityData {
  activity_id: string;
  registration_id: string;
  activity_date: string;
  exercise_type: string;
  distance_km: number;
  steps_count?: number | null;
  start_time: string;
  end_time: string;
  pace_min_per_km: number;
  pause_duration_seconds?: number | null;
  user?: {
    name?: string;
    username?: string;
  };
}

interface ActivityMonthGroup {
  key: string;
  label: string;
  totalDistance: number;
  activities: ActivityData[];
}

interface ActivityYearGroup {
  year: string;
  totalDistance: number;
  activityCount: number;
  months: ActivityMonthGroup[];
}

interface FamilyMember {
  familyMemberId: string;
  registrationId: string;
  username: string;
  familyCode: string;
  name: string;
  country: string;
  sex: string;
  createdAt: string;
}

interface FamilyMembersResponse {
  familyCode: string | null;
  familyCodeReady?: boolean;
  members: FamilyMember[];
}

interface FamilyLeaderboardRow {
  registrationId: string;
  name: string;
  days: number;
  distance: number;
  time: number;
  pace: number;
  sex?: string;
  country?: string;
  distanceCounts?: Record<MedalBand, number>;
}

interface FamilyWeekGroup {
  key: string;
  label: string;
  rows: FamilyLeaderboardRow[];
}

interface FamilyMonthGroup {
  key: string;
  label: string;
  weeks: FamilyWeekGroup[];
}

interface FamilyYearGroup {
  year: string;
  months: FamilyMonthGroup[];
}

interface ClubMonthGroup {
  key: string;
  label: string;
  weeks: ClubWeekGroup[];
  monthlyRows?: FamilyLeaderboardRow[];
}

interface ClubLeaderboardYearGroup {
  year: string;
  months: ClubMonthGroup[];
  annualRows?: FamilyLeaderboardRow[];
}

type ClubWeekGroup = FamilyWeekGroup;

interface RegisteredEvent {
  eventId: string;
  registrationId: string;
  eventName: string;
  startsAt: string;
  endsAt: string;
  isOnMedalList: boolean;
  status: 'ongoing' | 'upcoming' | 'completed';
}

interface EventParticipantRow {
  eventId: string;
  registrationId: string;
  name: string;
  sex: string;
  country: string;
  distanceKm: number | null;
  timeSeconds: number | null;
  paceSecondsPerKm: number | null;
  status: string;
}

interface CommunityData {
  registrationId: string;
  Name: string;
  Country: string;
  Club: string;
  Age?: number | null;
  ParaEquipmentGroup?: string | null;
  ParaUsesEquipment?: boolean;
  Sex: string;
  AvgDistance: number;
  AvgTime: number;
  AveragePace: number;
  ActiveDays: number;
}

interface UserClubTab {
  key: string;
  clubId: string | null;
  clubName: string;
  coordinatorId: string | null;
  isSpecial: boolean;
  specialClubCode: string | null;
  isFamily?: boolean;
}

type MedalBand = "Ultra" | "50k" | "42K" | "25K" | "21K" | "10k" | "5k" | "3k";

interface CommunityMedalData {
  registrationId: string;
  Name: string;
  Country: string;
  Club: string;
  Sex: string;
  medalCounts: Record<MedalBand, number>;
  totalMedals: number;
  points: number;
}

interface CommunityClubActivityData {
  clubId: string;
  Name: string;
  country: string;
  score: number;
  memberCount: number;
}

interface CommunityClubMedalData {
  clubName: string;
  country: string;
  athleteCount: number;
  medalCounts: Record<MedalBand, number>;
  totalMedals: number;
  points: number;
}

interface SmartFitClubRow {
  registrationId: string;
  rank: number;
  ageGroup: string;
  flag: string;
  name: string;
  sex: string;
  days: number;
  avgSteps: number;
  avgTime: number;
  healthScore: number;
  remarks: string;
}

interface StairLeaderboardRow {
  rank: number;
  registrationId: string;
  name: string;
  sex: string;
  building: string;
  steps: number;
  ascents: number;
  durationSeconds: number;
}

type ActiveTab = "events" | "stairs" | "family" | "club" | "community";
type CommunityLeaderboardView = "activity_indv" | "activity_club" | "medals_indv" | "medals_club";
type CommunityBoardMode = "activity" | "medals";
type CommunityBoardScope = "individual" | "clubs";
type ClubLeaderboardView = "normal" | "distance_count";
type FilterSexOption = "all" | "Male" | "Female";
type LeaderboardTab = "club" | "community";
type LeaderboardFilters = {
  startDate: string;
  endDate: string;
  sex: FilterSexOption;
  country: string;
};

const EMPTY_LEADERBOARD_FILTERS: LeaderboardFilters = {
  startDate: "",
  endDate: "",
  sex: "all",
  country: "all",
};
const MIN_DISTANCE_ACTIVITY = 0.5;
const MIN_ACTIVITY_DURATION_MINUTES = 5;
const JUNIOR_RUNNERS_SPECIAL_CLUB_CODE = "junior_runners";
const TREADMILL_RUNNERS_SPECIAL_CLUB_CODE = "treadmill_runners";
const SMARTFIT_SPECIAL_CLUB_CODE = "smartfit_club";
const PARA_RUNNERS_SPECIAL_CLUB_CODE = "para_runners";
const JUNIOR_MAX_AGE = 15;
const PARA_EQUIPMENT_LABELS: Record<string, string> = {
  wheelchair: "Wheelchair",
  handcycle: "Handcycle",
  prosthetic_blades: "Prosthetic blades",
  other: "Other",
};
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
const MEDAL_DISPLAY_BANDS = [...MEDAL_BANDS].sort((a, b) => a.minKm - b.minKm);
const EMPTY_MEDAL_COUNTS = MEDAL_BANDS.reduce((acc, band) => {
  acc[band.key] = 0;
  return acc;
}, {} as Record<MedalBand, number>);

function getParaEquipmentGroup(registration: any): string | null {
  if (registration?.has_disability !== true) return null;
  if (registration?.para_uses_equipment !== true) return "No gear";
  const type = String(registration?.para_equipment_type || "").trim();
  if (type === "other") {
    return String(registration?.para_equipment_other || "").trim() || "Other";
  }
  return PARA_EQUIPMENT_LABELS[type] || "Other";
}

function usesParaEquipment(registration: any): boolean {
  return registration?.has_disability === true && registration?.para_uses_equipment === true;
}

const countryCodeByName = new Map(
  WORLD_COUNTRIES.map((country) => [country.name.trim().toLowerCase(), country.iso_alpha2.toUpperCase()])
);

function getCountryFlag(country?: string | null) {
  const trimmed = String(country || "").trim();
  if (!trimmed || trimmed === "-") return "";
  const code = trimmed.length === 2 ? trimmed.toUpperCase() : countryCodeByName.get(trimmed.toLowerCase());
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...[...code].map((char) => 127397 + char.charCodeAt(0)));
}

function getMedalBand(distanceKm: number): (typeof MEDAL_BANDS)[number] | null {
  return MEDAL_BANDS.find((band) => distanceKm >= band.minKm) || null;
}

function getMedalBandForCompletedDistance(
  completedDistanceKm: number,
  configuredDistances?: unknown
): (typeof MEDAL_BANDS)[number] | null {
  const completedDistance = Number(completedDistanceKm) || 0;
  const distances = Array.isArray(configuredDistances)
    ? configuredDistances
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((a, b) => b - a)
    : [];

  const matchedDistance = distances.find((distance) => completedDistance + 0.01 >= distance);
  return getMedalBand(matchedDistance || completedDistance);
}

function getDateOnly(value?: string | null): string {
  return String(value || "").slice(0, 10);
}

function addDaysIso(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minIsoDate(a: string, b: string): string {
  return a <= b ? a : b;
}

function getInclusiveDayCount(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
}

function getAgeFromDob(value?: string | null): number | null {
  const dob = value ? new Date(`${String(value).slice(0, 10)}T00:00:00`) : null;
  if (!dob || Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

function isJuniorAge(dob?: string | null): boolean {
  const age = getAgeFromDob(dob);
  return age !== null && age <= JUNIOR_MAX_AGE;
}

function normalizeSex(value?: string | null): string {
  const lower = String(value || "").trim().toLowerCase();
  if (lower.startsWith("m")) return "Male";
  if (lower.startsWith("f")) return "Female";
  return value ? String(value).trim() : "-";
}

function getSmartFitAgeGroup(age: number | null): string {
  if (age === null || age <= 19) return "19-";
  if (age <= 39) return "20-39";
  if (age <= 59) return "40-59";
  if (age <= 79) return "60-79";
  return "80+";
}

function getStepTargetForProfile(ageGroup: string, sex: string): number {
  const isFemale = sex.toLowerCase().startsWith("f");
  if (ageGroup === "19-") return 12000;
  if (ageGroup === "20-39") return isFemale ? 9000 : 10000;
  if (ageGroup === "40-59") return isFemale ? 8000 : 8500;
  if (ageGroup === "60-79") return isFemale ? 6500 : 7000;
  return isFemale ? 4500 : 5000;
}

function getSleepTargetForAgeGroup(ageGroup: string): { min: number; max: number } {
  if (ageGroup === "19-") return { min: 8, max: 10 };
  if (ageGroup === "60-79" || ageGroup === "80+") return { min: 7, max: 8 };
  return { min: 7, max: 9 };
}

function scoreSmartFitHealth(input: {
  avgSteps: number;
  avgHeartRate: number | null;
  avgSleep: number | null;
  avgSpo2: number | null;
  ageGroup: string;
  sex: string;
}): number {
  const stepTarget = getStepTargetForProfile(input.ageGroup, input.sex);
  const stepsScore = Math.min(100, (input.avgSteps / stepTarget) * 100);
  let heartRateScore = 60;
  if (input.avgHeartRate !== null) {
    const ideal = input.ageGroup === "60-79" || input.ageGroup === "80+" ? 72 : input.sex === "Female" ? 74 : 70;
    heartRateScore = Math.max(0, 100 - Math.abs(input.avgHeartRate - ideal) * 3);
  }
  let sleepScore = 60;
  if (input.avgSleep !== null) {
    const sleepTarget = getSleepTargetForAgeGroup(input.ageGroup);
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
}

function getSmartFitRemark(score: number): string {
  if (score >= 80) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Needs work";
  return "Low";
}

function getActivityDurationMinutes(activity: any): number {
  const startParts = String(activity.start_time || "00:00").split(":");
  const endParts = String(activity.end_time || "00:00").split(":");
  const startMinutes = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
  const endMinutes = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return 0;
  let duration = endMinutes - startMinutes;
  if (duration < 0) duration += 24 * 60;
  return Math.max(0, duration - Math.floor((activity.pause_duration_seconds || 0) / 60));
}

async function getJuniorSpecialClubRegistrationIds(registrationIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(registrationIds.filter(Boolean)));
  if (ids.length === 0) return new Set();

  const { data: juniorClubs, error: clubsError } = await supabase
    .from("clubs")
    .select("club_id, coordinator_id")
    .eq("special_club_code", JUNIOR_RUNNERS_SPECIAL_CLUB_CODE);

  if (clubsError) {
    console.error("[Community] Junior club lookup error:", clubsError);
    return new Set();
  }

  const juniorClubIds = (juniorClubs || []).map((club: any) => club.club_id).filter(Boolean);
  const juniorCoordinatorIds = (juniorClubs || []).map((club: any) => club.coordinator_id).filter(Boolean);
  const juniorIds = new Set<string>();

  const membershipRequestsPromise = juniorClubIds.length > 0
    ? supabase
      .from("club_membership_request")
      .select("registration_id")
      .in("registration_id", ids)
      .in("club_id", juniorClubIds)
      .eq("request_type", "membership")
      .neq("status", "rejected")
    : Promise.resolve({ data: [], error: null });

  const legacyMembershipsPromise = juniorCoordinatorIds.length > 0
    ? supabase
      .from("club_members")
      .select("registration_id")
      .in("registration_id", ids)
      .in("coordinator_id", juniorCoordinatorIds)
    : Promise.resolve({ data: [], error: null });

  const [{ data: requestRows, error: requestError }, { data: legacyRows, error: legacyError }] = await Promise.all([
    membershipRequestsPromise,
    legacyMembershipsPromise,
  ]);

  if (requestError) {
    console.error("[Community] Junior membership request lookup error:", requestError);
  }
  if (legacyError) {
    console.error("[Community] Junior legacy membership lookup error:", legacyError);
  }

  (requestRows || []).forEach((row: any) => {
    if (row.registration_id) juniorIds.add(row.registration_id);
  });
  (legacyRows || []).forEach((row: any) => {
    if (row.registration_id) juniorIds.add(row.registration_id);
  });

  return juniorIds;
}

export default function ActivityScreen() {
  const { user, privateMode, roleSession } = useAuth();
  const { colors: themeColors } = useTheme();
  const { isSubscribed } = useSubscription();
  const { height: windowHeight } = useWindowDimensions();
  const currentRegistrationId = roleSession.registrationId || user?.id || null;

  const [activeTab, setActiveTab] = useState<ActiveTab>("community");
  const [communityLeaderboardView, setCommunityLeaderboardView] = useState<CommunityLeaderboardView>("activity_indv");
  const [clubLeaderboardView, setClubLeaderboardView] = useState<ClubLeaderboardView>("normal");
  const [showLeaderboardFilters, setShowLeaderboardFilters] = useState(false);
  const [showLeaderboardSearch, setShowLeaderboardSearch] = useState(false);
  const [leaderboardSearchQuery, setLeaderboardSearchQuery] = useState("");
  const [selectedLeaderboardEventId, setSelectedLeaderboardEventId] = useState("");
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [leaderboardFilters, setLeaderboardFilters] = useState<Record<LeaderboardTab, LeaderboardFilters>>({
    club: EMPTY_LEADERBOARD_FILTERS,
    community: EMPTY_LEADERBOARD_FILTERS,
  });
  const [datePickerTarget, setDatePickerTarget] = useState<{
    tab: LeaderboardTab;
    field: "startDate" | "endDate";
  } | null>(null);
  const [selectedClubKey, setSelectedClubKey] = useState<string | null>(null);
  const [familyCodeInput, setFamilyCodeInput] = useState("");
  const [familyActionLoading, setFamilyActionLoading] = useState(false);
  const [showExternalForm, setShowExternalForm] = useState(false);
  const [formData, setFormData] = useState({
    activityDate: "",
    exerciseType: "Run" as "Run" | "Walk" | "Cycle" | "Treadmill" | "Stairs",
    startTime: "",
    duration: "",
    distanceKm: "",
    stepsCount: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const activeLeaderboardTab: LeaderboardTab = activeTab === "club" ? "club" : "community";
  const currentFilters = leaderboardFilters[activeLeaderboardTab];
  const filterStartDate = currentFilters.startDate;
  const filterEndDate = currentFilters.endDate;
  const filterSex = currentFilters.sex;
  const filterCountry = currentFilters.country;

  const updateLeaderboardFilters = useCallback(
    (tab: LeaderboardTab, updates: Partial<LeaderboardFilters>) => {
      setLeaderboardFilters((prev) => ({
        ...prev,
        [tab]: {
          ...prev[tab],
          ...updates,
        },
      }));
    },
    []
  );

  const clearLeaderboardFilters = useCallback((tab: LeaderboardTab) => {
    setLeaderboardFilters((prev) => ({
      ...prev,
      [tab]: { ...EMPTY_LEADERBOARD_FILTERS },
    }));
  }, []);

  const formatDateLabel = useCallback((value: string) => {
    if (!value) return "Select date";
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, []);

  const datePickerOptions = useMemo(() => {
    const days: string[] = [];
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i += 1) {
      days.push(cursor.toISOString().split("T")[0]);
      cursor.setDate(cursor.getDate() - 1);
    }
    return days;
  }, []);

  const getClubNameMap = useCallback(async (registrationIds: string[]) => {
    const uniqueRegistrationIds = Array.from(new Set(registrationIds.filter(Boolean)));
    if (uniqueRegistrationIds.length === 0) {
      return new Map<string, string>();
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("club_membership_request")
      .select("registration_id, club, club_id")
      .in("registration_id", uniqueRegistrationIds)
      .eq("request_type", "membership")
      .eq("status", "approved");

    if (membershipError) {
      console.error("[ClubLookup] Membership fetch error:", membershipError);
      throw membershipError;
    }

    const clubIds = Array.from(
      new Set((memberships || []).map((membership: any) => membership.club_id).filter(Boolean))
    );

    let clubById = new Map<string, { name: string; isSpecial: boolean }>();
    if (clubIds.length > 0) {
      const { data: clubs, error: clubsError } = await supabase
        .from("clubs")
        .select("club_id, club_name, is_special_club, special_club_code")
        .in("club_id", clubIds);

      if (clubsError) {
        console.error("[ClubLookup] Club fetch error:", clubsError);
        throw clubsError;
      }

      clubById = new Map(
        (clubs || []).map((club: any) => [
          club.club_id,
          {
            name: club.club_name || "",
            isSpecial: club.is_special_club === true || Boolean(club.special_club_code),
          },
        ])
      );
    }

    const clubsByRegistration = new Map<string, { name: string; isSpecial: boolean }[]>();
    (memberships || []).forEach((membership: any) => {
      const registrationId = membership.registration_id;
      if (!registrationId) return;
      const club = membership.club_id ? clubById.get(membership.club_id) : null;
      const name = club?.name || membership.club || "";
      if (!name) return;
      if (!clubsByRegistration.has(registrationId)) {
        clubsByRegistration.set(registrationId, []);
      }
      clubsByRegistration.get(registrationId)?.push({
        name,
        isSpecial: club?.isSpecial ?? false,
      });
    });

    return new Map(
      Array.from(clubsByRegistration.entries()).map(([registrationId, clubRows]) => {
        const normalClubs = clubRows.filter((club) => !club.isSpecial);
        const visibleClubs = normalClubs.length > 0 ? normalClubs : clubRows;
        return [registrationId, visibleClubs.map((club) => club.name).join(", ")];
      })
    );
  }, []);

  const getCoordinatorClubNameMap = useCallback(async (registrationIds: string[]) => {
    const uniqueRegistrationIds = Array.from(new Set(registrationIds.filter(Boolean)));
    if (uniqueRegistrationIds.length === 0) {
      return new Map<string, string>();
    }

    const { data: coordinators, error: coordinatorsError } = await supabase
      .from("coordinators")
      .select("coordinator_id, registration_id")
      .in("registration_id", uniqueRegistrationIds);

    if (coordinatorsError) {
      console.error("[ClubLookup] Coordinator fetch error:", coordinatorsError);
      throw coordinatorsError;
    }

    const coordinatorIds = Array.from(
      new Set((coordinators || []).map((coordinator: any) => coordinator.coordinator_id).filter(Boolean))
    );

    let clubByCoordinatorId = new Map<string, string>();
    if (coordinatorIds.length > 0) {
      const { data: clubs, error: clubsError } = await supabase
        .from("clubs")
        .select("coordinator_id, club_name")
        .in("coordinator_id", coordinatorIds);

      if (clubsError) {
        console.error("[ClubLookup] Coordinator club fetch error:", clubsError);
        throw clubsError;
      }

      clubByCoordinatorId = new Map((clubs || []).map((club: any) => [club.coordinator_id, club.club_name || ""]));
    }

    const result = new Map<string, string>();
    (coordinators || []).forEach((coordinator: any) => {
      const registrationId = coordinator.registration_id;
      const clubName = clubByCoordinatorId.get(coordinator.coordinator_id);
      if (registrationId && clubName) {
        result.set(registrationId, clubName);
      }
    });

    return result;
  }, []);

  const resolveCanonicalRegistrationIds = useCallback(async (registrationIds: string[]) => {
    const uniqueRegistrationIds = Array.from(new Set(registrationIds.filter(Boolean)));
    if (uniqueRegistrationIds.length === 0) {
      return new Map<string, string>();
    }

    const [byAuthIdResult, byLegacyIdResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("profile_id, registration_id")
        .in("profile_id", uniqueRegistrationIds),
      supabase
        .from("profiles")
        .select("profile_id, registration_id")
        .in("registration_id", uniqueRegistrationIds),
    ]);

    if (byAuthIdResult.error) {
      console.error("[RegistrationResolve] Profile auth-id lookup error:", byAuthIdResult.error);
      throw byAuthIdResult.error;
    }

    if (byLegacyIdResult.error) {
      console.error("[RegistrationResolve] Profile legacy-id lookup error:", byLegacyIdResult.error);
      throw byLegacyIdResult.error;
    }

    const resolved = new Map<string, string>();

    uniqueRegistrationIds.forEach((id) => {
      resolved.set(id, id);
    });

    [...(byAuthIdResult.data || []), ...(byLegacyIdResult.data || [])].forEach((profile: any) => {
      const authId = String(profile.profile_id || "").trim();
      const legacyId = String(profile.registration_id || "").trim();

      if (authId && legacyId) {
        resolved.set(authId, legacyId);
        resolved.set(legacyId, legacyId);
      }
    });

    return resolved;
  }, []);

  const handleSaveCSV = async () => {
    if (!isSubscribed) {
      Alert.alert(
        'Premium Feature',
        'Downloading activity data as CSV is available only on a subscribed plan. Please upgrade to access this feature.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!sortedActivities || sortedActivities.length === 0) {
      Alert.alert('No Data', 'There are no activities to export.');
      return;
    }

    setIsSaving(true);
    try {
      await saveCsvFile(buildWorkoutCsv(sortedActivities), 'my_activities.csv', 'Your activity export was saved to:');

      console.log('[ActivityCSV] Export successful');
    } catch (error: any) {
      console.error('[ActivityCSV] Export failed:', error);
      Alert.alert('Error', 'Failed to export activities. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveWorkoutCSV = async (activity: ActivityData) => {
    if (!isSubscribed) {
      Alert.alert(
        'Premium Feature',
        'Downloading a workout as CSV is available only on a subscribed plan. Please upgrade to access this feature.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsSaving(true);
    try {
      const datePart = String(activity.activity_date || 'workout').slice(0, 10);
      await saveCsvFile(
        buildWorkoutCsv([activity]),
        `runnation_workout_${datePart}_${activity.activity_id}.csv`,
        'This workout CSV was saved to:'
      );
      console.log('[ActivityCSV] Single workout export successful', { activityId: activity.activity_id });
    } catch (error: any) {
      console.error('[ActivityCSV] Single workout export failed:', error);
      Alert.alert('Error', 'Failed to export this workout. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFamilyMember = async () => {
    if (!user?.id) {
      Alert.alert("Sign In Required", "Please sign in again before adding Family members.");
      return;
    }
    const familyCode = familyCodeInput.trim();
    if (!familyCode) {
      Alert.alert("Family Code Required", "Enter the RunNation Family Code for this Family slot.");
      return;
    }
    try {
      setFamilyActionLoading(true);
      await getServerClient().family.addMember.mutate({ registrationId: user.id, familyCode });
      setFamilyCodeInput("");
      await Promise.all([refetchFamilyMembers(), refetchFamilyLeaderboard()]);
      Alert.alert("Added", "This runner has been added to your Family tab.");
    } catch (error: any) {
      Alert.alert("Could Not Add", error?.message || "Please check the Family Code and try again.");
    } finally {
      setFamilyActionLoading(false);
    }
  };

  const handleRemoveFamilyMember = async (member: FamilyMember) => {
    if (!user?.id) return;
    Alert.alert("Remove Family Member", `Remove ${member.name || member.username} from your Family tab?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            setFamilyActionLoading(true);
            await getServerClient().family.removeMember.mutate({
              registrationId: user.id,
              familyMemberId: member.familyMemberId,
            });
            await Promise.all([refetchFamilyMembers(), refetchFamilyLeaderboard()]);
          } catch (error: any) {
            Alert.alert("Could Not Remove", error?.message || "Please try again.");
          } finally {
            setFamilyActionLoading(false);
          }
        },
      },
    ]);
  };

  useEffect(() => {
    if (!isSubscribed && (activeTab === "club" || activeTab === "community")) {
      setActiveTab("family");
    }
  }, [isSubscribed, activeTab]);

  const { data: registeredEvents, isLoading: eventsLoading, refetch: refetchEvents } = useQuery<RegisteredEvent[]>({
    queryKey: ["registered-events", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        const { data: participantData, error: pError } = await supabase
          .from("events_participants")
          .select("event_id, registration_id")
          .eq("registration_id", user.id);

        if (pError) {
          console.error("[RegisteredEvents] Participant fetch error:", JSON.stringify(pError));
          return [];
        }
        if (!participantData || participantData.length === 0) return [];

        const eventIds = participantData.map(p => p.event_id);
        const { data: eventsData, error: eError } = await supabase
          .from("events")
          .select("event_id, event_name, starts_at, ends_at, medal_min_daily_distance, medal_min_cumulative_distance, medal_date_start, medal_date_end")
          .in("event_id", eventIds);

        if (eError) {
          console.error("[RegisteredEvents] Events fetch error:", JSON.stringify(eError));
          return [];
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const results: RegisteredEvent[] = await Promise.all(
          (eventsData || []).map(async (event: any) => {
            const startDate = new Date(event.starts_at);
            const endDate = new Date(event.ends_at);
            let status: RegisteredEvent['status'] = 'upcoming';
            if (today >= startDate && today <= endDate) status = 'ongoing';
            else if (today > endDate) status = 'completed';

            let isOnMedalList = false;
            const medalStart = event.medal_date_start;
            const medalEnd = event.medal_date_end;
            const minDaily = event.medal_min_daily_distance;
            const minCumulative = event.medal_min_cumulative_distance;

            if (medalStart && medalEnd) {
              const yesterday = new Date(today);
              yesterday.setDate(yesterday.getDate() - 1);
              const todayIso = today.toISOString().split('T')[0];
              const yesterdayIso = yesterday.toISOString().split('T')[0];
              const medalEndStr = typeof medalEnd === 'string' ? medalEnd : new Date(medalEnd).toISOString().split('T')[0];
              const cutoffStr = medalEndStr < todayIso ? medalEndStr : yesterdayIso;

              if (cutoffStr < medalStart) {
                isOnMedalList = false;
              } else {
                const { data: acts } = await supabase
                  .from("activities")
                  .select("activity_date, distance_km")
                  .eq("registration_id", user.id)
                  .gte("activity_date", medalStart)
                  .lte("activity_date", cutoffStr);

                let totalDist = 0;
                const byDate = new Map<string, number>();
                (acts || []).forEach((a: any) => {
                  const dk = a.activity_date ? a.activity_date.split('T')[0] : a.activity_date;
                  byDate.set(dk, (byDate.get(dk) || 0) + (a.distance_km || 0));
                  totalDist += a.distance_km || 0;
                });

                let qualified = true;
                if (minDaily && minDaily > 0) {
                  const cur = new Date(medalStart + 'T00:00:00Z');
                  const cutoffDate = new Date(cutoffStr + 'T00:00:00Z');
                  while (cur <= cutoffDate) {
                    const dk = cur.toISOString().split('T')[0];
                    if ((byDate.get(dk) || 0) < minDaily) { qualified = false; break; }
                    cur.setUTCDate(cur.getUTCDate() + 1);
                  }
                }
                if (minCumulative && minCumulative > 0 && totalDist < minCumulative) {
                  qualified = false;
                }
                if (!minDaily && !minCumulative) {
                  qualified = true;
                }
                isOnMedalList = qualified;
              }
            }

            return {
              eventId: event.event_id,
              registrationId: user.id,
              eventName: event.event_name || 'Unnamed Event',
              startsAt: event.starts_at,
              endsAt: event.ends_at,
              isOnMedalList,
              status,
            };
          })
        );

        console.log("[RegisteredEvents] Fetched", results.length, "events");
        return results;
      } catch (error: any) {
        console.error("[RegisteredEvents] Query failed:", JSON.stringify(error), error?.message);
        return [];
      }
    },
    enabled: activeTab === "events" && !!user?.id,
    staleTime: 30000,
    retry: 1,
  });

  const selectedLeaderboardEvent = useMemo(
    () => (registeredEvents || []).find((event) => event.eventId === selectedLeaderboardEventId) || null,
    [registeredEvents, selectedLeaderboardEventId]
  );

  const { data: eventParticipants = [], isLoading: eventParticipantsLoading, refetch: refetchEventParticipants } = useQuery<EventParticipantRow[]>({
    queryKey: ["leaderboard-event-participants", selectedLeaderboardEventId],
    queryFn: async () => {
      if (!selectedLeaderboardEventId) return [];

      const { data, error } = await supabase
        .from("events_participants")
        .select(`
          registration_id,
          distance_km,
          time_seconds,
          event_id,
          registrations!events_participants_registration_id_fkey(first_name, other_names, sex, country)
        `)
        .eq("event_id", selectedLeaderboardEventId);

      if (error) {
        console.error("[LeaderboardEventParticipants] Fetch error:", JSON.stringify(error));
        throw error;
      }

      return (data || [])
        .map((row: any) => {
          const registration = Array.isArray(row.registrations) ? row.registrations[0] : row.registrations;
          const firstName = String(registration?.first_name || "").trim();
          const otherNames = String(registration?.other_names || "").trim();
          const name = [firstName, otherNames].filter(Boolean).join(" ") || "Runner";
          const distanceKm = row.distance_km == null ? null : Number(row.distance_km);
          const timeSeconds = row.time_seconds == null ? null : Number(row.time_seconds);
          const paceSecondsPerKm = distanceKm && distanceKm > 0 && timeSeconds && timeSeconds > 0
            ? timeSeconds / distanceKm
            : null;

          return {
            eventId: String(row.event_id || selectedLeaderboardEventId),
            registrationId: String(row.registration_id || ""),
            name,
            sex: String(registration?.sex || "-"),
            country: String(registration?.country || "-"),
            distanceKm: Number.isFinite(distanceKm) ? distanceKm : null,
            timeSeconds: Number.isFinite(timeSeconds) ? timeSeconds : null,
            paceSecondsPerKm,
            status: distanceKm && distanceKm > 0 && timeSeconds && timeSeconds > 0 ? "Finisher" : "Participant",
          };
        })
        .filter((row) => (row.distanceKm || 0) > 0 && (row.timeSeconds || 0) > 0)
        .sort((a, b) => {
          const distanceDiff = (b.distanceKm || 0) - (a.distanceKm || 0);
          if (distanceDiff !== 0) return distanceDiff;
          return (a.timeSeconds || Number.MAX_SAFE_INTEGER) - (b.timeSeconds || Number.MAX_SAFE_INTEGER);
        });
    },
    enabled: activeTab === "events" && !!selectedLeaderboardEventId,
    staleTime: 30000,
    retry: 1,
  });

  const { data: stairLeaderboard = [], isLoading: stairLeaderboardLoading, refetch: refetchStairLeaderboard, error: stairLeaderboardError } = useQuery<StairLeaderboardRow[]>({
    queryKey: ["stair-leaderboard"],
    queryFn: async () => getServerClient().activities.getStairLeaderboard.query(),
    enabled: activeTab === "stairs",
    staleTime: 30000,
    retry: 1,
  });

  const { data: activities, isLoading, refetch, error: activitiesError } = useQuery<ActivityData[]>({
    queryKey: ["activities", user],
    queryFn: async () => {
      try {
        let query = supabase
          .from("activities")
          .select("*");

        if (user) {
          query = query.eq("registration_id", user.id);
        }

        const { data, error } = await query;

        if (error) {
          console.error("[Activities] Supabase error:", error);
          throw error;
        }

        console.log("[Activities] Fetched", data?.length || 0, "activities");
        return data || [];
      } catch (error: any) {
        console.error("[Activities] Query failed:", error);
        throw error;
      }
    },
    enabled: false,
    staleTime: 30000,
    retry: 1,
  });

  const { data: userClubs = [] } = useQuery<UserClubTab[]>({
    queryKey: ["user-clubs", currentRegistrationId, roleSession.clubCoordinatorScopes],
    queryFn: async () => {
      const familyTab: UserClubTab = {
        key: "__family__",
        clubId: null,
        clubName: "Family",
        coordinatorId: null,
        isSpecial: false,
        specialClubCode: null,
        isFamily: true,
      };
      if (!currentRegistrationId) return [];
      try {
        const { data: membershipRows, error: membershipError } = await supabase
          .from("club_membership_request")
          .select("club, club_id, request_type, status")
          .eq("registration_id", currentRegistrationId)
          .eq("request_type", "membership")
          .neq("status", "rejected")
          .order("created_at", { ascending: true });

        if (membershipError) {
          console.error("[UserClubs] Membership request fetch error:", JSON.stringify(membershipError));
          return [];
        }

        const { data: legacyMemberships } = await supabase
          .from("club_members")
          .select("coordinator_id")
          .eq("registration_id", currentRegistrationId);

        const clubIds = Array.from(new Set([
          ...(membershipRows || []).map((row: any) => row.club_id),
          ...roleSession.clubCoordinatorScopes,
        ].filter(Boolean)));
        const coordinatorIds = Array.from(new Set((legacyMemberships || []).map((row: any) => row.coordinator_id).filter(Boolean)));

        if (clubIds.length === 0 && coordinatorIds.length === 0) {
          console.log("[UserClubs] User is not in any club");
          return [familyTab];
        }

        let clubsQuery = supabase
          .from("clubs")
          .select("club_id, club_name, coordinator_id, is_special_club, special_club_code");

        if (clubIds.length > 0 && coordinatorIds.length > 0) {
          clubsQuery = clubsQuery.or(`club_id.in.(${clubIds.join(",")}),coordinator_id.in.(${coordinatorIds.join(",")})`);
        } else if (clubIds.length > 0) {
          clubsQuery = clubsQuery.in("club_id", clubIds);
        } else {
          clubsQuery = clubsQuery.in("coordinator_id", coordinatorIds);
        }

        const { data: clubs, error: clubError } = await clubsQuery;
        if (clubError) {
          console.error("[UserClubs] Club fetch error:", JSON.stringify(clubError));
          return [];
        }

        const clubById = new Map((clubs || []).map((club: any) => [club.club_id, club]));
        const clubByCoordinator = new Map((clubs || []).map((club: any) => [club.coordinator_id, club]));
        const tabs = new Map<string, UserClubTab>();

        (membershipRows || []).forEach((membership: any) => {
          const club = membership.club_id ? clubById.get(membership.club_id) : null;
          const isSpecial = club?.is_special_club === true || Boolean(club?.special_club_code);
          if (!isSpecial && membership.status !== "approved") return;
          const clubName = club?.club_name || membership.club || "Club";
          const key = club?.club_id || membership.club_id || clubName;
          tabs.set(String(key), {
            key: String(key),
            clubId: club?.club_id || membership.club_id || null,
            clubName,
            coordinatorId: club?.coordinator_id || null,
            isSpecial,
            specialClubCode: club?.special_club_code || null,
          });
        });

        (legacyMemberships || []).forEach((membership: any) => {
          const club = membership.coordinator_id ? clubByCoordinator.get(membership.coordinator_id) : null;
          if (!club?.club_id || tabs.has(String(club.club_id))) return;
          tabs.set(String(club.club_id), {
            key: String(club.club_id),
            clubId: club.club_id,
            clubName: club.club_name || "Club",
            coordinatorId: club.coordinator_id || membership.coordinator_id || null,
            isSpecial: club.is_special_club === true || Boolean(club.special_club_code),
            specialClubCode: club.special_club_code || null,
          });
        });

        roleSession.clubCoordinatorScopes.forEach((clubId) => {
          const club = clubById.get(clubId);
          if (!club?.club_id || tabs.has(String(club.club_id))) return;
          tabs.set(String(club.club_id), {
            key: String(club.club_id),
            clubId: club.club_id,
            clubName: club.club_name || "Club",
            coordinatorId: club.coordinator_id || null,
            isSpecial: club.is_special_club === true || Boolean(club.special_club_code),
            specialClubCode: club.special_club_code || null,
          });
        });

        return [familyTab, ...tabs.values()].sort((a, b) => {
          if (a.isFamily) return -1;
          if (b.isFamily) return 1;
          if (a.isSpecial !== b.isSpecial) return a.isSpecial ? 1 : -1;
          return a.clubName.localeCompare(b.clubName);
        });
      } catch (error: any) {
        console.error("[UserClubs] Query failed:", JSON.stringify(error), error?.message);
        return [familyTab];
      }
    },
    enabled: !!currentRegistrationId,
    staleTime: 60000,
  });

  const clubTabs = useMemo(() => userClubs.filter((club) => !club.isFamily), [userClubs]);
  const selectedClub = useMemo(() => {
    if (clubTabs.length === 0) return null;
    return clubTabs.find((club) => club.key === selectedClubKey) || clubTabs[0];
  }, [clubTabs, selectedClubKey]);
  const selectedClubIsFamily = activeTab === "family";
  const selectedClubShowsAge = useMemo(() => {
    const code = String(selectedClub?.specialClubCode || "").toLowerCase();
    const name = String(selectedClub?.clubName || "").toLowerCase();
    return (
      code === "junior_runners" ||
      code === "golden_age_runners" ||
      name.includes("junior") ||
      name.includes("golden age")
    );
  }, [selectedClub?.clubName, selectedClub?.specialClubCode]);
  const selectedClubIsSmartFit = useMemo(() => {
    const code = String(selectedClub?.specialClubCode || "").toLowerCase();
    const name = String(selectedClub?.clubName || "").toLowerCase();
    return code === SMARTFIT_SPECIAL_CLUB_CODE || name.includes("smartfit");
  }, [selectedClub?.clubName, selectedClub?.specialClubCode]);
  const selectedClubIsPara = useMemo(() => {
    const code = String(selectedClub?.specialClubCode || "").toLowerCase();
    const name = String(selectedClub?.clubName || "").toLowerCase();
    return code === PARA_RUNNERS_SPECIAL_CLUB_CODE || name.includes("para");
  }, [selectedClub?.clubName, selectedClub?.specialClubCode]);
  const selectedClubIsTreadmill = useMemo(() => {
    const code = String(selectedClub?.specialClubCode || "").toLowerCase();
    const name = String(selectedClub?.clubName || "").toLowerCase();
    return code === TREADMILL_RUNNERS_SPECIAL_CLUB_CODE || name.includes("treadmill");
  }, [selectedClub?.clubName, selectedClub?.specialClubCode]);

  useEffect(() => {
    if (clubTabs.length === 0) {
      setSelectedClubKey(null);
      return;
    }
    if (!selectedClubKey || !clubTabs.some((club) => club.key === selectedClubKey)) {
      setSelectedClubKey(clubTabs[0].key);
    }
  }, [clubTabs, selectedClubKey]);

  const { data: clubMemberIds } = useQuery<string[]>({
    queryKey: ["club-member-ids", selectedClub?.key, selectedClub?.clubId, selectedClub?.coordinatorId],
    queryFn: async () => {
      if (selectedClubIsFamily || (!selectedClub?.clubId && !selectedClub?.coordinatorId)) return [];
      try {
        const idSet = new Set<string>();

        if (selectedClub.clubId) {
          const { data, error } = await supabase
            .from("club_membership_request")
            .select("registration_id")
            .eq("club_id", selectedClub.clubId)
            .eq("request_type", "membership")
            .in("status", selectedClub.isSpecial ? ["pending", "approved"] : ["approved"]);
          if (error) {
            console.error("[ClubMembers] Membership request fetch error:", JSON.stringify(error));
          } else {
            (data || []).forEach((membership: any) => {
              if (membership.registration_id) idSet.add(membership.registration_id);
            });
          }
        }

        if (currentRegistrationId && selectedClub.clubId && roleSession.clubCoordinatorScopes.includes(selectedClub.clubId)) {
          idSet.add(currentRegistrationId);
        }

        if (selectedClub.coordinatorId) {
          const { data, error } = await supabase
            .from("club_members")
            .select("registration_id")
            .eq("coordinator_id", selectedClub.coordinatorId);
          if (error) {
            console.error("[ClubMembers] Legacy member fetch error:", JSON.stringify(error));
          } else {
            (data || []).forEach((membership: any) => {
              if (membership.registration_id) idSet.add(membership.registration_id);
            });
          }
        }

        const ids = [...idSet];
        console.log("[ClubMembers] Found", ids.length, "members in club", selectedClub.clubName);
        return ids;
      } catch (error: any) {
        console.error("[ClubMembers] Query failed:", JSON.stringify(error), error?.message);
        return [];
      }
    },
    enabled: !selectedClubIsFamily && (!!selectedClub?.clubId || !!selectedClub?.coordinatorId),
    staleTime: 60000,
  });

  const { data: familyMembersData, isLoading: familyMembersLoading, refetch: refetchFamilyMembers } = useQuery<FamilyMembersResponse>({
    queryKey: ["family-members", user?.id],
    queryFn: async () => {
      if (!user?.id) return { familyCode: null, familyCodeReady: false, members: [] };
      return getServerClient().family.getMembers.query({ registrationId: user.id });
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });
  const familyMembers = familyMembersData?.members ?? [];
  const myFamilyCode = familyMembersData?.familyCode ?? null;
  const familyCodeReady = familyMembersData?.familyCodeReady !== false;

  const familyRegistrationIds = useMemo(() => {
    if (familyMembers.length === 0) return [];
    return Array.from(new Set([user?.id, ...familyMembers.map((member) => member.registrationId)].filter(Boolean))) as string[];
  }, [familyMembers, user?.id]);

  const { data: familyLeaderboardGroups = [], isLoading: familyLeaderboardLoading, refetch: refetchFamilyLeaderboard } = useQuery<FamilyYearGroup[]>({
    queryKey: ["family-leaderboard", familyRegistrationIds, filterStartDate, filterEndDate],
    queryFn: async () => {
      if (familyRegistrationIds.length === 0) return [];

      const canonicalMap = await resolveCanonicalRegistrationIds(familyRegistrationIds);
      const canonicalIds = Array.from(new Set(familyRegistrationIds.map((id) => canonicalMap.get(id) || id).filter(Boolean)));

      let activitiesQuery = supabase
        .from("activities")
        .select("registration_id, activity_date, distance_km, start_time, end_time, pause_duration_seconds")
        .in("registration_id", canonicalIds);

      if (filterStartDate) activitiesQuery = activitiesQuery.gte("activity_date", filterStartDate);
      if (filterEndDate) activitiesQuery = activitiesQuery.lte("activity_date", filterEndDate);

      const [{ data: activities, error: activityError }, { data: registrations, error: registrationError }] = await Promise.all([
        activitiesQuery,
        supabase
          .from("registrations")
          .select("registration_id, first_name, other_names, username")
          .in("registration_id", canonicalIds),
      ]);

      if (activityError) throw activityError;
      if (registrationError) throw registrationError;

      const profileMap = new Map((registrations || []).map((profile: any) => [
        profile.registration_id,
        [profile.first_name, profile.other_names].filter(Boolean).join(" ").trim() || profile.username || "Runner",
      ]));

      const years = new Map<string, { months: Map<string, { label: string; weeks: Map<string, { label: string; stats: Map<string, { days: Set<string>; distance: number; time: number }> }> }> }>();

      (activities || []).forEach((activity: any) => {
        const regId = canonicalMap.get(activity.registration_id) || activity.registration_id;
        const dateOnly = String(activity.activity_date || "").slice(0, 10);
        const date = new Date(`${dateOnly}T00:00:00`);
        if (!regId || Number.isNaN(date.getTime())) return;

        const year = String(date.getFullYear());
        const monthKey = `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const monthLabel = date.toLocaleDateString("en-US", { month: "long" });
        const weekNumber = Math.ceil(date.getDate() / 7);
        const weekKey = `${monthKey}-W${weekNumber}`;
        const weekLabel = `Week ${weekNumber}`;

        const yearGroup = years.get(year) || { months: new Map() };
        const monthGroup = yearGroup.months.get(monthKey) || { label: monthLabel, weeks: new Map() };
        const weekGroup = monthGroup.weeks.get(weekKey) || { label: weekLabel, stats: new Map() };
        const stats = weekGroup.stats.get(regId) || { days: new Set<string>(), distance: 0, time: 0 };

        stats.days.add(dateOnly);
        stats.distance += Number(activity.distance_km || 0);
        stats.time += getActivityDurationMinutes(activity);
        weekGroup.stats.set(regId, stats);
        monthGroup.weeks.set(weekKey, weekGroup);
        yearGroup.months.set(monthKey, monthGroup);
        years.set(year, yearGroup);
      });

      return Array.from(years.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([year, yearGroup]) => ({
          year,
          months: Array.from(yearGroup.months.entries())
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([monthKey, monthGroup]) => ({
              key: monthKey,
              label: monthGroup.label,
              weeks: Array.from(monthGroup.weeks.entries())
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([weekKey, weekGroup]) => {
                  const rows = Array.from(weekGroup.stats.entries())
                    .map(([registrationId, stats]) => ({
                      registrationId,
                      name: profileMap.get(registrationId) || "Runner",
                      days: stats.days.size,
                      distance: stats.distance,
                      time: stats.time,
                      pace: stats.distance > 0 ? stats.time / stats.distance : 0,
                    }))
                    .sort((a, b) => b.distance - a.distance || b.days - a.days || a.pace - b.pace);
                  return { key: weekKey, label: weekGroup.label, rows };
                }),
            })),
        }));
    },
    enabled: activeTab === "family" && familyRegistrationIds.length > 0,
    staleTime: 30000,
  });

  const {
    data: clubLeaderboardGroups = [],
    isLoading: clubLeaderboardLoading,
    error: clubLeaderboardError,
    refetch: refetchClubLeaderboard,
  } = useQuery<ClubLeaderboardYearGroup[]>({
    queryKey: [
      "club-leaderboard-groups",
      selectedClub?.key,
      clubMemberIds,
      selectedClubIsTreadmill,
      filterStartDate,
      filterEndDate,
      filterSex,
      filterCountry,
    ],
    queryFn: async () => {
      if (!clubMemberIds || clubMemberIds.length === 0) return [];

      const canonicalMap = await resolveCanonicalRegistrationIds(clubMemberIds);
      const canonicalIds = Array.from(
        new Set(clubMemberIds.map((id) => canonicalMap.get(id) || id).filter(Boolean))
      );

      let activitiesQuery = supabase
        .from("activities")
        .select("registration_id, activity_date, distance_km, start_time, end_time, pause_duration_seconds, exercise_type")
        .in("registration_id", canonicalIds);

      if (selectedClubIsTreadmill) activitiesQuery = activitiesQuery.eq("exercise_type", "Treadmill");
      if (filterStartDate) activitiesQuery = activitiesQuery.gte("activity_date", filterStartDate);
      if (filterEndDate) activitiesQuery = activitiesQuery.lte("activity_date", filterEndDate);

      const [{ data: activities, error: activityError }, { data: registrations, error: registrationError }] =
        await Promise.all([
          activitiesQuery,
          supabase
            .from("registrations")
            .select("registration_id, first_name, other_names, username, sex, country")
            .in("registration_id", canonicalIds),
        ]);

      if (activityError) throw activityError;
      if (registrationError) throw registrationError;

      const profileMap = new Map(
        (registrations || []).map((profile: any) => [
          profile.registration_id,
          {
            name:
              [profile.first_name, profile.other_names].filter(Boolean).join(" ").trim() ||
              profile.username ||
              "Runner",
            sex: profile.sex || "-",
            country: profile.country || "-",
          },
        ])
      );
      const years = new Map<
        string,
        {
          months: Map<
            string,
            {
              label: string;
              weeks: Map<
                string,
                {
                  label: string;
                  stats: Map<string, { days: Set<string>; distance: number; time: number; distanceCounts: Record<MedalBand, number> }>;
                }
              >;
            }
          >;
        }
      >();

      (activities || []).forEach((activity: any) => {
        const registrationId = canonicalMap.get(activity.registration_id) || activity.registration_id;
        const profile = profileMap.get(registrationId);
        if (!registrationId || !profile) return;
        if (filterSex !== "all" && profile.sex !== filterSex) return;
        if (filterCountry !== "all" && profile.country !== filterCountry) return;

        const dateOnly = String(activity.activity_date || "").slice(0, 10);
        const date = new Date(`${dateOnly}T00:00:00`);
        if (Number.isNaN(date.getTime())) return;

        const year = String(date.getFullYear());
        const monthKey = `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const monthLabel = date.toLocaleDateString("en-US", { month: "long" });
        const weekNumber = Math.ceil(date.getDate() / 7);
        const weekKey = `${monthKey}-W${weekNumber}`;

        const yearGroup = years.get(year) || { months: new Map() };
        const monthGroup = yearGroup.months.get(monthKey) || { label: monthLabel, weeks: new Map() };
        const weekGroup = monthGroup.weeks.get(weekKey) || {
          label: `Week ${weekNumber}`,
          stats: new Map(),
        };
        const stats = weekGroup.stats.get(registrationId) || {
          days: new Set<string>(),
          distance: 0,
          time: 0,
          distanceCounts: { ...EMPTY_MEDAL_COUNTS },
        };

        stats.days.add(dateOnly);
        const activityDistance = Number(activity.distance_km || 0);
        stats.distance += activityDistance;
        stats.time += getActivityDurationMinutes(activity);
        const distanceBand = getMedalBand(activityDistance);
        if (distanceBand) {
          stats.distanceCounts[distanceBand.key] += 1;
        }
        weekGroup.stats.set(registrationId, stats);

        monthGroup.weeks.set(weekKey, weekGroup);
        yearGroup.months.set(monthKey, monthGroup);
        years.set(year, yearGroup);
      });

      const now = new Date();
      const currentYear = String(now.getFullYear());
      const toRows = (
        stats: Map<string, { days?: Set<string>; distance: number; time: number; distanceCounts: Record<MedalBand, number> }>,
        fixedDays?: number
      ) =>
        Array.from(stats.entries())
          .map(([registrationId, values]) => {
            const profile = profileMap.get(registrationId);
            const days = fixedDays ?? values.days?.size ?? 0;
            return {
              registrationId,
              name: profile?.name || "Runner",
              sex: profile?.sex || "-",
              country: profile?.country || "-",
              days,
              distance: values.distance,
              time: values.time,
              pace: values.distance > 0 ? values.time / values.distance : 0,
              distanceCounts: values.distanceCounts,
            };
          })
          .sort((a, b) => b.distance - a.distance || b.days - a.days || a.pace - b.pace);

      return Array.from(years.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([year, yearGroup]) => {
          if (year !== currentYear) {
            const annualStats = new Map<string, { days: Set<string>; distance: number; time: number; distanceCounts: Record<MedalBand, number> }>();
            yearGroup.months.forEach((monthGroup) => {
              monthGroup.weeks.forEach((weekGroup) => {
                weekGroup.stats.forEach((stats, registrationId) => {
                  const total = annualStats.get(registrationId) || {
                    days: new Set<string>(),
                    distance: 0,
                    time: 0,
                    distanceCounts: { ...EMPTY_MEDAL_COUNTS },
                  };
                  stats.days.forEach((day) => total.days.add(day));
                  total.distance += stats.distance;
                  total.time += stats.time;
                  MEDAL_DISPLAY_BANDS.forEach((band) => {
                    total.distanceCounts[band.key] += stats.distanceCounts[band.key] || 0;
                  });
                  annualStats.set(registrationId, total);
                });
              });
            });
            return { year, months: [], annualRows: toRows(annualStats) };
          }

          return {
            year,
            months: Array.from(yearGroup.months.entries())
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([monthKey, monthGroup]) => {
              const monthNumber = Number(monthKey.slice(5, 7));
              const monthAge = now.getMonth() + 1 - monthNumber;
              if (monthAge >= 3) {
                const monthlyStats = new Map<string, { days: Set<string>; distance: number; time: number; distanceCounts: Record<MedalBand, number> }>();
                monthGroup.weeks.forEach((weekGroup) => {
                  weekGroup.stats.forEach((stats, registrationId) => {
                    const total = monthlyStats.get(registrationId) || {
                      days: new Set<string>(),
                      distance: 0,
                      time: 0,
                      distanceCounts: { ...EMPTY_MEDAL_COUNTS },
                    };
                    stats.days.forEach((day) => total.days.add(day));
                    total.distance += stats.distance;
                    total.time += stats.time;
                    MEDAL_DISPLAY_BANDS.forEach((band) => {
                      total.distanceCounts[band.key] += stats.distanceCounts[band.key] || 0;
                    });
                    monthlyStats.set(registrationId, total);
                  });
                });
                return {
                  key: monthKey,
                  label: monthGroup.label,
                  weeks: [],
                  monthlyRows: toRows(monthlyStats),
                };
              }

              return {
                key: monthKey,
                label: monthGroup.label,
                weeks: Array.from(monthGroup.weeks.entries())
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([weekKey, weekGroup]) => ({
                    key: weekKey,
                    label: weekGroup.label,
                    rows: toRows(weekGroup.stats),
                  })),
              };
            }),
          };
        });
    },
    enabled: activeTab === "club" && !!selectedClub && !!clubMemberIds?.length,
    staleTime: 30000,
    retry: 1,
  });

  const { data: clubCommunityData, isLoading: clubLoading, refetch: refetchClub, error: clubError } = useQuery<CommunityData[]>({
    queryKey: ["club-community", selectedClub?.key, clubMemberIds, selectedClubIsTreadmill, filterStartDate, filterEndDate],
    queryFn: async () => {
      if (!clubMemberIds || clubMemberIds.length === 0) return [];
      try {
        let activitiesQuery = supabase
          .from("activities")
          .select("registration_id, activity_date, distance_km, start_time, end_time, pause_duration_seconds, pace_min_per_km, exercise_type")
          .in("registration_id", clubMemberIds);

        if (selectedClubIsTreadmill) {
          activitiesQuery = activitiesQuery.eq("exercise_type", "Treadmill");
        }

        if (filterStartDate) {
          activitiesQuery = activitiesQuery.gte("activity_date", filterStartDate);
        }
        if (filterEndDate) {
          activitiesQuery = activitiesQuery.lte("activity_date", filterEndDate);
        }

        const { data: activities, error: activityError } = await activitiesQuery;

        if (activityError) {
          console.error("[ClubCommunity] Activity fetch error:", activityError);
          throw activityError;
        }

        const { data: registrations, error: regError } = await supabase
          .from("registrations")
          .select('registration_id, first_name, other_names, country, city_town_district, sex, dob, has_disability, para_uses_equipment, para_equipment_type, para_equipment_other')
          .in("registration_id", clubMemberIds);

        if (regError) {
          console.error("[ClubCommunity] Registration fetch error:", regError);
          throw regError;
        }

        const regMap = new Map(registrations?.map(r => [r.registration_id, r]));
        const resolvedRegistrationIds = await resolveCanonicalRegistrationIds(
          (activities || []).map((activity: any) => activity.registration_id)
        );
        const userStats = new Map<string, {
          totalDistance: number;
          totalTime: number;
          paceSum: number;
          activityCount: number;
          activeDays: Set<string>;
        }>();

        activities?.forEach(activity => {
          const rawRegId = activity.registration_id;
          const regId = resolvedRegistrationIds.get(rawRegId) || rawRegId;
          if (!regId) return;
          const activityDateKey = String(activity.activity_date || "").split("T")[0];
          const startParts = activity.start_time.split(':');
          const endParts = activity.end_time.split(':');
          const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
          const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
          let duration = endMinutes - startMinutes;
          if (duration < 0) duration += 24 * 60;
          duration = Math.max(0, duration - Math.floor((activity.pause_duration_seconds || 0) / 60));

          const existing = userStats.get(regId) || {
            totalDistance: 0, totalTime: 0, paceSum: 0, activityCount: 0, activeDays: new Set<string>(),
          };
          existing.totalDistance += activity.distance_km || 0;
          existing.totalTime += duration;
          existing.paceSum += activity.pace_min_per_km || 0;
          existing.activityCount += 1;
          if (activityDateKey) {
            existing.activeDays.add(activityDateKey);
          }
          userStats.set(regId, existing);
        });

        const result: CommunityData[] = [];
        (registrations || []).forEach((registration: any) => {
          const regId = registration.registration_id;
          if (!regId) return;
          const stats = userStats.get(regId) || {
            totalDistance: 0,
            totalTime: 0,
            paceSum: 0,
            activityCount: 0,
            activeDays: new Set<string>(),
          };
          const firstName = registration.first_name || "";
          const otherNames = registration.other_names || "";
          const fullName = [firstName, otherNames].filter(n => n).join(" ") || "Unknown";
          const activeDays = stats.activeDays.size;
          result.push({
            registrationId: regId,
            Name: fullName,
            Country: registration.country || "-",
            Club: selectedClub?.clubName || "",
            Age: getAgeFromDob(registration.dob),
            ParaEquipmentGroup: getParaEquipmentGroup(registration),
            ParaUsesEquipment: usesParaEquipment(registration),
            Sex: registration.sex || "-",
            AvgDistance: activeDays > 0 ? stats.totalDistance / activeDays : 0,
            AvgTime: activeDays > 0 ? stats.totalTime / activeDays : 0,
            AveragePace: stats.activityCount > 0 ? stats.paceSum / stats.activityCount : 0,
            ActiveDays: activeDays,
          });
        });

        const filteredResult = result.filter((item) => item.ActiveDays >= 1);
        console.log("[ClubCommunity] Processed", filteredResult.length, "club members");
        return filteredResult;
      } catch (error: any) {
        console.error("[ClubCommunity] Query failed:", error);
        throw error;
      }
    },
    enabled: false,
    staleTime: 30000,
    retry: 1,
  });

  const { data: communityData, isLoading: communityLoading, refetch: refetchCommunity, error: communityError } = useQuery<CommunityData[]>({
    queryKey: ["community", filterStartDate, filterEndDate],
    queryFn: async () => {
      try {
        const activities: any[] = [];
        const pageSize = 1000;

        for (let offset = 0; ; offset += pageSize) {
          let activitiesQuery = supabase
            .from("activities")
            .select(`
              activity_id,
              registration_id,
              activity_date,
              distance_km,
              start_time,
              end_time,
              pause_duration_seconds,
              pace_min_per_km
            `)
            .order("activity_id", { ascending: true })
            .range(offset, offset + pageSize - 1);

          if (filterStartDate) {
            activitiesQuery = activitiesQuery.gte("activity_date", filterStartDate);
          }
          if (filterEndDate) {
            activitiesQuery = activitiesQuery.lte("activity_date", filterEndDate);
          }

          const { data: activityPage, error: activityError } = await activitiesQuery;

          if (activityError) {
            console.error("[Community] Activity fetch error:", activityError);
            throw activityError;
          }

          activities.push(...(activityPage || []));
          if (!activityPage || activityPage.length < pageSize) break;
        }

        const { data: registrations, error: regError } = await supabase
          .from("registrations")
          .select(`
            registration_id,
            first_name,
            other_names,
            country,
            sex,
            dob,
            has_disability,
            para_uses_equipment,
            para_equipment_type,
            para_equipment_other
          `);

        if (regError) {
          console.error("[Community] Registration fetch error:", regError);
          throw regError;
        }

      const adultCommunityRegistrations = (registrations || []).filter((registration: any) => !isJuniorAge(registration.dob));
      const juniorRegistrationIds = await getJuniorSpecialClubRegistrationIds(
        adultCommunityRegistrations.map((registration: any) => registration.registration_id)
      );
      const eligibleCommunityRegistrations = adultCommunityRegistrations.filter(
        (registration: any) => !juniorRegistrationIds.has(registration.registration_id) && !usesParaEquipment(registration)
      );
      const eligibleRegistrationIds = eligibleCommunityRegistrations.map((registration: any) => registration.registration_id);
      const [membershipClubNameMap, coordinatorClubNameMap] = await Promise.all([
        getClubNameMap(eligibleRegistrationIds),
        getCoordinatorClubNameMap(eligibleRegistrationIds),
      ]);
      const clubNameMap = new Map([
        ...Array.from(coordinatorClubNameMap.entries()),
        ...Array.from(membershipClubNameMap.entries()),
      ]);
      const resolvedRegistrationIds = await resolveCanonicalRegistrationIds(
        (activities || []).map((activity: any) => activity.registration_id)
      );
      const eligibleCommunityIds = new Set(eligibleCommunityRegistrations.map((registration: any) => registration.registration_id));
      const userStats = new Map<string, {
        totalDistance: number;
        totalTime: number;
        paceSum: number;
        activityCount: number;
        activeDays: Set<string>;
      }>();

      activities?.forEach(activity => {
        const rawRegId = activity.registration_id;
        const regId = resolvedRegistrationIds.get(rawRegId) || rawRegId;
        if (!regId) return;
        if (!eligibleCommunityIds.has(regId)) return;
        const activityDateKey = String(activity.activity_date || "").split("T")[0];

        const startParts = activity.start_time.split(':');
        const endParts = activity.end_time.split(':');
        const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
        const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
        let duration = endMinutes - startMinutes;
        if (duration < 0) duration += 24 * 60;
        duration = Math.max(0, duration - Math.floor((activity.pause_duration_seconds || 0) / 60));

        const existing = userStats.get(regId) || {
          totalDistance: 0,
          totalTime: 0,
          paceSum: 0,
          activityCount: 0,
          activeDays: new Set<string>(),
        };

        existing.totalDistance += activity.distance_km || 0;
        existing.totalTime += duration;
        existing.paceSum += activity.pace_min_per_km || 0;
        existing.activityCount += 1;
        if (activityDateKey) {
          existing.activeDays.add(activityDateKey);
        }

        userStats.set(regId, existing);
      });

      const result: CommunityData[] = [];
      eligibleCommunityRegistrations.forEach((registration: any) => {
        const regId = registration.registration_id;
        if (!regId) return;
        const stats = userStats.get(regId) || {
          totalDistance: 0,
          totalTime: 0,
          paceSum: 0,
          activityCount: 0,
          activeDays: new Set<string>(),
        };

        const firstName = registration.first_name || "";
        const otherNames = registration.other_names || "";
        const fullName = [firstName, otherNames].filter(n => n).join(" ") || "Unknown";

        const activeDays = stats.activeDays.size;
        if (stats.totalDistance < 3 || stats.totalTime < 30) return;
        result.push({
          registrationId: regId,
          Name: fullName,
          Country: registration.country || "-",
          Club: clubNameMap.get(regId) || "",
          Sex: registration.sex || "-",
          AvgDistance: activeDays > 0 ? stats.totalDistance / activeDays : 0,
          AvgTime: activeDays > 0 ? stats.totalTime / activeDays : 0,
          AveragePace: stats.activityCount > 0 ? stats.paceSum / stats.activityCount : 0,
          ActiveDays: activeDays
        });
      });

      const filteredResult = result.filter((item) => item.ActiveDays >= 1);
      console.log("[Community] Processed", filteredResult.length, "users");
      return filteredResult;
      } catch (error: any) {
        console.error("[Community] Query failed:", error);
        throw error;
      }
    },
    enabled: activeTab === "community",
    staleTime: 30000,
    retry: 1,
  });

  const { data: communityClubActivityData, isLoading: communityClubActivityLoading, refetch: refetchCommunityClubActivity, error: communityClubActivityError } = useQuery<CommunityClubActivityData[]>({
    queryKey: ["community-club-activity"],
    queryFn: async () => {
      const todayIso = new Date().toISOString().slice(0, 10);

      const { data: clubs, error: clubsError } = await supabase
        .from("clubs")
        .select("club_id, club_name, created_at, country, coordinator_id, is_active");

      if (clubsError) {
        console.error("[CommunityClubActivity] Club fetch error:", clubsError);
        throw clubsError;
      }

      const activeClubs = (clubs || []).filter((club: any) => club.club_id && club.is_active !== false);
      const clubById = new Map(activeClubs.map((club: any) => [club.club_id, club]));
      const clubByCoordinatorId = new Map(
        activeClubs
          .filter((club: any) => club.coordinator_id)
          .map((club: any) => [club.coordinator_id, club])
      );
      const clubIds = activeClubs.map((club: any) => club.club_id).filter(Boolean);
      const coordinatorIds = activeClubs.map((club: any) => club.coordinator_id).filter(Boolean);

      if (clubIds.length === 0) return [];

      const [{ data: memberships, error: membershipsError }, { data: coordinators, error: coordinatorsError }] = await Promise.all([
        supabase
          .from("club_membership_request")
          .select("registration_id, club_id")
          .in("club_id", clubIds)
          .eq("request_type", "membership")
          .eq("status", "approved"),
        coordinatorIds.length > 0
          ? supabase
              .from("coordinators")
              .select("coordinator_id, registration_id")
              .in("coordinator_id", coordinatorIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (membershipsError) {
        console.error("[CommunityClubActivity] Membership fetch error:", membershipsError);
        throw membershipsError;
      }
      if (coordinatorsError) {
        console.error("[CommunityClubActivity] Coordinator fetch error:", coordinatorsError);
        throw coordinatorsError;
      }

      const memberIdsByClubId = new Map<string, Set<string>>();
      activeClubs.forEach((club: any) => memberIdsByClubId.set(club.club_id, new Set<string>()));

      (memberships || []).forEach((membership: any) => {
        if (!membership.club_id || !membership.registration_id || !clubById.has(membership.club_id)) return;
        memberIdsByClubId.get(membership.club_id)?.add(membership.registration_id);
      });

      (coordinators || []).forEach((coordinator: any) => {
        const club = clubByCoordinatorId.get(coordinator.coordinator_id);
        if (!club?.club_id || !coordinator.registration_id) return;
        memberIdsByClubId.get(club.club_id)?.add(coordinator.registration_id);
      });

      const coordinatorRegistrationIds = Array.from(
        new Set((coordinators || []).map((coordinator: any) => coordinator.registration_id).filter(Boolean))
      );
      let countryByRegistrationId = new Map<string, string>();
      if (coordinatorRegistrationIds.length > 0) {
        const { data: coordinatorRegistrations, error: coordinatorRegistrationsError } = await supabase
          .from("registrations")
          .select("registration_id, country")
          .in("registration_id", coordinatorRegistrationIds);

        if (coordinatorRegistrationsError) {
          console.error("[CommunityClubActivity] Coordinator registration fetch error:", coordinatorRegistrationsError);
          throw coordinatorRegistrationsError;
        }

        countryByRegistrationId = new Map(
          (coordinatorRegistrations || []).map((registration: any) => [
            registration.registration_id,
            registration.country || "",
          ])
        );
      }
      const countryByCoordinatorId = new Map(
        (coordinators || []).map((coordinator: any) => [
          coordinator.coordinator_id,
          countryByRegistrationId.get(coordinator.registration_id) || "",
        ])
      );

      const memberIds = Array.from(
        new Set(
          Array.from(memberIdsByClubId.values())
            .flatMap((members) => Array.from(members))
            .filter(Boolean)
        )
      );

      if (memberIds.length === 0) return [];

      const { data: activities, error: activitiesError } = await supabase
        .from("activities")
        .select("registration_id, activity_date")
        .in("registration_id", memberIds)
        .lte("activity_date", todayIso);

      if (activitiesError) {
        console.error("[CommunityClubActivity] Activity fetch error:", activitiesError);
        throw activitiesError;
      }

      const activeDatesByRegistration = new Map<string, Set<string>>();
      (activities || []).forEach((activity: any) => {
        const registrationId = activity.registration_id;
        const activityDate = getDateOnly(activity.activity_date);
        if (!registrationId || !activityDate) return;
        if (!activeDatesByRegistration.has(registrationId)) {
          activeDatesByRegistration.set(registrationId, new Set<string>());
        }
        activeDatesByRegistration.get(registrationId)?.add(activityDate);
      });

      return activeClubs.flatMap((club: any): CommunityClubActivityData[] => {
        const members = Array.from(memberIdsByClubId.get(club.club_id) || []);
        const memberCount = members.length;
        if (memberCount === 0) return [];

        const startIso = getDateOnly(club.created_at) || todayIso;
        const dayCount = getInclusiveDayCount(startIso, todayIso);
        const activeMemberDays = members.reduce((sum, registrationId) => {
          const dates = activeDatesByRegistration.get(registrationId);
          if (!dates) return sum;
          let validDays = 0;
          dates.forEach((date) => {
            if (date >= startIso && date <= todayIso) validDays += 1;
          });
          return sum + validDays;
        }, 0);
        const possibleMemberDays = Math.max(1, memberCount * dayCount);
        const score = (activeMemberDays / possibleMemberDays) * 100;

        return [{
          clubId: club.club_id,
          Name: club.club_name || "Club",
          country: countryByCoordinatorId.get(club.coordinator_id) || club.country || "-",
          score,
          memberCount,
        }];
      });
    },
    enabled: activeTab === "community" && communityLeaderboardView === "activity_club",
    staleTime: 30000,
    retry: 1,
  });

  const { data: smartFitClubRows = [], isLoading: smartFitClubLoading, refetch: refetchSmartFitClub } = useQuery<SmartFitClubRow[]>({
    queryKey: ["smartfit-club", selectedClub?.key, clubMemberIds, filterStartDate, filterEndDate],
    queryFn: async () => {
      if (!clubMemberIds || clubMemberIds.length === 0) return [];

      let healthQuery = supabase
        .from("health_goal")
        .select("registration_id, record_date, steps, heart_rate_bpm, sleep_hours, blood_oxygen_spo2")
        .in("registration_id", clubMemberIds);
      if (filterStartDate) healthQuery = healthQuery.gte("record_date", filterStartDate);
      if (filterEndDate) healthQuery = healthQuery.lte("record_date", filterEndDate);

      let activitiesQuery = supabase
        .from("activities")
        .select("registration_id, activity_date, start_time, end_time, pause_duration_seconds")
        .in("registration_id", clubMemberIds);
      if (filterStartDate) activitiesQuery = activitiesQuery.gte("activity_date", filterStartDate);
      if (filterEndDate) activitiesQuery = activitiesQuery.lte("activity_date", filterEndDate);

      const [
        { data: healthData, error: healthError },
        { data: registrations, error: registrationError },
        { data: activities, error: activityError },
      ] = await Promise.all([
        healthQuery,
        supabase
          .from("registrations")
          .select("registration_id, first_name, other_names, username, sex, dob, country")
          .in("registration_id", clubMemberIds),
        activitiesQuery,
      ]);

      if (healthError) throw healthError;
      if (registrationError) throw registrationError;
      if (activityError) throw activityError;

      const profileMap = new Map((registrations || []).map((profile: any) => [profile.registration_id, profile]));
      const healthByUser = new Map<string, any[]>();
      (healthData || []).forEach((entry: any) => {
        if (!entry.registration_id) return;
        const rows = healthByUser.get(entry.registration_id) || [];
        rows.push(entry);
        healthByUser.set(entry.registration_id, rows);
      });

      const activityTimeByUser = new Map<string, { totalTime: number; days: Set<string> }>();
      (activities || []).forEach((activity: any) => {
        if (!activity.registration_id) return;
        const existing = activityTimeByUser.get(activity.registration_id) || { totalTime: 0, days: new Set<string>() };
        existing.totalTime += getActivityDurationMinutes(activity);
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
        const healthScore = scoreSmartFitHealth({
          avgSteps,
          avgHeartRate: heartRates.length ? heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length : null,
          avgSleep: sleepHours.length ? sleepHours.reduce((sum, value) => sum + value, 0) / sleepHours.length : null,
          avgSpo2: spo2Values.length ? spo2Values.reduce((sum, value) => sum + value, 0) / spo2Values.length : null,
          ageGroup,
          sex,
        });
        const activityStats = activityTimeByUser.get(registrationId);
        const activityDays = activityStats?.days.size || 0;

        return {
          registrationId,
          rank: 0,
          ageGroup,
          flag: getCountryFlag(profile.country),
          name: [profile.first_name, profile.other_names].filter(Boolean).join(" ").trim() || profile.username || "Runner",
          sex,
          days,
          avgSteps: Math.round(avgSteps),
          avgTime: activityStats && activityDays > 0 ? activityStats.totalTime / activityDays : 0,
          healthScore,
          remarks: getSmartFitRemark(healthScore),
        };
      });

      const rankedRows: SmartFitClubRow[] = [];
      ["19-", "20-39", "40-59", "60-79", "80+"].forEach((ageGroup) => {
        const groupRows = rows
          .filter((row) => row.ageGroup === ageGroup)
          .sort((a, b) =>
            b.healthScore - a.healthScore ||
            b.avgSteps - a.avgSteps ||
            b.avgTime - a.avgTime ||
            b.days - a.days
          );
        groupRows.forEach((row, index) => rankedRows.push({ ...row, rank: index + 1 }));
      });

      return rankedRows;
    },
    enabled: activeTab === "club" && selectedClubIsSmartFit && !!clubMemberIds && clubMemberIds.length > 0,
    staleTime: 30000,
  });

  const { data: communityMedalData, isLoading: communityMedalLoading, refetch: refetchCommunityMedals, error: communityMedalError } = useQuery<CommunityMedalData[]>({
    queryKey: ["community-medals"],
    queryFn: async () => {
      try {
        const now = new Date();
        const currentYear = now.getFullYear();
        const yearStart = `${currentYear}-01-01`;
        const yearEnd = `${currentYear}-12-31`;
        const todayIso = now.toISOString().slice(0, 10);
        const yesterdayIso = addDaysIso(todayIso, -1);

        const { data: events, error: eventsError } = await supabase
          .from("events")
          .select(`
            event_id,
            event_name,
            starts_at,
            ends_at,
            event_type,
            has_medal,
            approval_status,
            available_distances_km,
            medal_min_daily_distance,
            medal_min_cumulative_distance,
            medal_date_start,
            medal_date_end
          `)
          .eq("has_medal", true)
          .eq("approval_status", "approved")
          .gte("ends_at", yearStart)
          .lte("starts_at", yearEnd);

        if (eventsError) {
          console.error("[CommunityMedals] Event fetch error:", eventsError);
          throw eventsError;
        }

        const eventIds = (events || []).map((event: any) => event.event_id).filter(Boolean);
        if (eventIds.length === 0) return [];

        const { data: participants, error: participantsError } = await supabase
          .from("events_participants")
          .select("event_participant_id, event_id, registration_id, distance_km, time_seconds")
          .in("event_id", eventIds);

        if (participantsError) {
          console.error("[CommunityMedals] Participant fetch error:", participantsError);
          throw participantsError;
        }

        const rawRegistrationIds = Array.from(new Set((participants || []).map((participant: any) => participant.registration_id).filter(Boolean)));
        if (rawRegistrationIds.length === 0) return [];

        const resolvedRegistrationIds = await resolveCanonicalRegistrationIds(rawRegistrationIds);
        const canonicalRegistrationIds = Array.from(new Set(rawRegistrationIds.map((id) => resolvedRegistrationIds.get(id) || id).filter(Boolean)));
        const activityLookupIds = Array.from(new Set([...rawRegistrationIds, ...canonicalRegistrationIds]));

        const [{ data: registrations, error: registrationError }, { data: activities, error: activitiesError }] = await Promise.all([
          supabase
            .from("registrations")
            .select("registration_id, first_name, other_names, country, sex, dob, has_disability, para_uses_equipment")
            .in("registration_id", canonicalRegistrationIds),
          supabase
            .from("activities")
            .select("registration_id, activity_date, distance_km")
            .in("registration_id", activityLookupIds)
            .gte("activity_date", yearStart)
            .lte("activity_date", todayIso),
        ]);

        if (registrationError) {
          console.error("[CommunityMedals] Registration fetch error:", registrationError);
          throw registrationError;
        }

        if (activitiesError) {
          console.error("[CommunityMedals] Activity fetch error:", activitiesError);
          throw activitiesError;
        }

        const [membershipClubNameMap, coordinatorClubNameMap] = await Promise.all([
          getClubNameMap(canonicalRegistrationIds),
          getCoordinatorClubNameMap(canonicalRegistrationIds),
        ]);
        const clubNameMap = new Map([
          ...Array.from(coordinatorClubNameMap.entries()),
          ...Array.from(membershipClubNameMap.entries()),
        ]);
        const registrationMap = new Map((registrations || []).map((registration: any) => [registration.registration_id, registration]));
        const juniorMedalRegistrationIds = await getJuniorSpecialClubRegistrationIds(canonicalRegistrationIds);
        const eventMap = new Map((events || []).map((event: any) => [event.event_id, event]));
        const activityDistanceByRegDate = new Map<string, number>();

        (activities || []).forEach((activity: any) => {
          const canonicalId = resolvedRegistrationIds.get(activity.registration_id) || activity.registration_id;
          const activityDate = getDateOnly(activity.activity_date);
          if (!canonicalId || !activityDate) return;
          const key = `${canonicalId}:${activityDate}`;
          activityDistanceByRegDate.set(key, (activityDistanceByRegDate.get(key) || 0) + (Number(activity.distance_km) || 0));
        });

        const rowsByRegistration = new Map<string, CommunityMedalData>();

        (participants || []).forEach((participant: any) => {
          const event = eventMap.get(participant.event_id);
          const canonicalId = resolvedRegistrationIds.get(participant.registration_id) || participant.registration_id;
          const registration = registrationMap.get(canonicalId);
          if (!event || !canonicalId || !registration) return;
          if (isJuniorAge(registration.dob) || juniorMedalRegistrationIds.has(canonicalId)) return;
          if (usesParaEquipment(registration)) return;

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
                if (minDailyDistance > 0 && dayDistance < minDailyDistance) {
                  dailyQualified = false;
                }
                cursor = addDaysIso(cursor, 1);
              }
              qualified = dailyQualified && (minCumulativeDistance <= 0 || totalDistance >= minCumulativeDistance);
            }
          }

          if (!qualified) return;

          const band = getMedalBandForCompletedDistance(totalDistance, event.available_distances_km);
          if (!band) return;

          const existing = rowsByRegistration.get(canonicalId) || {
            registrationId: canonicalId,
            Name: [registration.first_name, registration.other_names].filter(Boolean).join(" ") || "Unknown",
            Country: registration.country || "-",
            Club: clubNameMap.get(canonicalId) || "",
            Sex: normalizeSex(registration.sex),
            medalCounts: { ...EMPTY_MEDAL_COUNTS },
            totalMedals: 0,
            points: 0,
          };

          existing.medalCounts[band.key] += 1;
          existing.totalMedals += 1;
          existing.points += band.points;
          rowsByRegistration.set(canonicalId, existing);
        });

        return [...rowsByRegistration.values()].filter((row) => row.totalMedals > 0);
      } catch (error: any) {
        console.error("[CommunityMedals] Query failed:", error);
        throw error;
      }
    },
    enabled: activeTab === "community",
    staleTime: 30000,
    retry: 1,
  });

  const sortedActivities = useMemo(() => 
    activities
      ? [...activities].sort((a, b) => {
          return new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime();
        })
      : [],
    [activities]
  );

  const groupedActivities = useMemo<ActivityYearGroup[]>(() => {
    const years = new Map<string, {
      totalDistance: number;
      activityCount: number;
      months: Map<string, ActivityMonthGroup>;
    }>();

    sortedActivities.forEach((activity) => {
      const date = new Date(activity.activity_date);
      const validDate = !Number.isNaN(date.getTime());
      const year = validDate ? String(date.getFullYear()) : "Unknown Year";
      const monthIndex = validDate ? date.getMonth() : -1;
      const monthKey = validDate ? `${year}-${String(monthIndex + 1).padStart(2, "0")}` : `${year}-unknown`;
      const monthLabel = validDate
        ? date.toLocaleDateString("en-US", { month: "long" })
        : "Unknown Month";
      const yearGroup = years.get(year) || {
        totalDistance: 0,
        activityCount: 0,
        months: new Map<string, ActivityMonthGroup>(),
      };
      const monthGroup = yearGroup.months.get(monthKey) || {
        key: monthKey,
        label: monthLabel,
        totalDistance: 0,
        activities: [],
      };

      yearGroup.totalDistance += activity.distance_km || 0;
      yearGroup.activityCount += 1;
      monthGroup.totalDistance += activity.distance_km || 0;
      monthGroup.activities.push(activity);
      yearGroup.months.set(monthKey, monthGroup);
      years.set(year, yearGroup);
    });

    return [...years.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, group]) => ({
        year,
        totalDistance: group.totalDistance,
        activityCount: group.activityCount,
        months: [...group.months.values()].sort((a, b) => b.key.localeCompare(a.key)),
      }));
  }, [sortedActivities]);

  const uniqueDaysCount = useMemo(() => 
    activities
      ? new Set(activities.map(a => String(a.activity_date || "").split("T")[0]).filter(Boolean)).size
      : 0,
    [activities]
  );

  const totalDistance = useMemo(() => 
    activities
      ? activities.reduce((sum, a) => sum + a.distance_km, 0)
      : 0,
    [activities]
  );

  const totalTimeMinutes = useMemo(() => 
    activities
      ? activities.reduce((sum, activity) => {
          const startParts = activity.start_time.split(':');
          const endParts = activity.end_time.split(':');
          const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
          const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
          let duration = endMinutes - startMinutes;
          if (duration < 0) duration += 24 * 60;
          duration = Math.max(0, duration - Math.floor((activity.pause_duration_seconds || 0) / 60));
          return sum + duration;
        }, 0)
      : 0,
    [activities]
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleDateString("en-US", { month: "short" });
    return `${day} ${month}`;
  };

  const getExerciseEmoji = (type: string): string => {
    if (type === "Cycle") return "🚲";
    if (type === "Treadmill" || type === "Tredmill") return "🏃‍♂️";
    if (type === "Stairs") return "🪜";
    if (type === "Walk") return "🚶";
    if (type === "Run") return "🏃";
    return "🏃";
  };

  const getActivityMeasureLabel = (activity: ActivityData): string => {
    if (activity.exercise_type === "Stairs") {
      return `${Number(activity.steps_count || 0).toLocaleString()} steps`;
    }
    return `${Number(activity.distance_km || 0).toFixed(1)} km`;
  };

  const formatPauseDuration = (pauseSeconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(pauseSeconds || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const calculateDuration = (start: string, end: string, pauseSeconds = 0): string => {
    const startParts = start.split(':');
    const endParts = end.split(':');
    
    const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
    const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
    
    let totalMinutes = endMinutes - startMinutes;
    if (totalMinutes < 0) {
      totalMinutes += 24 * 60;
    }
    totalMinutes = Math.max(0, totalMinutes - Math.floor((pauseSeconds || 0) / 60));
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatPaceMinPerKm = (paceMinPerKm: number): string => {
    if (paceMinPerKm === 0) return "--:--";
    const totalSecondsPerKm = Math.round(paceMinPerKm * 60);
    const minutes = Math.floor(totalSecondsPerKm / 60);
    const seconds = totalSecondsPerKm % 60;
    return `${minutes}'${seconds.toString().padStart(2, '0')}"`;
  };

  const escapeCsvValue = (value: string | number): string => {
    const text = String(value ?? "");
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const saveCsvFile = async (csvContent: string, fileName: string, successMessage: string) => {
    if (Platform.OS === 'web') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    const { File: FSFile, Paths: FSPaths } = await import('expo-file-system/next');
    const file = new FSFile(FSPaths.document, fileName);
    file.write(csvContent);
    Alert.alert('CSV Saved', `${successMessage}\n${file.uri}`);
  };

  const buildWorkoutCsv = (workouts: ActivityData[]): string => {
    const headers = ['Date', 'Type', 'Distance (km)', 'Steps', 'Start Time', 'End Time', 'Duration', 'Pause Time', 'Pace (min/km)'];
    const rows = workouts.map((activity) => [
      activity.activity_date,
      activity.exercise_type,
      activity.distance_km.toFixed(2),
      activity.exercise_type === "Stairs" ? Number(activity.steps_count || 0) : "",
      activity.start_time,
      activity.end_time,
      calculateDuration(activity.start_time, activity.end_time, activity.pause_duration_seconds || 0),
      formatPauseDuration(activity.pause_duration_seconds || 0),
      formatPaceMinPerKm(activity.pace_min_per_km),
    ]);

    return [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(','))
      .join('\n');
  };

  const availableCountries = useMemo(() => {
    const source = activeTab === "club"
      ? clubLeaderboardGroups.flatMap((year) =>
          year.months.flatMap((month) =>
            month.weeks.flatMap((week) =>
              week.rows.map((row) => ({ Country: row.country || "-" }))
            )
          )
        )
      : communityLeaderboardView === "medals_indv"
        ? communityMedalData
        : communityData;
    const values = (source || [])
      .map((item) => item.Country)
      .filter((country) => country && country !== "-");

    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [activeTab, clubLeaderboardGroups, communityData, communityLeaderboardView, communityMedalData]);

  const applyLeaderboardFilters = useCallback((rows: CommunityData[]) => {
    return rows.filter((item) => {
      if (privateMode && user?.id && item.registrationId === user.id) {
        return false;
      }
      if (filterSex !== "all" && item.Sex !== filterSex) {
        return false;
      }
      if (filterCountry !== "all" && item.Country !== filterCountry) {
        return false;
      }
      return true;
    });
  }, [filterCountry, filterSex, privateMode, user?.id]);

  const applyMedalLeaderboardFilters = useCallback((rows: CommunityMedalData[]) => {
    return rows.filter((item) => {
      if (privateMode && user?.id && item.registrationId === user.id) {
        return false;
      }
      if (filterSex !== "all" && item.Sex !== filterSex) {
        return false;
      }
      if (filterCountry !== "all" && item.Country !== filterCountry) {
        return false;
      }
      return true;
    });
  }, [filterCountry, filterSex, privateMode, user?.id]);

  const applyLeaderboardSearch = useCallback(<T extends { Name: string },>(rows: T[]) => {
    const query = leaderboardSearchQuery.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((item) => item.Name.toLowerCase().includes(query));
  }, [leaderboardSearchQuery]);

  const sortedCommunityData = useMemo(() => {
    if (!communityData) return [];
    const filtered = applyLeaderboardSearch(applyLeaderboardFilters(communityData));
    return [...filtered].sort((a, b) => {
      const distDiff = b.AvgDistance - a.AvgDistance;
      if (distDiff !== 0) return distDiff;
      const daysDiff = b.ActiveDays - a.ActiveDays;
      if (daysDiff !== 0) return daysDiff;
      return a.AveragePace - b.AveragePace;
    });
  }, [applyLeaderboardFilters, applyLeaderboardSearch, communityData]);

  const currentUserQualifiesForCommunity = useMemo(
    () => Boolean(currentRegistrationId && communityData?.some((row) => row.registrationId === currentRegistrationId)),
    [communityData, currentRegistrationId]
  );

  const sortedCommunityClubActivityData = useMemo(() => {
    if (!communityClubActivityData) return [];
    const searched = applyLeaderboardSearch(communityClubActivityData);
    return [...searched].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
      return a.Name.localeCompare(b.Name);
    });
  }, [applyLeaderboardSearch, communityClubActivityData]);

  const sortedClubData = useMemo(() => {
    if (!clubCommunityData) return [];
    const filtered = applyLeaderboardFilters(clubCommunityData);
    return [...filtered].sort((a, b) => {
      const distDiff = b.AvgDistance - a.AvgDistance;
      if (distDiff !== 0) return distDiff;
      const daysDiff = b.ActiveDays - a.ActiveDays;
      if (daysDiff !== 0) return daysDiff;
      return a.AveragePace - b.AveragePace;
    });
  }, [applyLeaderboardFilters, clubCommunityData]);

  const sortedCommunityMedalData = useMemo(() => {
    if (!communityMedalData) return [];
    const filtered = applyLeaderboardSearch(applyMedalLeaderboardFilters(communityMedalData));
    return [...filtered].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.totalMedals !== a.totalMedals) return b.totalMedals - a.totalMedals;
      return a.Name.localeCompare(b.Name);
    });
  }, [applyLeaderboardSearch, applyMedalLeaderboardFilters, communityMedalData]);

  const sortedCommunityClubMedalData = useMemo<CommunityClubMedalData[]>(() => {
    const clubRows = new Map<string, CommunityClubMedalData>();
    sortedCommunityMedalData.forEach((row) => {
      const clubName = String(row.Club || "").trim();
      if (!clubName) return;
      const existing = clubRows.get(clubName) || {
        clubName,
        country: row.Country || "-",
        athleteCount: 0,
        medalCounts: { ...EMPTY_MEDAL_COUNTS },
        totalMedals: 0,
        points: 0,
      };
      existing.athleteCount += 1;
      existing.totalMedals += row.totalMedals;
      existing.points += row.points;
      MEDAL_DISPLAY_BANDS.forEach((band) => {
        existing.medalCounts[band.key] += row.medalCounts[band.key] || 0;
      });
      if ((!existing.country || existing.country === "-") && row.Country) {
        existing.country = row.Country;
      }
      clubRows.set(clubName, existing);
    });

    return [...clubRows.values()].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.totalMedals !== a.totalMedals) return b.totalMedals - a.totalMedals;
      if (b.athleteCount !== a.athleteCount) return b.athleteCount - a.athleteCount;
      return a.clubName.localeCompare(b.clubName);
    });
  }, [sortedCommunityMedalData]);

  const renderFamilyManager = () => (
    <View style={styles.familyManagerCard}>
      <View style={styles.familyManagerHeader}>
        <View style={styles.familyManagerTitleBlock}>
          <Text style={styles.familyManagerTitle}>Family</Text>
          <Text style={styles.familyManagerSubtitle}>Share your code, add up to 5 people.</Text>
        </View>
        <View style={styles.familyCodeCard}>
          <Text style={styles.familyCodeLabel}>My Code</Text>
          <Text style={styles.familyCodeValue} numberOfLines={1}>
            {myFamilyCode || (familyCodeReady ? "Unavailable" : "Pending")}
          </Text>
        </View>
      </View>
      <View style={styles.familyInputRow}>
        <TextInput
          style={[styles.familyUsernameInput, (!familyCodeReady || familyMembers.length >= 5) && styles.familyUsernameInputDisabled]}
          value={familyCodeInput}
          onChangeText={setFamilyCodeInput}
          placeholder={familyCodeReady ? "Enter Family Code" : "Migration pending"}
          placeholderTextColor="#9ca3af"
          autoCapitalize="characters"
          editable={familyCodeReady && !familyActionLoading && familyMembers.length < 5}
        />
        <TouchableOpacity
          style={[
            styles.familyAddButton,
            (!familyCodeReady || familyActionLoading || familyMembers.length >= 5) && styles.familyButtonDisabled,
          ]}
          onPress={handleAddFamilyMember}
          disabled={!familyCodeReady || familyActionLoading || familyMembers.length >= 5}
        >
          <Text style={styles.familyAddButtonText}>Add</Text>
        </TouchableOpacity>
      </View>
      {familyMembers.length > 0 ? (
        <View style={styles.familyMemberGrid}>
          {familyMembers.map((member) => (
            <View key={member.familyMemberId} style={styles.familyMemberPill}>
              <View style={styles.familyMemberInfo}>
                <Text style={styles.familyMemberName} numberOfLines={1}>{member.name}</Text>
                <Text style={styles.familyMemberUsername} numberOfLines={1}>{member.familyCode || `@${member.username}`}</Text>
              </View>
              <TouchableOpacity
                style={[styles.familyRemoveButton, familyActionLoading && styles.familyButtonDisabled]}
                onPress={() => handleRemoveFamilyMember(member)}
                disabled={familyActionLoading}
              >
                <Text style={styles.familyRemoveButtonText}>x</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  const renderGroupedLeaderboard = (groups: FamilyYearGroup[]) => (
    <View style={styles.familyLeaderboardContainer}>
      {groups.map((yearGroup) => (
        <View key={yearGroup.year} style={styles.familyYearGroup}>
          <Text style={styles.runsYearTitle}>{yearGroup.year}</Text>
          {yearGroup.months.map((monthGroup) => (
            <View key={monthGroup.key} style={styles.familyMonthGroup}>
              <Text style={styles.runsMonthTitle}>{monthGroup.label}</Text>
              {monthGroup.weeks.map((weekGroup) => (
                <View key={weekGroup.key} style={styles.familyWeekGroup}>
                  <Text style={styles.familyWeekTitle}>{weekGroup.label}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.familyTable}>
                      <View style={styles.leaderboardTableHeader}>
                        <View style={styles.familyRankColumn}><Text style={styles.leaderTableHeaderText}>Rank</Text></View>
                        <View style={styles.familyNameColumn}><Text style={styles.leaderTableHeaderText}>Name</Text></View>
                        <View style={styles.familyDaysColumn}><Text style={styles.leaderTableHeaderText}>Days</Text></View>
                        <View style={styles.familyDistanceColumn}><Text style={styles.leaderTableHeaderText}>Distance</Text></View>
                        <View style={styles.familyTimeColumn}><Text style={styles.leaderTableHeaderText}>Time</Text></View>
                        <View style={styles.familyPaceColumn}><Text style={styles.leaderTableHeaderText}>Pace</Text></View>
                      </View>
                      {weekGroup.rows.map((row, index) => (
                        <View key={`${weekGroup.key}-${row.registrationId}`} style={[styles.leaderboardTableRow, index % 2 === 1 && styles.leaderboardTableRowAlt, row.registrationId === currentRegistrationId && styles.currentUserLeaderboardRow]}>
                          <View style={styles.familyRankColumn}><Text style={styles.leaderTableCellText}>{index + 1}</Text></View>
                          <View style={styles.familyNameColumn}><Text style={[styles.leaderTableCellText, row.registrationId === currentRegistrationId && styles.currentUserLeaderboardText]} numberOfLines={1}>{row.name}</Text></View>
                          <View style={styles.familyDaysColumn}><Text style={styles.leaderTableCellText}>{row.days}</Text></View>
                          <View style={styles.familyDistanceColumn}><Text style={styles.leaderTableCellText}>{row.distance.toFixed(1)} km</Text></View>
                          <View style={styles.familyTimeColumn}><Text style={styles.leaderTableCellText}>{formatTime(row.time)}</Text></View>
                          <View style={styles.familyPaceColumn}><Text style={styles.leaderTableCellText}>{formatPaceMinPerKm(row.pace)}</Text></View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );

  const renderClubRows = (rows: FamilyLeaderboardRow[], keyPrefix: string) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.familyTable}>
        <View style={styles.leaderboardTableHeader}>
          <View style={styles.familyRankColumn}><Text style={styles.leaderTableHeaderText}>Rank</Text></View>
          <View style={styles.familyNameColumn}><Text style={styles.leaderTableHeaderText}>Name</Text></View>
          <View style={styles.familyDaysColumn}><Text style={styles.leaderTableHeaderText}>Days</Text></View>
          <View style={styles.familyDistanceColumn}><Text style={styles.leaderTableHeaderText}>Distance</Text></View>
          <View style={styles.familyTimeColumn}><Text style={styles.leaderTableHeaderText}>Time</Text></View>
          <View style={styles.familyPaceColumn}><Text style={styles.leaderTableHeaderText}>Pace</Text></View>
        </View>
        {rows.map((row, index) => (
          <View
            key={`${keyPrefix}-${row.registrationId}`}
            style={[styles.leaderboardTableRow, index % 2 === 1 && styles.leaderboardTableRowAlt, row.registrationId === currentRegistrationId && styles.currentUserLeaderboardRow]}
          >
            <View style={styles.familyRankColumn}><Text style={styles.leaderTableCellText}>{index + 1}</Text></View>
            <View style={styles.familyNameColumn}><Text style={[styles.leaderTableCellText, row.registrationId === currentRegistrationId && styles.currentUserLeaderboardText]} numberOfLines={1}>{row.name}</Text></View>
            <View style={styles.familyDaysColumn}><Text style={styles.leaderTableCellText}>{row.days}</Text></View>
            <View style={styles.familyDistanceColumn}><Text style={styles.leaderTableCellText}>{row.distance.toFixed(1)} km</Text></View>
            <View style={styles.familyTimeColumn}><Text style={styles.leaderTableCellText}>{formatTime(row.time)}</Text></View>
            <View style={styles.familyPaceColumn}><Text style={styles.leaderTableCellText}>{formatPaceMinPerKm(row.pace)}</Text></View>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  const renderClubDistanceCountRows = (rows: FamilyLeaderboardRow[], keyPrefix: string) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.clubDistanceCountTable}>
        <View style={[styles.leaderboardTableHeader, styles.medalLeaderboardTableHeader]}>
          <View style={styles.medalRankColumn}><Text style={styles.leaderTableHeaderText}>#</Text></View>
          <View style={styles.medalNameColumn}><Text style={styles.leaderTableHeaderText}>Name</Text></View>
          <View style={styles.medalSexColumn}><Text style={styles.leaderTableHeaderText}>Sex</Text></View>
          {MEDAL_DISPLAY_BANDS.map((band) => (
            <View key={band.key} style={styles.medalCountColumn}>
              <Text style={styles.leaderTableHeaderText}>{band.key}</Text>
            </View>
          ))}
          <View style={styles.clubDistanceTotalColumn}><Text style={styles.leaderTableHeaderText}>Total km</Text></View>
        </View>
        {rows.map((row, index) => (
          <View
            key={`${keyPrefix}-${row.registrationId}`}
            style={[
              styles.leaderboardTableRow,
              styles.medalLeaderboardTableRow,
              index % 2 === 1 && styles.leaderboardTableRowAlt,
              row.registrationId === currentRegistrationId && styles.currentUserLeaderboardRow,
            ]}
          >
            <View style={[styles.medalRankColumn, styles.leaderRankCell]}>
              <Text style={styles.leaderFlagText}>{getCountryFlag(row.country)}</Text>
              <Text style={styles.leaderTableCellText}>{index + 1}</Text>
            </View>
            <View style={styles.medalNameColumn}>
              <Text
                style={[styles.leaderTableCellText, row.registrationId === currentRegistrationId && styles.currentUserLeaderboardText]}
                numberOfLines={1}
              >
                {row.name}
              </Text>
            </View>
            <View style={styles.medalSexColumn}>
              <Text style={styles.leaderTableCellText}>
                {row.sex === "Male" ? "M" : row.sex === "Female" ? "F" : row.sex || "-"}
              </Text>
            </View>
            {MEDAL_DISPLAY_BANDS.map((band) => (
              <View key={band.key} style={styles.medalCountColumn}>
                <Text style={styles.leaderTableCellText}>{row.distanceCounts?.[band.key] || 0}</Text>
              </View>
            ))}
            <View style={styles.clubDistanceTotalColumn}>
              <Text style={styles.leaderTableCellText}>{row.distance.toFixed(1)}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  const renderClubPeriodRows = (rows: FamilyLeaderboardRow[], keyPrefix: string) =>
    clubLeaderboardView === "distance_count"
      ? renderClubDistanceCountRows(rows, keyPrefix)
      : renderClubRows(rows, keyPrefix);

  const renderClubLeaderboard = (groups: ClubLeaderboardYearGroup[]) => (
    <View style={styles.familyLeaderboardContainer}>
      {groups.map((yearGroup) => (
        <View key={yearGroup.year} style={styles.familyYearGroup}>
          <Text style={styles.runsYearTitle}>{yearGroup.year}</Text>
          {yearGroup.annualRows ? (
            <View style={styles.familyWeekGroup}>
              <Text style={styles.familyWeekTitle}>Year total</Text>
              {renderClubPeriodRows(yearGroup.annualRows, `${yearGroup.year}-total`)}
            </View>
          ) : (
            yearGroup.months.map((monthGroup) => (
              <View key={monthGroup.key} style={styles.familyMonthGroup}>
                <Text style={styles.runsMonthTitle}>{monthGroup.label}</Text>
                {monthGroup.monthlyRows ? (
                  <View style={styles.familyWeekGroup}>
                    <Text style={styles.familyWeekTitle}>Month total</Text>
                    {renderClubPeriodRows(monthGroup.monthlyRows, `${monthGroup.key}-total`)}
                  </View>
                ) : (
                  monthGroup.weeks.map((weekGroup) => (
                    <View key={weekGroup.key} style={styles.familyWeekGroup}>
                      <Text style={styles.familyWeekTitle}>{weekGroup.label}</Text>
                      {renderClubPeriodRows(weekGroup.rows, weekGroup.key)}
                    </View>
                  ))
                )}
              </View>
            ))
          )}
        </View>
      ))}
    </View>
  );

  const renderLeaderboardTable = (
    rows: CommunityData[],
    options: { showClub?: boolean; showAge?: boolean } = {}
  ) => {
    const showClub = options.showClub !== false;
    const showAge = options.showAge === true;
    return (
      <View style={styles.leaderboardTableContainer}>
        <View style={styles.leaderboardTableHeader}>
          <View style={styles.leaderRankColumn}>
            <Text style={styles.leaderTableHeaderText}>#</Text>
          </View>
          <View style={styles.leaderNameColumn}>
            <Text style={styles.leaderTableHeaderText}>Name</Text>
          </View>
          {showClub ? (
            <View style={styles.leaderClubColumn}>
              <Text style={styles.leaderTableHeaderText}>Club</Text>
            </View>
          ) : null}
          {showAge ? (
            <View style={styles.leaderAgeColumn}>
              <Text style={styles.leaderTableHeaderText}>Age</Text>
            </View>
          ) : null}
          <View style={styles.leaderSexColumn}>
            <Text style={styles.leaderTableHeaderText}>Sex</Text>
          </View>
          <View style={styles.leaderDaysColumn}>
            <Text style={styles.leaderTableHeaderText}>Days</Text>
          </View>
          <View style={styles.leaderDistanceColumn}>
            <Text style={styles.leaderTableHeaderText}>Av.km</Text>
          </View>
          <View style={styles.leaderTimeColumn}>
            <Text style={styles.leaderTableHeaderText}>Av.Time</Text>
          </View>
          <View style={styles.leaderPaceColumn}>
            <Text style={styles.leaderTableHeaderText}>Av.Pace</Text>
          </View>
        </View>
        {renderFrozenLeaderboardRows(
          rows.map((item, index) => (
            <View key={item.registrationId} style={[styles.leaderboardTableRow, index % 2 === 1 && styles.leaderboardTableRowAlt, item.registrationId === currentRegistrationId && styles.currentUserLeaderboardRow]}>
              <View style={[styles.leaderRankColumn, styles.leaderRankCell]}>
                <Text style={styles.leaderFlagText}>{getCountryFlag(item.Country)}</Text>
                <Text style={styles.leaderTableCellText}>{index + 1}</Text>
              </View>
              <View style={styles.leaderNameColumn}>
                <Text style={[styles.leaderTableCellText, item.registrationId === currentRegistrationId && styles.currentUserLeaderboardText]} numberOfLines={1}>{item.Name}</Text>
              </View>
              {showClub ? (
                <View style={styles.leaderClubColumn}>
                  <Text style={styles.leaderTableCellText} numberOfLines={1}>{item.Club || "-"}</Text>
                </View>
              ) : null}
              {showAge ? (
                <View style={styles.leaderAgeColumn}>
                  <Text style={styles.leaderTableCellText}>{item.Age ?? "-"}</Text>
                </View>
              ) : null}
              <View style={styles.leaderSexColumn}>
                <Text style={styles.leaderTableCellText}>
                  {item.Sex === "Male" ? "M" : item.Sex === "Female" ? "F" : item.Sex || "-"}
                </Text>
              </View>
              <View style={styles.leaderDaysColumn}>
                <Text style={styles.leaderTableCellText}>{item.ActiveDays}</Text>
              </View>
              <View style={styles.leaderDistanceColumn}>
                <Text style={styles.leaderTableCellText}>{item.AvgDistance.toFixed(1)}</Text>
              </View>
              <View style={styles.leaderTimeColumn}>
                <Text style={styles.leaderTableCellText} numberOfLines={1}>{formatTime(item.AvgTime)}</Text>
              </View>
              <View style={styles.leaderPaceColumn}>
                <Text style={styles.leaderTableCellText} numberOfLines={1}>{formatPaceMinPerKm(item.AveragePace)}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    );
  };

  const formatParticipantTime = (seconds?: number | null): string => {
    if (!seconds || seconds <= 0) return "--:--";
    const safeSeconds = Math.round(seconds);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const remainingSeconds = safeSeconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const formatParticipantPace = (secondsPerKm?: number | null): string => {
    if (!secondsPerKm || secondsPerKm <= 0) return "--:--";
    return formatPaceMinPerKm(secondsPerKm / 60);
  };

  const renderEventParticipantsTable = () => (
    <View style={styles.eventsSection}>
      <Text style={[styles.eventsSectionTitle, { color: themeColors.text }]}>Event Results</Text>
      <TouchableOpacity
        style={[styles.eventDropdownButton, { backgroundColor: themeColors.cardBackground }]}
        onPress={() => setShowEventPicker(true)}
        activeOpacity={0.75}
      >
        <Calendar size={18} color={colors.primary} />
        <View style={styles.eventDropdownTextBlock}>
          <Text style={styles.eventDropdownLabel}>Event</Text>
          <Text style={[styles.eventDropdownText, { color: themeColors.text }]} numberOfLines={1}>
            {selectedLeaderboardEvent?.eventName || "Select an event"}
          </Text>
        </View>
        <ChevronDown size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      {!selectedLeaderboardEventId ? (
        <View style={[styles.noEventsCard, { backgroundColor: themeColors.cardBackground }]}>
          <Calendar size={20} color={colors.textLight} />
          <Text style={styles.noEventsText}>Select an event to view results</Text>
        </View>
      ) : eventParticipantsLoading ? (
        <View style={[styles.noEventsCard, { backgroundColor: themeColors.cardBackground }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.noEventsText}>Loading results...</Text>
        </View>
      ) : eventParticipants.length === 0 ? (
        <View style={[styles.noEventsCard, { backgroundColor: themeColors.cardBackground }]}>
          <Award size={20} color={colors.textLight} />
          <Text style={styles.noEventsText}>No results recorded yet</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.eventParticipantsTable}>
            <View style={styles.leaderboardTableHeader}>
              <View style={styles.eventRankColumn}><Text style={styles.leaderTableHeaderText}>#</Text></View>
              <View style={styles.eventParticipantNameColumn}><Text style={styles.leaderTableHeaderText}>Name</Text></View>
              <View style={styles.eventParticipantSmallColumn}><Text style={styles.leaderTableHeaderText}>Sex</Text></View>
              <View style={styles.eventParticipantCountryColumn}><Text style={styles.leaderTableHeaderText}>Country</Text></View>
              <View style={styles.eventParticipantMetricColumn}><Text style={styles.leaderTableHeaderText}>km</Text></View>
              <View style={styles.eventParticipantMetricColumn}><Text style={styles.leaderTableHeaderText}>Time</Text></View>
              <View style={styles.eventParticipantMetricColumn}><Text style={styles.leaderTableHeaderText}>Pace</Text></View>
              <View style={styles.eventParticipantStatusColumn}><Text style={styles.leaderTableHeaderText}>Status</Text></View>
            </View>
            {eventParticipants.map((participant, index) => (
              <View
                key={`${participant.eventId}-${participant.registrationId || index}`}
                style={[
                  styles.leaderboardTableRow,
                  index % 2 === 1 && styles.leaderboardTableRowAlt,
                  participant.registrationId === currentRegistrationId && styles.currentUserLeaderboardRow,
                ]}
              >
                <View style={styles.eventRankColumn}>
                  <Text style={styles.leaderTableCellText}>{index + 1}</Text>
                </View>
                <View style={styles.eventParticipantNameColumn}>
                  <Text
                    style={[styles.leaderTableCellText, participant.registrationId === currentRegistrationId && styles.currentUserLeaderboardText]}
                    numberOfLines={1}
                  >
                    {participant.name}
                  </Text>
                </View>
                <View style={styles.eventParticipantSmallColumn}>
                  <Text style={styles.leaderTableCellText}>
                    {participant.sex === "Male" ? "M" : participant.sex === "Female" ? "F" : participant.sex || "-"}
                  </Text>
                </View>
                <View style={styles.eventParticipantCountryColumn}>
                  <Text style={styles.leaderTableCellText} numberOfLines={1}>{participant.country || "-"}</Text>
                </View>
                <View style={styles.eventParticipantMetricColumn}>
                  <Text style={styles.leaderTableCellText}>{participant.distanceKm ? participant.distanceKm.toFixed(1) : "-"}</Text>
                </View>
                <View style={styles.eventParticipantMetricColumn}>
                  <Text style={styles.leaderTableCellText}>{formatParticipantTime(participant.timeSeconds)}</Text>
                </View>
                <View style={styles.eventParticipantMetricColumn}>
                  <Text style={styles.leaderTableCellText}>{formatParticipantPace(participant.paceSecondsPerKm)}</Text>
                </View>
                <View style={styles.eventParticipantStatusColumn}>
                  <Text style={styles.leaderTableCellText} numberOfLines={1}>{participant.status}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );

  const renderStairLeaderboardTable = (rows: StairLeaderboardRow[]) => (
    <View style={styles.leaderboardTableContainer}>
      <View style={styles.leaderboardTableHeader}>
        <View style={styles.leaderRankColumn}>
          <Text style={styles.leaderTableHeaderText}>#</Text>
        </View>
        <View style={styles.leaderNameColumn}>
          <Text style={styles.leaderTableHeaderText}>Name</Text>
        </View>
        <View style={styles.leaderClubColumn}>
          <Text style={styles.leaderTableHeaderText}>Building</Text>
        </View>
        <View style={styles.leaderSexColumn}>
          <Text style={styles.leaderTableHeaderText}>Sex</Text>
        </View>
        <View style={styles.leaderDistanceColumn}>
          <Text style={styles.leaderTableHeaderText}>Steps</Text>
        </View>
        <View style={styles.leaderDaysColumn}>
          <Text style={styles.leaderTableHeaderText}>Asc</Text>
        </View>
        <View style={styles.leaderTimeColumn}>
          <Text style={styles.leaderTableHeaderText}>Time</Text>
        </View>
      </View>
      {rows.map((item, index) => (
        <View
          key={item.registrationId}
          style={[
            styles.leaderboardTableRow,
            index % 2 === 1 && styles.leaderboardTableRowAlt,
            item.registrationId === currentRegistrationId && styles.currentUserLeaderboardRow,
          ]}
        >
          <View style={styles.leaderRankColumn}>
            <Text style={styles.leaderTableCellText}>{item.rank || index + 1}</Text>
          </View>
          <View style={styles.leaderNameColumn}>
            <Text style={[styles.leaderTableCellText, item.registrationId === currentRegistrationId && styles.currentUserLeaderboardText]} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
          <View style={styles.leaderClubColumn}>
            <Text style={styles.leaderTableCellText} numberOfLines={1}>{item.building || "-"}</Text>
          </View>
          <View style={styles.leaderSexColumn}>
            <Text style={styles.leaderTableCellText}>
              {item.sex === "Male" ? "M" : item.sex === "Female" ? "F" : item.sex || "-"}
            </Text>
          </View>
          <View style={styles.leaderDistanceColumn}>
            <Text style={styles.leaderTableCellText}>{Number(item.steps || 0).toLocaleString()}</Text>
          </View>
          <View style={styles.leaderDaysColumn}>
            <Text style={styles.leaderTableCellText}>{Number(item.ascents || 0).toLocaleString()}</Text>
          </View>
          <View style={styles.leaderTimeColumn}>
            <Text style={styles.leaderTableCellText}>{formatParticipantTime(Number(item.durationSeconds || 0))}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  const renderParaClubLeaderboardTable = (rows: CommunityData[]) => {
    const groupOrder = ["Wheelchair", "Handcycle", "Prosthetic blades", "Other", "No gear"];
    const groups = Array.from(new Set(rows.map((row) => row.ParaEquipmentGroup || "No gear"))).sort((a, b) => {
      const aIndex = groupOrder.indexOf(a);
      const bIndex = groupOrder.indexOf(b);
      if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
      return a.localeCompare(b);
    });

    return (
      <View>
        {groups.map((group) => {
          const groupRows = rows.filter((row) => (row.ParaEquipmentGroup || "No gear") === group);
          if (groupRows.length === 0) return null;
          return (
            <View key={group} style={styles.paraClubGroup}>
              <Text style={styles.smartFitClubGroupTitle}>{group}</Text>
              {renderLeaderboardTable(groupRows, { showClub: false })}
            </View>
          );
        })}
      </View>
    );
  };

  const renderMedalLeaderboardTable = (rows: CommunityMedalData[]) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.medalLeaderboardTableContainer}>
        <View style={[styles.leaderboardTableHeader, styles.medalLeaderboardTableHeader]}>
          <View style={styles.medalRankColumn}>
            <Text style={styles.leaderTableHeaderText}>#</Text>
          </View>
          <View style={styles.medalNameColumn}>
            <Text style={styles.leaderTableHeaderText}>Name</Text>
          </View>
          <View style={styles.medalSexColumn}>
            <Text style={styles.leaderTableHeaderText}>Sex</Text>
          </View>
          <View style={styles.medalClubColumn}>
            <Text style={styles.leaderTableHeaderText}>Club</Text>
          </View>
          {MEDAL_DISPLAY_BANDS.map((band) => (
            <View key={band.key} style={styles.medalCountColumn}>
              <Text style={styles.leaderTableHeaderText}>{band.key}</Text>
            </View>
          ))}
          <View style={styles.medalPointsColumn}>
            <Text style={styles.leaderTableHeaderText}>Pts</Text>
          </View>
        </View>
        {renderFrozenLeaderboardRows(
          rows.map((item, index) => (
            <View key={item.registrationId} style={[styles.leaderboardTableRow, styles.medalLeaderboardTableRow, index % 2 === 1 && styles.leaderboardTableRowAlt, item.registrationId === currentRegistrationId && styles.currentUserLeaderboardRow]}>
              <View style={[styles.medalRankColumn, styles.leaderRankCell]}>
                <Text style={styles.leaderFlagText}>{getCountryFlag(item.Country)}</Text>
                <Text style={styles.leaderTableCellText}>{index + 1}</Text>
              </View>
              <View style={styles.medalNameColumn}>
                <Text style={[styles.leaderTableCellText, item.registrationId === currentRegistrationId && styles.currentUserLeaderboardText]} numberOfLines={1}>{item.Name}</Text>
              </View>
              <View style={styles.medalSexColumn}>
                <Text style={styles.leaderTableCellText}>
                  {item.Sex === "Male" ? "M" : item.Sex === "Female" ? "F" : item.Sex || "-"}
                </Text>
              </View>
              <View style={styles.medalClubColumn}>
                <Text style={styles.leaderTableCellText} numberOfLines={1}>{item.Club || "-"}</Text>
              </View>
              {MEDAL_DISPLAY_BANDS.map((band) => (
                <View key={band.key} style={styles.medalCountColumn}>
                  <Text style={styles.leaderTableCellText}>{item.medalCounts[band.key] || 0}</Text>
                </View>
              ))}
              <View style={styles.medalPointsColumn}>
                <Text style={styles.leaderTableCellText}>{item.points}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );

  const renderClubMedalLeaderboardTable = (rows: CommunityClubMedalData[]) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.medalLeaderboardTableContainer}>
        <View style={[styles.leaderboardTableHeader, styles.medalLeaderboardTableHeader]}>
          <View style={styles.medalRankColumn}>
            <Text style={styles.leaderTableHeaderText}>#</Text>
          </View>
          <View style={styles.medalNameColumn}>
            <Text style={styles.leaderTableHeaderText}>Club</Text>
          </View>
          <View style={styles.medalSexColumn}>
            <Text style={styles.leaderTableHeaderText}>Mbrs</Text>
          </View>
          {MEDAL_DISPLAY_BANDS.map((band) => (
            <View key={band.key} style={styles.medalCountColumn}>
              <Text style={styles.leaderTableHeaderText}>{band.key}</Text>
            </View>
          ))}
          <View style={styles.medalPointsColumn}>
            <Text style={styles.leaderTableHeaderText}>Pts</Text>
          </View>
        </View>
        {renderFrozenLeaderboardRows(
          rows.map((item, index) => (
            <View key={item.clubName} style={[styles.leaderboardTableRow, styles.medalLeaderboardTableRow, index % 2 === 1 && styles.leaderboardTableRowAlt]}>
              <View style={[styles.medalRankColumn, styles.leaderRankCell]}>
                <Text style={styles.leaderFlagText}>{getCountryFlag(item.country)}</Text>
                <Text style={styles.leaderTableCellText}>{index + 1}</Text>
              </View>
              <View style={styles.medalNameColumn}>
                <Text style={styles.leaderTableCellText} numberOfLines={1}>{item.clubName}</Text>
              </View>
              <View style={styles.medalSexColumn}>
                <Text style={styles.leaderTableCellText}>{item.athleteCount}</Text>
              </View>
              {MEDAL_DISPLAY_BANDS.map((band) => (
                <View key={band.key} style={styles.medalCountColumn}>
                  <Text style={styles.leaderTableCellText}>{item.medalCounts[band.key] || 0}</Text>
                </View>
              ))}
              <View style={styles.medalPointsColumn}>
                <Text style={styles.leaderTableCellText}>{item.points}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );

  const renderClubActivityLeaderboardTable = (rows: CommunityClubActivityData[]) => (
    <View style={styles.clubActivityTableContainer}>
      <View style={styles.leaderboardTableHeader}>
        <View style={styles.clubActivityRankColumn}>
          <Text style={styles.leaderTableHeaderText}>Rank</Text>
        </View>
        <View style={styles.clubActivityNameColumn}>
          <Text style={styles.leaderTableHeaderText}>Name</Text>
        </View>
        <View style={styles.clubActivityCountryColumn}>
          <Text style={styles.leaderTableHeaderText}>Country</Text>
        </View>
        <View style={styles.clubActivityMembersColumn}>
          <Text style={styles.leaderTableHeaderText}>Members</Text>
        </View>
        <View style={styles.clubActivityScoreColumn}>
          <Text style={styles.leaderTableHeaderText}>Score</Text>
        </View>
      </View>
      {renderFrozenLeaderboardRows(
        rows.map((item, index) => (
          <View key={item.clubId} style={[styles.leaderboardTableRow, index % 2 === 1 && styles.leaderboardTableRowAlt]}>
            <View style={styles.clubActivityRankColumn}>
              <Text style={styles.leaderTableCellText}>{index + 1}</Text>
            </View>
            <View style={styles.clubActivityNameColumn}>
              <Text style={styles.leaderTableCellText} numberOfLines={1}>{item.Name}</Text>
            </View>
            <View style={styles.clubActivityCountryColumn}>
              <Text style={styles.leaderTableCellText} numberOfLines={1}>{item.country}</Text>
            </View>
            <View style={styles.clubActivityMembersColumn}>
              <Text style={styles.leaderTableCellText}>{item.memberCount}</Text>
            </View>
            <View style={styles.clubActivityScoreColumn}>
              <Text style={styles.leaderTableCellText}>{item.score.toFixed(1)}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderSmartFitClubTable = (rows: SmartFitClubRow[]) => (
    <View style={styles.smartFitClubContainer}>
      {["19-", "20-39", "40-59", "60-79", "80+"].map((ageGroup) => {
        const groupRows = rows.filter((row) => row.ageGroup === ageGroup);
        if (groupRows.length === 0) return null;
        return (
          <View key={ageGroup} style={styles.smartFitClubGroup}>
            <Text style={styles.smartFitClubGroupTitle}>Age {ageGroup}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.smartFitClubTable}>
                <View style={styles.leaderboardTableHeader}>
                  <View style={styles.smartFitFlagColumn}>
                    <Text style={styles.leaderTableHeaderText}>Flag</Text>
                  </View>
                  <View style={styles.smartFitRankColumn}>
                    <Text style={styles.leaderTableHeaderText}>Rank</Text>
                  </View>
                  <View style={styles.smartFitNameColumn}>
                    <Text style={styles.leaderTableHeaderText}>Name</Text>
                  </View>
                  <View style={styles.smartFitSexColumn}>
                    <Text style={styles.leaderTableHeaderText}>Sex</Text>
                  </View>
                  <View style={styles.smartFitDaysColumn}>
                    <Text style={styles.leaderTableHeaderText}>Days</Text>
                  </View>
                  <View style={styles.smartFitStepsColumn}>
                    <Text style={styles.leaderTableHeaderText}>Av.Steps</Text>
                  </View>
                  <View style={styles.smartFitTimeColumn}>
                    <Text style={styles.leaderTableHeaderText}>Av.Time</Text>
                  </View>
                  <View style={styles.smartFitScoreColumn}>
                    <Text style={styles.leaderTableHeaderText}>Health Score</Text>
                  </View>
                  <View style={styles.smartFitRemarksColumn}>
                    <Text style={styles.leaderTableHeaderText}>Remarks</Text>
                  </View>
                </View>
                {groupRows.map((row, index) => (
                  <View
                    key={`${row.ageGroup}-${row.registrationId}`}
                    style={[styles.leaderboardTableRow, index % 2 === 1 && styles.leaderboardTableRowAlt, row.registrationId === currentRegistrationId && styles.currentUserLeaderboardRow]}
                  >
                    <View style={styles.smartFitFlagColumn}>
                      <Text style={styles.leaderFlagText}>{row.flag || "-"}</Text>
                    </View>
                    <View style={styles.smartFitRankColumn}>
                      <Text style={styles.leaderTableCellText}>{row.rank}</Text>
                    </View>
                    <View style={styles.smartFitNameColumn}>
                      <Text style={[styles.leaderTableCellText, row.registrationId === currentRegistrationId && styles.currentUserLeaderboardText]} numberOfLines={1}>{row.name}</Text>
                    </View>
                    <View style={styles.smartFitSexColumn}>
                      <Text style={styles.leaderTableCellText}>{row.sex === "Male" ? "M" : row.sex === "Female" ? "F" : "-"}</Text>
                    </View>
                    <View style={styles.smartFitDaysColumn}>
                      <Text style={styles.leaderTableCellText}>{row.days}</Text>
                    </View>
                    <View style={styles.smartFitStepsColumn}>
                      <Text style={styles.leaderTableCellText}>{row.avgSteps.toLocaleString()}</Text>
                    </View>
                    <View style={styles.smartFitTimeColumn}>
                      <Text style={styles.leaderTableCellText}>{formatTime(row.avgTime)}</Text>
                    </View>
                    <View style={styles.smartFitScoreColumn}>
                      <Text style={styles.leaderTableCellText}>{row.healthScore}</Text>
                    </View>
                    <View style={styles.smartFitRemarksColumn}>
                      <Text style={styles.leaderTableCellText} numberOfLines={1}>{row.remarks}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        );
      })}
    </View>
  );

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  };

  const handleExternalActivitySubmit = async () => {
    if (!user?.id) {
      Alert.alert("Error", "You must be logged in to submit activities");
      return;
    }

    const isStairs = formData.exerciseType === "Stairs";
    const requiredMeasure = isStairs ? formData.stepsCount : formData.distanceKm;

    if (!formData.activityDate || !formData.startTime || !formData.duration || !requiredMeasure) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    const durationRegex = /^\d{2}:\d{2}:\d{2}$/;
    if (!durationRegex.test(formData.duration)) {
      Alert.alert("Error", "Duration must be in HH:MM:SS format (e.g., 00:45:30)");
      return;
    }

    const distanceNum = isStairs ? 0 : parseFloat(formData.distanceKm);
    const stepsNum = isStairs ? parseInt(formData.stepsCount.replace(/,/g, ""), 10) : null;

    if (!isStairs && (isNaN(distanceNum) || distanceNum <= 0)) {
      Alert.alert("Error", "Please enter a valid distance");
      return;
    }

    if (isStairs && (!stepsNum || isNaN(stepsNum) || stepsNum <= 0)) {
      Alert.alert("Error", "Please enter a valid stair step count");
      return;
    }

    const durationParts = formData.duration.split(':');
    const durationMinutes = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1]) + parseInt(durationParts[2]) / 60;

    if (formData.exerciseType === "Walk") {
      if (distanceNum < MIN_DISTANCE_ACTIVITY) {
        Alert.alert("Activity Not Saved", `A Walk must be at least ${MIN_DISTANCE_ACTIVITY} km to be saved.`);
        return;
      }
      if (durationMinutes < MIN_ACTIVITY_DURATION_MINUTES) {
        Alert.alert("Activity Not Saved", `A Walk must be at least ${MIN_ACTIVITY_DURATION_MINUTES} minutes to be saved.`);
        return;
      }
    } else if (formData.exerciseType === "Run") {
      if (distanceNum < MIN_DISTANCE_ACTIVITY) {
        Alert.alert("Activity Not Saved", `A Run must be at least ${MIN_DISTANCE_ACTIVITY} km to be saved.`);
        return;
      }
      if (durationMinutes < MIN_ACTIVITY_DURATION_MINUTES) {
        Alert.alert("Activity Not Saved", `A Run must be at least ${MIN_ACTIVITY_DURATION_MINUTES} minutes to be saved.`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      await getServerClient().activities.submitExternalActivity.mutate({
        registrationId: user.id,
        activityDate: formData.activityDate,
        exerciseType: formData.exerciseType,
        startTime: `${formData.startTime}:00`,
        duration: formData.duration,
        distanceKm: isStairs ? null : distanceNum,
        stepsCount: isStairs ? stepsNum : null,
      });
      
      Alert.alert(
        "Success",
        "Your activity has been submitted successfully!"
      );

      setShowExternalForm(false);
      setFormData({
        activityDate: "",
        exerciseType: "Run",
        startTime: "",
        duration: "",
        distanceKm: "",
        stepsCount: "",
      });
    } catch (error: any) {
      console.error("[Submit External Activity] Error:", error);
      Alert.alert("Error", error?.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const communityBoardMode: CommunityBoardMode = communityLeaderboardView.startsWith("medals") ? "medals" : "activity";
  const communityBoardScope: CommunityBoardScope = communityLeaderboardView.endsWith("club") ? "clubs" : "individual";
  const communityTableBodyMaxHeight = Math.max(280, Math.floor(windowHeight - 282));
  const renderFrozenLeaderboardRows = (children: any) => (
    <ScrollView
      style={[styles.leaderboardTableBody, { maxHeight: communityTableBodyMaxHeight }]}
      nestedScrollEnabled
      showsVerticalScrollIndicator
    >
      {children}
    </ScrollView>
  );
  const setCommunityBoardMode = (mode: CommunityBoardMode) => {
    setCommunityLeaderboardView(mode === "activity" ? "activity_indv" : "medals_indv");
  };
  const setCommunityBoardScope = (scope: CommunityBoardScope) => {
    setCommunityLeaderboardView(
      communityBoardMode === "activity"
        ? scope === "clubs" ? "activity_club" : "activity_indv"
        : scope === "clubs" ? "medals_club" : "medals_indv"
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <LinearGradient colors={[themeColors.primary, themeColors.primaryDark]} style={styles.header}>
        <View style={styles.reportTabsRow}>
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleButton, activeTab === "community" && styles.toggleButtonActive, !isSubscribed && styles.toggleButtonLocked]}
              onPress={() => {
                if (!isSubscribed) {
                  Alert.alert('Subscription Expired', 'Renew your subscription to access Community.', [{ text: 'OK' }]);
                  return;
                }
                setActiveTab("community");
              }}
              activeOpacity={0.7}
            >
              <View style={styles.toggleLabelRow}>
                <Text
                  style={[styles.toggleText, activeTab === "community" && styles.toggleTextActive, !isSubscribed && styles.toggleTextLocked]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
                  Community
                </Text>
                {!isSubscribed && <Lock size={12} color="#9CA3AF" />}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, activeTab === "events" && styles.toggleButtonActive]}
              onPress={() => setActiveTab("events")}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleText, activeTab === "events" && styles.toggleTextActive]} numberOfLines={1}>
                Events
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, activeTab === "club" && styles.toggleButtonActive, !isSubscribed && styles.toggleButtonLocked]}
              onPress={() => {
                if (!isSubscribed) {
                  Alert.alert('Subscription Expired', 'Renew your subscription to access Club.', [{ text: 'OK' }]);
                  return;
                }
                setActiveTab("club");
              }}
              activeOpacity={0.7}
            >
              <View style={styles.toggleLabelRow}>
                <Text style={[styles.toggleText, activeTab === "club" && styles.toggleTextActive, !isSubscribed && styles.toggleTextLocked]} numberOfLines={1}>
                  Club
                </Text>
                {!isSubscribed && <Lock size={12} color="#9CA3AF" />}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, activeTab === "stairs" && styles.toggleButtonActive]}
              onPress={() => setActiveTab("stairs")}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleText, activeTab === "stairs" && styles.toggleTextActive]} numberOfLines={1}>
                Stairs
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, activeTab === "family" && styles.toggleButtonActive]}
              onPress={() => setActiveTab("family")}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleText, activeTab === "family" && styles.toggleTextActive]} numberOfLines={1}>
                Family
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === "club" && (
            <TouchableOpacity
              style={[styles.saveIconButton, showLeaderboardFilters && styles.saveIconButtonActive]}
              onPress={() => setShowLeaderboardFilters((value) => !value)}
              activeOpacity={0.8}
              accessibilityLabel="Filter club leaderboard"
            >
              <Filter size={18} color={showLeaderboardFilters ? colors.primary : colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {activeTab === "club" && clubTabs.length > 0 && (
          <View style={styles.clubTabsPanel}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clubTabsRow}>
              {clubTabs.map((club) => (
                <TouchableOpacity
                  key={club.key}
                  style={[styles.clubTabChip, selectedClub?.key === club.key && styles.clubTabChipActive]}
                  onPress={() => setSelectedClubKey(club.key)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.clubTabChipText, selectedClub?.key === club.key && styles.clubTabChipTextActive]} numberOfLines={1}>
                    {club.clubName}
                  </Text>
                  {club.isSpecial ? (
                    <Text style={[styles.clubTabBadge, selectedClub?.key === club.key && styles.clubTabBadgeActive]}>Special</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.clubLeaderboardViewTabs}>
              {([
                { key: "normal", label: "Normal" },
                { key: "distance_count", label: "Distance Count" },
              ] as const).map((view) => (
                <TouchableOpacity
                  key={view.key}
                  style={[
                    styles.clubLeaderboardViewTab,
                    clubLeaderboardView === view.key && styles.clubLeaderboardViewTabActive,
                  ]}
                  onPress={() => setClubLeaderboardView(view.key)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.clubLeaderboardViewTabText,
                      clubLeaderboardView === view.key && styles.clubLeaderboardViewTabTextActive,
                    ]}
                  >
                    {view.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {(activeTab === "community" || activeTab === "club") && (
          <>
            {activeTab === "community" && (
              <View style={styles.communityBoardTabs}>
                <View style={styles.communityBoardTabStack}>
                  <View style={styles.communityBoardTabGroup}>
                    {([
                      { key: "activity", label: "Activity" },
                      { key: "medals", label: "Medals" },
                    ] as const).map((mode) => (
                      <TouchableOpacity
                        key={mode.key}
                        style={[styles.communityBoardTab, communityBoardMode === mode.key && styles.communityBoardTabActive]}
                        onPress={() => setCommunityBoardMode(mode.key)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.communityBoardTabText, communityBoardMode === mode.key && styles.communityBoardTabTextActive]}>
                          {mode.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.communityBoardSubTabGroup}>
                    {([
                      { key: "individual", label: "Individual" },
                      { key: "clubs", label: "Clubs" },
                    ] as const).map((scope) => (
                      <TouchableOpacity
                        key={scope.key}
                        style={[styles.communityBoardSubTab, communityBoardScope === scope.key && styles.communityBoardSubTabActive]}
                        onPress={() => setCommunityBoardScope(scope.key)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.communityBoardSubTabText, communityBoardScope === scope.key && styles.communityBoardSubTabTextActive]}>
                          {scope.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.leaderboardIconButton, showLeaderboardSearch && styles.leaderboardIconButtonActive]}
                  onPress={() => setShowLeaderboardSearch((value) => !value)}
                  activeOpacity={0.75}
                  accessibilityLabel="Search leaderboard"
                >
                  <Search size={17} color={showLeaderboardSearch ? colors.primary : colors.white} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.leaderboardIconButton, showLeaderboardFilters && styles.leaderboardIconButtonActive]}
                  onPress={() => setShowLeaderboardFilters((value) => !value)}
                  activeOpacity={0.75}
                  accessibilityLabel="Filter leaderboard"
                >
                  <Filter size={17} color={showLeaderboardFilters ? colors.primary : colors.white} />
                </TouchableOpacity>
              </View>
            )}
            {activeTab === "community" && showLeaderboardSearch && (
              <View style={styles.searchPanel}>
                <Search size={16} color={colors.white} />
                <TextInput
                  style={styles.searchInput}
                  value={leaderboardSearchQuery}
                  onChangeText={setLeaderboardSearchQuery}
                  placeholder="Search runner name"
                  placeholderTextColor="rgba(255,255,255,0.72)"
                  autoCapitalize="words"
                  autoCorrect={false}
                />
                {leaderboardSearchQuery.trim() ? (
                  <TouchableOpacity onPress={() => setLeaderboardSearchQuery("")} hitSlop={8}>
                    <X size={16} color={colors.white} />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
            {showLeaderboardFilters && (
              <View style={styles.filterPanel}>
                {(activeTab === "club" || communityLeaderboardView === "activity_indv") && (
                  <View style={styles.filterRow}>
                    <View style={styles.filterField}>
                      <Text style={styles.filterFieldLabel}>Start Date</Text>
                      <TouchableOpacity
                        style={styles.filterDateButton}
                        onPress={() => setDatePickerTarget({ tab: activeLeaderboardTab, field: "startDate" })}
                      >
                        <Calendar size={14} color={colors.white} />
                        <Text style={styles.filterDateButtonText}>
                          {formatDateLabel(filterStartDate)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.filterField}>
                      <Text style={styles.filterFieldLabel}>End Date</Text>
                      <TouchableOpacity
                        style={styles.filterDateButton}
                        onPress={() => setDatePickerTarget({ tab: activeLeaderboardTab, field: "endDate" })}
                      >
                        <Calendar size={14} color={colors.white} />
                        <Text style={styles.filterDateButtonText}>
                          {formatDateLabel(filterEndDate)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                {!selectedClubIsFamily ? (
                <View style={styles.filterGroup}>
                  <Text style={styles.filterFieldLabel}>Sex</Text>
                  <View style={styles.filterChipRow}>
                    {(["all", "Male", "Female"] as const).map((option) => (
                      <TouchableOpacity
                        key={option}
                        style={[styles.filterChip, filterSex === option && styles.filterChipActive]}
                        onPress={() => updateLeaderboardFilters(activeLeaderboardTab, { sex: option })}
                      >
                        <Text style={[styles.filterChipText, filterSex === option && styles.filterChipTextActive]}>
                          {option === "all" ? "All" : option}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                ) : null}
                {!selectedClubIsFamily ? (
                <View style={styles.filterGroup}>
                  <Text style={styles.filterFieldLabel}>Country</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
                    <TouchableOpacity
                      style={[styles.filterChip, filterCountry === "all" && styles.filterChipActive]}
                      onPress={() => updateLeaderboardFilters(activeLeaderboardTab, { country: "all" })}
                    >
                      <Text style={[styles.filterChipText, filterCountry === "all" && styles.filterChipTextActive]}>All</Text>
                    </TouchableOpacity>
                    {availableCountries.map((country) => (
                      <TouchableOpacity
                        key={country}
                        style={[styles.filterChip, filterCountry === country && styles.filterChipActive]}
                        onPress={() => updateLeaderboardFilters(activeLeaderboardTab, { country })}
                      >
                        <Text style={[styles.filterChipText, filterCountry === country && styles.filterChipTextActive]}>
                          {country}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                ) : null}
                <TouchableOpacity
                  style={styles.clearFiltersButton}
                  onPress={() => clearLeaderboardFilters(activeLeaderboardTab)}
                >
                  <Text style={styles.clearFiltersButtonText}>Clear Filters</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl 
            refreshing={
              activeTab === "community"
                ? communityLeaderboardView === "medals_indv"
                  ? communityMedalLoading
                  : communityLeaderboardView === "medals_club"
                    ? communityMedalLoading
                  : communityLeaderboardView === "activity_club"
                    ? communityClubActivityLoading
                  : communityLeaderboardView === "activity_indv"
                    ? communityLoading
                    : false
                : activeTab === "family"
                  ? familyMembersLoading || familyLeaderboardLoading
                  : activeTab === "club"
                    ? clubLeaderboardLoading
                  : activeTab === "events"
                      ? eventsLoading || (!!selectedLeaderboardEventId && eventParticipantsLoading)
                      : activeTab === "stairs"
                        ? stairLeaderboardLoading
                        : false
            }
            onRefresh={() => {
              if (activeTab === "community") {
                if (communityLeaderboardView === "medals_indv") return refetchCommunityMedals();
                if (communityLeaderboardView === "medals_club") return refetchCommunityMedals();
                if (communityLeaderboardView === "activity_club") return refetchCommunityClubActivity();
                if (communityLeaderboardView === "activity_indv") return refetchCommunity();
                return Promise.resolve();
              }
              if (activeTab === "family") {
                return Promise.all([refetchFamilyMembers(), refetchFamilyLeaderboard()]);
              }
              if (activeTab === "club") {
                return refetchClubLeaderboard();
              }
              if (activeTab === "events") {
                if (selectedLeaderboardEventId) return Promise.all([refetchEvents(), refetchEventParticipants()]);
                return refetchEvents();
              }
              if (activeTab === "stairs") {
                return refetchStairLeaderboard();
              }
              return Promise.resolve();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {activeTab === "events" ? (
          renderEventParticipantsTable()
        ) : activeTab === "stairs" ? (
          stairLeaderboardError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>!</Text>
              <Text style={styles.emptyText}>Connection Error</Text>
              <Text style={styles.emptySubtext}>Could not load the stairs leaderboard.</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => refetchStairLeaderboard()}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : stairLeaderboardLoading && stairLeaderboard.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading stairs leaderboard...</Text>
            </View>
          ) : stairLeaderboard.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No stair sessions yet</Text>
              <Text style={styles.emptySubtext}>Verified stair climbs will appear here by building and steps.</Text>
            </View>
          ) : (
            renderStairLeaderboardTable(stairLeaderboard)
          )
        ) : activeTab === "family" ? (
          <>
            {renderFamilyManager()}
            {familyMembersLoading ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Loading Family data...</Text>
              </View>
            ) : familyMembers.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No family members added yet</Text>
                <Text style={styles.emptySubtext}>Use the Family Code input above to add a family member. The leaderboard will stay blank until you add someone.</Text>
              </View>
            ) : familyLeaderboardLoading ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Loading Family activity...</Text>
              </View>
            ) : familyLeaderboardGroups.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>!</Text>
                <Text style={styles.emptyText}>No Family activity yet</Text>
                <Text style={styles.emptySubtext}>Add RunNation Family Codes, then Family activity will appear by year, month, and week.</Text>
              </View>
            ) : (
              renderGroupedLeaderboard(familyLeaderboardGroups)
            )}
          </>
        ) : activeTab === "club" ? (
          !selectedClub ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🏅</Text>
              <Text style={styles.emptyText}>No Club Membership</Text>
              <Text style={styles.emptySubtext}>You are not a member of any running or special club yet</Text>
            </View>
          ) : clubLeaderboardError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>⚠️</Text>
              <Text style={styles.emptyText}>Connection Error</Text>
              <Text style={styles.emptySubtext}>Check your internet connection</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => refetchClubLeaderboard()}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : clubLeaderboardLoading && clubLeaderboardGroups.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading club members...</Text>
            </View>
          ) : clubLeaderboardGroups.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🏃‍♂️</Text>
              <Text style={styles.emptyText}>No club activity yet</Text>
              <Text style={styles.emptySubtext}>Club activity will appear here by year, month, and week.</Text>
            </View>
          ) : (
            renderClubLeaderboard(clubLeaderboardGroups)
          )
        ) : activeTab === "community" ? (
          communityLeaderboardView === "activity_club" ? (
            communityClubActivityError ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>!</Text>
                <Text style={styles.emptyText}>Connection Error</Text>
                <Text style={styles.emptySubtext}>Check your internet connection</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => refetchCommunityClubActivity()}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : communityClubActivityLoading && sortedCommunityClubActivityData.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Loading club activity leaderboard...</Text>
              </View>
            ) : sortedCommunityClubActivityData.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>🏃</Text>
                <Text style={styles.emptyText}>No club activity yet</Text>
                <Text style={styles.emptySubtext}>Clubs will appear here after members record activity.</Text>
              </View>
            ) : (
              renderClubActivityLeaderboardTable(sortedCommunityClubActivityData)
            )
          ) : communityLeaderboardView === "medals_club" ? (
            communityMedalError ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>!</Text>
                <Text style={styles.emptyText}>Connection Error</Text>
                <Text style={styles.emptySubtext}>Check your internet connection</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => refetchCommunityMedals()}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : communityMedalLoading && sortedCommunityClubMedalData.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Loading club medal leaderboard...</Text>
              </View>
            ) : sortedCommunityClubMedalData.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Award size={48} color={colors.lightGray} />
                <Text style={styles.emptyText}>No club medals yet</Text>
                <Text style={styles.emptySubtext}>Clubs will appear here after their members earn medal race results.</Text>
              </View>
            ) : (
              renderClubMedalLeaderboardTable(sortedCommunityClubMedalData)
            )
          ) : communityLeaderboardView === "medals_indv" ? (
            communityMedalError ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>!</Text>
                <Text style={styles.emptyText}>Connection Error</Text>
                <Text style={styles.emptySubtext}>Check your internet connection</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => refetchCommunityMedals()}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : communityMedalLoading && sortedCommunityMedalData.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Loading medal leaderboard...</Text>
              </View>
            ) : sortedCommunityMedalData.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Award size={48} color={colors.lightGray} />
                <Text style={styles.emptyText}>No community medals yet</Text>
                <Text style={styles.emptySubtext}>Earned medal race results for this year will appear here.</Text>
              </View>
            ) : (
              renderMedalLeaderboardTable(sortedCommunityMedalData)
            )
          ) : communityError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>⚠️</Text>
              <Text style={styles.emptyText}>Connection Error</Text>
              <Text style={styles.emptySubtext}>Check your internet connection</Text>
              <TouchableOpacity 
                style={styles.retryButton} 
                onPress={() => refetchCommunity()}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : communityLoading && sortedCommunityData.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading leaderboard...</Text>
            </View>
          ) : sortedCommunityData.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No qualifying runners yet</Text>
              <Text style={styles.emptySubtext}>
                Community ranking requires at least 3 km and 30 minutes of total workouts.
              </Text>
            </View>
          ) : (
            <>
              {!currentUserQualifiesForCommunity ? (
                <View style={styles.communityQualificationNotice}>
                  <Text style={styles.communityQualificationNoticeText} numberOfLines={2}>
                    Not ranked yet: community ranking requires at least 3 km and 30 minutes of total workouts.
                  </Text>
                </View>
              ) : null}
              {renderLeaderboardTable(sortedCommunityData)}
            </>
          )
        ) : null}
      </ScrollView>

      <Modal
        visible={showEventPicker}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowEventPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.eventPickerModal, { backgroundColor: themeColors.surface }]}>
            <View style={styles.eventPickerHeader}>
              <Text style={[styles.eventPickerTitle, { color: themeColors.text }]}>Choose Event</Text>
              <TouchableOpacity onPress={() => setShowEventPicker(false)} hitSlop={8}>
                <X size={22} color={themeColors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.eventPickerList} contentContainerStyle={styles.eventPickerListContent}>
              {eventsLoading ? (
                <View style={styles.eventPickerEmpty}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.noEventsText}>Loading events...</Text>
                </View>
              ) : registeredEvents && registeredEvents.length > 0 ? (
                registeredEvents.map((event) => {
                  const isSelected = event.eventId === selectedLeaderboardEventId;
                  return (
                    <TouchableOpacity
                      key={event.eventId}
                      style={[styles.eventPickerOption, isSelected && styles.eventPickerOptionActive]}
                      onPress={() => {
                        setSelectedLeaderboardEventId(event.eventId);
                        setShowEventPicker(false);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.eventPickerOptionText, isSelected && styles.eventPickerOptionTextActive]} numberOfLines={2}>
                        {event.eventName}
                      </Text>
                      <Text style={styles.eventPickerOptionMeta} numberOfLines={1}>
                        {formatDate(event.startsAt)} - {formatDate(event.endsAt)} | {event.status === "ongoing" ? "Ongoing" : event.status === "upcoming" ? "Not Started" : "Closed"}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.eventPickerEmpty}>
                  <Calendar size={22} color={colors.textLight} />
                  <Text style={styles.noEventsText}>No registered events</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showExternalForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowExternalForm(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.surface }]}>
            <LinearGradient colors={themeColors.gradient.orange} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add External Activity</Text>
              <TouchableOpacity onPress={() => setShowExternalForm(false)}>
                <X size={24} color="#fff" />
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
                  value={formData.activityDate}
                  onChangeText={(text) => setFormData({ ...formData, activityDate: text })}
                  placeholderTextColor={themeColors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Activity Type *</Text>
                <View style={styles.typeChipsContainer}>
                  {["Run", "Walk", "Cycle", "Stairs"].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeChip,
                        formData.exerciseType === type && styles.typeChipActive,
                      ]}
                      onPress={() => setFormData({ ...formData, exerciseType: type as any })}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.typeChipText,
                          formData.exerciseType === type && styles.typeChipTextActive,
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
                  value={formData.startTime}
                  onChangeText={(text) => setFormData({ ...formData, startTime: text })}
                  placeholderTextColor={themeColors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Duration (HH:MM:SS) *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  placeholder="e.g., 00:45:30"
                  value={formData.duration}
                  onChangeText={(text) => setFormData({ ...formData, duration: text })}
                  placeholderTextColor={themeColors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>
                  {formData.exerciseType === "Stairs" ? "Stair Steps *" : "Distance (km) *"}
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  placeholder={formData.exerciseType === "Stairs" ? "e.g., 720" : "e.g., 5.5"}
                  keyboardType="numeric"
                  value={formData.exerciseType === "Stairs" ? formData.stepsCount : formData.distanceKm}
                  onChangeText={(text) =>
                    setFormData(
                      formData.exerciseType === "Stairs"
                        ? { ...formData, stepsCount: text }
                        : { ...formData, distanceKm: text }
                    )
                  }
                  placeholderTextColor={themeColors.textLight}
                />
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: themeColors.border }]}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowExternalForm(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitButton}
                onPress={handleExternalActivitySubmit}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                <LinearGradient colors={colors.gradient.orange} style={styles.modalSubmitGradient}>
                  <Text style={styles.modalSubmitText}>
                    {isSubmitting ? "Submitting..." : "Submit"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!datePickerTarget}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDatePickerTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.datePickerModal}>
            <View style={styles.datePickerHeader}>
              <Text style={styles.datePickerTitle}>
                {datePickerTarget?.field === "startDate" ? "Select Start Date" : "Select End Date"}
              </Text>
              <TouchableOpacity onPress={() => setDatePickerTarget(null)}>
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.datePickerList} contentContainerStyle={styles.datePickerListContent}>
              {datePickerTarget ? (
                <>
                  <TouchableOpacity
                    style={styles.datePickerOption}
                    onPress={() => {
                      updateLeaderboardFilters(datePickerTarget.tab, {
                        [datePickerTarget.field]: "",
                      });
                      setDatePickerTarget(null);
                    }}
                  >
                    <Text style={styles.datePickerOptionText}>Clear date</Text>
                  </TouchableOpacity>
                  {datePickerOptions.map((dateValue) => (
                    <TouchableOpacity
                      key={dateValue}
                      style={[
                        styles.datePickerOption,
                        leaderboardFilters[datePickerTarget.tab][datePickerTarget.field] === dateValue &&
                          styles.datePickerOptionActive,
                      ]}
                      onPress={() => {
                        updateLeaderboardFilters(datePickerTarget.tab, {
                          [datePickerTarget.field]: dateValue,
                        });
                        setDatePickerTarget(null);
                      }}
                    >
                      <Text
                        style={[
                          styles.datePickerOptionText,
                          leaderboardFilters[datePickerTarget.tab][datePickerTarget.field] === dateValue &&
                            styles.datePickerOptionTextActive,
                        ]}
                      >
                        {formatDateLabel(dateValue)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </>
              ) : null}
            </ScrollView>
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
  header: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 9,
    gap: 7,
  },
  reportTabsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toggleContainer: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
    padding: 3,
  },
  toggleButton: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 1,
    paddingVertical: 7,
    alignItems: "center",
    borderRadius: 7,
  },
  toggleButtonActive: {
    backgroundColor: colors.white,
  },
  toggleText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "800" as const,
    color: colors.white,
    includeFontPadding: false,
    textAlign: "center" as const,
  },
  toggleTextActive: {
    color: colors.primary,
  },
  toggleLabelRow: {
    minWidth: 0,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 2,
  },
  headerButtonsRow: {
    flexDirection: "row" as const,
    gap: 10,
  },
  addButton: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.primary,
  },
  saveButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  saveIconButton: {
    width: 42,
    height: 42,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: colors.white,
    borderRadius: 12,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  saveIconButtonActive: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  saveIconButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonLocked: {
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.primary,
  },
  saveButtonTextLocked: {
    color: "#9CA3AF",
  },
  filterPanel: {
    marginTop: 7,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 11,
    padding: 8,
    gap: 8,
  },
  filterRow: {
    flexDirection: "row" as const,
    gap: 7,
  },
  filterField: {
    flex: 1,
    gap: 4,
  },
  filterFieldLabel: {
    fontSize: 12,
    color: colors.white,
    fontWeight: "700" as const,
  },
  filterInput: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontSize: 12,
    color: colors.white,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  filterDateButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  filterDateButtonText: {
    fontSize: 12,
    color: colors.white,
    fontWeight: "600" as const,
  },
  filterGroup: {
    gap: 5,
  },
  filterChipRow: {
    flexDirection: "row" as const,
    gap: 6,
    paddingRight: 4,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  filterChipActive: {
    backgroundColor: colors.white,
  },
  filterChipText: {
    fontSize: 12,
    color: colors.white,
    fontWeight: "700" as const,
  },
  filterChipTextActive: {
    color: colors.primary,
  },
  clearFiltersButton: {
    alignSelf: "flex-start" as const,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  clearFiltersButtonText: {
    fontSize: 12,
    color: colors.white,
    fontWeight: "700" as const,
  },
  scrollView: {
    flex: 1,
  },
  statsSection: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: colors.white,
  },
  statLabel: {
    fontSize: 10,
    color: colors.white,
    opacity: 0.9,
    fontWeight: "600" as const,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    marginTop: 60,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: colors.text,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 12,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.white,
  },
  leaderboardContainer: {
    padding: 16,
    gap: 12,
  },
  leaderboardCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    gap: 10,
  },
  leaderboardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "space-between",
  },
  locationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flex: 1,
    minWidth: 0,
  },
  locationText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: "600" as const,
  },
  nameBadge: {
    backgroundColor: "rgba(255, 149, 0, 0.08)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  runnerName: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: colors.text,
  },
  leaderboardStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  leaderStatItem: {
    alignItems: "center",
    flex: 1,
  },
  leaderStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.divider,
  },
  leaderStatValue: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: colors.text,
    marginBottom: 3,
  },
  leaderStatLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    fontWeight: "600" as const,
  },
  leaderboardTableContainer: {
    margin: 6,
    marginBottom: 8,
    borderRadius: 8,
    overflow: "hidden" as const,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  leaderboardTableHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: colors.primary,
    paddingHorizontal: 2,
    paddingVertical: 3,
  },
  leaderboardTableBody: {
    backgroundColor: colors.white,
  },
  clubDistanceCountTable: {
    minWidth: 680,
    margin: 6,
    marginBottom: 10,
    borderRadius: 8,
    overflow: "hidden" as const,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  clubDistanceTotalColumn: {
    width: 54,
  },
  leaderboardTableRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 2,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  leaderboardTableRowAlt: {
    backgroundColor: "rgba(255, 107, 53, 0.04)",
  },
  currentUserLeaderboardRow: {
    backgroundColor: "rgba(255, 107, 53, 0.18)",
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    borderTopWidth: 1,
    borderTopColor: colors.primary,
    borderBottomColor: colors.primary,
  },
  currentUserLeaderboardText: {
    color: colors.primary,
    fontWeight: "900" as const,
  },
  communityQualificationNotice: {
    marginHorizontal: 6,
    marginBottom: 0,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  communityQualificationNoticeText: {
    color: colors.textSecondary,
    fontSize: 9,
    lineHeight: 11,
    textAlign: "center" as const,
  },
  leaderTableHeaderText: {
    color: colors.white,
    fontSize: 7,
    fontWeight: "800" as const,
  },
  leaderTableCellText: {
    color: colors.text,
    fontSize: 7,
    fontWeight: "600" as const,
    lineHeight: 10,
  },
  leaderRankColumn: {
    flex: 0.58,
    minWidth: 24,
  },
  leaderNameColumn: {
    flex: 1.6,
    minWidth: 52,
  },
  leaderClubColumn: {
    flex: 1.15,
    minWidth: 42,
  },
  leaderAgeColumn: {
    flex: 0.48,
    minWidth: 20,
  },
  leaderSexColumn: {
    flex: 0.42,
    minWidth: 16,
  },
  leaderDaysColumn: {
    flex: 0.52,
    minWidth: 22,
  },
  leaderDistanceColumn: {
    flex: 0.72,
    minWidth: 30,
  },
  leaderTimeColumn: {
    flex: 0.9,
    minWidth: 38,
  },
  leaderPaceColumn: {
    flex: 0.7,
    minWidth: 30,
  },
  leaderRankCell: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 2,
  },
  leaderFlagText: {
    fontSize: 8,
    lineHeight: 10,
  },
  smartFitClubContainer: {
    gap: 12,
    paddingBottom: 16,
  },
  smartFitClubGroup: {
    marginHorizontal: 12,
    marginTop: 12,
  },
  paraClubGroup: {
    marginHorizontal: 12,
    marginTop: 12,
  },
  smartFitClubGroupTitle: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: colors.text,
    marginBottom: 6,
  },
  familyManagerCard: {
    margin: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
    gap: 8,
  },
  familyManagerHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  familyManagerTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  familyManagerTitle: {
    fontSize: 15,
    fontWeight: "800" as const,
    color: colors.text,
  },
  familyManagerSubtitle: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 13,
    color: colors.textSecondary,
  },
  familyCodeCard: {
    minWidth: 118,
    maxWidth: 140,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  familyCodeLabel: {
    fontSize: 8,
    fontWeight: "900" as const,
    color: "#047857",
    textTransform: "uppercase" as const,
  },
  familyCodeValue: {
    marginTop: 1,
    fontSize: 16,
    fontWeight: "900" as const,
    color: "#065f46",
    letterSpacing: 0.6,
  },
  familyMemberGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },
  familyMemberPill: {
    width: "31.8%",
    minHeight: 42,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: "#f9fafb",
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  familyMemberInfo: {
    flex: 1,
    minWidth: 0,
  },
  familyMemberName: {
    fontSize: 10,
    fontWeight: "800" as const,
    color: colors.text,
  },
  familyMemberUsername: {
    marginTop: 1,
    fontSize: 8,
    color: colors.textSecondary,
  },
  familyRemoveButton: {
    width: 18,
    height: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 9,
    backgroundColor: "#fee2e2",
  },
  familyRemoveButtonText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900" as const,
    color: "#b91c1c",
  },
  familyInputRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  familyUsernameInput: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingHorizontal: 10,
    fontSize: 12,
    color: colors.text,
    backgroundColor: "#fff",
  },
  familyUsernameInputDisabled: {
    backgroundColor: "#f3f4f6",
  },
  familyAddButton: {
    width: 52,
    minHeight: 36,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  familyAddButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "800" as const,
  },
  familyButtonDisabled: {
    opacity: 0.55,
  },
  familyLeaderboardContainer: {
    paddingBottom: 16,
  },
  familyYearGroup: {
    marginHorizontal: 12,
    marginTop: 12,
  },
  familyMonthGroup: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: "hidden" as const,
  },
  familyWeekGroup: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 8,
  },
  familyWeekTitle: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: colors.textSecondary,
    marginHorizontal: 8,
    marginBottom: 6,
  },
  clubDayGroup: {
    marginBottom: 8,
  },
  clubDayTitle: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: colors.primary,
    marginHorizontal: 8,
    marginBottom: 4,
  },
  familyTable: {
    minWidth: 430,
  },
  familyRankColumn: {
    width: 42,
  },
  familyNameColumn: {
    width: 120,
  },
  familyDaysColumn: {
    width: 48,
  },
  familyDistanceColumn: {
    width: 72,
  },
  familyTimeColumn: {
    width: 72,
  },
  familyPaceColumn: {
    width: 72,
  },
  smartFitClubTable: {
    minWidth: 560,
    borderRadius: 12,
    overflow: "hidden" as const,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  smartFitFlagColumn: {
    width: 36,
  },
  smartFitRankColumn: {
    width: 38,
  },
  smartFitNameColumn: {
    width: 92,
  },
  smartFitSexColumn: {
    width: 32,
  },
  smartFitDaysColumn: {
    width: 38,
  },
  smartFitStepsColumn: {
    width: 64,
  },
  smartFitTimeColumn: {
    width: 56,
  },
  smartFitScoreColumn: {
    width: 72,
  },
  smartFitRemarksColumn: {
    width: 86,
  },
  communityBoardTabs: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 6,
    paddingHorizontal: 0,
    paddingTop: 2,
  },
  communityBoardTabStack: {
    flex: 1,
    gap: 4,
  },
  communityBoardTabGroup: {
    flexDirection: "row" as const,
    gap: 5,
  },
  communityBoardTab: {
    flex: 1,
    minHeight: 29,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  communityBoardTabActive: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },
  communityBoardTabText: {
    fontSize: 9,
    fontWeight: "800" as const,
    color: colors.white,
    includeFontPadding: false,
  },
  communityBoardTabTextActive: {
    color: colors.primary,
  },
  communityBoardSubTabGroup: {
    flexDirection: "row" as const,
    gap: 5,
  },
  communityBoardSubTab: {
    flex: 1,
    minHeight: 26,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  communityBoardSubTabActive: {
    backgroundColor: "rgba(255,255,255,0.26)",
    borderColor: "rgba(255,255,255,0.72)",
  },
  communityBoardSubTabText: {
    fontSize: 10,
    fontWeight: "800" as const,
    color: "rgba(255,255,255,0.78)",
    includeFontPadding: false,
  },
  communityBoardSubTabTextActive: {
    color: colors.white,
  },
  leaderboardIconButton: {
    width: 32,
    height: 29,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  leaderboardIconButtonActive: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },
  searchPanel: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 7,
    marginHorizontal: 0,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 9,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.white,
    fontSize: 12,
    fontWeight: "700" as const,
    paddingVertical: 6,
  },
  medalLeaderboardTableContainer: {
    minWidth: 382,
    margin: 6,
    marginBottom: 8,
    borderRadius: 8,
    overflow: "hidden" as const,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  medalLeaderboardTableHeader: {
    paddingHorizontal: 1,
    paddingVertical: 2,
  },
  medalLeaderboardTableRow: {
    paddingHorizontal: 1,
    paddingVertical: 2,
  },
  medalRankColumn: {
    width: 28,
  },
  medalNameColumn: {
    width: 66,
  },
  medalSexColumn: {
    width: 22,
  },
  medalClubColumn: {
    width: 44,
  },
  medalCountColumn: {
    width: 22,
    alignItems: "center" as const,
  },
  medalPointsColumn: {
    width: 34,
    alignItems: "center" as const,
  },
  clubActivityTableContainer: {
    margin: 6,
    marginBottom: 8,
    borderRadius: 8,
    overflow: "hidden" as const,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  clubActivityRankColumn: {
    width: 42,
  },
  clubActivityNameColumn: {
    flex: 1,
    minWidth: 110,
  },
  clubActivityCountryColumn: {
    width: 58,
  },
  clubActivityMembersColumn: {
    width: 48,
  },
  clubActivityScoreColumn: {
    width: 62,
    alignItems: "flex-start" as const,
  },
  activitiesContainer: {
    padding: 16,
    gap: 12,
  },
  runsTableContainer: {
    padding: 12,
    gap: 12,
  },
  runsYearGroup: {
    gap: 8,
  },
  runsYearHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 4,
  },
  runsYearTitle: {
    fontSize: 16,
    fontWeight: "900" as const,
    color: colors.text,
  },
  runsYearSummary: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  runsMonthTable: {
    borderRadius: 10,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  runsMonthHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: colors.extraLightGray,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  runsMonthTitle: {
    fontSize: 13,
    fontWeight: "900" as const,
    color: colors.text,
  },
  runsMonthSummary: {
    fontSize: 10,
    fontWeight: "800" as const,
    color: colors.textSecondary,
  },
  runsTableHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: colors.primary,
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  runsTableRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 5,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  runsTableRowAlt: {
    backgroundColor: "rgba(255, 107, 53, 0.04)",
  },
  runsTableHeaderText: {
    color: colors.white,
    fontSize: 8,
    fontWeight: "900" as const,
  },
  runsTableCellText: {
    color: colors.text,
    fontSize: 8,
    fontWeight: "700" as const,
    lineHeight: 12,
  },
  runsDateColumn: {
    flex: 0.95,
    minWidth: 39,
  },
  runsTypeColumn: {
    flex: 1.05,
    minWidth: 42,
  },
  runsDistanceColumn: {
    flex: 0.62,
    minWidth: 28,
    textAlign: "right" as const,
  },
  runsTimeColumn: {
    flex: 0.9,
    minWidth: 38,
    textAlign: "right" as const,
  },
  runsPaceColumn: {
    flex: 0.95,
    minWidth: 40,
    textAlign: "right" as const,
  },
  runsPauseColumn: {
    flex: 0.76,
    minWidth: 31,
    textAlign: "right" as const,
  },
  runsDownloadHeader: {
    flex: 0.5,
    minWidth: 24,
    textAlign: "center" as const,
  },
  runsDownloadColumn: {
    flex: 0.5,
    minWidth: 24,
    alignItems: "center" as const,
  },
  workoutCsvButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  workoutCsvButtonDisabled: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  activityCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  activityRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  activityMainInfo: {
    flexShrink: 1,
    marginRight: 12,
  },
  activityType: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.text,
  },
  activityDate: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "500" as const,
    marginTop: 1,
  },
  activityPauseText: {
    fontSize: 11,
    color: colors.textLight,
    fontWeight: "600" as const,
    marginTop: 2,
  },
  activityMetrics: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  metricItem: {
    alignItems: "center" as const,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: colors.text,
  },
  metricLabel: {
    fontSize: 9,
    color: colors.textLight,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
  },
  metricDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.lightGray,
    marginHorizontal: 2,
  },
  eventDropdownButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  eventDropdownTextBlock: {
    flex: 1,
    gap: 2,
  },
  eventDropdownLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "700" as const,
  },
  eventDropdownText: {
    fontSize: 14,
    fontWeight: "800" as const,
  },
  eventParticipantsTable: {
    minWidth: 680,
    marginBottom: 10,
    borderRadius: 8,
    overflow: "hidden" as const,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  eventRankColumn: {
    width: 34,
  },
  eventParticipantNameColumn: {
    width: 150,
  },
  eventParticipantSmallColumn: {
    width: 42,
  },
  eventParticipantCountryColumn: {
    width: 92,
  },
  eventParticipantMetricColumn: {
    width: 72,
  },
  eventParticipantStatusColumn: {
    width: 92,
  },
  eventPickerModal: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "72%",
    borderRadius: 18,
    padding: 16,
  },
  eventPickerHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 12,
  },
  eventPickerTitle: {
    fontSize: 18,
    fontWeight: "800" as const,
  },
  eventPickerList: {
    maxHeight: 420,
  },
  eventPickerListContent: {
    gap: 8,
    paddingBottom: 4,
  },
  eventPickerOption: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.white,
  },
  eventPickerOptionActive: {
    borderColor: colors.primary,
    backgroundColor: "rgba(255, 107, 53, 0.08)",
  },
  eventPickerOptionText: {
    fontSize: 14,
    fontWeight: "800" as const,
    color: colors.text,
  },
  eventPickerOptionTextActive: {
    color: colors.primary,
  },
  eventPickerOptionMeta: {
    marginTop: 3,
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "600" as const,
  },
  eventPickerEmpty: {
    minHeight: 110,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
  },
  eventsSection: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
  },
  eventsSectionTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: colors.text,
    marginBottom: 2,
  },
  eventCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  eventCardRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  eventBadges: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    flexShrink: 0,
  },
  eventName: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: colors.text,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.extraLightGray,
  },
  statusOngoing: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  statusUpcoming: {
    backgroundColor: "rgba(74, 144, 226, 0.12)",
  },
  statusCompleted: {
    backgroundColor: "rgba(102, 102, 102, 0.1)",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  statusTextOngoing: {
    color: colors.success,
  },
  statusTextUpcoming: {
    color: '#4A90E2',
  },
  statusTextCompleted: {
    color: colors.textSecondary,
  },
  medalIndicator: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
  },
  medalText: {
    fontSize: 12,
    fontWeight: "600" as const,
  },
  medalTextQualified: {
    color: '#D4A017',
  },
  medalTextNot: {
    color: colors.textLight,
  },

  noEventsCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 20,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 10,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  noEventsText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: colors.textLight,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 24,
    width: "100%",
    maxWidth: 500,
    maxHeight: "90%",
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800" as const,
    color: colors.white,
  },
  modalBody: {
    padding: 24,
  },
  modalSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 24,
    fontWeight: "600" as const,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.text,
    marginBottom: 10,
  },
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.extraLightGray,
  },
  typeChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  typeChip: {
    flexGrow: 1,
    flexBasis: "47%",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.extraLightGray,
    alignItems: "center",
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
  modalFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.extraLightGray,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  modalSubmitButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  modalSubmitGradient: {
    paddingVertical: 14,
    alignItems: "center",
  },
  modalSubmitText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: colors.white,
  },
  datePickerModal: {
    backgroundColor: colors.white,
    borderRadius: 20,
    width: "100%",
    maxWidth: 420,
    maxHeight: "80%",
    overflow: "hidden" as const,
  },
  datePickerHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: colors.text,
  },
  datePickerList: {
    flexGrow: 0,
  },
  datePickerListContent: {
    padding: 14,
    gap: 8,
  },
  datePickerOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.extraLightGray,
  },
  datePickerOptionActive: {
    backgroundColor: "rgba(255,149,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,149,0,0.35)",
  },
  datePickerOptionText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: "600" as const,
  },
  datePickerOptionTextActive: {
    color: colors.primary,
  },
  clubTabsPanel: {
    marginTop: 10,
  },
  clubTabsRow: {
    gap: 6,
    paddingRight: 4,
  },
  clubLeaderboardViewTabs: {
    flexDirection: "row" as const,
    gap: 6,
    marginTop: 7,
  },
  clubLeaderboardViewTab: {
    flex: 1,
    minHeight: 30,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  clubLeaderboardViewTabActive: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },
  clubLeaderboardViewTabText: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 10,
    fontWeight: "800" as const,
  },
  clubLeaderboardViewTabTextActive: {
    color: colors.primary,
  },
  clubTabChip: {
    minHeight: 34,
    maxWidth: 170,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: "center",
  },
  clubTabChipActive: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },
  clubTabChipText: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "800" as const,
    color: colors.white,
  },
  clubTabChipTextActive: {
    color: colors.primary,
  },
  clubTabBadge: {
    marginTop: 1,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800" as const,
    color: "rgba(255,255,255,0.75)",
    textTransform: "uppercase" as const,
  },
  clubTabBadgeActive: {
    color: colors.textLight,
  },
  toggleButtonLocked: {
    opacity: 0.5,
  },
  toggleTextLocked: {
    color: '#9CA3AF',
  },
});
