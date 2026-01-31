import { StyleSheet, View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Calendar as CalendarIcon, Users, Clock, Award } from "lucide-react-native";
import { useRouter } from "expo-router";
import colors from "@/constants/colors";

interface Event {
  eventId: string;
  eventName: string;
  startsAt: string;
  endsAt: string;
}

type EventsQueryResult = Event[] | undefined;

export default function EventsScreen() {
  const { registrationId } = useAuth();
  const router = useRouter();

  const { data: events, isLoading: eventsLoading, refetch: refetchEvents } = trpc.admin.getEvents.useQuery(undefined, {
    refetchOnMount: true,
    staleTime: 0,
  }) as { data: EventsQueryResult; isLoading: boolean; refetch: () => void };

  const enrollMutation = trpc.admin.enrollEvent.useMutation({
    onSuccess: () => {
      Alert.alert("Success", "You have been enrolled in the event!");
      refetchEvents();
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to enroll: ${error.message}`);
    },
  });

  const handleEnrollPress = (eventId: string) => {
    enrollMutation.mutate({
      eventId,
      registrationId,
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleDateString("en-US", { month: "short" });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const sortedEvents = events
    ? [...events].sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
    : [];

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.participantsButton}
        onPress={() => router.push("/participants")}
        activeOpacity={0.8}
      >
        <LinearGradient colors={colors.gradient.teal} style={styles.participantsGradient}>
          <Users size={20} color={colors.white} />
          <Text style={styles.participantsButtonText}>View Participants</Text>
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.medalButton}
        onPress={() => router.push("/medal-list" as any)}
        activeOpacity={0.8}
      >
        <LinearGradient colors={colors.gradient.orange} style={styles.medalGradient}>
          <Award size={20} color={colors.white} />
          <Text style={styles.medalButtonText}>Medal List</Text>
        </LinearGradient>
      </TouchableOpacity>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl 
            refreshing={eventsLoading} 
            onRefresh={refetchEvents}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {eventsLoading && sortedEvents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Loading events...</Text>
          </View>
        ) : sortedEvents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <CalendarIcon size={64} color={colors.lightGray} />
            <Text style={styles.emptyText}>No events scheduled</Text>
            <Text style={styles.emptySubtext}>Check back later for upcoming events</Text>
          </View>
        ) : (
          <View style={styles.eventsContainer}>
            {sortedEvents.map((event) => (
              <LinearGradient key={event.eventId} colors={[colors.white, colors.extraLightGray]} style={styles.eventCard}>
                <View style={styles.eventHeader}>
                  <CalendarIcon size={24} color={colors.primary} />
                  <Text style={styles.eventName} numberOfLines={2}>{event.eventName}</Text>
                </View>
                
                <View style={styles.eventDates}>
                  <View style={styles.dateRow}>
                    <Clock size={16} color={colors.textSecondary} />
                    <View style={styles.dateContent}>
                      <Text style={styles.dateLabel}>Starts</Text>
                      <Text style={styles.dateValue}>{formatDate(event.startsAt)}</Text>
                    </View>
                  </View>
                  <View style={styles.dateRow}>
                    <Clock size={16} color={colors.textSecondary} />
                    <View style={styles.dateContent}>
                      <Text style={styles.dateLabel}>Ends</Text>
                      <Text style={styles.dateValue}>{formatDate(event.endsAt)}</Text>
                    </View>
                  </View>
                </View>
                
                <TouchableOpacity 
                  style={styles.enrollButton}
                  onPress={() => handleEnrollPress(event.eventId)}
                  activeOpacity={0.8}
                >
                  <LinearGradient colors={colors.gradient.orange} style={styles.enrollGradient}>
                    <Text style={styles.enrollButtonText}>Enroll Now</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </LinearGradient>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  participantsButton: {
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  participantsGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    gap: 8,
  },
  participantsButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: colors.white,
  },
  medalButton: {
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  medalGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    gap: 8,
  },
  medalButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: colors.white,
  },
  scrollView: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    marginTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: colors.textSecondary,
    marginBottom: 8,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: "center",
  },
  eventsContainer: {
    padding: 16,
    gap: 12,
  },
  eventCard: {
    borderRadius: 16,
    padding: 20,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
    gap: 16,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  eventName: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: colors.text,
    flex: 1,
  },
  enrollButton: {
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  enrollGradient: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: "center",
  },
  enrollButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: colors.white,
  },
  eventDates: {
    gap: 12,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.white,
    padding: 12,
    borderRadius: 10,
  },
  dateContent: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600" as const,
    marginBottom: 4,
  },
  dateValue: {
    fontSize: 15,
    color: colors.text,
    fontWeight: "700" as const,
  },
});
