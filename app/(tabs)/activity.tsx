import { StyleSheet, View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, Modal, TextInput } from "react-native";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { X, Calendar, TrendingUp, Clock, Award, Users, Download, Filter } from "lucide-react-native";

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
  start_time: string;
  end_time: string;
  pace_min_per_km: number;
  pause_duration_seconds?: number | null;
  user?: {
    name?: string;
    username?: string;
  };
}

interface RegisteredEvent {
  eventId: string;
  registrationId: string;
  eventName: string;
  startsAt: string;
  endsAt: string;
  isOnMedalList: boolean;
  status: 'ongoing' | 'upcoming' | 'completed';
}

interface CommunityData {
  registrationId: string;
  Name: string;
  Country: string;
  Club: string;
  Sex: string;
  AvgDistance: number;
  AvgTime: number;
  AveragePace: number;
  ActiveDays: number;
}

type CommunitySortOption = "distance" | "time";
type ActiveTab = "runs" | "club" | "community";
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

export default function ActivityScreen() {
  const { user, privateMode } = useAuth();
  const { colors: themeColors } = useTheme();
  const { isSubscribed } = useSubscription();

  const [communitySortBy, setCommunitySortBy] = useState<CommunitySortOption>("distance");
  const [clubSortBy, setClubSortBy] = useState<CommunitySortOption>("distance");
  const [activeTab, setActiveTab] = useState<ActiveTab>("runs");
  const [showLeaderboardFilters, setShowLeaderboardFilters] = useState(false);
  const [leaderboardFilters, setLeaderboardFilters] = useState<Record<LeaderboardTab, LeaderboardFilters>>({
    club: EMPTY_LEADERBOARD_FILTERS,
    community: EMPTY_LEADERBOARD_FILTERS,
  });
  const [datePickerTarget, setDatePickerTarget] = useState<{
    tab: LeaderboardTab;
    field: "startDate" | "endDate";
  } | null>(null);
  const [showExternalForm, setShowExternalForm] = useState(false);
  const [formData, setFormData] = useState({
    activityDate: "",
    exerciseType: "Run" as "Run" | "Walk" | "Treadmill",
    startTime: "",
    duration: "",
    distanceKm: "",
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
      .from("club_members")
      .select("registration_id, coordinator_id")
      .in("registration_id", uniqueRegistrationIds);

    if (membershipError) {
      console.error("[ClubLookup] Membership fetch error:", membershipError);
      throw membershipError;
    }

    const coordinatorIds = Array.from(
      new Set((memberships || []).map((membership: any) => membership.coordinator_id).filter(Boolean))
    );

    if (coordinatorIds.length === 0) {
      return new Map<string, string>();
    }

    const { data: clubs, error: clubsError } = await supabase
      .from("clubs")
      .select("coordinator_id, club_name")
      .in("coordinator_id", coordinatorIds);

    if (clubsError) {
      console.error("[ClubLookup] Club fetch error:", clubsError);
      throw clubsError;
    }

    const clubByCoordinator = new Map(
      (clubs || []).map((club: any) => [club.coordinator_id, club.club_name || ""])
    );

    return new Map(
      (memberships || []).map((membership: any) => [
        membership.registration_id,
        clubByCoordinator.get(membership.coordinator_id) || "",
      ])
    );
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
      const headers = ['Date', 'Type', 'Distance (km)', 'Start Time', 'End Time', 'Pause Time', 'Pace (min/km)'];
      const rows = sortedActivities.map((a) => [
        a.activity_date,
        a.exercise_type,
        a.distance_km.toFixed(2),
        a.start_time,
        a.end_time,
        formatPauseDuration(a.pause_duration_seconds || 0),
        formatPaceMinPerKm(a.pace_min_per_km),
      ]);

      const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');

      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'my_activities.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        const { File: FSFile, Paths: FSPaths } = await import('expo-file-system/next');
        const file = new FSFile(FSPaths.cache, 'my_activities.csv');
        file.write(csvContent);
        const sharingModule = await import('expo-sharing');
        await sharingModule.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: 'Save Activity CSV',
          UTI: 'public.comma-separated-values-text',
        });
      }

      console.log('[ActivityCSV] Export successful');
    } catch (error: any) {
      console.error('[ActivityCSV] Export failed:', error);
      Alert.alert('Error', 'Failed to export activities. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!isSubscribed && (activeTab === "club" || activeTab === "community")) {
      setActiveTab("runs");
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
    enabled: activeTab === "runs" && !!user?.id,
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
    enabled: activeTab === "runs",
    staleTime: 30000,
    retry: 1,
  });

  const { data: userClub } = useQuery<{ club_name: string; coordinator_id: string } | null>({
    queryKey: ["user-club", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      try {
        const { data: membership, error: memError } = await supabase
          .from("club_members")
          .select("coordinator_id")
          .eq("registration_id", user.id)
          .maybeSingle();
        if (memError) {
          console.error("[UserClub] Membership fetch error:", JSON.stringify(memError));
          return null;
        }
        if (!membership?.coordinator_id) {
          console.log("[UserClub] User is not in any club");
          return null;
        }
        const { data: club, error: clubError } = await supabase
          .from("clubs")
          .select("club_name, coordinator_id")
          .eq("coordinator_id", membership.coordinator_id)
          .maybeSingle();
        if (clubError) {
          console.error("[UserClub] Club fetch error:", JSON.stringify(clubError));
          return null;
        }
        console.log("[UserClub] User club:", club?.club_name);
        return club;
      } catch (error: any) {
        console.error("[UserClub] Query failed:", JSON.stringify(error), error?.message);
        return null;
      }
    },
    enabled: !!user?.id,
    staleTime: 60000,
  });

  const { data: clubMemberIds } = useQuery<string[]>({
    queryKey: ["club-member-ids", userClub?.coordinator_id],
    queryFn: async () => {
      if (!userClub?.coordinator_id) return [];
      try {
        const { data, error } = await supabase
          .from("club_members")
          .select("registration_id")
          .eq("coordinator_id", userClub.coordinator_id);
        if (error) {
          console.error("[ClubMembers] Fetch error:", JSON.stringify(error));
          return [];
        }
        const ids = (data || []).map((m: any) => m.registration_id).filter(Boolean);
        console.log("[ClubMembers] Found", ids.length, "members in club", userClub.club_name);
        return ids;
      } catch (error: any) {
        console.error("[ClubMembers] Query failed:", JSON.stringify(error), error?.message);
        return [];
      }
    },
    enabled: !!userClub?.coordinator_id,
    staleTime: 60000,
  });

  const { data: clubCommunityData, isLoading: clubLoading, refetch: refetchClub, error: clubError } = useQuery<CommunityData[]>({
    queryKey: ["club-community", clubMemberIds, filterStartDate, filterEndDate],
    queryFn: async () => {
      if (!clubMemberIds || clubMemberIds.length === 0) return [];
      try {
        let activitiesQuery = supabase
          .from("activities")
          .select("registration_id, activity_date, distance_km, start_time, end_time, pause_duration_seconds, pace_min_per_km")
          .in("registration_id", clubMemberIds);

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
          .select('registration_id, first_name, other_names, country, city_town_district, sex')
          .in("registration_id", clubMemberIds);

        if (regError) {
          console.error("[ClubCommunity] Registration fetch error:", regError);
          throw regError;
        }

        const regMap = new Map(registrations?.map(r => [r.registration_id, r]));
        const clubNameMap = await getClubNameMap(clubMemberIds);
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
            Club: clubNameMap.get(regId) || "",
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
    enabled: activeTab === "club" && !!clubMemberIds && clubMemberIds.length > 0,
    staleTime: 30000,
    retry: 1,
  });

  const { data: communityData, isLoading: communityLoading, refetch: refetchCommunity, error: communityError } = useQuery<CommunityData[]>({
    queryKey: ["community", filterStartDate, filterEndDate],
    queryFn: async () => {
      try {
        let activitiesQuery = supabase
          .from("activities")
          .select(`
            registration_id,
            activity_date,
            distance_km,
            start_time,
            end_time,
            pause_duration_seconds,
            pace_min_per_km
          `);

        if (filterStartDate) {
          activitiesQuery = activitiesQuery.gte("activity_date", filterStartDate);
        }
        if (filterEndDate) {
          activitiesQuery = activitiesQuery.lte("activity_date", filterEndDate);
        }

        const { data: activities, error: activityError } = await activitiesQuery;

        if (activityError) {
          console.error("[Community] Activity fetch error:", activityError);
          throw activityError;
        }

        const { data: registrations, error: regError } = await supabase
          .from("registrations")
          .select(`
            registration_id,
            first_name,
            other_names,
            country,
            sex
          `);

        if (regError) {
          console.error("[Community] Registration fetch error:", regError);
          throw regError;
        }

      const regMap = new Map(registrations?.map(r => [r.registration_id, r]));
      const clubNameMap = await getClubNameMap((registrations || []).map((registration: any) => registration.registration_id));
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

  const sortedActivities = useMemo(() => 
    activities
      ? [...activities].sort((a, b) => {
          return new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime();
        })
      : [],
    [activities]
  );

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
    if (type === "Treadmill" || type === "Tredmill") return "🏃‍♂️";
    if (type === "Walk") return "🚶";
    if (type === "Run") return "🏃";
    return "🏃";
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

  const convertPaceToMinPerKm = (paceMinPerKm: number): string => {
    const paceText = formatPaceMinPerKm(paceMinPerKm);
    return paceText === "--:--" ? paceText : `${paceText} /km`;
  };

  const availableCountries = useMemo(() => {
    const source = activeTab === "club" ? clubCommunityData : communityData;
    const values = (source || [])
      .map((item) => item.Country)
      .filter((country) => country && country !== "-");

    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [activeTab, clubCommunityData, communityData]);

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

  const sortedCommunityData = useMemo(() => {
    if (!communityData) return [];
    const filtered = applyLeaderboardFilters(communityData);
    return [...filtered].sort((a, b) => {
      if (communitySortBy === "time") {
        const timeDiff = b.AvgTime - a.AvgTime;
        if (timeDiff !== 0) return timeDiff;
      } else {
        const distDiff = b.AvgDistance - a.AvgDistance;
        if (distDiff !== 0) return distDiff;
      }
      const daysDiff = b.ActiveDays - a.ActiveDays;
      if (daysDiff !== 0) return daysDiff;
      return a.AveragePace - b.AveragePace;
    });
  }, [applyLeaderboardFilters, communityData, communitySortBy]);

  const sortedClubData = useMemo(() => {
    if (!clubCommunityData) return [];
    const filtered = applyLeaderboardFilters(clubCommunityData);
    return [...filtered].sort((a, b) => {
      if (clubSortBy === "time") {
        const timeDiff = b.AvgTime - a.AvgTime;
        if (timeDiff !== 0) return timeDiff;
      } else {
        const distDiff = b.AvgDistance - a.AvgDistance;
        if (distDiff !== 0) return distDiff;
      }
      const daysDiff = b.ActiveDays - a.ActiveDays;
      if (daysDiff !== 0) return daysDiff;
      return a.AveragePace - b.AveragePace;
    });
  }, [applyLeaderboardFilters, clubCommunityData, clubSortBy]);

  const renderLeaderboardTable = (rows: CommunityData[]) => (
    <View style={styles.leaderboardTableContainer}>
      <View style={styles.leaderboardTableHeader}>
        <View style={styles.leaderRankColumn}>
          <Text style={styles.leaderTableHeaderText}>#</Text>
        </View>
        <View style={styles.leaderNameColumn}>
          <Text style={styles.leaderTableHeaderText}>Name</Text>
        </View>
        <View style={styles.leaderClubColumn}>
          <Text style={styles.leaderTableHeaderText}>Club</Text>
        </View>
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
      {rows.map((item, index) => (
        <View key={item.registrationId} style={[styles.leaderboardTableRow, index % 2 === 1 && styles.leaderboardTableRowAlt]}>
          <View style={[styles.leaderRankColumn, styles.leaderRankCell]}>
            <Text style={styles.leaderFlagText}>{getCountryFlag(item.Country)}</Text>
            <Text style={styles.leaderTableCellText}>{index + 1}</Text>
          </View>
          <View style={styles.leaderNameColumn}>
            <Text style={styles.leaderTableCellText} numberOfLines={1}>{item.Name}</Text>
          </View>
          <View style={styles.leaderClubColumn}>
            <Text style={styles.leaderTableCellText} numberOfLines={1}>{item.Club || "-"}</Text>
          </View>
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
      ))}
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

    if (!formData.activityDate || !formData.startTime || !formData.duration || !formData.distanceKm) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    const durationRegex = /^\d{2}:\d{2}:\d{2}$/;
    if (!durationRegex.test(formData.duration)) {
      Alert.alert("Error", "Duration must be in HH:MM:SS format (e.g., 00:45:30)");
      return;
    }

    const distanceNum = parseFloat(formData.distanceKm);

    if (isNaN(distanceNum) || distanceNum <= 0) {
      Alert.alert("Error", "Please enter a valid distance");
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
        distanceKm: distanceNum,
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
      });
    } catch (error: any) {
      console.error("[Submit External Activity] Error:", error);
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <LinearGradient colors={[themeColors.primary, themeColors.primaryDark]} style={styles.header}>
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, activeTab === "runs" && styles.toggleButtonActive]}
            onPress={() => setActiveTab("runs")}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, activeTab === "runs" && styles.toggleTextActive]}>
              My Runs
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, activeTab === "club" && styles.toggleButtonActive, !isSubscribed && styles.toggleButtonLocked]}
            onPress={() => {
              if (!isSubscribed) {
                Alert.alert('Subscription Expired', 'Renew your subscription to access My Club.', [{ text: 'OK' }]);
                return;
              }
              setActiveTab("club");
            }}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.toggleText, activeTab === "club" && styles.toggleTextActive, !isSubscribed && styles.toggleTextLocked]}>
                My Club
              </Text>
              {!isSubscribed && <Lock size={12} color="#9CA3AF" />}
            </View>
          </TouchableOpacity>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.toggleText, activeTab === "community" && styles.toggleTextActive, !isSubscribed && styles.toggleTextLocked]}>
                Community
              </Text>
              {!isSubscribed && <Lock size={12} color="#9CA3AF" />}
            </View>
          </TouchableOpacity>
        </View>

        {activeTab === "runs" && (
          <View style={styles.headerButtonsRow}>
            <TouchableOpacity
              style={[styles.saveButton, !isSubscribed && styles.saveButtonLocked]}
              onPress={handleSaveCSV}
              disabled={isSaving}
              activeOpacity={0.8}
              testID="save-csv-button"
            >
              {!isSubscribed ? <Lock size={16} color="#9CA3AF" /> : <Download size={16} color={colors.primary} />}
              <Text style={[styles.saveButtonText, !isSubscribed && styles.saveButtonTextLocked]}>
                {isSaving ? 'Exporting...' : 'Export My Runs data'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === "club" && userClub?.club_name && (
          <View style={styles.clubHeaderInfo}>
            <Users size={16} color={colors.white} />
            <Text style={styles.clubHeaderName}>{userClub.club_name}</Text>
          </View>
        )}

        {(activeTab === "community" || activeTab === "club") && (
          <>
            <View style={styles.sortContainer}>
              <Text style={styles.sortLabel}>Sort:</Text>
              <TouchableOpacity
                style={[styles.sortChip, (activeTab === "community" ? communitySortBy : clubSortBy) === "distance" && styles.sortChipActive]}
                onPress={() => activeTab === "community" ? setCommunitySortBy("distance") : setClubSortBy("distance")}
                activeOpacity={0.7}
              >
                <TrendingUp size={14} color={(activeTab === "community" ? communitySortBy : clubSortBy) === "distance" ? colors.primary : colors.white} />
                <Text style={[styles.sortChipText, (activeTab === "community" ? communitySortBy : clubSortBy) === "distance" && styles.sortChipTextActive]}>
                  Distance
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortChip, (activeTab === "community" ? communitySortBy : clubSortBy) === "time" && styles.sortChipActive]}
                onPress={() => activeTab === "community" ? setCommunitySortBy("time") : setClubSortBy("time")}
                activeOpacity={0.7}
              >
                <Clock size={14} color={(activeTab === "community" ? communitySortBy : clubSortBy) === "time" ? colors.primary : colors.white} />
                <Text style={[styles.sortChipText, (activeTab === "community" ? communitySortBy : clubSortBy) === "time" && styles.sortChipTextActive]}>
                  Time
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortChip, showLeaderboardFilters && styles.sortChipActive]}
                onPress={() => setShowLeaderboardFilters((value) => !value)}
                activeOpacity={0.7}
              >
                <Filter size={14} color={showLeaderboardFilters ? colors.primary : colors.white} />
                <Text style={[styles.sortChipText, showLeaderboardFilters && styles.sortChipTextActive]}>
                  Filters
                </Text>
              </TouchableOpacity>
            </View>
            {showLeaderboardFilters && (
              <View style={styles.filterPanel}>
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
            refreshing={activeTab === "community" ? communityLoading : activeTab === "club" ? clubLoading : isLoading} 
            onRefresh={() => activeTab === "community" ? refetchCommunity() : activeTab === "club" ? refetchClub() : refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {activeTab === "runs" && sortedActivities.length > 0 && (
          <View style={styles.statsSection}>
            <LinearGradient colors={colors.gradient.orange} style={styles.statCard}>
              <Text style={styles.statValue}>{uniqueDaysCount}</Text>
              <Text style={styles.statLabel}>Active Days</Text>
            </LinearGradient>
            
            <LinearGradient colors={colors.gradient.teal} style={styles.statCard}>
              <Text style={styles.statValue}>{totalDistance.toFixed(1)}</Text>
              <Text style={styles.statLabel}>Total km</Text>
            </LinearGradient>
            
            <LinearGradient colors={colors.gradient.blue} style={styles.statCard}>
              <Text style={styles.statValue}>{formatTime(totalTimeMinutes)}</Text>
              <Text style={styles.statLabel}>Total Time</Text>
            </LinearGradient>
          </View>
        )}

        {activeTab === "runs" && (
          <View style={styles.eventsSection}>
            <Text style={[styles.eventsSectionTitle, { color: themeColors.text }]}>Registered Events</Text>
            {registeredEvents && registeredEvents.length > 0 ? (
              registeredEvents.map((event) => (
                <View key={event.eventId} style={[styles.eventCard, { backgroundColor: themeColors.cardBackground }]}>
                  <View style={styles.eventCardRow}>
                    <Calendar size={14} color={colors.primary} />
                    <Text style={styles.eventName} numberOfLines={1}>{event.eventName}</Text>
                    <View style={styles.eventBadges}>
                      <View style={styles.medalIndicator}>
                        <Award size={12} color={event.isOnMedalList ? '#FFD700' : colors.lightGray} />
                        <Text style={[styles.medalText, event.isOnMedalList ? styles.medalTextQualified : styles.medalTextNot]}>
                          {event.isOnMedalList ? 'Yes' : 'No'}
                        </Text>
                      </View>
                      <View style={[
                        styles.statusBadge,
                        event.status === 'ongoing' && styles.statusOngoing,
                        event.status === 'upcoming' && styles.statusUpcoming,
                        event.status === 'completed' && styles.statusCompleted,
                      ]}>
                        <Text style={[
                          styles.statusText,
                          event.status === 'ongoing' && styles.statusTextOngoing,
                          event.status === 'upcoming' && styles.statusTextUpcoming,
                          event.status === 'completed' && styles.statusTextCompleted,
                        ]}>
                          {event.status === 'ongoing' ? 'Ongoing' : event.status === 'upcoming' ? 'Not Started' : 'Closed'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <View style={[styles.noEventsCard, { backgroundColor: themeColors.cardBackground }]}>
                <Calendar size={20} color={colors.textLight} />
                <Text style={styles.noEventsText}>No registered events</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === "club" ? (
          !userClub?.club_name ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🏅</Text>
              <Text style={styles.emptyText}>No Club Membership</Text>
              <Text style={styles.emptySubtext}>You are not a member of any running club yet</Text>
            </View>
          ) : clubError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>⚠️</Text>
              <Text style={styles.emptyText}>Connection Error</Text>
              <Text style={styles.emptySubtext}>Check your internet connection</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => refetchClub()}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : clubLoading && sortedClubData.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading club members...</Text>
            </View>
          ) : sortedClubData.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🏃‍♂️</Text>
              <Text style={styles.emptyText}>No club members yet</Text>
              <Text style={styles.emptySubtext}>Club members will appear here as soon as they join your club.</Text>
            </View>
          ) : (
            renderLeaderboardTable(sortedClubData)
          )
        ) : activeTab === "community" ? (
          communityError ? (
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
              <Text style={styles.emptyEmoji}>🏃‍♂️</Text>
              <Text style={styles.emptyText}>No registered runners yet</Text>
              <Text style={styles.emptySubtext}>Runners will appear here even before they record their first run.</Text>
            </View>
          ) : (
            renderLeaderboardTable(sortedCommunityData)
          )
        ) : activeTab === "runs" ? (
          activitiesError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>⚠️</Text>
              <Text style={styles.emptyText}>Connection Error</Text>
              <Text style={styles.emptySubtext}>Check your internet connection</Text>
              <TouchableOpacity 
                style={styles.retryButton} 
                onPress={() => refetch()}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : isLoading && sortedActivities.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading activities...</Text>
            </View>
          ) : sortedActivities.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>👟</Text>
              <Text style={styles.emptyText}>No activities yet</Text>
              <Text style={styles.emptySubtext}>Start your first run to see it here</Text>
            </View>
          ) : (
            <View style={styles.activitiesContainer}>
              {sortedActivities.map((activity) => (
                <View key={activity.activity_id} style={[styles.activityCard, { backgroundColor: themeColors.cardBackground }]}>
                  <View style={styles.activityRow}>
                    <View style={styles.activityMainInfo}>
                      <Text style={styles.activityType}>{activity.exercise_type}</Text>
                      <Text style={styles.activityDate}>{formatDate(activity.activity_date)}</Text>
                      {(activity.pause_duration_seconds || 0) > 0 ? (
                        <Text style={styles.activityPauseText}>Paused {formatPauseDuration(activity.pause_duration_seconds || 0)}</Text>
                      ) : null}
                    </View>
                    <View style={styles.activityMetrics}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricValue}>{activity.distance_km.toFixed(1)}</Text>
                        <Text style={styles.metricLabel}>km</Text>
                      </View>
                      <View style={styles.metricDot} />
                      <View style={styles.metricItem}>
                        <Text style={styles.metricValue}>{calculateDuration(activity.start_time, activity.end_time, activity.pause_duration_seconds || 0)}</Text>
                        <Text style={styles.metricLabel}>time</Text>
                      </View>
                      <View style={styles.metricDot} />
                      <View style={styles.metricItem}>
                        <Text style={styles.metricValue}>{convertPaceToMinPerKm(activity.pace_min_per_km)}</Text>
                        <Text style={styles.metricLabel}>pace</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}


            </View>
          )
        ) : null}
      </ScrollView>

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
                  {["Run", "Walk", "Treadmill"].map((type) => (
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
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Distance (km) *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  placeholder="e.g., 5.5"
                  keyboardType="numeric"
                  value={formData.distanceKm}
                  onChangeText={(text) => setFormData({ ...formData, distanceKm: text })}
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
    padding: 20,
    paddingTop: 16,
    gap: 16,
  },
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  toggleButtonActive: {
    backgroundColor: colors.white,
  },
  toggleText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.white,
  },
  toggleTextActive: {
    color: colors.primary,
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
  sortContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap" as const,
    gap: 10,
  },
  sortLabel: {
    fontSize: 14,
    color: colors.white,
    fontWeight: "600" as const,
  },
  sortChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  sortChipActive: {
    backgroundColor: colors.white,
  },
  sortChipText: {
    fontSize: 13,
    color: colors.white,
    fontWeight: "600" as const,
  },
  sortChipTextActive: {
    color: colors.primary,
  },
  filterPanel: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  filterRow: {
    flexDirection: "row" as const,
    gap: 10,
  },
  filterField: {
    flex: 1,
    gap: 6,
  },
  filterFieldLabel: {
    fontSize: 12,
    color: colors.white,
    fontWeight: "700" as const,
  },
  filterInput: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.white,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  filterDateButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  filterDateButtonText: {
    fontSize: 13,
    color: colors.white,
    fontWeight: "600" as const,
  },
  filterGroup: {
    gap: 8,
  },
  filterChipRow: {
    flexDirection: "row" as const,
    gap: 8,
    paddingRight: 4,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
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
    margin: 12,
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden" as const,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  leaderboardTableHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: colors.primary,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  leaderboardTableRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  leaderboardTableRowAlt: {
    backgroundColor: "rgba(255, 107, 53, 0.04)",
  },
  leaderTableHeaderText: {
    color: colors.white,
    fontSize: 8,
    fontWeight: "800" as const,
  },
  leaderTableCellText: {
    color: colors.text,
    fontSize: 8,
    fontWeight: "600" as const,
    lineHeight: 12,
  },
  leaderRankColumn: {
    flex: 0.72,
    minWidth: 32,
  },
  leaderNameColumn: {
    flex: 1.85,
    minWidth: 70,
  },
  leaderClubColumn: {
    flex: 1.35,
    minWidth: 52,
  },
  leaderSexColumn: {
    flex: 0.52,
    minWidth: 22,
  },
  leaderDaysColumn: {
    flex: 0.65,
    minWidth: 30,
  },
  leaderDistanceColumn: {
    flex: 0.95,
    minWidth: 42,
  },
  leaderTimeColumn: {
    flex: 1.05,
    minWidth: 48,
  },
  leaderPaceColumn: {
    flex: 0.9,
    minWidth: 42,
  },
  leaderRankCell: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 2,
  },
  leaderFlagText: {
    fontSize: 9,
    lineHeight: 12,
  },
  activitiesContainer: {
    padding: 16,
    gap: 12,
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
    gap: 10,
  },
  typeChip: {
    flex: 1,
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
  clubHeaderInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  clubHeaderName: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: colors.white,
  },
  toggleButtonLocked: {
    opacity: 0.5,
  },
  toggleTextLocked: {
    color: '#9CA3AF',
  },
});
