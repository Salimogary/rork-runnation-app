import { StyleSheet, View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Award } from "lucide-react-native";
import colors from "@/constants/colors";
import { useMemo, useState } from "react";
import { formatCountryName } from "@/constants/country-utils";

interface MedalParticipant {
  participantId: string;
  registrationId: string;
  eventId: string;
  firstName: string;
  otherNames: string;
  country: string;
  club: string;
  eventName: string;
  qualifiedDays: number;
  totalDistance: number;
}

export default function MedalListScreen() {
  const { user, privateMode } = useAuth();
  const params = useLocalSearchParams<{ eventMode?: string }>();
  const [selectedEvent, setSelectedEvent] = useState<string>("all");
  const eventMode = params.eventMode === "multiday" ? "multiday" : "multiday";

  const formatCountryClub = (country?: string, club?: string) =>
    [formatCountryName(country), club].filter(Boolean).join(",");

  const { data: medalList, isLoading, refetch } = trpc.admin.getMedalList.useQuery(
    {},
    {
      refetchOnMount: true,
      staleTime: 0,
    }
  ) as { data: MedalParticipant[] | undefined; isLoading: boolean; refetch: () => void };

  const { data: events = [] } = trpc.events.getEvents.useQuery();

  const multidayEvents = useMemo(() => {
    return (events || []).filter((event: any) => {
      const startsAt = event?.starts_at;
      const endsAt = event?.ends_at;
      return eventMode === "multiday" && !!startsAt && !!endsAt && startsAt.slice(0, 10) !== endsAt.slice(0, 10);
    });
  }, [eventMode, events]);

  const multidayEventIds = useMemo(
    () => new Set(multidayEvents.map((event: any) => event.event_id)),
    [multidayEvents]
  );

  const eventMetaMap = useMemo(() => {
    return new Map(
      multidayEvents.map((event: any) => [
        event.event_id,
        {
          organizerLabel: event.organizer_name || event.organizer || "",
          eventName: event.event_name || "Unknown Event",
        },
      ])
    );
  }, [multidayEvents]);

  const filteredList = useMemo(() => {
    if (!medalList) return [];

    return [...medalList]
      .filter((participant) => {
        if (!multidayEventIds.has(participant.eventId)) return false;
        if (privateMode && user?.id && participant.registrationId === user.id) return false;
        if (selectedEvent !== "all" && participant.eventId !== selectedEvent) return false;
        return true;
      })
      .sort((a, b) => {
        if (b.totalDistance !== a.totalDistance) {
          return b.totalDistance - a.totalDistance;
        }
        if (b.qualifiedDays !== a.qualifiedDays) {
          return b.qualifiedDays - a.qualifiedDays;
        }
        return `${a.firstName} ${a.otherNames}`.localeCompare(`${b.firstName} ${b.otherNames}`);
      });
  }, [medalList, multidayEventIds, privateMode, selectedEvent, user?.id]);

  const groupedByEvent = useMemo(() => {
    return filteredList.reduce((acc, participant) => {
      if (!acc[participant.eventId]) {
        acc[participant.eventId] = [];
      }
      acc[participant.eventId].push(participant);
      return acc;
    }, {} as Record<string, MedalParticipant[]>);
  }, [filteredList]);

  const eventOptions = useMemo(() => {
    return multidayEvents
      .map((event: any) => ({
        eventId: event.event_id,
        eventName: event.event_name || "Unknown Event",
      }))
      .sort((a, b) => a.eventName.localeCompare(b.eventName));
  }, [multidayEvents]);

  return (
    <>
      <Stack.Screen options={{ title: "Multiday Events" }} />
      <View style={styles.container}>
        {eventOptions.length > 0 && (
          <View style={styles.filterHeader}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScrollContent}
            >
              <TouchableOpacity
                style={[styles.filterButton, selectedEvent === "all" && styles.filterButtonActive]}
                onPress={() => setSelectedEvent("all")}
              >
                <Text style={[styles.filterText, selectedEvent === "all" && styles.filterTextActive]}>
                  All Events
                </Text>
              </TouchableOpacity>
              {eventOptions.map((event) => (
                <TouchableOpacity
                  key={event.eventId}
                  style={[styles.filterButton, selectedEvent === event.eventId && styles.filterButtonActive]}
                  onPress={() => setSelectedEvent(event.eventId)}
                >
                  <Text style={[styles.filterText, selectedEvent === event.eventId && styles.filterTextActive]}>
                    {event.eventName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

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
          {isLoading && filteredList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading multiday events...</Text>
            </View>
          ) : filteredList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Award size={64} color={colors.lightGray} />
              <Text style={styles.emptyText}>No multiday standings yet</Text>
              <Text style={styles.emptySubtext}>
                Multiday event standings will appear here once runners begin qualifying.
              </Text>
            </View>
          ) : (
            <View style={styles.participantsContainer}>
              {Object.entries(groupedByEvent).map(([eventId, participants]) => {
                const eventMeta = eventMetaMap.get(eventId);
                const organizerLabel = eventMeta?.organizerLabel || "";
                const eventName = eventMeta?.eventName || participants[0]?.eventName || "Unknown Event";

                return (
                  <View key={eventId} style={styles.eventBlock}>
                    <View style={styles.eventHeader}>
                      <Text style={styles.eventName}>{eventName}</Text>
                      <Text style={styles.eventOrganizer} numberOfLines={1}>
                        {organizerLabel || " "}
                      </Text>
                    </View>

                    <View style={styles.tableContainer}>
                      <View style={styles.tableHeader}>
                        <View style={styles.numberColumn}>
                          <Text style={styles.tableHeaderText}>#</Text>
                        </View>
                        <View style={styles.nameColumn}>
                          <Text style={styles.tableHeaderText}>Name</Text>
                        </View>
                        <View style={styles.residenceColumn}>
                          <Text style={styles.tableHeaderTextCenter}>Country,Club</Text>
                        </View>
                        <View style={styles.daysColumn}>
                          <Text style={styles.tableHeaderTextCenter}>Days</Text>
                        </View>
                        <View style={styles.totalColumn}>
                          <Text style={styles.tableHeaderTextCenter}>Total</Text>
                        </View>
                        <View style={styles.averageColumn}>
                          <Text style={styles.tableHeaderTextCenter}>Avg/Day</Text>
                        </View>
                      </View>

                      {participants.map((participant, index) => (
                        <View
                          key={participant.participantId || `${participant.registrationId}-${index}`}
                          style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}
                        >
                          <Text style={[styles.tableCellSmall, styles.numberColumn]}>{index + 1}</Text>
                          <Text style={[styles.tableCellSmall, styles.nameColumn]} numberOfLines={1}>
                            {`${participant.firstName} ${participant.otherNames || ""}`.trim()}
                          </Text>
                          <Text
                            style={[
                              styles.tableCellSmall,
                              styles.residenceColumn,
                              styles.tableCellCenter,
                              styles.residenceCellText,
                            ]}
                            numberOfLines={2}
                          >
                            {formatCountryClub(participant.country, participant.club) || "-"}
                          </Text>
                          <Text style={[styles.tableCellSmall, styles.daysColumn, styles.tableCellCenter]}>
                            {participant.qualifiedDays}
                          </Text>
                          <Text style={[styles.tableCellSmall, styles.totalColumn, styles.tableCellCenter]}>
                            {participant.totalDistance.toFixed(1)}
                          </Text>
                          <Text style={[styles.tableCellSmall, styles.averageColumn, styles.tableCellCenter]}>
                            {participant.qualifiedDays > 0
                              ? (participant.totalDistance / participant.qualifiedDays).toFixed(1)
                              : "0.0"}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
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
    color: "#666",
    marginBottom: 8,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    textAlign: "center" as const,
  },
  filterHeader: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#f5f5f5",
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: "#10b981",
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#666",
  },
  filterTextActive: {
    color: "#fff",
  },
  participantsContainer: {
    padding: 12,
    paddingBottom: 24,
  },
  eventBlock: {
    marginBottom: 12,
  },
  eventHeader: {
    backgroundColor: "#10b981",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    gap: 10,
  },
  eventName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#fff",
    flex: 1,
  },
  eventOrganizer: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: "rgba(255, 255, 255, 0.9)",
    maxWidth: "40%",
    textAlign: "right" as const,
  },
  tableContainer: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#f2f4f7",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#10b981",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tableHeaderText: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: "#fff",
  },
  tableHeaderTextCenter: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: "#fff",
    textAlign: "left" as const,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  tableRowAlt: {
    backgroundColor: "#fafafa",
  },
  tableCellSmall: {
    fontSize: 9,
    color: "#333",
    lineHeight: 12,
  },
  tableCellCenter: {
    textAlign: "left" as const,
  },
  residenceCellText: {
    flexWrap: "wrap" as const,
  },
  numberColumn: {
    flex: 0.4,
  },
  nameColumn: {
    flex: 2.1,
  },
  residenceColumn: {
    flex: 2.5,
    textAlign: "left" as const,
  },
  daysColumn: {
    flex: 0.8,
    textAlign: "left" as const,
  },
  totalColumn: {
    flex: 0.9,
    textAlign: "left" as const,
  },
  averageColumn: {
    flex: 1.1,
    textAlign: "left" as const,
  },
});
