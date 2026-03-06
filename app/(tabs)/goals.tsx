import { StyleSheet, View, Text, ScrollView, RefreshControl, Animated } from "react-native";
import { useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Target, TrendingDown, TrendingUp, Award, Calendar, CheckCircle, Scale } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import colors from "@/constants/colors";

interface UserGoal {
  user_goals_id: number;
  registration_id: string;
  goal: string;
}

interface ProfileData {
  "Weight Current"?: number;
  "Weight Target"?: number;
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

export default function GoalsScreen() {
  const { user } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

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

  const { data: profile, refetch: refetchProfile } = useQuery<ProfileData | null>({
    queryKey: ["goalProfile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("registrations")
        .select('"Weight Current", "Weight Target"')
        .eq("RegistrationID", user.id)
        .maybeSingle();
      if (error) {
        console.error("[Goals] Error fetching profile:", error);
        return null;
      }
      return data as ProfileData;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const { data: activitySummary, refetch: refetchActivity } = useQuery<ActivitySummary>({
    queryKey: ["goalActivitySummary", user?.id],
    queryFn: async () => {
      if (!user?.id) return { totalDistance: 0, totalTime: 0, activeDays: 0, avgDistance: 0, avgPace: 0, streakDays: 0 };
      const { data, error } = await supabase
        .from("activities")
        .select("Activity_Date, Distance_km, Start_Time, End_Time, Pace_km_h")
        .eq("RegistrationID", user.id);

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
        totalDistance += a.Distance_km || 0;
        paceSum += a.Pace_km_h || 0;
        const dateKey = a.Activity_Date?.split?.("T")?.[0] || a.Activity_Date;
        if (dateKey) daySet.add(dateKey);
        const startParts = (a.Start_Time || "0:0:0").split(":");
        const endParts = (a.End_Time || "0:0:0").split(":");
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

  const { data: eventGoals = [], refetch: refetchEvents } = useQuery<RegisteredEvent[]>({
    queryKey: ["goalEvents", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        const { data: participantData } = await supabase
          .from("events_participants")
          .select("eventId")
          .eq("RegistrationID", user.id);

        if (!participantData || participantData.length === 0) return [];

        const eventIds = participantData.map((p: any) => p.eventId);
        const { data: eventsData } = await supabase
          .from("events")
          .select("eventId, eventName, startsAt, endsAt, medal_min_daily_distance, medal_min_cumulative_distance, medal_date_start, medal_date_end")
          .in("eventId", eventIds);

        if (!eventsData) return [];

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const results: RegisteredEvent[] = await Promise.all(
          eventsData.map(async (event: any) => {
            const startDate = new Date(event.startsAt);
            const endDate = new Date(event.endsAt);
            let status: RegisteredEvent["status"] = "upcoming";
            if (today >= startDate && today <= endDate) status = "ongoing";
            else if (today > endDate) status = "completed";

            let currentDistance = 0;
            const medalStart = event.medal_date_start || event.startsAt;
            const medalEnd = event.medal_date_end || event.endsAt;

            if (medalStart) {
              const { data: acts } = await supabase
                .from("activities")
                .select("Distance_km")
                .eq("RegistrationID", user.id)
                .gte("Activity_Date", medalStart)
                .lte("Activity_Date", medalEnd);

              currentDistance = (acts || []).reduce((sum: number, a: any) => sum + (a.Distance_km || 0), 0);
            }

            let isOnMedalList = true;
            if (event.medal_min_cumulative_distance && currentDistance < event.medal_min_cumulative_distance) {
              isOnMedalList = false;
            }

            return {
              eventId: event.eventId,
              eventName: event.eventName || "Unnamed Event",
              startsAt: event.startsAt,
              endsAt: event.endsAt,
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
        console.error("[Goals] Event goals fetch error:", error);
        return [];
      }
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const isRefreshing = goalsLoading;

  const handleRefresh = () => {
    void refetchGoals();
    void refetchProfile();
    void refetchActivity();
    void refetchEvents();
  };

  const weightProgress = useMemo(() => {
    if (!profile?.["Weight Current"] || !profile?.["Weight Target"]) return null;
    const current = profile["Weight Current"];
    const target = profile["Weight Target"];
    const diff = current - target;
    const isLosing = diff > 0;
    const progressPercent = isLosing
      ? Math.min(100, Math.max(0, ((current - target) / current) * 100))
      : 100;
    return { current, target, diff: Math.abs(diff), isLosing, progressPercent };
  }, [profile]);

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const ongoingEvents = eventGoals.filter((e) => e.status === "ongoing");

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {activitySummary && (
          <View style={styles.streakSection}>
            <LinearGradient colors={["#FF6B35", "#FF8C42"]} style={styles.streakCard}>
              <View style={styles.streakTop}>
                <Text style={styles.streakNumber}>{activitySummary.streakDays}</Text>
                <Text style={styles.streakLabel}>Day Streak</Text>
              </View>
              <View style={styles.streakStats}>
                <View style={styles.streakStatItem}>
                  <Text style={styles.streakStatValue}>{activitySummary.activeDays}</Text>
                  <Text style={styles.streakStatLabel}>Active Days</Text>
                </View>
                <View style={styles.streakDivider} />
                <View style={styles.streakStatItem}>
                  <Text style={styles.streakStatValue}>{activitySummary.totalDistance.toFixed(1)}</Text>
                  <Text style={styles.streakStatLabel}>Total km</Text>
                </View>
                <View style={styles.streakDivider} />
                <View style={styles.streakStatItem}>
                  <Text style={styles.streakStatValue}>{formatTime(activitySummary.totalTime)}</Text>
                  <Text style={styles.streakStatLabel}>Total Time</Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        )}

        {weightProgress && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Scale size={18} color={colors.text} />
              <Text style={styles.sectionTitle}>Weight Goal</Text>
            </View>
            <View style={styles.weightCard}>
              <View style={styles.weightRow}>
                <View style={styles.weightItem}>
                  <Text style={styles.weightValue}>{weightProgress.current}</Text>
                  <Text style={styles.weightLabel}>Current (kg)</Text>
                </View>
                <View style={styles.weightArrow}>
                  {weightProgress.isLosing ? (
                    <TrendingDown size={24} color={colors.success} />
                  ) : (
                    <TrendingUp size={24} color={colors.secondary} />
                  )}
                </View>
                <View style={styles.weightItem}>
                  <Text style={styles.weightValue}>{weightProgress.target}</Text>
                  <Text style={styles.weightLabel}>Target (kg)</Text>
                </View>
              </View>
              <View style={styles.weightProgressBar}>
                <View style={styles.weightProgressTrack}>
                  <LinearGradient
                    colors={weightProgress.isLosing ? ["#10B981", "#34D399"] : ["#00C9A7", "#00E5BE"]}
                    style={[styles.weightProgressFill, { width: `${Math.min(100, 100 - (weightProgress.diff / weightProgress.current) * 100)}%` }]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  />
                </View>
              </View>
              <Text style={styles.weightDiff}>
                {weightProgress.diff.toFixed(1)} kg {weightProgress.isLosing ? "to lose" : "to gain"}
              </Text>
            </View>
          </View>
        )}

        {userGoals.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Target size={18} color={colors.text} />
              <Text style={styles.sectionTitle}>My Fitness Goals</Text>
            </View>
            <View style={styles.goalsContainer}>
              {userGoals.map((goal) => (
                <View key={goal.user_goals_id} style={styles.goalChip}>
                  <CheckCircle size={14} color={colors.success} />
                  <Text style={styles.goalChipText}>{goal.goal}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {ongoingEvents.length > 0 && (
          <View style={styles.section}>
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
        )}

        {activitySummary && activitySummary.activeDays > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <TrendingUp size={18} color={colors.text} />
              <Text style={styles.sectionTitle}>Daily Averages</Text>
            </View>
            <View style={styles.avgRow}>
              <LinearGradient colors={colors.gradient.teal} style={styles.avgCard}>
                <Text style={styles.avgValue}>{activitySummary.avgDistance.toFixed(1)}</Text>
                <Text style={styles.avgLabel}>km/day</Text>
              </LinearGradient>
              <LinearGradient colors={colors.gradient.blue} style={styles.avgCard}>
                <Text style={styles.avgValue}>
                  {activitySummary.avgPace > 0 ? (60 / activitySummary.avgPace).toFixed(1) : "--"}
                </Text>
                <Text style={styles.avgLabel}>min/km avg</Text>
              </LinearGradient>
            </View>
          </View>
        )}

        {userGoals.length === 0 && !weightProgress && ongoingEvents.length === 0 && (
          <View style={styles.emptyContainer}>
            <Target size={48} color={colors.lightGray} />
            <Text style={styles.emptyTitle}>No Goals Set Yet</Text>
            <Text style={styles.emptySubtext}>
              Visit your Profile to set fitness goals, weight targets, and join events to track your progress here.
            </Text>
          </View>
        )}
      </ScrollView>
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
    borderRadius: 20,
    padding: 20,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  streakTop: {
    alignItems: "center" as const,
    marginBottom: 16,
  },
  streakNumber: {
    fontSize: 48,
    fontWeight: "900" as const,
    color: colors.white,
    lineHeight: 54,
  },
  streakLabel: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: colors.white,
    opacity: 0.9,
    marginTop: 2,
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
  weightDiff: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center" as const,
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
});
