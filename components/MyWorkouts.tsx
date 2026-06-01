import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";

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
  start_time: string;
  end_time: string;
  pace_min_per_km: number;
  pause_duration_seconds?: number | null;
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

export default function MyWorkouts() {
  const { user } = useAuth();
  const { colors: themeColors } = useTheme();

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
      const monthLabel = validDate ? date.toLocaleDateString("en-US", { month: "long" }) : "Unknown Month";
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

  const uniqueDaysCount = useMemo(
    () => new Set(activities.map((activity) => String(activity.activity_date || "").split("T")[0]).filter(Boolean)).size,
    [activities]
  );

  const totalDistance = useMemo(
    () => activities.reduce((sum, activity) => sum + (activity.distance_km || 0), 0),
    [activities]
  );

  const totalTimeMinutes = useMemo(
    () => activities.reduce((sum, activity) => {
      const startParts = activity.start_time.split(":");
      const endParts = activity.end_time.split(":");
      const startMinutes = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
      const endMinutes = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);
      let duration = endMinutes - startMinutes;
      if (duration < 0) duration += 24 * 60;
      duration = Math.max(0, duration - Math.floor((activity.pause_duration_seconds || 0) / 60));
      return sum + duration;
    }, 0),
    [activities]
  );

  if (error) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Connection Error</Text>
        <Text style={styles.emptySubtext}>Check your internet connection</Text>
      </View>
    );
  }

  if (isLoading && sortedActivities.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.emptyText}>Loading workouts...</Text>
      </View>
    );
  }

  if (sortedActivities.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>!</Text>
        <Text style={styles.emptyText}>No workouts yet</Text>
        <Text style={styles.emptySubtext}>Record your first workout to see it here</Text>
      </View>
    );
  }

  return (
    <View>
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
          <Text style={styles.statValue}>{formatTotalTime(totalTimeMinutes)}</Text>
          <Text style={styles.statLabel}>Total Time</Text>
        </LinearGradient>
      </View>

      <View style={styles.runsTableContainer}>
        {groupedActivities.map((yearGroup) => (
          <View key={yearGroup.year} style={styles.runsYearGroup}>
            <View style={styles.runsYearHeader}>
              <Text style={[styles.runsYearTitle, { color: themeColors.text }]}>{yearGroup.year}</Text>
              <Text style={styles.runsYearSummary}>
                {yearGroup.activityCount} workouts | {yearGroup.totalDistance.toFixed(1)} km
              </Text>
            </View>
            {yearGroup.months.map((monthGroup) => (
              <View key={monthGroup.key} style={[styles.runsMonthTable, { backgroundColor: themeColors.cardBackground }]}>
                <View style={styles.runsMonthHeader}>
                  <Text style={[styles.runsMonthTitle, { color: themeColors.text }]}>{monthGroup.label}</Text>
                  <Text style={styles.runsMonthSummary}>
                    {monthGroup.activities.length} | {monthGroup.totalDistance.toFixed(1)} km
                  </Text>
                </View>
                <View style={styles.runsTableHeader}>
                  <Text style={[styles.runsTableHeaderText, styles.runsDateColumn]}>Date</Text>
                  <Text style={[styles.runsTableHeaderText, styles.runsTypeColumn]}>Type</Text>
                  <Text style={[styles.runsTableHeaderText, styles.runsDistanceColumn]}>km</Text>
                  <Text style={[styles.runsTableHeaderText, styles.runsTimeColumn]}>Time</Text>
                  <Text style={[styles.runsTableHeaderText, styles.runsPaceColumn]}>Pace</Text>
                </View>
                {monthGroup.activities.map((activity, index) => (
                  <View key={activity.activity_id} style={[styles.runsTableRow, index % 2 === 1 && styles.runsTableRowAlt]}>
                    <Text style={[styles.runsTableCellText, styles.runsDateColumn]} numberOfLines={1}>{formatDate(activity.activity_date)}</Text>
                    <Text style={[styles.runsTableCellText, styles.runsTypeColumn]} numberOfLines={1}>{activity.exercise_type}</Text>
                    <Text style={[styles.runsTableCellText, styles.runsDistanceColumn]}>{activity.distance_km.toFixed(1)}</Text>
                    <Text style={[styles.runsTableCellText, styles.runsTimeColumn]} numberOfLines={1}>
                      {calculateDuration(activity.start_time, activity.end_time, activity.pause_duration_seconds || 0)}
                    </Text>
                    <Text style={[styles.runsTableCellText, styles.runsPaceColumn]} numberOfLines={1}>
                      {formatPaceMinPerKm(activity.pace_min_per_km)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
