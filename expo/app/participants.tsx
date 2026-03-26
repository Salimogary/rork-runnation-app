import { StyleSheet, View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo, useState } from "react";

interface Participant {
  event_name: string;
  first_name: string;
  other_names: string;
  residence: string;
  sex: string;
  registration_id?: string;
}

export default function ParticipantsScreen() {
  const { user, privateMode } = useAuth();
  const [selectedEvent, setSelectedEvent] = useState<string>("all");

  const { data: participants, isLoading, refetch } = useQuery<Participant[]>({
    queryKey: ["event_participants_snapshot"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_participants_snapshot")
        .select("event_name, first_name, other_names, residence, sex")
        .order("event_name", { ascending: true });

      if (error) {
        console.error("Error fetching participants:", error.message);
        throw new Error(error.message || "Failed to fetch participants");
      }

      return data || [];
    },
    staleTime: 30000,
  });

  const eventNames = useMemo(() => {
    if (!participants) return [];
    const names = new Set<string>();
    participants.forEach((p) => {
      if (p.event_name) names.add(p.event_name);
    });
    return Array.from(names).sort();
  }, [participants]);

  const filteredParticipants = useMemo(() => {
    if (!participants) return [];
    let filtered = participants;
    if (privateMode && user?.id) {
      filtered = filtered.filter((p) => p.registration_id !== user.id);
    }
    if (selectedEvent === "all") return filtered;
    return filtered.filter((p) => p.event_name === selectedEvent);
  }, [participants, selectedEvent, privateMode, user?.id]);

  const groupedParticipants = useMemo(() => {
    const grouped: Record<string, Participant[]> = {};
    filteredParticipants.forEach((participant) => {
      const eventName = participant.event_name || "Unknown Event";
      if (!grouped[eventName]) {
        grouped[eventName] = [];
      }
      grouped[eventName].push(participant);
    });
    
    return grouped;
  }, [filteredParticipants]);



  return (
    <>
      <Stack.Screen
        options={{
          title: "Registered Participants",
          headerStyle: {
            backgroundColor: "#10b981",
          },
          headerTintColor: "#fff",
          headerTitleStyle: {
            fontWeight: "700" as const,
          },
        }}
      />
      <View style={styles.container}>
        {eventNames.length > 0 && (
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
              {eventNames.map((eventName) => (
                <TouchableOpacity
                  key={eventName}
                  style={[styles.filterButton, selectedEvent === eventName && styles.filterButtonActive]}
                  onPress={() => setSelectedEvent(eventName)}
                >
                  <Text style={[styles.filterText, selectedEvent === eventName && styles.filterTextActive]}>
                    {eventName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} />
          }
        >
          {isLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Loading participants...</Text>
            </View>
          ) : !participants || participants.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No participants yet</Text>
              <Text style={styles.emptySubtext}>
                Participants will appear here once they enroll
              </Text>
            </View>
          ) : filteredParticipants.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No participants for this event</Text>
              <Text style={styles.emptySubtext}>
                Select a different event or view all
              </Text>
            </View>
          ) : (
            <View style={styles.participantsContainer}>
              {Object.keys(groupedParticipants).map((eventName) => (
                <View key={eventName} style={styles.eventGroup}>
                  <View style={styles.eventHeader}>
                    <Text style={styles.eventName}>{eventName}</Text>
                    <Text style={styles.eventCount}>
                      {groupedParticipants[eventName].length} participant{groupedParticipants[eventName].length !== 1 ? 's' : ''}
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
                        <Text style={styles.tableHeaderTextCenter}>Residence</Text>
                      </View>
                      <View style={styles.sexColumn}>
                        <Text style={styles.tableHeaderTextCenter}>Sex</Text>
                      </View>
                    </View>
                    {groupedParticipants[eventName].map((participant, index) => (
                      <View 
                        key={index} 
                        style={[
                          styles.tableRow,
                          index % 2 === 1 && styles.tableRowAlt
                        ]}
                      >
                        <Text style={[styles.tableCellSmall, styles.numberColumn]}>
                          {index + 1}
                        </Text>
                        <Text style={[styles.tableCellSmall, styles.nameColumn]} numberOfLines={1}>
                          {participant.first_name} {participant.other_names}
                        </Text>
                        <Text style={[styles.tableCellSmall, styles.residenceColumn, styles.tableCellCenter]} numberOfLines={1}>
                          {participant.residence || "-"}
                        </Text>
                        <Text style={[styles.tableCellSmall, styles.sexColumn, styles.tableCellCenter]}>
                          {participant.sex === "Male" ? "M" : participant.sex === "Female" ? "F" : participant.sex || "-"}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
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
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    textAlign: "center" as const,
  },
  participantsContainer: {
    padding: 16,
  },
  eventGroup: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    overflow: "hidden",
  },
  tableContainer: {
    backgroundColor: "#fff",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#10b981",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#fff",
  },
  tableHeaderTextCenter: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#fff",
    textAlign: "center" as const,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  tableRowAlt: {
    backgroundColor: "#fafafa",
  },
  tableCellSmall: {
    fontSize: 11,
    color: "#333",
  },
  tableCellCenter: {
    textAlign: "center" as const,
  },
  numberColumn: {
    flex: 0.6,
  },
  nameColumn: {
    flex: 3,
  },
  residenceColumn: {
    flex: 2.5,
    textAlign: "center" as const,
  },
  sexColumn: {
    flex: 1,
    textAlign: "center" as const,
  },
  eventHeader: {
    backgroundColor: "#10b981",
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eventName: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#fff",
    flex: 1,
  },
  eventCount: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "rgba(255, 255, 255, 0.9)",
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
});
