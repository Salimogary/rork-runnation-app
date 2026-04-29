import { StyleSheet, View, Text, ScrollView, RefreshControl, TouchableOpacity, SectionList } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Award } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo, useState } from "react";
import { formatCountryName } from "@/constants/country-utils";

interface Participant {
  event_id?: string;
  event_name: string;
  starts_at?: string | null;
  ends_at?: string | null;
  organizerLabel?: string;
  first_name: string;
  other_names: string;
  country: string;
  club: string;
  sex: string;
  distance_km?: number | null;
  time_seconds?: number | null;
  registration_id?: string;
}

type RunCategory =
  | "Awaiting Result"
  | "Ungraded"
  | "3K"
  | "5K"
  | "10K"
  | "Half-Marathon"
  | "Marathon";

const RUN_CATEGORY_ORDER: RunCategory[] = [
  "Awaiting Result",
  "Ungraded",
  "3K",
  "5K",
  "10K",
  "Half-Marathon",
  "Marathon",
];

const CATEGORY_STYLES: Record<
  RunCategory,
  {
    backgroundColor: string;
    textColor: string;
    accentColor?: string;
  }
> = {
  "Awaiting Result": {
    backgroundColor: "#F8FAFC",
    textColor: "#475569",
  },
  Ungraded: {
    backgroundColor: "#F3F4F6",
    textColor: "#4B5563",
  },
  "3K": {
    backgroundColor: "#EFF6FF",
    textColor: "#1D4ED8",
  },
  "5K": {
    backgroundColor: "#ECFDF5",
    textColor: "#047857",
  },
  "10K": {
    backgroundColor: "#FFF7ED",
    textColor: "#C2410C",
  },
  "Half-Marathon": {
    backgroundColor: "#FEF3C7",
    textColor: "#A16207",
    accentColor: "#D97706",
  },
  Marathon: {
    backgroundColor: "#FCE7F3",
    textColor: "#BE185D",
    accentColor: "#E11D48",
  },
};

type ParticipantSection = {
  key: string;
  eventName: string;
  eventOrganizerLabel: string;
  category: RunCategory;
  data: Participant[];
  isFirstInEvent: boolean;
};

export default function ParticipantsScreen() {
  const { user, privateMode } = useAuth();
  const params = useLocalSearchParams<{ eventMode?: string }>();
  const [selectedEvent, setSelectedEvent] = useState<string>("all");
  const eventMode = params.eventMode === "same-day" ? "same-day" : "same-day";

  const isOneDayEvent = (startsAt?: string | null, endsAt?: string | null) => {
    if (!startsAt || !endsAt) return false;
    return startsAt.slice(0, 10) === endsAt.slice(0, 10);
  };

  const { data: participants, isLoading, refetch } = useQuery<Participant[]>({
    queryKey: ["event_participants_snapshot"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events_participants")
        .select(`
          registration_id,
          distance_km,
          time_seconds,
          event_id,
          events!events_participants_event_id_fkey(event_name, starts_at, ends_at),
          registrations!events_participants_registration_id_fkey(first_name, other_names, sex, country)
        `)
        .order("event_id", { ascending: true });

      if (error) {
        console.error("Error fetching participants:", error.message);
        throw new Error(error.message || "Failed to fetch participants");
      }

      const registrationIds = (data || [])
        .map((item: any) => item.registration_id)
        .filter(Boolean);
      const eventIds = (data || []).map((item: any) => item.event_id).filter(Boolean);

      const { data: memberships, error: membershipsError } = await supabase
        .from("club_members")
        .select("registration_id, coordinator_id")
        .in("registration_id", registrationIds);

      if (membershipsError) {
        console.error("Error fetching participant clubs:", membershipsError.message);
        throw new Error(membershipsError.message || "Failed to fetch participant clubs");
      }

      const coordinatorIds = Array.from(
        new Set((memberships || []).map((membership: any) => membership.coordinator_id).filter(Boolean))
      );

      let clubByCoordinator = new Map<string, string>();
      if (coordinatorIds.length > 0) {
        const { data: clubs, error: clubsError } = await supabase
          .from("clubs")
          .select("coordinator_id, club_name")
          .in("coordinator_id", coordinatorIds);

        if (clubsError) {
          console.error("Error fetching clubs:", clubsError.message);
          throw new Error(clubsError.message || "Failed to fetch clubs");
        }

        clubByCoordinator = new Map(
          (clubs || []).map((club: any) => [club.coordinator_id, club.club_name || ""])
        );
      }

      const clubByRegistration = new Map(
        (memberships || []).map((membership: any) => [
          membership.registration_id,
          clubByCoordinator.get(membership.coordinator_id) || "",
        ])
      );

      const { data: eventRows, error: eventRowsError } = await supabase
        .from("events")
        .select("event_id, organizer")
        .in("event_id", eventIds);

      if (eventRowsError) {
        console.error("Error fetching event owners:", eventRowsError.message);
        throw new Error(eventRowsError.message || "Failed to fetch event owners");
      }

      const organizerIds = Array.from(
        new Set((eventRows || []).map((eventRow: any) => eventRow.organizer).filter(Boolean))
      );

      let organizerNameMap = new Map<string, string>();
      if (organizerIds.length > 0) {
        const { data: organizers, error: organizersError } = await supabase
          .from("event_organizers")
          .select("organizer_id, organizer_name")
          .in("organizer_id", organizerIds);

        if (organizersError) {
          console.error("Error fetching event organizers:", organizersError.message);
          throw new Error(organizersError.message || "Failed to fetch event organizers");
        }

        organizerNameMap = new Map(
          (organizers || []).map((organizer: any) => [organizer.organizer_id, organizer.organizer_name || ""])
        );
      }

      const eventOwnerMap = new Map(
        (eventRows || []).map((eventRow: any) => [
          eventRow.event_id,
          organizerNameMap.get(eventRow.organizer) || "",
        ])
      );

      return (data || []).map((item: any) => ({
        event_id: item.event_id,
        event_name: item.events?.event_name || "Unknown Event",
        starts_at: item.events?.starts_at || null,
        ends_at: item.events?.ends_at || null,
        organizerLabel: eventOwnerMap.get(item.event_id) || "",
        first_name: item.registrations?.first_name || "",
        other_names: item.registrations?.other_names || "",
        country: item.registrations?.country || "",
        club: clubByRegistration.get(item.registration_id) || "",
        sex: item.registrations?.sex || "",
        distance_km: item.distance_km ?? null,
        time_seconds: item.time_seconds ?? null,
        registration_id: item.registration_id,
      }));
    },
    staleTime: 30000,
  });

  const formatCountryClub = (country?: string, club?: string) =>
    [formatCountryName(country), club].filter(Boolean).join(",");

  const formatDuration = (seconds?: number | null) => {
    if (!seconds || seconds <= 0) return "-";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getPaceLabel = (distanceKm?: number | null, timeSeconds?: number | null) => {
    if (!distanceKm || !timeSeconds || distanceKm <= 0 || timeSeconds <= 0) return "-";
    const kmPerHour = distanceKm / (timeSeconds / 3600);
    return `${kmPerHour.toFixed(1)} km/h`;
  };

  const getPaceValue = (distanceKm?: number | null, timeSeconds?: number | null) => {
    if (!distanceKm || !timeSeconds || distanceKm <= 0 || timeSeconds <= 0) return null;
    return distanceKm / (timeSeconds / 3600);
  };

  const getRunCategory = (participant: Participant): RunCategory => {
    const distance = participant.distance_km;

    if (!distance || distance <= 0 || !participant.time_seconds || participant.time_seconds <= 0) {
      return "Awaiting Result";
    }

    if (distance < 2.5) return "Ungraded";
    if (distance < 4.5) return "3K";
    if (distance < 9.5) return "5K";
    if (distance < 18) return "10K";
    if (distance <= 30) return "Half-Marathon";
    return "Marathon";
  };

  const eventNames = useMemo(() => {
    if (!participants) return [];
    const names = new Set<string>();
    participants
      .filter((participant) => (eventMode === "same-day" ? isOneDayEvent(participant.starts_at, participant.ends_at) : true))
      .forEach((p) => {
      if (p.event_name) names.add(p.event_name);
      });
    return Array.from(names).sort();
  }, [eventMode, participants]);

  const filteredParticipants = useMemo(() => {
    if (!participants) return [];
    let filtered = participants.filter((participant) =>
      eventMode === "same-day" ? isOneDayEvent(participant.starts_at, participant.ends_at) : true
    );
    if (privateMode && user?.id) {
      filtered = filtered.filter((p) => p.registration_id !== user.id);
    }
    if (selectedEvent === "all") return filtered;
    return filtered.filter((p) => p.event_name === selectedEvent);
  }, [participants, selectedEvent, privateMode, user?.id]);

  const groupedParticipants = useMemo(() => {
    const grouped: Record<string, Record<RunCategory, Participant[]>> = {};
    filteredParticipants.forEach((participant) => {
      const eventName = participant.event_name || "Unknown Event";
      if (!grouped[eventName]) {
        grouped[eventName] = {
          "Awaiting Result": [],
          Ungraded: [],
          "3K": [],
          "5K": [],
          "10K": [],
          "Half-Marathon": [],
          Marathon: [],
        };
      }

      const category = getRunCategory(participant);
      grouped[eventName][category].push(participant);
    });

    Object.values(grouped).forEach((categoryMap) => {
      RUN_CATEGORY_ORDER.forEach((category) => {
        categoryMap[category].sort((a, b) => {
          const paceA = getPaceValue(a.distance_km, a.time_seconds);
          const paceB = getPaceValue(b.distance_km, b.time_seconds);

          if (paceA === null && paceB === null) {
            return `${a.first_name} ${a.other_names}`.localeCompare(`${b.first_name} ${b.other_names}`);
          }
          if (paceA === null) return 1;
          if (paceB === null) return -1;
          return paceB - paceA;
        });
      });
    });

    return grouped;
  }, [filteredParticipants]);

  const participantSections = useMemo<ParticipantSection[]>(() => {
    const sections: ParticipantSection[] = [];

    Object.keys(groupedParticipants).forEach((eventName) => {
      const categoryMap = groupedParticipants[eventName];
      const totalCount = Object.values(categoryMap).reduce((sum, list) => sum + list.length, 0);
      let isFirstInEvent = true;

      RUN_CATEGORY_ORDER.forEach((category) => {
        const data = categoryMap[category];
        if (!data.length) return;

        sections.push({
          key: `${eventName}-${category}`,
          eventName,
          eventOrganizerLabel: data[0]?.organizerLabel || "",
          category,
          data,
          isFirstInEvent,
        });

        isFirstInEvent = false;
      });
    });

    return sections;
  }, [groupedParticipants]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Same Day Events",
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
        {isLoading ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Loading participants...</Text>
          </View>
        ) : !participants || participants.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No same day event participants yet</Text>
            <Text style={styles.emptySubtext}>
              Runners will appear here after joining and recording same day event runs.
            </Text>
          </View>
        ) : filteredParticipants.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No same day participants for this event</Text>
            <Text style={styles.emptySubtext}>
              Select a different event or view all
            </Text>
          </View>
        ) : (
          <SectionList
            style={styles.scrollView}
            sections={participantSections}
            keyExtractor={(item, index) => `${item.registration_id || item.first_name}-${index}`}
            stickySectionHeadersEnabled
            refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
            contentContainerStyle={styles.participantsContainer}
            renderItem={({ item, index }) => (
              <View
                style={[
                  styles.tableRow,
                  index % 2 === 1 && styles.tableRowAlt
                ]}
              >
                <Text style={[styles.tableCellSmall, styles.numberColumn]}>
                  {index + 1}
                </Text>
                <Text style={[styles.tableCellSmall, styles.nameColumn]} numberOfLines={1}>
                  {item.first_name} {item.other_names}
                </Text>
                <Text style={[styles.tableCellSmall, styles.residenceColumn, styles.tableCellCenter, styles.residenceCellText]} numberOfLines={2}>
                  {formatCountryClub(item.country, item.club) || "-"}
                </Text>
                <Text style={[styles.tableCellSmall, styles.sexColumn, styles.tableCellCenter]}>
                  {item.sex === "Male" ? "M" : item.sex === "Female" ? "F" : item.sex || "-"}
                </Text>
                <Text style={[styles.tableCellSmall, styles.distanceColumn, styles.tableCellCenter]}>
                  {item.distance_km ? `${item.distance_km.toFixed(1)}` : "-"}
                </Text>
                <Text style={[styles.tableCellSmall, styles.timeColumn, styles.tableCellCenter]}>
                  {formatDuration(item.time_seconds)}
                </Text>
                <Text style={[styles.tableCellSmall, styles.paceColumn, styles.tableCellCenter]}>
                  {getPaceLabel(item.distance_km, item.time_seconds)}
                </Text>
              </View>
            )}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeaderWrap}>
                {section.isFirstInEvent ? (
                  <View style={styles.eventHeader}>
                    <Text style={styles.eventName}>{section.eventName}</Text>
                    <Text style={styles.eventCount} numberOfLines={1}>
                      {section.eventOrganizerLabel || " "}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.tableContainer}>
                    <View
                      style={[
                        styles.categoryBand,
                        { backgroundColor: CATEGORY_STYLES[section.category].backgroundColor },
                      ]}
                    >
                      <View style={styles.categoryBandLabelWrap}>
                        {CATEGORY_STYLES[section.category].accentColor ? (
                          <View
                            style={[
                              styles.categoryBandIcon,
                              { backgroundColor: CATEGORY_STYLES[section.category].accentColor },
                            ]}
                          >
                            <Award size={10} color="#fff" />
                          </View>
                        ) : null}
                        <Text
                          style={[
                            styles.categoryBandTitle,
                            { color: CATEGORY_STYLES[section.category].textColor },
                          ]}
                        >
                          {section.category}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.categoryBandCount,
                          { color: CATEGORY_STYLES[section.category].textColor },
                        ]}
                      >
                        {section.data.length}
                      </Text>
                    </View>
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
                    <View style={styles.sexColumn}>
                      <Text style={styles.tableHeaderTextCenter}>Sex</Text>
                    </View>
                    <View style={styles.distanceColumn}>
                      <Text style={styles.tableHeaderTextCenter}>Dist</Text>
                    </View>
                    <View style={styles.timeColumn}>
                      <Text style={styles.tableHeaderTextCenter}>Time</Text>
                    </View>
                    <View style={styles.paceColumn}>
                      <Text style={styles.tableHeaderTextCenter}>Pace</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}
          />
        )}
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
    padding: 12,
    paddingBottom: 24,
  },
  sectionHeaderWrap: {
    marginBottom: 0,
  },
  tableContainer: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#f2f4f7",
  },
  categoryBand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  categoryBandLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  categoryBandIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryBandTitle: {
    fontSize: 11,
    fontWeight: "800" as const,
  },
  categoryBandCount: {
    fontSize: 11,
    fontWeight: "700" as const,
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
    flex: 2.4,
  },
  residenceColumn: {
    flex: 2.5,
    textAlign: "left" as const,
  },
  sexColumn: {
    flex: 0.7,
    textAlign: "left" as const,
  },
  distanceColumn: {
    flex: 0.9,
    textAlign: "left" as const,
  },
  timeColumn: {
    flex: 1.2,
    textAlign: "left" as const,
  },
  paceColumn: {
    flex: 1.1,
    textAlign: "left" as const,
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
    marginTop: 12,
  },
  eventName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#fff",
    flex: 1,
  },
  eventCount: {
    fontSize: 12,
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
