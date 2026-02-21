import { StyleSheet, View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, Modal, TextInput } from "react-native";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, X, Calendar, MapPin, TrendingUp, Clock, Award, ChevronRight } from "lucide-react-native";
import colors from "@/constants/colors";


interface ActivityData {
  ActivityID: number;
  RegistrationID: string;
  Activity_Date: string;
  Exercise_Type: string;
  Distance_km: number;
  Start_Time: string;
  End_Time: string;
  Pace_km_h: number;
  user?: {
    name?: string;
    username?: string;
  };
}

interface RegisteredEvent {
  eventId: string;
  RegistrationID: string;
  eventName: string;
  startsAt: string;
  endsAt: string;
  isOnMedalList: boolean;
  status: 'ongoing' | 'upcoming' | 'completed';
}

interface CommunityData {
  RegistrationID: string;
  Name: string;
  Country: string;
  Residence: string;
  Sex: string;
  AvgDistance: number;
  AvgTime: number;
  AveragePace: number;
  ActiveDays: number;
}

type CommunitySortOption = "distance" | "time";

export default function ActivityScreen() {
  const { user, privateMode } = useAuth();

  const [communitySortBy, setCommunitySortBy] = useState<CommunitySortOption>("distance");
  const [showCommunity, setShowCommunity] = useState(false);
  const [showExternalForm, setShowExternalForm] = useState(false);
  const [formData, setFormData] = useState({
    activityDate: "",
    exerciseType: "Run" as "Run" | "Walk" | "Treadmill",
    startTime: "",
    duration: "",
    distanceKm: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: registeredEvents, isLoading: eventsLoading, refetch: refetchEvents } = useQuery<RegisteredEvent[]>({
    queryKey: ["registered-events", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        const { data: participantData, error: pError } = await supabase
          .from("Event Participants")
          .select("eventId, RegistrationID")
          .eq("RegistrationID", user.id);

        if (pError) {
          console.error("[RegisteredEvents] Participant fetch error:", JSON.stringify(pError));
          return [];
        }
        if (!participantData || participantData.length === 0) return [];

        const eventIds = participantData.map(p => p.eventId);
        const { data: eventsData, error: eError } = await supabase
          .from("Events")
          .select("eventId, eventName, startsAt, endsAt, medal_min_daily_distance, medal_min_cumulative_distance, medal_date_start, medal_date_end")
          .in("eventId", eventIds);

        if (eError) {
          console.error("[RegisteredEvents] Events fetch error:", JSON.stringify(eError));
          return [];
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const results: RegisteredEvent[] = await Promise.all(
          (eventsData || []).map(async (event: any) => {
            const startDate = new Date(event.startsAt);
            const endDate = new Date(event.endsAt);
            let status: RegisteredEvent['status'] = 'upcoming';
            if (today >= startDate && today <= endDate) status = 'ongoing';
            else if (today > endDate) status = 'completed';

            let isOnMedalList = false;
            const medalStart = event.medal_date_start;
            const medalEnd = event.medal_date_end;
            const minDaily = event.medal_min_daily_distance;
            const minCumulative = event.medal_min_cumulative_distance;

            if (medalStart && medalEnd) {
              const mStart = new Date(medalStart);
              const mEnd = new Date(medalEnd);
              const actualEnd = mEnd > today ? today : mEnd;
              const actualEndStr = actualEnd.toISOString().split('T')[0];

              const { data: acts } = await supabase
                .from("Activity Sample")
                .select("Activity_Date, Distance_km")
                .eq("RegistrationID", user.id)
                .gte("Activity_Date", medalStart)
                .lte("Activity_Date", actualEndStr);

              let totalDist = 0;
              const byDate = new Map<string, number>();
              (acts || []).forEach((a: any) => {
                const dk = new Date(a.Activity_Date).toISOString().split('T')[0];
                byDate.set(dk, (byDate.get(dk) || 0) + (a.Distance_km || 0));
                totalDist += a.Distance_km || 0;
              });

              let qualified = true;
              if (minDaily && minDaily > 0) {
                const cur = new Date(mStart);
                while (cur <= actualEnd) {
                  const dk = cur.toISOString().split('T')[0];
                  if ((byDate.get(dk) || 0) < minDaily) { qualified = false; break; }
                  cur.setDate(cur.getDate() + 1);
                }
              }
              if (minCumulative && minCumulative > 0 && totalDist < minCumulative) {
                qualified = false;
              }
              isOnMedalList = qualified;
            }

            return {
              eventId: event.eventId,
              RegistrationID: user.id,
              eventName: event.eventName || 'Unnamed Event',
              startsAt: event.startsAt,
              endsAt: event.endsAt,
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
    enabled: !showCommunity && !!user?.id,
    staleTime: 30000,
    retry: 1,
  });

  const { data: activities, isLoading, refetch, error: activitiesError } = useQuery<ActivityData[]>({
    queryKey: ["activities", user],
    queryFn: async () => {
      try {
        let query = supabase
          .from("Activity Sample")
          .select("*");

        if (user) {
          query = query.eq("RegistrationID", user.id);
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
    enabled: !showCommunity,
    staleTime: 30000,
    retry: 1,
  });

  const { data: communityData, isLoading: communityLoading, refetch: refetchCommunity, error: communityError } = useQuery<CommunityData[]>({
    queryKey: ["community"],
    queryFn: async () => {
      try {
        const { data: activities, error: activityError } = await supabase
          .from("Activity Sample")
          .select(`
            RegistrationID,
            Activity_Date,
            Distance_km,
            Start_Time,
            End_Time,
            Pace_km_h
          `);

        if (activityError) {
          console.error("[Community] Activity fetch error:", activityError);
          throw activityError;
        }

        const { data: registrations, error: regError } = await supabase
          .from("Registration Sample")
          .select(`
            RegistrationID,
            "First Name",
            "Other Names",
            Country,
            Residence,
            Sex
          `);

        if (regError) {
          console.error("[Community] Registration fetch error:", regError);
          throw regError;
        }

      const regMap = new Map(registrations?.map(r => [r.RegistrationID, r]));
      const userStats = new Map<string, {
        totalDistance: number;
        totalTime: number;
        paceSum: number;
        activityCount: number;
        activeDays: Set<string>;
      }>();

      activities?.forEach(activity => {
        const regId = activity.RegistrationID;
        if (!regId) return;

        const startParts = activity.Start_Time.split(':');
        const endParts = activity.End_Time.split(':');
        const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
        const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
        let duration = endMinutes - startMinutes;
        if (duration < 0) duration += 24 * 60;

        const existing = userStats.get(regId) || {
          totalDistance: 0,
          totalTime: 0,
          paceSum: 0,
          activityCount: 0,
          activeDays: new Set<string>(),
        };

        existing.totalDistance += activity.Distance_km || 0;
        existing.totalTime += duration;
        existing.paceSum += activity.Pace_km_h || 0;
        existing.activityCount += 1;
        existing.activeDays.add(activity.Activity_Date);

        userStats.set(regId, existing);
      });

      const result: CommunityData[] = [];
      userStats.forEach((stats, regId) => {
        const registration = regMap.get(regId);
        if (!registration) return;

        const firstName = registration["First Name"] || "";
        const otherNames = registration["Other Names"] || "";
        const fullName = [firstName, otherNames].filter(n => n).join(" ") || "Unknown";

        const activeDays = stats.activeDays.size;
        result.push({
          RegistrationID: regId,
          Name: fullName,
          Country: registration.Country || "-",
          Residence: registration.Residence || "-",
          Sex: registration.Sex || "-",
          AvgDistance: activeDays > 0 ? stats.totalDistance / activeDays : 0,
          AvgTime: activeDays > 0 ? stats.totalTime / activeDays : 0,
          AveragePace: stats.activityCount > 0 ? stats.paceSum / stats.activityCount : 0,
          ActiveDays: activeDays
        });
      });

      console.log("[Community] Processed", result.length, "users");
      return result;
      } catch (error: any) {
        console.error("[Community] Query failed:", error);
        throw error;
      }
    },
    enabled: showCommunity,
    staleTime: 30000,
    retry: 1,
  });

  const sortedActivities = useMemo(() => 
    activities
      ? [...activities].sort((a, b) => {
          return new Date(b.Activity_Date).getTime() - new Date(a.Activity_Date).getTime();
        })
      : [],
    [activities]
  );

  const uniqueDaysCount = useMemo(() => 
    activities
      ? new Set(activities.map(a => a.Activity_Date)).size
      : 0,
    [activities]
  );

  const totalDistance = useMemo(() => 
    activities
      ? activities.reduce((sum, a) => sum + a.Distance_km, 0)
      : 0,
    [activities]
  );

  const totalTimeMinutes = useMemo(() => 
    activities
      ? activities.reduce((sum, activity) => {
          const startParts = activity.Start_Time.split(':');
          const endParts = activity.End_Time.split(':');
          const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
          const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
          let duration = endMinutes - startMinutes;
          if (duration < 0) duration += 24 * 60;
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

  const calculateDuration = (start: string, end: string): string => {
    const startParts = start.split(':');
    const endParts = end.split(':');
    
    const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
    const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
    
    let totalMinutes = endMinutes - startMinutes;
    if (totalMinutes < 0) {
      totalMinutes += 24 * 60;
    }
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const convertPaceToMinPerKm = (paceKmH: number): string => {
    if (paceKmH === 0) return "--:--";
    const minPerKm = 60 / paceKmH;
    const minutes = Math.floor(minPerKm);
    const seconds = Math.round((minPerKm - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const sortedCommunityData = useMemo(() => {
    if (!communityData) return [];
    let filtered = communityData;
    if (privateMode && user?.id) {
      filtered = filtered.filter(item => item.RegistrationID !== user.id);
    }
    return [...filtered].sort((a, b) => {
      const distDiff = b.AvgDistance - a.AvgDistance;
      if (distDiff !== 0) return distDiff;
      const daysDiff = b.ActiveDays - a.ActiveDays;
      if (daysDiff !== 0) return daysDiff;
      return a.AveragePace - b.AveragePace;
    });
  }, [communityData, privateMode, user?.id]);

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
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

    setIsSubmitting(true);

    try {
      console.log("[Submit External Activity] Submitting data:", {
        RegistrationID: user.id,
        Activity_Date: formData.activityDate,
        Exercise_Type: formData.exerciseType,
        Start_Time: formData.startTime + ":00",
        Duration: formData.duration,
        Distance_km: distanceNum,
      });

      const { data, error } = await supabase
        .from("External Activity Submissions")
        .insert({
          RegistrationID: user.id,
          Activity_Date: formData.activityDate,
          Exercise_Type: formData.exerciseType,
          Start_Time: formData.startTime + ":00",
          Duration: formData.duration,
          Distance_km: distanceNum,
        })
        .select()
        .single();

      if (error) {
        console.error("[Submit External Activity] Error:", error);
        Alert.alert("Error", error.message || "Failed to submit activity");
        return;
      }

      console.log("[Submit External Activity] Success:", data);
      
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
    <View style={styles.container}>
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.header}>
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, !showCommunity && styles.toggleButtonActive]}
            onPress={() => setShowCommunity(false)}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, !showCommunity && styles.toggleTextActive]}>
              My Runs
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, showCommunity && styles.toggleButtonActive]}
            onPress={() => setShowCommunity(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, showCommunity && styles.toggleTextActive]}>
              Community
            </Text>
          </TouchableOpacity>
        </View>

        {!showCommunity && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowExternalForm(true)}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            <Plus size={20} color={colors.primary} />
            <Text style={styles.addButtonText}>Add Activity</Text>
          </TouchableOpacity>
        )}

        {showCommunity && (
          <View style={styles.sortContainer}>
            <Text style={styles.sortLabel}>Sort:</Text>
            <TouchableOpacity
              style={[styles.sortChip, communitySortBy === "distance" && styles.sortChipActive]}
              onPress={() => setCommunitySortBy("distance")}
              activeOpacity={0.7}
            >
              <TrendingUp size={14} color={communitySortBy === "distance" ? colors.primary : colors.white} />
              <Text style={[styles.sortChipText, communitySortBy === "distance" && styles.sortChipTextActive]}>
                Distance
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortChip, communitySortBy === "time" && styles.sortChipActive]}
              onPress={() => setCommunitySortBy("time")}
              activeOpacity={0.7}
            >
              <Clock size={14} color={communitySortBy === "time" ? colors.primary : colors.white} />
              <Text style={[styles.sortChipText, communitySortBy === "time" && styles.sortChipTextActive]}>
                Time
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl 
            refreshing={showCommunity ? communityLoading : isLoading} 
            onRefresh={() => showCommunity ? refetchCommunity() : refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {!showCommunity && sortedActivities.length > 0 && (
          <View style={styles.statsSection}>
            <LinearGradient colors={colors.gradient.orange} style={styles.statCard}>
              <Calendar size={24} color={colors.white} />
              <Text style={styles.statValue}>{uniqueDaysCount}</Text>
              <Text style={styles.statLabel}>Active Days</Text>
            </LinearGradient>
            
            <LinearGradient colors={colors.gradient.teal} style={styles.statCard}>
              <TrendingUp size={24} color={colors.white} />
              <Text style={styles.statValue}>{totalDistance.toFixed(1)}</Text>
              <Text style={styles.statLabel}>Total km</Text>
            </LinearGradient>
            
            <LinearGradient colors={colors.gradient.blue} style={styles.statCard}>
              <Clock size={24} color={colors.white} />
              <Text style={styles.statValue}>{formatTime(totalTimeMinutes)}</Text>
              <Text style={styles.statLabel}>Total Time</Text>
            </LinearGradient>
          </View>
        )}

        {showCommunity ? (
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
              <Text style={styles.emptyText}>No runners yet</Text>
              <Text style={styles.emptySubtext}>Be the first to hit the road!</Text>
            </View>
          ) : (
            <View style={styles.leaderboardContainer}>
              {sortedCommunityData.map((item, index) => (
                <View key={item.RegistrationID} style={styles.leaderboardCard}>
                  <View style={styles.leaderboardHeader}>
                    <View style={styles.nameBadge}>
                      <Text style={styles.runnerName} numberOfLines={1}>{item.Name}</Text>
                    </View>
                    <View style={styles.locationBadge}>
                      <MapPin size={10} color={colors.textSecondary} />
                      <Text style={styles.locationText} numberOfLines={1}>
                        {item.Country !== "-" && item.Residence !== "-" 
                          ? `${item.Country}, ${item.Residence}`
                          : item.Country !== "-" 
                          ? item.Country
                          : item.Residence}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.leaderboardStats}>
                    <View style={styles.leaderStatItem}>
                      <Text style={styles.leaderStatValue}>{index + 1}</Text>
                    </View>
                    <View style={styles.leaderStatDivider} />
                    <View style={styles.leaderStatItem}>
                      <Text style={styles.leaderStatValue}>{item.ActiveDays}</Text>
                      <Text style={styles.leaderStatLabel}>Days</Text>
                    </View>
                    <View style={styles.leaderStatDivider} />
                    <View style={styles.leaderStatItem}>
                      <Text style={styles.leaderStatValue}>{item.AvgDistance.toFixed(1)}</Text>
                      <Text style={styles.leaderStatLabel}>Av.km</Text>
                    </View>
                    <View style={styles.leaderStatDivider} />
                    <View style={styles.leaderStatItem}>
                      <Text style={styles.leaderStatValue}>{formatTime(item.AvgTime)}</Text>
                      <Text style={styles.leaderStatLabel}>Av.Time</Text>
                    </View>
                    <View style={styles.leaderStatDivider} />
                    <View style={styles.leaderStatItem}>
                      <Text style={styles.leaderStatValue}>{convertPaceToMinPerKm(item.AveragePace)}</Text>
                      <Text style={styles.leaderStatLabel}>Av.Pace</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )
        ) : (
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
                <View key={activity.ActivityID} style={styles.activityCard}>
                  <View style={styles.activityRow}>
                    <View style={styles.activityMainInfo}>
                      <Text style={styles.activityType}>{activity.Exercise_Type}</Text>
                      <Text style={styles.activityDate}>{formatDate(activity.Activity_Date)}</Text>
                    </View>
                    <View style={styles.activityMetrics}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricValue}>{activity.Distance_km.toFixed(1)}</Text>
                        <Text style={styles.metricLabel}>km</Text>
                      </View>
                      <View style={styles.metricDot} />
                      <View style={styles.metricItem}>
                        <Text style={styles.metricValue}>{calculateDuration(activity.Start_Time, activity.End_Time)}</Text>
                        <Text style={styles.metricLabel}>time</Text>
                      </View>
                      <View style={styles.metricDot} />
                      <View style={styles.metricItem}>
                        <Text style={styles.metricValue}>{convertPaceToMinPerKm(activity.Pace_km_h)}</Text>
                        <Text style={styles.metricLabel}>pace</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}

              {registeredEvents && registeredEvents.length > 0 && (
                <View style={styles.eventsSection}>
                  <Text style={styles.eventsSectionTitle}>Registered Events</Text>
                  {registeredEvents.map((event) => (
                    <View key={event.eventId} style={styles.eventCard}>
                      <View style={styles.eventCardTop}>
                        <View style={styles.eventNameRow}>
                          <Calendar size={16} color={colors.primary} />
                          <Text style={styles.eventName} numberOfLines={1}>{event.eventName}</Text>
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
                            {event.status === 'ongoing' ? 'Ongoing' : event.status === 'upcoming' ? formatDate(event.startsAt) : 'Completed'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.eventCardBottom}>
                        <View style={styles.medalIndicator}>
                          <Award size={14} color={event.isOnMedalList ? '#FFD700' : colors.lightGray} />
                          <Text style={[
                            styles.medalText,
                            event.isOnMedalList ? styles.medalTextQualified : styles.medalTextNot,
                          ]}>
                            {event.isOnMedalList ? 'On Medal List' : 'Not on Medal List'}
                          </Text>
                        </View>
                        {event.status === 'upcoming' && (
                          <Text style={styles.eventStartLabel}>Starts {formatDate(event.startsAt)}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )
        )}
      </ScrollView>

      <Modal
        visible={showExternalForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowExternalForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient colors={colors.gradient.orange} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add External Activity</Text>
              <TouchableOpacity onPress={() => setShowExternalForm(false)}>
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalSubtitle}>
                📱 Import from other running apps
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Date *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD (e.g., 2024-12-25)"
                  value={formData.activityDate}
                  onChangeText={(text) => setFormData({ ...formData, activityDate: text })}
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Activity Type *</Text>
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
                <Text style={styles.inputLabel}>Start Time *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="HH:MM (e.g., 08:30)"
                  value={formData.startTime}
                  onChangeText={(text) => setFormData({ ...formData, startTime: text })}
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Duration (HH:MM:SS) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 00:45:30"
                  value={formData.duration}
                  onChangeText={(text) => setFormData({ ...formData, duration: text })}
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Distance (km) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 5.5"
                  keyboardType="numeric"
                  value={formData.distanceKm}
                  onChangeText={(text) => setFormData({ ...formData, distanceKm: text })}
                  placeholderTextColor={colors.textLight}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
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
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
  sortContainer: {
    flexDirection: "row",
    alignItems: "center",
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
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 8,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800" as const,
    color: colors.white,
  },
  statLabel: {
    fontSize: 11,
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
    marginTop: 8,
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
    padding: 14,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    gap: 10,
  },
  eventCardTop: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  eventNameRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  eventName: {
    fontSize: 14,
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
  eventCardBottom: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  medalIndicator: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
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
  eventStartLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "500" as const,
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
});
