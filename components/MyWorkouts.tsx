import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";

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
}

interface ActivityMonthGroup {
  key: string;
  label: string;
  totalDistance: number;
  totalSteps: number;
  activities: ActivityData[];
}

interface ActivityYearGroup {
  year: string;
  totalDistance: number;
  totalSteps: number;
  activityCount: number;
  months: ActivityMonthGroup[];
}

function formatTotalTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, "0");
  const month = date.toLocaleDateString("en-US", { month: "short" });
  return `${day} ${month}`;
}

function calculateDuration(start: string, end: string, pauseSeconds = 0): string {
  const startParts = start.split(":");
  const endParts = end.split(":");
  const startMinutes = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
  const endMinutes = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);

  let totalMinutes = endMinutes - startMinutes;
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  totalMinutes = Math.max(0, totalMinutes - Math.floor((pauseSeconds || 0) / 60));

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatPaceMinPerKm(paceMinPerKm: number): string {
  if (!paceMinPerKm) return "--:--";
  const totalSecondsPerKm = Math.round(paceMinPerKm * 60);
  const minutes = Math.floor(totalSecondsPerKm / 60);
  const seconds = totalSecondsPerKm % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatActivityMeasure(activity: ActivityData): string {
  if (activity.exercise_type === "Stairs") {
    return `${Number(activity.steps_count || 0).toLocaleString()} steps`;
  }
  return `${Number(activity.distance_km || 0).toFixed(1)} km`;
}

export default function MyWorkouts() {
  const { user } = useAuth();
  const { colors: themeColors } = useTheme();
  const queryClient = useQueryClient();
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  const [activeHistoryTab, setActiveHistoryTab] = useState<"all" | "stairs">("all");

  const { data: activities = [], isLoading, error } = useQuery<ActivityData[]>({
    queryKey: ["my-workouts", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("registration_id", user.id)
        .order("activity_date", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const sortedActivities = useMemo(
    () => [...activities].sort((a, b) => new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime()),
    [activities]
  );
  const visibleActivities = useMemo(
    () => activeHistoryTab === "stairs"
      ? sortedActivities.filter((activity) => activity.exercise_type === "Stairs")
      : sortedActivities,
    [activeHistoryTab, sortedActivities]
  );

  const deleteWorkout = async (activity: ActivityData) => {
    if (!user?.id || deletingActivityId) return;

    setDeletingActivityId(activity.activity_id);
    try {
      const { error } = await supabase
        .from("activities")
        .delete()
        .eq("activity_id", activity.activity_id)
        .eq("registration_id", user.id);

      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-workouts", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["activities"] }),
        queryClient.invalidateQueries({ queryKey: ["dailyRunActivities", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["recentPaceActivities", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["healthDurationActivities", user.id] }),
      ]);
    } catch (error) {
      console.error("[MyWorkouts] Could not delete workout:", error);
      Alert.alert("Delete Failed", error instanceof Error ? error.message : "This workout could not be deleted.");
    } finally {
      setDeletingActivityId(null);
    }
  };

  const confirmDeleteWorkout = (activity: ActivityData) => {
    if (deletingActivityId) return;

    Alert.alert(
      "Delete Workout",
      `Delete this ${activity.exercise_type} from ${formatDate(activity.activity_date)}? This removes it from your workout totals, goals, and rankings.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteWorkout(activity);
          },
        },
      ]
    );
  };

  const groupedActivities = useMemo<ActivityYearGroup[]>(() => {
    const years = new Map<string, {
      totalDistance: number;
      totalSteps: number;
      activityCount: number;
      months: Map<string, ActivityMonthGroup>;
    }>();

    visibleActivities.forEach((activity) => {
      const date = new Date(activity.activity_date);
      const validDate = !Number.isNaN(date.getTime());
      const year = validDate ? String(date.getFullYear()) : "Unknown Year";
      const monthIndex = validDate ? date.getMonth() : -1;
      const monthKey = validDate ? `${year}-${String(monthIndex + 1).padStart(2, "0")}` : `${year}-unknown`;
      const monthLabel = validDate ? date.toLocaleDateString("en-US", { month: "long" }) : "Unknown Month";
      const yearGroup = years.get(year) || {
        totalDistance: 0,
        totalSteps: 0,
        activityCount: 0,
        months: new Map<string, ActivityMonthGroup>(),
      };
      const monthGroup = yearGroup.months.get(monthKey) || {
        key: monthKey,
        label: monthLabel,
        totalDistance: 0,
        totalSteps: 0,
        activities: [],
      };

      yearGroup.totalDistance += activity.distance_km || 0;
      yearGroup.totalSteps += Number(activity.steps_count || 0);
      yearGroup.activityCount += 1;
      monthGroup.totalDistance += activity.distance_km || 0;
      monthGroup.totalSteps += Number(activity.steps_count || 0);
      monthGroup.activities.push(activity);
      yearGroup.months.set(monthKey, monthGroup);
      years.set(year, yearGroup);
    });

    return [...years.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, group]) => ({
        year,
        totalDistance: group.totalDistance,
        totalSteps: group.totalSteps,
        activityCount: group.activityCount,
        months: [...group.months.values()].sort((a, b) => b.key.localeCompare(a.key)),
      }));
  }, [visibleActivities]);

  const uniqueDaysCount = useMemo(
    () => new Set(visibleActivities.map((activity) => String(activity.activity_date || "").split("T")[0]).filter(Boolean)).size,
    [visibleActivities]
  );

  const totalDistance = useMemo(
    () => visibleActivities.reduce((sum, activity) => sum + (activity.distance_km || 0), 0),
    [visibleActivities]
  );

  const totalSteps = useMemo(
    () => visibleActivities.reduce((sum, activity) => sum + Number(activity.steps_count || 0), 0),
    [visibleActivities]
  );

  const totalTimeMinutes = useMemo(
    () => visibleActivities.reduce((sum, activity) => {
      const startParts = activity.start_time.split(":");
      const endParts = activity.end_time.split(":");
      const startMinutes = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
      const endMinutes = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);
      let duration = endMinutes - startMinutes;
      if (duration < 0) duration += 24 * 60;
      duration = Math.max(0, duration - Math.floor((activity.pause_duration_seconds || 0) / 60));
      return sum + duration;
    }, 0),
    [visibleActivities]
  );

  if (error) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: themeColors.text }]}>Connection Error</Text>
        <Text style={[styles.emptySubtext, { color: themeColors.textSecondary }]}>Check your internet connection</Text>
      </View>
    );
  }

  if (isLoading && sortedActivities.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.emptyText, { color: themeColors.text }]}>Loading workouts...</Text>
      </View>
    );
  }

  if (sortedActivities.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>!</Text>
        <Text style={[styles.emptyText, { color: themeColors.text }]}>No workouts yet</Text>
        <Text style={[styles.emptySubtext, { color: themeColors.textSecondary }]}>Record your first workout to see it here</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.historyTabs}>
        {([
          ["all", "All"],
          ["stairs", "Stairs"],
        ] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.historyTabButton,
              { backgroundColor: themeColors.inputBackground },
              activeHistoryTab === key && styles.historyTabButtonActive,
            ]}
            onPress={() => setActiveHistoryTab(key)}
            activeOpacity={0.75}
          >
            <Text style={[
              styles.historyTabText,
              { color: themeColors.textSecondary },
              activeHistoryTab === key && styles.historyTabTextActive,
            ]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.statsSection}>
        <LinearGradient colors={colors.gradient.orange} style={styles.statCard}>
          <Text style={styles.statValue}>{uniqueDaysCount}</Text>
          <Text style={styles.statLabel}>Active Days</Text>
        </LinearGradient>
        <LinearGradient colors={colors.gradient.teal} style={styles.statCard}>
          <Text style={styles.statValue}>{activeHistoryTab === "stairs" ? totalSteps.toLocaleString() : totalDistance.toFixed(1)}</Text>
          <Text style={styles.statLabel}>{activeHistoryTab === "stairs" ? "Total Steps" : "Total km"}</Text>
        </LinearGradient>
        <LinearGradient colors={colors.gradient.blue} style={styles.statCard}>
          <Text style={styles.statValue}>{formatTotalTime(totalTimeMinutes)}</Text>
          <Text style={styles.statLabel}>Total Time</Text>
        </LinearGradient>
      </View>

      {visibleActivities.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: themeColors.text }]}>{activeHistoryTab === "stairs" ? "No stairs workouts yet" : "No workouts yet"}</Text>
          <Text style={[styles.emptySubtext, { color: themeColors.textSecondary }]}>{activeHistoryTab === "stairs" ? "Your staircase QR workouts will appear here" : "Record your first workout to see it here"}</Text>
        </View>
      ) : (
      <View style={styles.runsTableContainer}>
        {groupedActivities.map((yearGroup) => (
          <View key={yearGroup.year} style={styles.runsYearGroup}>
            <View style={styles.runsYearHeader}>
              <Text style={[styles.runsYearTitle, { color: themeColors.text }]}>{yearGroup.year}</Text>
              <Text style={[styles.runsYearSummary, { color: themeColors.textSecondary }]}>
                {yearGroup.activityCount} workouts | {activeHistoryTab === "stairs" ? `${yearGroup.totalSteps.toLocaleString()} steps` : `${yearGroup.totalDistance.toFixed(1)} km`}
              </Text>
            </View>
            {yearGroup.months.map((monthGroup) => (
              <View key={monthGroup.key} style={[styles.runsMonthTable, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
                <View style={[styles.runsMonthHeader, { backgroundColor: themeColors.inputBackground }]}>
                  <Text style={[styles.runsMonthTitle, { color: themeColors.text }]}>{monthGroup.label}</Text>
                  <Text style={[styles.runsMonthSummary, { color: themeColors.textSecondary }]}>
                    {monthGroup.activities.length} | {activeHistoryTab === "stairs" ? `${monthGroup.totalSteps.toLocaleString()} steps` : `${monthGroup.totalDistance.toFixed(1)} km`}
                  </Text>
                </View>
                <View style={[styles.runsTableHeader, { backgroundColor: themeColors.border }]}>
                  <Text style={[styles.runsTableHeaderText, styles.runsDateColumn, { color: themeColors.textSecondary }]}>Date</Text>
                  <Text style={[styles.runsTableHeaderText, styles.runsTypeColumn, { color: themeColors.textSecondary }]}>Type</Text>
                  <Text style={[styles.runsTableHeaderText, styles.runsDistanceColumn, { color: themeColors.textSecondary }]}>km/steps</Text>
                  <Text style={[styles.runsTableHeaderText, styles.runsTimeColumn, { color: themeColors.textSecondary }]}>Time</Text>
                  <Text style={[styles.runsTableHeaderText, styles.runsPaceColumn, { color: themeColors.textSecondary }]}>Pace</Text>
                </View>
                {monthGroup.activities.map((activity, index) => {
                  const isDeleting = deletingActivityId === activity.activity_id;
                  return (
                  <TouchableOpacity
                    key={activity.activity_id}
                    style={[
                      styles.runsTableRow,
                      {
                        backgroundColor: index % 2 === 1
                          ? themeColors.inputBackground
                          : themeColors.cardBackground,
                      },
                      isDeleting && styles.runsTableRowDeleting,
                    ]}
                    onLongPress={() => confirmDeleteWorkout(activity)}
                    delayLongPress={650}
                    activeOpacity={0.72}
                    disabled={!!deletingActivityId}
                    accessibilityRole="button"
                    accessibilityLabel={`Workout ${activity.exercise_type} on ${formatDate(activity.activity_date)}`}
                    accessibilityHint="Long press to delete this workout"
                  >
                    <Text style={[styles.runsTableCellText, styles.runsDateColumn, { color: themeColors.text }]} numberOfLines={1}>{formatDate(activity.activity_date)}</Text>
                    <Text style={[styles.runsTableCellText, styles.runsTypeColumn, { color: themeColors.text }]} numberOfLines={1}>{activity.exercise_type}</Text>
                    <Text style={[styles.runsTableCellText, styles.runsDistanceColumn, { color: themeColors.text }]}>{formatActivityMeasure(activity)}</Text>
                    <Text style={[styles.runsTableCellText, styles.runsTimeColumn, { color: themeColors.text }]} numberOfLines={1}>
                      {calculateDuration(activity.start_time, activity.end_time, activity.pause_duration_seconds || 0)}
                    </Text>
                    {isDeleting ? (
                      <View style={[styles.runsPaceColumn, styles.runsDeletingCell]}>
                        <ActivityIndicator size="small" color={colors.primary} />
                      </View>
                    ) : (
                      <Text style={[styles.runsTableCellText, styles.runsPaceColumn, { color: themeColors.text }]} numberOfLines={1}>
                        {formatPaceMinPerKm(activity.pace_min_per_km)}
                      </Text>
                    )}
                  </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        ))}
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  historyTabs: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 12,
  },
  historyTabButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.extraLightGray,
  },
  historyTabButtonActive: {
    backgroundColor: colors.primary,
  },
  historyTabText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textSecondary,
  },
  historyTabTextActive: {
    color: colors.white,
  },
  statsSection: {
    flexDirection: "row",
    gap: 12,
    paddingBottom: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.white,
  },
  statLabel: {
    fontSize: 10,
    color: colors.white,
    opacity: 0.9,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    marginTop: 30,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: "center",
    marginTop: 6,
  },
  runsTableContainer: {
    gap: 14,
  },
  runsYearGroup: {
    gap: 10,
  },
  runsYearHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  runsYearTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  runsYearSummary: {
    fontSize: 12,
    color: colors.textLight,
    fontWeight: "700",
  },
  runsMonthTable: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  runsMonthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.extraLightGray,
  },
  runsMonthTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  runsMonthSummary: {
    fontSize: 12,
    color: colors.textLight,
    fontWeight: "700",
  },
  runsTableHeader: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: colors.lightGray,
  },
  runsTableHeaderText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    textTransform: "uppercase",
  },
  runsTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  runsTableRowAlt: {
    backgroundColor: "rgba(0,0,0,0.025)",
  },
  runsTableRowDeleting: {
    opacity: 0.55,
  },
  runsTableCellText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: "600",
  },
  runsDateColumn: {
    flex: 1.05,
  },
  runsTypeColumn: {
    flex: 1,
  },
  runsDistanceColumn: {
    flex: 0.7,
    textAlign: "right",
  },
  runsTimeColumn: {
    flex: 0.9,
    textAlign: "right",
  },
  runsPaceColumn: {
    flex: 0.85,
    textAlign: "right",
  },
  runsDeletingCell: {
    alignItems: "flex-end",
  },
});
