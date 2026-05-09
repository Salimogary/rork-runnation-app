import { StyleSheet, View, Text, ScrollView, RefreshControl, TouchableOpacity, SectionList } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Award } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WORLD_COUNTRIES } from "@/constants/countries";
import { formatCountryName } from "@/constants/country-utils";

interface Participant {
  event_id?: string;
  event_name: string;
  starts_at?: string | null;
  ends_at?: string | null;
  event_type?: string | null;
  recurrence_weekday?: number | null;
  recurrence_weekdays?: number[] | null;
  medal_min_daily_distance?: number | null;
  medal_min_cumulative_distance?: number | null;
  occurrence_date?: string | null;
  organizerLabel?: string;
  first_name: string;
  other_names: string;
  country: string;
  club: string;
  sex: string;
  distance_km?: number | null;
  time_seconds?: number | null;
  activeDays?: number;
  meetsMinimumDistance?: boolean;
  registration_id?: string;
}

type ResultCategory = "Finishers" | "Participants";

const RESULT_CATEGORY_ORDER: ResultCategory[] = ["Finishers", "Participants"];

const CATEGORY_STYLES: Record<
  ResultCategory,
  {
    backgroundColor: string;
    textColor: string;
    accentColor?: string;
  }
> = {
  Finishers: {
    backgroundColor: "#ECFDF5",
    textColor: "#047857",
    accentColor: "#10B981",
  },
  Participants: {
    backgroundColor: "#FEF2F2",
    textColor: "#B91C1C",
    accentColor: "#EF4444",
  },
};

const countryCodeByName = new Map(
  WORLD_COUNTRIES.map((country) => [country.name.trim().toLowerCase(), country.iso_alpha2.toUpperCase()])
);

function getCountryFlag(country?: string | null) {
  const trimmed = String(country || "").trim();
  if (!trimmed) return "";
  const code = trimmed.length === 2 ? trimmed.toUpperCase() : countryCodeByName.get(trimmed.toLowerCase());
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...[...code].map((char) => 127397 + char.charCodeAt(0)));
}

function isOneDayEvent(startsAt?: string | null, endsAt?: string | null) {
  if (!startsAt || !endsAt) return false;
  return startsAt.slice(0, 10) === endsAt.slice(0, 10);
}

function getEventKind(participant: Pick<Participant, "starts_at" | "ends_at" | "event_type">) {
  if (participant.event_type === "recurring") return "recurring";
  if (participant.event_type === "multiday") return "multiday";
  return isOneDayEvent(participant.starts_at, participant.ends_at) ? "same-day" : "multiday";
}

function formatEventDateRange(startsAt?: string | null, endsAt?: string | null) {
  if (!startsAt && !endsAt) return "";
  const formatCompactDate = (value?: string | null) => {
    const dateOnly = getDateOnly(value);
    if (!dateOnly) return "";
    const [year, month, day] = dateOnly.split("-");
    return `${Number(day)}/${Number(month)}/${String(year).slice(-2)}`;
  };
  if (!startsAt) return formatCompactDate(endsAt);
  if (!endsAt || startsAt.slice(0, 10) === endsAt.slice(0, 10)) return formatCompactDate(startsAt);
  return `${formatCompactDate(startsAt)}-${formatCompactDate(endsAt)}`;
}

function getClubOrganizerLabel(participant: Participant) {
  return participant.club || participant.organizerLabel || "Unassigned";
}

function getDateOnly(dateString?: string | null) {
  if (!dateString) return "";
  return String(dateString).slice(0, 10);
}

function getUtcDayNumber(dateString?: string | null) {
  const dateOnly = getDateOnly(dateString);
  if (!dateOnly) return null;
  const [year, month, day] = dateOnly.split("-").map(Number);
  if (!year || !month || !day) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function getUtcWeekday(dateString?: string | null) {
  const dateOnly = getDateOnly(dateString);
  if (!dateOnly) return null;
  const [year, month, day] = dateOnly.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function getEventDurationDays(startsAt?: string | null, endsAt?: string | null) {
  const startDay = getUtcDayNumber(startsAt);
  const endDay = getUtcDayNumber(endsAt);
  if (startDay === null || endDay === null) return 1;
  return Math.max(1, endDay - startDay + 1);
}

function getCurrentEventDay(startsAt?: string | null, endsAt?: string | null) {
  const startDay = getUtcDayNumber(startsAt);
  if (startDay === null) return 1;
  const todayDay = getUtcDayNumber(new Date().toISOString());
  if (todayDay === null) return 1;
  const durationDays = getEventDurationDays(startsAt, endsAt);
  return Math.min(Math.max(1, todayDay - startDay + 1), durationDays);
}

function getAveragePaceSeconds(distanceKm?: number | null, timeSeconds?: number | null) {
  if (!distanceKm || !timeSeconds || distanceKm <= 0 || timeSeconds <= 0) return null;
  return timeSeconds / distanceKm;
}

function getAverageDistance(distanceKm?: number | null, activeDays?: number) {
  if (!distanceKm || !activeDays || distanceKm <= 0 || activeDays <= 0) return 0;
  return distanceKm / activeDays;
}

function getActivityDurationSeconds(startTime?: string | null, endTime?: string | null) {
  if (!startTime || !endTime) return 0;
  const [startHours, startMinutes, startSeconds = 0] = startTime.split(":").map(Number);
  const [endHours, endMinutes, endSeconds = 0] = endTime.split(":").map(Number);
  if (
    Number.isNaN(startHours) ||
    Number.isNaN(startMinutes) ||
    Number.isNaN(endHours) ||
    Number.isNaN(endMinutes)
  ) {
    return 0;
  }

  let startTotal = startHours * 3600 + startMinutes * 60 + startSeconds;
  let endTotal = endHours * 3600 + endMinutes * 60 + endSeconds;
  if (endTotal < startTotal) endTotal += 24 * 3600;
  return Math.max(0, endTotal - startTotal);
}

type ParticipantSection = {
  key: string;
  eventName: string;
  eventDateLabel: string;
  eventOrganizerLabel: string;
  category: ResultCategory;
  data: Participant[];
  isFirstInEvent: boolean;
};

export default function ParticipantsScreen() {
  const { user, privateMode } = useAuth();
  const params = useLocalSearchParams<{ eventMode?: string }>();
  const [selectedEvent, setSelectedEvent] = useState<string>("all");
  const [selectedCountry, setSelectedCountry] = useState<string>("all");
  const [selectedClubOrganizer, setSelectedClubOrganizer] = useState<string>("all");
  const [selectedSex, setSelectedSex] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<"event" | "country" | "club" | "sex" | null>(null);
  const eventMode = params.eventMode === "multiday" ? "multiday" : params.eventMode === "recurring" ? "recurring" : "same-day";
  const screenTitle = eventMode === "multiday" ? "Multiday Events" : eventMode === "recurring" ? "Recurring Events" : "Same Day Events";
  const participantLabel = eventMode === "multiday" ? "multiday" : eventMode === "recurring" ? "recurring" : "same day";

  const matchesEventMode = useCallback((participant: Participant) => {
    return getEventKind(participant) === eventMode;
  }, [eventMode]);

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
          events!events_participants_event_id_fkey(event_name, starts_at, ends_at, event_type, recurrence_weekday, recurrence_weekdays, medal_min_daily_distance, medal_min_cumulative_distance),
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
      const uniqueRegistrationIds = Array.from(new Set(registrationIds));

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

      let activitiesByRegistration = new Map<string, any[]>();
      if (uniqueRegistrationIds.length > 0) {
        const { data: activityRows, error: activitiesError } = await supabase
          .from("activities")
          .select("registration_id, activity_date, distance_km, start_time, end_time")
          .in("registration_id", uniqueRegistrationIds);

        if (activitiesError) {
          console.error("Error fetching participant activities:", activitiesError.message);
          throw new Error(activitiesError.message || "Failed to fetch participant activities");
        }

        activitiesByRegistration = new Map();
        (activityRows || []).forEach((activity: any) => {
          const regId = activity.registration_id;
          const activityDate = getDateOnly(activity.activity_date);
          if (!regId || !activityDate) return;
          if (!activitiesByRegistration.has(regId)) {
            activitiesByRegistration.set(regId, []);
          }
          activitiesByRegistration.get(regId)?.push({
            ...activity,
            activityDate,
          });
        });
      }

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

      return (data || []).flatMap((item: any): Participant[] => {
        const startDate = getDateOnly(item.events?.starts_at);
        const endDate = getDateOnly(item.events?.ends_at);
        const eventKind = getEventKind({
          starts_at: item.events?.starts_at,
          ends_at: item.events?.ends_at,
          event_type: item.events?.event_type ?? null,
        });
        const eventActivities = (activitiesByRegistration.get(item.registration_id) || []).filter((activity) => {
          const activityDate = activity.activityDate;
          if (startDate && activityDate < startDate) return false;
          if (endDate && activityDate > endDate) return false;
          if (eventKind === "recurring") {
            const recurrenceWeekdays = Array.isArray(item.events?.recurrence_weekdays)
              ? item.events.recurrence_weekdays.map(Number)
              : item.events?.recurrence_weekday !== null && item.events?.recurrence_weekday !== undefined
              ? [Number(item.events.recurrence_weekday)]
              : [];
            if (recurrenceWeekdays.length > 0 && !recurrenceWeekdays.includes(Number(getUtcWeekday(activityDate)))) {
              return false;
            }
          }
          return true;
        });
        const activeDays = new Set(eventActivities.map((activity) => activity.activityDate)).size;
        const multidayDistanceKm = eventActivities.reduce(
          (sum, activity) => sum + (Number(activity.distance_km) || 0),
          0
        );
        const multidayTimeSeconds = eventActivities.reduce(
          (sum, activity) => sum + getActivityDurationSeconds(activity.start_time, activity.end_time),
          0
        );

        const baseParticipant = {
          event_id: item.event_id,
          event_name: item.events?.event_name || "Unknown Event",
          starts_at: item.events?.starts_at || null,
          ends_at: item.events?.ends_at || null,
          event_type: item.events?.event_type || null,
          recurrence_weekday: item.events?.recurrence_weekday ?? null,
          recurrence_weekdays: item.events?.recurrence_weekdays ?? null,
          medal_min_daily_distance: item.events?.medal_min_daily_distance ?? null,
          medal_min_cumulative_distance: item.events?.medal_min_cumulative_distance ?? null,
          organizerLabel: eventOwnerMap.get(item.event_id) || "",
          first_name: item.registrations?.first_name || "",
          other_names: item.registrations?.other_names || "",
          country: item.registrations?.country || "",
          club: clubByRegistration.get(item.registration_id) || "",
          sex: item.registrations?.sex || "",
          activeDays,
          registration_id: item.registration_id,
        };

        const minDailyDistance = Number(item.events?.medal_min_daily_distance) || 0;
        const minCumulativeDistance = Number(item.events?.medal_min_cumulative_distance) || 0;
        const hasResult = multidayDistanceKm > 0 && multidayTimeSeconds > 0;
        const dailyTotals = new Map<string, number>();
        eventActivities.forEach((activity) => {
          const current = dailyTotals.get(activity.activityDate) || 0;
          dailyTotals.set(activity.activityDate, current + (Number(activity.distance_km) || 0));
        });
        const meetsDailyMinimum =
          minDailyDistance <= 0 ||
          (dailyTotals.size > 0 && Array.from(dailyTotals.values()).every((distanceKm) => distanceKm >= minDailyDistance));
        const meetsCumulativeMinimum = minCumulativeDistance <= 0 || multidayDistanceKm >= minCumulativeDistance;
        const meetsEventMinimum = hasResult && meetsDailyMinimum && meetsCumulativeMinimum;

        if (eventKind === "recurring") {
          if (!eventActivities.length) {
            return [{
              ...baseParticipant,
              occurrence_date: null,
              distance_km: null,
              time_seconds: null,
              activeDays: 0,
              meetsMinimumDistance: false,
            }];
          }

          const byDate = new Map<string, { distanceKm: number; timeSeconds: number }>();
          eventActivities.forEach((activity) => {
            const existing = byDate.get(activity.activityDate) || { distanceKm: 0, timeSeconds: 0 };
            existing.distanceKm += Number(activity.distance_km) || 0;
            existing.timeSeconds += getActivityDurationSeconds(activity.start_time, activity.end_time);
            byDate.set(activity.activityDate, existing);
          });

          return Array.from(byDate.entries()).map(([activityDate, totals]) => ({
            ...baseParticipant,
            occurrence_date: activityDate,
            distance_km: totals.distanceKm,
            time_seconds: totals.timeSeconds,
            activeDays: 1,
            meetsMinimumDistance:
              totals.distanceKm > 0 &&
              totals.timeSeconds > 0 &&
              (minDailyDistance <= 0 || totals.distanceKm >= minDailyDistance),
          }));
        }

        return [{
          ...baseParticipant,
          occurrence_date: null,
          distance_km: eventKind === "multiday" ? multidayDistanceKm : item.distance_km ?? null,
          time_seconds: eventKind === "multiday" ? multidayTimeSeconds : item.time_seconds ?? null,
          meetsMinimumDistance:
            eventKind === "multiday"
              ? meetsEventMinimum
              : Boolean(
                  item.distance_km &&
                    item.time_seconds &&
                    item.distance_km > 0 &&
                    item.time_seconds > 0 &&
                    (minDailyDistance <= 0 || item.distance_km >= minDailyDistance)
                ),
        }];
      });
    },
    staleTime: 30000,
  });

  const formatDuration = (seconds?: number | null) => {
    if (!seconds || seconds <= 0) return "-";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDistance = (distanceKm?: number | null) => {
    if (!distanceKm || distanceKm <= 0) return "-";
    return distanceKm.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  };

  const getPaceLabel = (distanceKm?: number | null, timeSeconds?: number | null) => {
    if (!distanceKm || !timeSeconds || distanceKm <= 0 || timeSeconds <= 0) return "-";
    const totalSecondsPerKm = Math.round(timeSeconds / distanceKm);
    const minutes = Math.floor(totalSecondsPerKm / 60);
    const seconds = totalSecondsPerKm % 60;
    return `${minutes}'${seconds.toString().padStart(2, "0")}"`;
  };

  const getPaceValue = (distanceKm?: number | null, timeSeconds?: number | null) => {
    if (!distanceKm || !timeSeconds || distanceKm <= 0 || timeSeconds <= 0) return null;
    return distanceKm / (timeSeconds / 3600);
  };

  const getResultCategory = (participant: Participant): ResultCategory => {
    return participant.meetsMinimumDistance ? "Finishers" : "Participants";
  };

  const eventNames = useMemo(() => {
    if (!participants) return [];
    const names = new Set<string>();
    participants
      .filter(matchesEventMode)
      .filter((participant) => (privateMode && user?.id ? participant.registration_id !== user.id : true))
      .forEach((p) => {
      if (p.event_name) names.add(p.event_name);
      });
    return Array.from(names).sort();
  }, [matchesEventMode, participants, privateMode, user?.id]);

  const eventFilteredParticipants = useMemo(() => {
    if (!participants) return [];
    let filtered = participants.filter(matchesEventMode);
    if (privateMode && user?.id) {
      filtered = filtered.filter((p) => p.registration_id !== user.id);
    }
    if (selectedEvent === "all") return filtered;
    return filtered.filter((p) => p.event_name === selectedEvent);
  }, [matchesEventMode, participants, selectedEvent, privateMode, user?.id]);

  const countryOptions = useMemo(() => {
    const countries = new Set<string>();
    eventFilteredParticipants.forEach((participant) => {
      if (participant.country) countries.add(participant.country);
    });
    return Array.from(countries).sort((a, b) =>
      (formatCountryName(a) || a).localeCompare(formatCountryName(b) || b)
    );
  }, [eventFilteredParticipants]);

  const countryFilteredParticipants = useMemo(() => {
    if (selectedCountry === "all") return eventFilteredParticipants;
    return eventFilteredParticipants.filter((participant) => participant.country === selectedCountry);
  }, [eventFilteredParticipants, selectedCountry]);

  const clubOrganizerOptions = useMemo(() => {
    const labels = new Set<string>();
    countryFilteredParticipants.forEach((participant) => {
      labels.add(getClubOrganizerLabel(participant));
    });
    return Array.from(labels).sort();
  }, [countryFilteredParticipants]);

  const clubOrganizerFilteredParticipants = useMemo(() => {
    if (selectedClubOrganizer === "all") return countryFilteredParticipants;
    return countryFilteredParticipants.filter(
      (participant) => getClubOrganizerLabel(participant) === selectedClubOrganizer
    );
  }, [countryFilteredParticipants, selectedClubOrganizer]);

  const sexOptions = useMemo(() => {
    const sexes = new Set<string>();
    clubOrganizerFilteredParticipants.forEach((participant) => {
      if (participant.sex) sexes.add(participant.sex);
    });
    return Array.from(sexes).sort();
  }, [clubOrganizerFilteredParticipants]);

  const filteredParticipants = useMemo(() => {
    if (selectedSex === "all") return clubOrganizerFilteredParticipants;
    return clubOrganizerFilteredParticipants.filter((participant) => participant.sex === selectedSex);
  }, [clubOrganizerFilteredParticipants, selectedSex]);

  useEffect(() => {
    setSelectedCountry("all");
    setSelectedClubOrganizer("all");
    setSelectedSex("all");
  }, [selectedEvent]);

  useEffect(() => {
    setSelectedClubOrganizer("all");
    setSelectedSex("all");
  }, [selectedCountry]);

  useEffect(() => {
    setSelectedSex("all");
  }, [selectedClubOrganizer]);

  const groupedParticipants = useMemo(() => {
    const grouped: Record<string, Record<ResultCategory, Participant[]>> = {};
    filteredParticipants.forEach((participant) => {
      const eventName = participant.event_name || "Unknown Event";
      const recurringDateLabel = eventMode === "recurring" ? participant.occurrence_date || "Awaiting activity" : "";
      const groupKey = eventMode === "recurring" ? `${eventName}__${recurringDateLabel}` : eventName;
      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          Finishers: [],
          Participants: [],
        };
      }

      const category = getResultCategory(participant);
      grouped[groupKey][category].push(participant);
    });

    Object.values(grouped).forEach((categoryMap) => {
      RESULT_CATEGORY_ORDER.forEach((category) => {
        categoryMap[category].sort((a, b) => {
          if (eventMode === "multiday") {
            const activeDaysDiff = (b.activeDays || 0) - (a.activeDays || 0);
            if (activeDaysDiff !== 0) return activeDaysDiff;

            const distanceDiff =
              getAverageDistance(b.distance_km, b.activeDays) -
              getAverageDistance(a.distance_km, a.activeDays);
            if (distanceDiff !== 0) return distanceDiff;

            const paceA = getAveragePaceSeconds(a.distance_km, a.time_seconds);
            const paceB = getAveragePaceSeconds(b.distance_km, b.time_seconds);
            if (paceA === null && paceB === null) {
              return `${a.first_name} ${a.other_names}`.localeCompare(`${b.first_name} ${b.other_names}`);
            }
            if (paceA === null) return 1;
            if (paceB === null) return -1;
            return paceA - paceB;
          }

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
  }, [eventMode, filteredParticipants]);

  const participantSections = useMemo<ParticipantSection[]>(() => {
    const sections: ParticipantSection[] = [];

    Object.keys(groupedParticipants).forEach((groupKey) => {
      const categoryMap = groupedParticipants[groupKey];
      let isFirstInEvent = true;

      RESULT_CATEGORY_ORDER.forEach((category) => {
        const data = categoryMap[category];
        if (!data.length) return;
        const displayEventName = data[0]?.event_name || groupKey.split("__")[0] || "Unknown Event";
        const recurringDate = data[0]?.occurrence_date || null;

        sections.push({
          key: `${groupKey}-${category}`,
          eventName: displayEventName,
          eventDateLabel: eventMode === "recurring"
            ? recurringDate
              ? formatEventDateRange(recurringDate, recurringDate)
              : "Awaiting activity"
            : formatEventDateRange(data[0]?.starts_at, data[0]?.ends_at),
          eventOrganizerLabel: data[0]?.organizerLabel || "",
          category,
          data,
          isFirstInEvent,
        });

        isFirstInEvent = false;
      });
    });

    return sections;
  }, [eventMode, groupedParticipants]);

  const renderFilterDropdown = (
    id: "event" | "country" | "club" | "sex",
    label: string,
    allLabel: string,
    selectedValue: string,
    onSelect: (value: string) => void,
    options: string[],
    formatOption: (value: string) => string = (value) => value
  ) => (
    <View style={styles.dropdownWrap}>
      <TouchableOpacity
        style={[styles.dropdownButton, activeFilter === id && styles.dropdownButtonActive]}
        onPress={() => setActiveFilter((current) => (current === id ? null : id))}
      >
        <Text style={[styles.dropdownLabel, activeFilter === id && styles.dropdownLabelActive]} numberOfLines={1}>
          {selectedValue === "all" ? label : formatOption(selectedValue)}
        </Text>
        <Text style={[styles.dropdownChevron, activeFilter === id && styles.dropdownLabelActive]}>⌄</Text>
      </TouchableOpacity>
      {activeFilter === id ? (
        <View style={styles.dropdownPanel}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {[{ value: "all", label: allLabel }, ...options.map((option) => ({ value: option, label: formatOption(option) }))].map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.dropdownOption,
                  selectedValue === option.value && styles.dropdownOptionActive,
                ]}
                onPress={() => {
                  onSelect(option.value);
                  setActiveFilter(null);
                }}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    selectedValue === option.value && styles.dropdownOptionTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: screenTitle,
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
            {renderFilterDropdown("event", "Event", "All Events", selectedEvent, setSelectedEvent, eventNames)}
            {renderFilterDropdown("country", "Country", "All Countries", selectedCountry, setSelectedCountry, countryOptions, (country) =>
              `${getCountryFlag(country)} ${formatCountryName(country) || country}`.trim()
            )}
            {renderFilterDropdown(
              "club",
              "Club/Organizer",
              "All Clubs",
              selectedClubOrganizer,
              setSelectedClubOrganizer,
              clubOrganizerOptions
            )}
            {renderFilterDropdown("sex", "Sex", "All Sex", selectedSex, setSelectedSex, sexOptions)}
          </View>
        )}
        {isLoading ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Loading participants...</Text>
          </View>
        ) : !participants || participants.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No {participantLabel} event participants yet</Text>
            <Text style={styles.emptySubtext}>
              Runners will appear here after joining and recording {participantLabel} event runs.
            </Text>
          </View>
        ) : filteredParticipants.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No {participantLabel} participants for this event</Text>
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
            renderItem={({ item, index }) => {
              const activeDays = item.activeDays || 0;
              const eventDay = getCurrentEventDay(item.starts_at, item.ends_at);
              const isOnTrack = activeDays === eventDay;

              return (
                <View
                  style={[
                    styles.tableRow,
                    index % 2 === 1 && styles.tableRowAlt
                  ]}
                >
                  <View style={[styles.numberColumn, styles.rankCell]}>
                    <Text style={styles.flagText}>{getCountryFlag(item.country)}</Text>
                    <Text style={styles.rankText}>{index + 1}</Text>
                  </View>
                  <Text style={[styles.tableCellSmall, styles.nameColumn]} numberOfLines={1}>
                    {item.first_name} {item.other_names}
                  </Text>
                  <Text style={[styles.tableCellSmall, styles.clubColumn, styles.tableCellCenter, styles.clubCellText]} numberOfLines={1}>
                    {item.club || "-"}
                  </Text>
                  <Text style={[styles.tableCellSmall, styles.sexColumn, styles.tableCellCenter]}>
                    {item.sex === "Male" ? "M" : item.sex === "Female" ? "F" : item.sex || "-"}
                  </Text>
                  {eventMode === "multiday" ? (
                    <View style={styles.dayColumn}>
                      <Text style={[styles.dayCellText, isOnTrack ? styles.dayCellOnTrack : styles.dayCellBehind]}>
                        {activeDays}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={[styles.tableCellSmall, styles.distanceColumn, styles.tableCellCenter]}>
                    {formatDistance(item.distance_km)}
                  </Text>
                  <Text style={[styles.tableCellSmall, styles.timeColumn, styles.tableCellCenter]}>
                    {formatDuration(item.time_seconds)}
                  </Text>
                  <Text style={[styles.tableCellSmall, styles.paceColumn, styles.tableCellCenter]}>
                    {getPaceLabel(item.distance_km, item.time_seconds)}
                  </Text>
                </View>
              );
            }}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeaderWrap}>
                {section.isFirstInEvent ? (
                  <View style={styles.eventHeader}>
                    <Text style={styles.eventName} numberOfLines={1}>
                      {section.eventName}
                    </Text>
                    <Text style={styles.eventMetaSmall} numberOfLines={1}>
                      {section.eventDateLabel || " "}
                    </Text>
                    <Text style={styles.eventMetaSmall} numberOfLines={1}>
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
                    <View style={styles.clubColumn}>
                      <Text style={styles.tableHeaderTextCenter}>Club</Text>
                    </View>
                    <View style={styles.sexColumn}>
                      <Text style={styles.tableHeaderTextCenter}>Sex</Text>
                    </View>
                    {eventMode === "multiday" ? (
                      <View style={styles.dayColumn}>
                        <Text style={styles.tableHeaderTextCenter}>Days</Text>
                      </View>
                    ) : null}
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
    padding: 6,
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
    paddingHorizontal: 4,
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: "700" as const,
    color: "#fff",
  },
  tableHeaderTextCenter: {
    fontSize: 8,
    fontWeight: "700" as const,
    color: "#fff",
    textAlign: "left" as const,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    alignItems: "center",
  },
  tableRowAlt: {
    backgroundColor: "#fafafa",
  },
  tableCellSmall: {
    fontSize: 8,
    color: "#333",
    lineHeight: 12,
  },
  tableCellCenter: {
    textAlign: "left" as const,
  },
  clubCellText: {
    flexWrap: "wrap" as const,
  },
  numberColumn: {
    flex: 0.72,
    minWidth: 28,
  },
  nameColumn: {
    flex: 1.75,
    minWidth: 58,
  },
  clubColumn: {
    flex: 1.5,
    minWidth: 52,
    textAlign: "left" as const,
  },
  sexColumn: {
    flex: 0.48,
    minWidth: 20,
    textAlign: "left" as const,
  },
  dayColumn: {
    flex: 0.7,
    minWidth: 30,
    alignItems: "flex-start" as const,
  },
  distanceColumn: {
    flex: 1.12,
    minWidth: 46,
    textAlign: "left" as const,
  },
  timeColumn: {
    flex: 1.18,
    minWidth: 48,
    textAlign: "left" as const,
  },
  paceColumn: {
    flex: 0.9,
    minWidth: 40,
    textAlign: "left" as const,
  },
  rankCell: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
  },
  flagText: {
    fontSize: 9,
    lineHeight: 12,
  },
  rankText: {
    color: "#333",
    fontSize: 8,
    fontWeight: "700" as const,
    lineHeight: 12,
  },
  dayCellText: {
    borderRadius: 8,
    color: "#fff",
    fontSize: 8,
    fontWeight: "800" as const,
    lineHeight: 13,
    minWidth: 18,
    overflow: "hidden" as const,
    paddingHorizontal: 5,
    textAlign: "center" as const,
  },
  dayCellOnTrack: {
    backgroundColor: "#16a34a",
  },
  dayCellBehind: {
    backgroundColor: "#dc2626",
  },
  eventHeader: {
    backgroundColor: "#10b981",
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    marginTop: 8,
    gap: 6,
  },
  eventName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#fff",
    flex: 1.35,
  },
  eventMetaSmall: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: "rgba(255, 255, 255, 0.9)",
    flex: 1,
  },
  filterHeader: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    zIndex: 20,
    elevation: 20,
  },
  dropdownWrap: {
    flex: 1,
    position: "relative" as const,
  },
  dropdownButton: {
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  dropdownButtonActive: {
    backgroundColor: "#10b981",
  },
  dropdownLabel: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#666",
  },
  dropdownChevron: {
    fontSize: 10,
    fontWeight: "900" as const,
    color: "#666",
  },
  dropdownLabelActive: {
    color: "#fff",
  },
  dropdownPanel: {
    position: "absolute" as const,
    top: 34,
    left: 0,
    minWidth: 170,
    maxHeight: 220,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 24,
    zIndex: 30,
    overflow: "hidden" as const,
  },
  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownOptionActive: {
    backgroundColor: "#ecfdf5",
  },
  dropdownOptionText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "600" as const,
  },
  dropdownOptionTextActive: {
    color: "#047857",
  },
});
