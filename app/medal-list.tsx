import { StyleSheet, View, Text, ScrollView, RefreshControl } from "react-native";
import { Stack } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Award, TrendingUp } from "lucide-react-native";
import colors from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";

interface MedalParticipant {
  participantId: string;
  registrationId: string;
  eventId: string;
  firstName: string;
  otherNames: string;
  country: string;
  residence: string;
  eventName: string;
  qualifiedDays: number;
  totalDistance: number;
}

export default function MedalListScreen() {
  const { user, privateMode } = useAuth();

  const { data: medalList, isLoading, refetch } = trpc.admin.getMedalList.useQuery(
    {},
    {
      refetchOnMount: true,
      staleTime: 0,
    }
  ) as { data: MedalParticipant[] | undefined; isLoading: boolean; refetch: () => void };

  const sortedList = medalList
    ? [...medalList]
        .filter((p) => {
          if (privateMode && user?.id && p.registrationId === user.id) return false;
          return true;
        })
        .sort((a, b) => {
          if (b.totalDistance !== a.totalDistance) {
            return b.totalDistance - a.totalDistance;
          }
          if (b.qualifiedDays !== a.qualifiedDays) {
            return b.qualifiedDays - a.qualifiedDays;
          }
          return 0;
        })
    : [];

  const groupedByEvent = sortedList.reduce((acc, participant) => {
    if (!acc[participant.eventName]) {
      acc[participant.eventName] = [];
    }
    acc[participant.eventName].push(participant);
    return acc;
  }, {} as Record<string, MedalParticipant[]>);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Medal List" }} />
      
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl 
            refreshing={isLoading} 
            onRefresh={refetch}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {isLoading && sortedList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Loading medal list...</Text>
          </View>
        ) : sortedList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Award size={64} color={colors.lightGray} />
            <Text style={styles.emptyText}>No qualified participants yet</Text>
            <Text style={styles.emptySubtext}>Complete event requirements to appear on the medal list</Text>
          </View>
        ) : (
          <View style={styles.eventsContainer}>
            {Object.entries(groupedByEvent).map(([eventName, participants]) => (
              <View key={eventName} style={styles.eventSection}>
                <View style={styles.eventHeader}>
                  <Award size={20} color={colors.primary} />
                  <Text style={styles.eventTitle}>{eventName}</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{participants.length}</Text>
                  </View>
                </View>

                <View style={styles.participantsList}>
                  {participants.map((participant, index) => {
                    const location = participant.country && participant.residence
                      ? `${participant.country}, ${participant.residence}`
                      : participant.residence || participant.country || "Unknown";
                    
                    return (
                      <LinearGradient
                        key={participant.participantId}
                        colors={index === 0 ? colors.gradient.gold : index === 1 ? colors.gradient.silver : index === 2 ? colors.gradient.bronze : [colors.white, colors.extraLightGray]}
                        style={styles.participantCard}
                      >
                        <View style={styles.rankContainer}>
                          <Text style={[
                            styles.rankNumber,
                            index === 0 && styles.goldRank,
                            index === 1 && styles.silverRank,
                            index === 2 && styles.bronzeRank,
                          ]}>
                            {index + 1}
                          </Text>
                        </View>

                        <View style={styles.participantInfo}>
                          <View style={styles.nameRow}>
                            <Text style={styles.locationText} numberOfLines={1}>
                              {location}
                            </Text>
                            <View style={styles.nameBox}>
                              <Text style={styles.nameText} numberOfLines={1}>
                                {`${participant.firstName} ${participant.otherNames || ""}`.trim()}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                              <Text style={styles.statLabel}>Days</Text>
                              <Text style={styles.statValue}>{participant.qualifiedDays}</Text>
                            </View>
                            <View style={styles.statItem}>
                              <Text style={styles.statLabel}>Total km</Text>
                              <Text style={styles.statValue}>{participant.totalDistance.toFixed(1)}</Text>
                            </View>
                            <View style={styles.statItem}>
                              <Text style={styles.statLabel}>Avg km/day</Text>
                              <Text style={styles.statValue}>
                                {participant.qualifiedDays > 0 
                                  ? (participant.totalDistance / participant.qualifiedDays).toFixed(1)
                                  : "0.0"}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </LinearGradient>
                    );
                  })}
                </View>
              </View>
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
    gap: 24,
  },
  eventSection: {
    gap: 12,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: colors.text,
    flex: 1,
  },
  countBadge: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 28,
    alignItems: "center",
  },
  countText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: colors.white,
  },
  participantsList: {
    gap: 10,
  },
  participantCard: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 12,
    gap: 12,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  rankContainer: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  rankNumber: {
    fontSize: 24,
    fontWeight: "900" as const,
    color: colors.textSecondary,
  },
  goldRank: {
    color: "#FFD700",
    textShadowColor: "#B8860B",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  silverRank: {
    color: "#C0C0C0",
    textShadowColor: "#808080",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  bronzeRank: {
    color: "#CD7F32",
    textShadowColor: "#8B4513",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  participantInfo: {
    flex: 1,
    gap: 8,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  locationText: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: colors.textSecondary,
    flex: 1,
  },
  nameBox: {
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: "45%",
  },
  nameText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.text,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statItem: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "800" as const,
    color: colors.text,
  },
});
