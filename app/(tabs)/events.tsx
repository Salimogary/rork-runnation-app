import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  RefreshControl,
  Alert,
  Modal,
  Share,
  Linking,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Award, Calendar, Car, ChevronDown, Clock3, Globe2, List, MapPin, CheckCircle2, Plus, Users } from "lucide-react-native";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { trpc } from "@/lib/trpc";
import appColors from "@/constants/colors";
import { formatCountryName } from "@/constants/country-utils";
import { formatDate } from "../../utils/date";
import { useAuth } from "@/contexts/AuthContext";
import { getServerClient } from "@/lib/server-client";

type EventScope = "local" | "all" | "virtual";
type EventEntryMode = "free" | "club_approved" | "paid";
type EventTypeFilter = "all" | "same_day" | "recurring" | "multiday";
type EventViewMode = "cards" | "table";
type EventTimeTab = "active" | "closed";
type EventsMainTab = "events" | "rideShare" | "accommodation";
type SelectorMode = "filters" | null;
type RideContactPreference = "any" | "calls_only" | "whatsapp_only";
type RideDriverSex = "Male" | "Female";
type RideBootSpace = "none" | "some";
type RideVehicleType = "passenger_car_light" | "van" | "bus";
type AccommodationType = "single" | "shared" | "mixed";
type LodgingType =
  | "private_home"
  | "airbnb"
  | "guest_house"
  | "motel"
  | "hotel"
  | "campsite"
  | "other";
type AccommodationFeature =
  | "breakfast"
  | "security_guard"
  | "access_24_7"
  | "restaurant"
  | "parking"
  | "cctv"
  | "reception_24_7";
type ContactFilter = "all" | RideContactPreference;
type PriceFilter = "all" | "free" | "paid";

const RIDE_CONTACT_PREFERENCE_OPTIONS: { value: RideContactPreference; label: string }[] = [
  { value: "calls_only", label: "Calls only" },
  { value: "whatsapp_only", label: "WhatsApp only" },
  { value: "any", label: "Any" },
];

const RIDE_DRIVER_SEX_OPTIONS: { value: RideDriverSex; label: string }[] = [
  { value: "Male", label: "Male driver" },
  { value: "Female", label: "Female driver" },
];

const RIDE_BOOT_SPACE_OPTIONS: { value: RideBootSpace; label: string }[] = [
  { value: "none", label: "No space" },
  { value: "some", label: "Have some space" },
];

const RIDE_VEHICLE_TYPE_OPTIONS: { value: RideVehicleType; label: string; maxSeats: number }[] = [
  { value: "passenger_car_light", label: "Passenger car (light)", maxSeats: 7 },
  { value: "van", label: "Van", maxSeats: 14 },
  { value: "bus", label: "Bus", maxSeats: 49 },
];

const ACCOMMODATION_FEATURE_OPTIONS: { value: AccommodationFeature; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "security_guard", label: "Security guard" },
  { value: "access_24_7", label: "24/7 access" },
  { value: "restaurant", label: "Restaurant" },
  { value: "parking", label: "Parking" },
  { value: "cctv", label: "CCTV" },
  { value: "reception_24_7", label: "24/7 reception" },
];

const LODGING_TYPE_OPTIONS: { value: LodgingType; label: string }[] = [
  { value: "private_home", label: "Private home" },
  { value: "airbnb", label: "AirBnB" },
  { value: "guest_house", label: "Guest House" },
  { value: "motel", label: "Motel" },
  { value: "hotel", label: "Hotel" },
  { value: "campsite", label: "Campsite" },
  { value: "other", label: "Other" },
];

function formatRideContactPreference(value?: string | null) {
  return RIDE_CONTACT_PREFERENCE_OPTIONS.find((option) => option.value === value)?.label || "Any";
}

function formatRideDriverSex(value?: string | null) {
  return RIDE_DRIVER_SEX_OPTIONS.find((option) => option.value === value)?.label || "Driver sex";
}

function formatRideBootSpace(value?: string | null) {
  return RIDE_BOOT_SPACE_OPTIONS.find((option) => option.value === value)?.label || "Boot space";
}

function getRideVehicleTypeOption(value?: string | null) {
  return RIDE_VEHICLE_TYPE_OPTIONS.find((option) => option.value === value) || RIDE_VEHICLE_TYPE_OPTIONS[0];
}

function formatRideVehicleType(value?: string | null) {
  return getRideVehicleTypeOption(value).label;
}

function formatAccommodationType(value?: string | null) {
  if (value === "shared") return "Shared accommodation";
  if (value === "mixed") return "Mixed accommodation";
  return "Single accommodation";
}

function formatAccommodationFeature(value?: string | null) {
  return ACCOMMODATION_FEATURE_OPTIONS.find((option) => option.value === value)?.label || String(value || "");
}

function formatLodgingType(value?: string | null) {
  return LODGING_TYPE_OPTIONS.find((option) => option.value === value)?.label || String(value || "");
}

function cleanPhoneNumber(value?: string | null) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function buildWhatsAppUrl(contact?: string | null, message = "") {
  const phone = cleanPhoneNumber(contact).replace(/^\+/, "");
  return phone ? `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ""}` : "";
}

function encodeBase64(input: string) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  let index = 0;
  while (index < input.length) {
    const chr1 = input.charCodeAt(index++);
    const chr2 = input.charCodeAt(index++);
    const chr3 = input.charCodeAt(index++);
    const enc1 = chr1 >> 2;
    const enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
    const enc3 = Number.isNaN(chr2) ? 64 : ((chr2 & 15) << 2) | (chr3 >> 6);
    const enc4 = Number.isNaN(chr3) ? 64 : chr3 & 63;
    output += chars.charAt(enc1) + chars.charAt(enc2) + chars.charAt(enc3) + chars.charAt(enc4);
  }
  return output;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function normalizeCountryCode(country?: string | null) {
  const value = String(country || "").trim().toLowerCase();
  if (!value) return "";
  if (["ug", "uga", "uganda"].includes(value)) return "UG";
  return value.slice(0, 2).toUpperCase();
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isOneDayEvent(startsAt?: string | null, endsAt?: string | null) {
  if (!startsAt || !endsAt) return false;
  return startsAt.slice(0, 10) === endsAt.slice(0, 10);
}

function formatShortEventDate(dateString?: string | null) {
  const dateOnly = String(dateString || "").slice(0, 10);
  if (!dateOnly) return "";
  const [year, month, day] = dateOnly.split("-");
  if (!year || !month || !day) return "";
  return `${Number(day)}/${Number(month)}/${String(year).slice(-2)}`;
}

function formatFullEventDate(dateString?: string | null) {
  const dateOnly = String(dateString || "").slice(0, 10);
  if (!dateOnly) return "";
  const [year, month, day] = dateOnly.split("-");
  if (!year || !month || !day) return "";
  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
}

function formatTableEventDate(dateString?: string | null) {
  const raw = String(dateString || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return formatShortEventDate(dateString);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).replace(" ", "-");
}

function padDatePart(value: number) {
  return value.toString().padStart(2, "0");
}

function formatLocalDateTimeInput(date: Date) {
  return [
    `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`,
    `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`,
  ].join("T");
}

function formatRideDateTimeField(value?: string | null) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const firstOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(firstOffset).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

function formatEventMetaDate(startsAt?: string | null, endsAt?: string | null) {
  const start = formatShortEventDate(startsAt);
  const end = formatShortEventDate(endsAt);
  if (!start) return end;
  if (!end || isOneDayEvent(startsAt, endsAt)) return start;
  return `${start}-${end}`;
}

function formatEventCardDate(item: any) {
  const eventType = getEventType(item);
  const startsAt = item?.starts_at || item?.startsAt;
  const endsAt = eventType === "same_day" || eventType === "recurring"
    ? startsAt
    : item?.ends_at || item?.endsAt;
  return formatEventMetaDate(startsAt, endsAt);
}

function formatEventDatesSummary(item: any) {
  const start = formatShortEventDate(item?.starts_at || item?.startsAt);
  const end = formatShortEventDate(item?.ends_at || item?.endsAt);
  const close = formatShortEventDate(item?.registration_closes_at || item?.registrationClosesAt);
  const eventType = getEventType(item);
  const eventDate = eventType === "same_day" || eventType === "recurring" || !end || start === end
    ? start
    : `${start}-${end}`;
  return [eventDate ? `Run ${eventDate}` : null, close ? `Close ${close}` : null].filter(Boolean).join("\n");
}

function formatEventFee(item: any) {
  const entry = item?.entry || item?.entryType;
  if (entry === "paid") {
    const fee = item?.entry_fee ?? item?.entryFee;
    const currency = String(item?.currency_code || item?.currencyCode || "").trim();
    return fee !== null && fee !== undefined ? `${currency ? `${currency} ` : ""}${fee}` : "Paid";
  }
  if (entry === "club_approved") return "Approved";
  return "Free";
}

function formatEventDistances(item: any) {
  const rawDistances = item?.available_distances_km ?? item?.availableDistancesKm;
  const distances = Array.isArray(rawDistances)
    ? rawDistances.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  if (distances.length > 0) return distances.map((distance) => `${distance}K`).join(", ");
  const daily = Number(item?.medal_min_daily_distance ?? item?.medalMinDailyDistance);
  const cumulative = Number(item?.medal_min_cumulative_distance ?? item?.medalMinCumulativeDistance);
  return [Number.isFinite(daily) && daily > 0 ? `${daily}K` : null, Number.isFinite(cumulative) && cumulative > 0 ? `${cumulative}K total` : null]
    .filter(Boolean)
    .join(", ") || "-";
}

function getEventRegistrationCloseDate(item: any): string {
  return String(item?.registration_closes_at || item?.registrationClosesAt || "").slice(0, 10);
}

function getEventEndDate(item: any): string {
  const explicitType = item?.event_type || item?.eventType;
  if (explicitType === "same_day" || explicitType === "recurring") {
    return String(item?.starts_at || item?.startsAt || "").slice(0, 10);
  }
  return String(item?.ends_at || item?.endsAt || item?.starts_at || item?.startsAt || "").slice(0, 10);
}

function addDaysToDateString(dateString: string, days: number): string {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isEventRegistrationClosed(item: any): boolean {
  const closeDate = getEventRegistrationCloseDate(item);
  if (!closeDate) return false;
  return new Date().toISOString().slice(0, 10) > closeDate;
}

function getParticipantLimit(item: any): number | null {
  const raw = item?.participant_limit ?? item?.participantLimit;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getParticipantCount(item: any): number {
  const raw = item?.participant_count ?? item?.participantCount;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function isEventFull(item: any): boolean {
  const limit = getParticipantLimit(item);
  return item?.isFull === true || (limit !== null && getParticipantCount(item) >= limit);
}

function shouldHideClosedEvent(item: any): boolean {
  if (!isEventRegistrationClosed(item)) return false;
  const endDate = getEventEndDate(item);
  const removeAfterDate = addDaysToDateString(endDate, 1);
  return Boolean(removeAfterDate && new Date().toISOString().slice(0, 10) > removeAfterDate);
}

function getEventType(item: any): "same_day" | "recurring" | "multiday" {
  if (item?.event_type === "recurring" || item?.eventType === "recurring") return "recurring";
  if (item?.event_type === "same_day" || item?.eventType === "same_day") return "same_day";
  if (item?.event_type === "multiday" || item?.eventType === "multiday") return "multiday";
  return isOneDayEvent(item?.starts_at, item?.ends_at) ? "same_day" : "multiday";
}

function getEventModeParam(item: any) {
  const eventType = getEventType(item);
  if (eventType === "recurring") return "recurring";
  return eventType === "same_day" ? "same-day" : "multiday";
}

function getEventTypeLabel(item: any) {
  const eventType = getEventType(item);
  if (eventType === "recurring") return "Recurring";
  return eventType === "same_day" ? "One Day" : "Multiday";
}

function getEventTypeTableLabel(item: any) {
  const eventType = getEventType(item);
  if (eventType === "recurring") return "Recurring";
  return eventType === "same_day" ? "One Day" : "Multiday";
}

function getEventLocationLabel(item: any) {
  if (item?.is_virtual === true || item?.isVirtual === true) return "Virtual";
  const location = String(item?.event_location || item?.eventLocation || "").trim();
  return location || "TBA";
}

function getEventLocationPin(item: any) {
  return String(item?.event_location_pin || item?.eventLocationPin || "").trim();
}

function isLocationPinLink(value: string) {
  return /^https?:\/\/\S+$/i.test(value);
}

function getTableEventStatus(item: any, registeredEvent: any): "" | "registered" | "pending" | "completed" | "closed" {
  const explicitStatus = String(registeredEvent?.registrationStatus || "").toLowerCase();
  if (explicitStatus === "pending" || explicitStatus === "awaiting_payment") return "pending";
  if (
    registeredEvent &&
    typeof registeredEvent.distanceKm === "number" &&
    registeredEvent.distanceKm > 0 &&
    typeof registeredEvent.timeSeconds === "number" &&
    registeredEvent.timeSeconds > 0
  ) {
    return "completed";
  }
  if (registeredEvent) return "registered";
  if (isEventRegistrationClosed(item)) return "closed";
  return "";
}

export default function EventsScreen() {
  const router = useRouter();
  const { registrationId, user } = useAuth();
  const trpcUtils = trpc.useUtils();
  const effectiveRegistrationId = registrationId || user?.id || "";
  const [eventScope, setEventScope] = useState<EventScope>("local");
  const [eventTypeFilter, setEventTypeFilter] = useState<EventTypeFilter>("all");
  const [eventViewMode, setEventViewMode] = useState<EventViewMode>("table");
  const [eventTimeTab, setEventTimeTab] = useState<EventTimeTab>("active");
  const [selectorMode, setSelectorMode] = useState<SelectorMode>(null);
  const [submittedEventIds, setSubmittedEventIds] = useState<string[]>([]);
  const [selectedPosterEvent, setSelectedPosterEvent] = useState<any | null>(null);
  const [selectedResultEvent, setSelectedResultEvent] = useState<{
    eventName: string;
    distanceKm: number | null;
    timeSeconds: number | null;
    dateLabel: string;
    countryLabel: string;
    posterLink: string | null;
  } | null>(null);
  const [isSharingResult, setIsSharingResult] = useState(false);
  const [isPostingResult, setIsPostingResult] = useState(false);
  const [mainTab, setMainTab] = useState<EventsMainTab>("events");
  const [showRideOfferForm, setShowRideOfferForm] = useState(false);
  const [showRideEventPicker, setShowRideEventPicker] = useState(false);
  const [showSeatPicker, setShowSeatPicker] = useState(false);
  const [showVehicleTypePicker, setShowVehicleTypePicker] = useState(false);
  const [showDeparturePicker, setShowDeparturePicker] = useState(false);
  const [showContactPreferencePicker, setShowContactPreferencePicker] = useState(false);
  const [showDriverSexPicker, setShowDriverSexPicker] = useState(false);
  const [showBootSpacePicker, setShowBootSpacePicker] = useState(false);
  const [showRideFilters, setShowRideFilters] = useState(false);
  const [showAccommodationForm, setShowAccommodationForm] = useState(false);
  const [showAccommodationFilters, setShowAccommodationFilters] = useState(false);
  const [showAccommodationEventPicker, setShowAccommodationEventPicker] = useState(false);
  const [showAccommodationTypePicker, setShowAccommodationTypePicker] = useState(false);
  const [showAccommodationContactPreferencePicker, setShowAccommodationContactPreferencePicker] = useState(false);
  const [showAccommodationHostSexPicker, setShowAccommodationHostSexPicker] = useState(false);
  const [showAccommodationRoomsPicker, setShowAccommodationRoomsPicker] = useState(false);
  const [departureCalendarMonth, setDepartureCalendarMonth] = useState(() => new Date());
  const [editingRideOfferId, setEditingRideOfferId] = useState<string | null>(null);
  const [editingAccommodationOfferId, setEditingAccommodationOfferId] = useState<string | null>(null);
  const [expandedBookingsOfferId, setExpandedBookingsOfferId] = useState<string | null>(null);
  const [expandedAccommodationBookingsOfferId, setExpandedAccommodationBookingsOfferId] = useState<string | null>(null);
  const [rideModerationDraft, setRideModerationDraft] = useState<{
    offerId: string;
    action: "hide" | "delete";
    title: string;
  } | null>(null);
  const [rideModerationReason, setRideModerationReason] = useState("");
  const [rideOfferForm, setRideOfferForm] = useState({
    eventId: "",
    availableSeats: "3",
    vehicleType: "passenger_car_light" as RideVehicleType,
    departureTown: "",
    departureAt: "",
    departureMeetingPoint: "",
    contact: "",
    preferredContactMethod: "any" as RideContactPreference,
    driverSex: "Male" as RideDriverSex,
    bootSpace: "some" as RideBootSpace,
    requiresCommitmentFee: false,
    commitmentFee: "",
    farePerSeat: "",
    carType: "",
    numberPlate: "",
    preferredSex: "Any" as "Any" | "Male" | "Female",
  });
  const [rideFilters, setRideFilters] = useState({
    vehicleType: "all" as "all" | RideVehicleType,
    minSeats: "all" as "all" | "1" | "2" | "3",
    driverSex: "all" as "all" | RideDriverSex,
    bootSpace: "all" as "all" | RideBootSpace,
    contact: "all" as ContactFilter,
    price: "all" as PriceFilter,
  });
  const [accommodationForm, setAccommodationForm] = useState({
    eventId: "",
    accommodationName: "",
    locationName: "",
    accommodationType: "single" as AccommodationType,
    lodgingTypes: [] as LodgingType[],
    roomsAvailable: "1",
    locationPin: "",
    pricePerRoom: "",
    roomDescription: "",
    notPermitted: "",
    features: [] as AccommodationFeature[],
    contact: "",
    preferredContactMethod: "any" as RideContactPreference,
    preferredGuestSex: "Any" as "Any" | "Male" | "Female",
    requiresCommitmentFee: false,
    commitmentFee: "",
  });
  const [accommodationBookingDrafts, setAccommodationBookingDrafts] = useState<Record<string, {
    occupants: { name: string; sex: RideDriverSex }[];
  }>>({});
  const [accommodationFilters, setAccommodationFilters] = useState({
    accommodationType: "all" as "all" | AccommodationType,
    minRooms: "all" as "all" | "1" | "2" | "3",
    contact: "all" as ContactFilter,
    guestSex: "all" as "all" | "Male" | "Female",
    price: "all" as PriceFilter,
  });
  const { data: profileBundle, isLoading: profileLoading } = trpc.profile.getBundle.useQuery(
    { registrationId: effectiveRegistrationId },
    { enabled: !!effectiveRegistrationId }
  );
  const { data: events, isLoading, error, refetch, isRefetching } =
    trpc.events.getEvents.useQuery();
  const { data: registeredEvents = [] } = trpc.events.getRegisteredEvents.useQuery(
    { registrationId: effectiveRegistrationId },
    {
      enabled: !!effectiveRegistrationId,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnReconnect: true,
    }
  );
  const enrollEventMutation = trpc.admin.enrollEvent.useMutation({
    onSuccess: async (result, variables) => {
      await Promise.all([
        trpcUtils.events.getRegisteredEvents.invalidate({ registrationId: effectiveRegistrationId }),
        trpcUtils.events.getRegisteredEvents.refetch({ registrationId: effectiveRegistrationId }),
      ]);

      setSubmittedEventIds((current) =>
        current.includes(variables.eventId) ? current : [...current, variables.eventId]
      );

      const externalRegistrationLink = String((result as any).externalRegistrationLink || "").trim();
      if (externalRegistrationLink) {
        try {
          await Linking.openURL(externalRegistrationLink);
        } catch {
          Alert.alert("Registration Link Error", "You were added to the event, but the external registration link could not be opened.");
        }
        return;
      }

      if (result.mode === "participant") {
        Alert.alert("Joined Event", result.message || "You have been added to the participant list.");
        return;
      }

      if (result.mode === "payment_required") {
        Alert.alert(
          "Payment Submitted",
          [result.message, result.paymentDetails].filter(Boolean).join("\n\n")
        );
        return;
      }

      Alert.alert("Participation Sent", result.message || "Your request has been sent for approval.");
    },
    onError: (mutationError: any) => {
      Alert.alert("Could Not Participate", mutationError.message || "Please try again.");
    },
  });
  const profileCountry = String(profileBundle?.profile?.country || "").trim();
  const profileCountryCode = normalizeCountryCode(profileCountry);
  const travelCountry = String(profileBundle?.profile?.travel_country || "").trim();
  const travelCountryCode = normalizeCountryCode(profileBundle?.profile?.travel_country_code || travelCountry);
  const travelStartDate = String(profileBundle?.profile?.travel_start_date || "").slice(0, 10);
  const travelEndDate = String(profileBundle?.profile?.travel_end_date || "").slice(0, 10);
  const todayDate = new Date().toISOString().slice(0, 10);
  const hasActiveTravelCountry = Boolean(
    travelCountry &&
      travelCountryCode &&
      travelStartDate &&
      travelEndDate &&
      todayDate >= travelStartDate &&
      todayDate <= travelEndDate
  );
  const localCountryCodes = useMemo(() => {
    return new Set([profileCountryCode, hasActiveTravelCountry ? travelCountryCode : ""].filter(Boolean));
  }, [hasActiveTravelCountry, profileCountryCode, travelCountryCode]);
  const hasCountry = profileCountry.length > 0;
  const compactCountryLabel = [
    formatCountryName(profileCountryCode || profileCountry) || "Global",
    hasActiveTravelCountry ? formatCountryName(travelCountryCode || travelCountry) || travelCountry : "",
  ].filter(Boolean).join(" + ");

  const registeredEventMap = useMemo(() => {
    return new Map(
      (registeredEvents || [])
        .filter((item): item is NonNullable<typeof item> => !!item)
        .map((item) => [item.eventId, item])
    );
  }, [registeredEvents]);

  const visibleEvents = useMemo(() => {
    const list = events ?? [];
    const scopedList = list.filter((item: any) => {
      const eventCountryCode = normalizeCountryCode(item.country_code || item.country);
      const isVirtual = item.is_virtual === true || item.isVirtual === true;
      if (eventScope === "virtual") return isVirtual;
      if (eventScope === "all") return !isVirtual;
      return !isVirtual && Boolean(eventCountryCode && localCountryCodes.has(eventCountryCode));
    });
    const lifecycleList = scopedList.filter((item: any) => {
      const endDate = getEventEndDate(item);
      const isClosed = Boolean(endDate && endDate < todayDate);
      return eventTimeTab === "closed" ? isClosed : !isClosed;
    });
    if (eventTypeFilter === "all") return lifecycleList;
    return lifecycleList.filter((item: any) => getEventType(item) === eventTypeFilter);
  }, [eventScope, eventTimeTab, eventTypeFilter, events, localCountryCodes, todayDate]);

  const tableEvents = useMemo(() => {
    return [...visibleEvents].sort((a: any, b: any) => {
      const aStatus = getTableEventStatus(a, registeredEventMap.get(a.event_id));
      const bStatus = getTableEventStatus(b, registeredEventMap.get(b.event_id));
      if (aStatus === "closed" && bStatus !== "closed") return 1;
      if (aStatus !== "closed" && bStatus === "closed") return -1;
      const aDate = String(a.starts_at || a.ends_at || "");
      const bDate = String(b.starts_at || b.ends_at || "");
      return aDate.localeCompare(bDate);
    });
  }, [registeredEventMap, visibleEvents]);

  const rideShareEventOptions = useMemo(() => {
    return [...(events ?? [])]
      .filter((item: any) => {
        const isVirtual = item.is_virtual === true || item.isVirtual === true;
        const endDate = getEventEndDate(item);
        const isClosed = Boolean(endDate && endDate < todayDate);
        return !isVirtual && !isClosed && item.approval_status === "approved";
      })
      .sort((a: any, b: any) => String(a.starts_at || "").localeCompare(String(b.starts_at || "")));
  }, [events, todayDate]);

  const selectedRideShareEventId = rideOfferForm.eventId || rideShareEventOptions[0]?.event_id || "";
  const selectedRideShareEvent =
    rideShareEventOptions.find((item: any) => item.event_id === selectedRideShareEventId) || rideShareEventOptions[0] || null;
  const selectedAccommodationEventId = accommodationForm.eventId || rideShareEventOptions[0]?.event_id || "";
  const selectedAccommodationEvent =
    rideShareEventOptions.find((item: any) => item.event_id === selectedAccommodationEventId) || rideShareEventOptions[0] || null;
  const selectedDepartureDate = useMemo(() => {
    const parsed = new Date(rideOfferForm.departureAt || "");
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [rideOfferForm.departureAt]);
  const departureCalendarDays = useMemo(() => buildCalendarDays(departureCalendarMonth), [departureCalendarMonth]);
  const departureHourOptions = useMemo(() => Array.from({ length: 24 }, (_, index) => index), []);
  const departureMinuteOptions = useMemo(() => [0, 15, 30, 45], []);
  const selectedVehicleType = getRideVehicleTypeOption(rideOfferForm.vehicleType);
  const seatOptions = useMemo(
    () => Array.from({ length: selectedVehicleType.maxSeats }, (_, index) => index + 1),
    [selectedVehicleType.maxSeats]
  );

  const rideSharesQuery = trpc.events.listRideShares.useQuery(
    { registrationId: effectiveRegistrationId, eventId: selectedRideShareEventId || undefined },
    { enabled: !!effectiveRegistrationId && mainTab === "rideShare" && !!selectedRideShareEventId }
  );
  const rideShareOffers = ((rideSharesQuery.data as any)?.offers ?? []) as any[];
  const filteredRideShareOffers = useMemo(() => {
    return rideShareOffers.filter((offer: any) => {
      if (rideFilters.vehicleType !== "all" && offer.vehicleType !== rideFilters.vehicleType) return false;
      if (rideFilters.minSeats !== "all" && Number(offer.seatsRemaining || 0) < Number(rideFilters.minSeats)) return false;
      if (rideFilters.driverSex !== "all" && offer.driverSex !== rideFilters.driverSex) return false;
      if (rideFilters.bootSpace !== "all" && offer.bootSpace !== rideFilters.bootSpace) return false;
      if (rideFilters.contact !== "all" && offer.preferredContactMethod !== rideFilters.contact) return false;
      if (rideFilters.price === "free" && Number(offer.farePerSeat || 0) > 0) return false;
      if (rideFilters.price === "paid" && Number(offer.farePerSeat || 0) <= 0) return false;
      return true;
    });
  }, [rideFilters, rideShareOffers]);
  const invalidateRideShares = () => trpcUtils.events.listRideShares.invalidate();
  const accommodationsQuery = trpc.events.listAccommodations.useQuery(
    { registrationId: effectiveRegistrationId, eventId: selectedAccommodationEventId || undefined },
    { enabled: !!effectiveRegistrationId && mainTab === "accommodation" && !!selectedAccommodationEventId }
  );
  const accommodationOffers = ((accommodationsQuery.data as any)?.offers ?? []) as any[];
  const filteredAccommodationOffers = useMemo(() => {
    return accommodationOffers.filter((offer: any) => {
      if (accommodationFilters.accommodationType !== "all" && offer.accommodationType !== accommodationFilters.accommodationType) return false;
      if (accommodationFilters.minRooms !== "all" && Number(offer.roomsRemaining || 0) < Number(accommodationFilters.minRooms)) return false;
      if (accommodationFilters.contact !== "all" && offer.preferredContactMethod !== accommodationFilters.contact) return false;
      if (accommodationFilters.guestSex !== "all" && offer.preferredGuestSex !== accommodationFilters.guestSex) return false;
      if (accommodationFilters.price === "free" && Number(offer.pricePerRoom || 0) > 0) return false;
      if (accommodationFilters.price === "paid" && Number(offer.pricePerRoom || 0) <= 0) return false;
      return true;
    });
  }, [accommodationFilters, accommodationOffers]);
  const invalidateAccommodations = () => trpcUtils.events.listAccommodations.invalidate();

  const createRideOfferMutation = trpc.events.createRideOffer.useMutation({
    onSuccess: () => {
      setRideOfferForm((current) => ({
        ...current,
        availableSeats: "3",
        vehicleType: "passenger_car_light",
        departureTown: "",
        departureAt: "",
        departureMeetingPoint: "",
        contact: "",
        preferredContactMethod: "any",
        driverSex: "Male",
        bootSpace: "some",
        requiresCommitmentFee: false,
        commitmentFee: "",
        farePerSeat: "",
        carType: "",
        numberPlate: "",
        preferredSex: "Any",
      }));
      setEditingRideOfferId(null);
      setShowRideOfferForm(false);
      void invalidateRideShares();
      Alert.alert("Car Listed", "Your car is now visible to runners looking for a ride.");
    },
    onError: (mutationError: any) => Alert.alert("Could Not List Car", mutationError.message || "Please try again."),
  });
  const updateRideOfferMutation = trpc.events.updateRideOffer.useMutation({
    onSuccess: () => {
      setEditingRideOfferId(null);
      setShowRideOfferForm(false);
      void invalidateRideShares();
      Alert.alert("Car Updated", "Your ride-share car details have been updated.");
    },
    onError: (mutationError: any) => Alert.alert("Could Not Update Car", mutationError.message || "Please try again."),
  });
  const requestRideBookingMutation = trpc.events.requestRideBooking.useMutation({
    onSuccess: () => {
      void invalidateRideShares();
      Alert.alert("Request Sent", "Your booking is pending until the driver confirms it.");
    },
    onError: (mutationError: any) => Alert.alert("Could Not Request Ride", mutationError.message || "Please try again."),
  });
  const withdrawRideBookingMutation = trpc.events.withdrawRideBooking.useMutation({
    onSuccess: () => void invalidateRideShares(),
    onError: (mutationError: any) => Alert.alert("Could Not Withdraw", mutationError.message || "Please try again."),
  });
  const updateRideBookingMutation = trpc.events.updateRideBooking.useMutation({
    onSuccess: () => void invalidateRideShares(),
    onError: (mutationError: any) => Alert.alert("Could Not Update Booking", mutationError.message || "Please try again."),
  });
  const updateRideOfferStatusMutation = trpc.events.updateRideOfferStatus.useMutation({
    onSuccess: () => {
      setRideModerationDraft(null);
      setRideModerationReason("");
      void invalidateRideShares();
    },
    onError: (mutationError: any) => Alert.alert("Could Not Update Car", mutationError.message || "Please try again."),
  });
  const cancelRideOfferMutation = trpc.events.cancelRideOffer.useMutation({
    onSuccess: () => void invalidateRideShares(),
    onError: (mutationError: any) => Alert.alert("Could Not Cancel Car", mutationError.message || "Please try again."),
  });
  const createAccommodationOfferMutation = trpc.events.createAccommodationOffer.useMutation({
    onSuccess: () => {
      setAccommodationForm((current) => ({
        ...current,
        accommodationName: "",
        locationName: "",
        accommodationType: "single",
        lodgingTypes: [],
        roomsAvailable: "1",
        locationPin: "",
        pricePerRoom: "",
        roomDescription: "",
        notPermitted: "",
        features: [],
        contact: "",
        preferredContactMethod: "any",
        preferredGuestSex: "Any",
        requiresCommitmentFee: false,
        commitmentFee: "",
      }));
      setEditingAccommodationOfferId(null);
      setShowAccommodationForm(false);
      void invalidateAccommodations();
      Alert.alert("Accommodation Listed", "Your accommodation is now visible to runners.");
    },
    onError: (mutationError: any) => Alert.alert("Could Not List Accommodation", mutationError.message || "Please try again."),
  });
  const updateAccommodationOfferMutation = trpc.events.updateAccommodationOffer.useMutation({
    onSuccess: () => {
      setEditingAccommodationOfferId(null);
      setShowAccommodationForm(false);
      void invalidateAccommodations();
      Alert.alert("Accommodation Updated", "Your accommodation details have been updated.");
    },
    onError: (mutationError: any) => Alert.alert("Could Not Update Accommodation", mutationError.message || "Please try again."),
  });
  const requestAccommodationBookingMutation = trpc.events.requestAccommodationBooking.useMutation({
    onSuccess: (_result, variables) => {
      setAccommodationBookingDrafts((current) => {
        const next = { ...current };
        delete next[variables.offerId];
        return next;
      });
      void invalidateAccommodations();
      Alert.alert("Booking Sent", "Your accommodation booking is pending until the owner confirms it.");
    },
    onError: (mutationError: any) => Alert.alert("Could Not Book Accommodation", mutationError.message || "Please try again."),
  });
  const withdrawAccommodationBookingMutation = trpc.events.withdrawAccommodationBooking.useMutation({
    onSuccess: () => void invalidateAccommodations(),
    onError: (mutationError: any) => Alert.alert("Could Not Withdraw", mutationError.message || "Please try again."),
  });
  const updateAccommodationBookingMutation = trpc.events.updateAccommodationBooking.useMutation({
    onSuccess: () => void invalidateAccommodations(),
    onError: (mutationError: any) => Alert.alert("Could Not Update Booking", mutationError.message || "Please try again."),
  });
  const cancelAccommodationOfferMutation = trpc.events.cancelAccommodationOffer.useMutation({
    onSuccess: () => void invalidateAccommodations(),
    onError: (mutationError: any) => Alert.alert("Could Not Cancel Accommodation", mutationError.message || "Please try again."),
  });

  const eventTypeFilterLabel = {
    all: "All Types",
    same_day: "One Day",
    recurring: "Recurring",
    multiday: "Multiday",
  }[eventTypeFilter];

  const locationFilterLabel =
    eventScope === "local" ? compactCountryLabel : eventScope === "virtual" ? "Virtual" : "All countries";

  const formatDuration = (seconds?: number | null) => {
    if (!seconds || seconds <= 0) return "";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatMoneyAmount = (amount?: number | null) => {
    if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return "";
    return Number(amount).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const buildResultShareText = (result: NonNullable<typeof selectedResultEvent>) => {
    const details = [
      `I completed ${result.eventName} on RunNation.`,
      `Distance: ${typeof result.distanceKm === "number" ? `${result.distanceKm.toFixed(2)} km` : "-"}`,
      `Time: ${formatDuration(result.timeSeconds) || "-"}`,
      result.dateLabel,
      result.countryLabel,
    ].filter(Boolean);

    return details.join("\n");
  };

  const inferImageMimeType = (uri: string) => {
    const normalized = uri.toLowerCase();
    if (normalized.includes(".png")) return "image/png";
    if (normalized.includes(".webp")) return "image/webp";
    return "image/jpeg";
  };

  const downloadPosterToLocal = async (posterLink: string) => {
    const ext = posterLink.toLowerCase().includes(".png")
      ? "png"
      : posterLink.toLowerCase().includes(".webp")
      ? "webp"
      : "jpg";
    const localPath = `${FileSystem.cacheDirectory}event-result-${Date.now()}.${ext}`;
    const download = await FileSystem.downloadAsync(posterLink, localPath);
    return download.uri;
  };

  const buildGeneratedResultPosterSvg = (result: NonNullable<typeof selectedResultEvent>) => {
    const eventName = escapeSvgText(result.eventName);
    const dateLabel = escapeSvgText(result.dateLabel);
    const countryLabel = escapeSvgText(result.countryLabel);
    const distanceLabel = escapeSvgText(
      typeof result.distanceKm === "number" ? `${result.distanceKm.toFixed(2)} km` : "-"
    );
    const timeLabel = escapeSvgText(formatDuration(result.timeSeconds) || "-");

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1920" viewBox="0 0 1080 1920" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1080" height="1920" fill="#FFF7ED"/>
  <rect x="56" y="56" width="968" height="1808" rx="48" fill="#FFFFFF"/>
  <rect x="56" y="56" width="968" height="220" rx="48" fill="#F97316"/>
  <rect x="56" y="220" width="968" height="120" fill="#F97316"/>
  <text x="96" y="148" fill="white" font-size="44" font-family="Arial, sans-serif" font-weight="700">RunNation</text>
  <text x="96" y="206" fill="#FED7AA" font-size="22" font-family="Arial, sans-serif" font-weight="700">EVENT RESULT</text>
  <text x="96" y="386" fill="#111827" font-size="72" font-family="Arial, sans-serif" font-weight="800">${eventName}</text>
  <text x="96" y="444" fill="#6B7280" font-size="28" font-family="Arial, sans-serif" font-weight="600">${dateLabel}</text>
  <text x="96" y="486" fill="#6B7280" font-size="28" font-family="Arial, sans-serif" font-weight="600">${countryLabel}</text>
  <rect x="96" y="580" width="888" height="360" rx="36" fill="#ECFDF5"/>
  <text x="148" y="688" fill="#166534" font-size="30" font-family="Arial, sans-serif" font-weight="700">Distance</text>
  <text x="148" y="798" fill="#111827" font-size="82" font-family="Arial, sans-serif" font-weight="800">${distanceLabel}</text>
  <rect x="96" y="988" width="888" height="360" rx="36" fill="#EFF6FF"/>
  <text x="148" y="1096" fill="#1D4ED8" font-size="30" font-family="Arial, sans-serif" font-weight="700">Time</text>
  <text x="148" y="1206" fill="#111827" font-size="82" font-family="Arial, sans-serif" font-weight="800">${timeLabel}</text>
  <rect x="96" y="1408" width="888" height="256" rx="36" fill="#FFF7ED" stroke="#FDBA74" stroke-width="4"/>
  <text x="148" y="1504" fill="#9A3412" font-size="26" font-family="Arial, sans-serif" font-weight="700">Keep running. Keep inspiring.</text>
  <text x="148" y="1570" fill="#7C2D12" font-size="58" font-family="Arial, sans-serif" font-weight="800">One Nation. One Run.</text>
  <text x="148" y="1638" fill="#7C2D12" font-size="58" font-family="Arial, sans-serif" font-weight="800">Endless Impact.</text>
</svg>`;
  };

  const createGeneratedResultPoster = async (result: NonNullable<typeof selectedResultEvent>) => {
    const svg = buildGeneratedResultPosterSvg(result);
    const localPath = `${FileSystem.cacheDirectory}event-result-generated-${Date.now()}.svg`;
    await FileSystem.writeAsStringAsync(localPath, svg, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    try {
      const pngResult = await manipulateAsync(
        localPath,
        [],
        {
          format: SaveFormat.PNG,
          compress: 1,
          base64: true,
        }
      );

      return {
        uri: pngResult.uri,
        mimeType: "image/png",
        base64: pngResult.base64 ?? null,
      };
    } catch (error) {
      return {
        uri: localPath,
        mimeType: "image/svg+xml",
        base64: null,
      };
    }
  };

  const handleShareResult = async () => {
    if (!selectedResultEvent) return;

    try {
      setIsSharingResult(true);
      const shareText = buildResultShareText(selectedResultEvent);

      if (selectedResultEvent.posterLink) {
        const localUri = await downloadPosterToLocal(selectedResultEvent.posterLink);
        await Share.share({
          title: selectedResultEvent.eventName,
          message: shareText,
          url: localUri,
        });
      } else {
        const generatedPoster = await createGeneratedResultPoster(selectedResultEvent);
        await Share.share({
          title: selectedResultEvent.eventName,
          message: shareText,
          url: generatedPoster.uri,
        });
      }
    } catch (error: any) {
      Alert.alert("Could Not Share", error?.message || "Please try again.");
    } finally {
      setIsSharingResult(false);
    }
  };

  const handlePostResultToChat = async () => {
    if (!selectedResultEvent || !effectiveRegistrationId) {
      Alert.alert("Not Ready", "Please sign in again before posting.");
      return;
    }

    try {
      setIsPostingResult(true);
      const caption = `${buildResultShareText(selectedResultEvent)}\n\n#RunNation #EventRun`;
      let imageBase64: string | null = null;
      let mimeType: string | null = null;

      if (selectedResultEvent.posterLink) {
        const localUri = await downloadPosterToLocal(selectedResultEvent.posterLink);
        imageBase64 = await FileSystem.readAsStringAsync(localUri, {
          encoding: "base64",
        });
        mimeType = inferImageMimeType(localUri);
      } else {
        const generatedPoster = await createGeneratedResultPoster(selectedResultEvent);
        imageBase64 = generatedPoster.base64;
        mimeType = generatedPoster.mimeType === "image/png" ? "image/png" : null;
      }

      await getServerClient().social.createPost.mutate({
        registrationId: effectiveRegistrationId,
        caption,
        activityData: null,
        imageBase64,
        mimeType,
        poll: null,
      });

      Alert.alert("Posted to Chat", "Your event result has been shared to the community feed.");
      setSelectedResultEvent(null);
    } catch (error: any) {
      Alert.alert("Could Not Post", error?.message || "Please try again.");
    } finally {
      setIsPostingResult(false);
    }
  };

  const handleParticipate = (eventItem: any) => {
    if (!effectiveRegistrationId) {
      Alert.alert("Sign In Required", "Please sign in before joining an event.");
      return;
    }
    if (isEventRegistrationClosed(eventItem)) {
      Alert.alert("Registration Closed", "Registration for this event is closed.");
      return;
    }
    if (isEventFull(eventItem)) {
      Alert.alert("Event Full", "This event has reached its participant limit.");
      return;
    }

    const entryMode: EventEntryMode = eventItem.entry === "paid"
      ? "paid"
      : eventItem.entry === "club_approved"
      ? "club_approved"
      : "free";

    const submit = () =>
      enrollEventMutation.mutate({
        eventId: eventItem.event_id,
        registrationId: effectiveRegistrationId,
      });

    const externalRegistrationLink = String(eventItem.registration_link || eventItem.registrationLink || "").trim();
    if (externalRegistrationLink) {
      submit();
      return;
    }

    if (entryMode === "paid") {
      const feeLabel =
        (eventItem.entry_fee ?? eventItem.entryFee) !== null &&
        (eventItem.entry_fee ?? eventItem.entryFee) !== undefined
          ? `${eventItem.currency_code || ""} ${formatMoneyAmount(Number(eventItem.entry_fee ?? eventItem.entryFee))}`.trim()
          : "";
      const organizerPaymentLink = String(eventItem.organizer_payment_link || eventItem.organizerPaymentLink || "").trim();
      const paymentDetails = String(eventItem.payment_details || eventItem.paymentDetails || "").trim();

      if (organizerPaymentLink) {
        Alert.alert(
          "Paid Event",
          [
            "This event uses the organizer or club payment link.",
            feeLabel ? `Fee: ${feeLabel}` : "",
            paymentDetails,
            "After opening the link, your registration will be sent for payment review.",
          ]
            .filter(Boolean)
            .join("\n\n"),
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Link",
              onPress: async () => {
                try {
                  await Linking.openURL(organizerPaymentLink);
                  submit();
                } catch {
                  Alert.alert("Payment Link Error", "Could not open the organizer payment link.");
                }
              },
            },
          ]
        );
        return;
      }

      Alert.alert(
        "Payment Link Under Maintenance",
        [
          "This event requires payment before you can be confirmed.",
          feeLabel ? `Fee: ${feeLabel}` : "",
          "The RunNation payment link is coming soon. Please try again later or contact the event organizer.",
        ]
          .filter(Boolean)
          .join("\n\n")
      );
      return;
    }

    submit();
  };


  const formatRideDateTime = (value?: string | null) => {
    const date = new Date(String(value || ""));
    if (Number.isNaN(date.getTime())) return String(value || "TBA");
    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatRideContact = (person: any) => {
    return [person?.phone, person?.email].filter(Boolean).join(" | ") || "Contact hidden until confirmed";
  };

  const updateDepartureDatePart = (datePart: Date) => {
    const current = selectedDepartureDate;
    const next = new Date(
      datePart.getFullYear(),
      datePart.getMonth(),
      datePart.getDate(),
      current.getHours(),
      current.getMinutes()
    );
    setRideOfferForm((currentForm) => ({ ...currentForm, departureAt: formatLocalDateTimeInput(next) }));
  };

  const updateDepartureTimePart = (hour: number, minute: number) => {
    const current = selectedDepartureDate;
    const next = new Date(current.getFullYear(), current.getMonth(), current.getDate(), hour, minute);
    setRideOfferForm((currentForm) => ({ ...currentForm, departureAt: formatLocalDateTimeInput(next) }));
  };

  const startEditRideOffer = (offer: any) => {
    setEditingRideOfferId(offer.offerId);
    setRideOfferForm({
      eventId: offer.eventId || selectedRideShareEventId,
      availableSeats: String(offer.availableSeats || 1),
      vehicleType: (offer.vehicleType || "passenger_car_light") as RideVehicleType,
      departureTown: offer.departureTown || "",
      departureAt: offer.departureAt ? formatLocalDateTimeInput(new Date(offer.departureAt)) : "",
      departureMeetingPoint: offer.departureMeetingPoint || "",
      contact: offer.contact || "",
      preferredContactMethod: (offer.preferredContactMethod || "any") as RideContactPreference,
      driverSex: (offer.driverSex || "Male") as RideDriverSex,
      bootSpace: (offer.bootSpace || "some") as RideBootSpace,
      requiresCommitmentFee: offer.requiresCommitmentFee === true,
      commitmentFee: offer.commitmentFee ? String(offer.commitmentFee) : "",
      farePerSeat: offer.farePerSeat ? String(offer.farePerSeat) : "",
      carType: offer.carType || "",
      numberPlate: offer.numberPlate || "",
      preferredSex: (offer.preferredSex || "Any") as "Any" | "Male" | "Female",
    });
    setDepartureCalendarMonth(offer.departureAt ? new Date(new Date(offer.departureAt).getFullYear(), new Date(offer.departureAt).getMonth(), 1) : new Date());
    setShowRideOfferForm(true);
  };

  const handleCreateRideOffer = () => {
    if (!effectiveRegistrationId) {
      Alert.alert("Login Required", "Please log in before listing a car.");
      return;
    }
    if (!selectedRideShareEventId) {
      Alert.alert("Choose Event", "Select a race before listing your car.");
      return;
    }

    const availableSeats = Number.parseInt(rideOfferForm.availableSeats, 10);
    const farePerSeat = Number.parseFloat(rideOfferForm.farePerSeat || "0");
    const commitmentFee = Number.parseFloat(rideOfferForm.commitmentFee || "0");
    const departureAt = rideOfferForm.departureAt.trim();
    const numberPlate = rideOfferForm.numberPlate.trim().toUpperCase();

    const maxSeats = getRideVehicleTypeOption(rideOfferForm.vehicleType).maxSeats;
    if (!Number.isFinite(availableSeats) || availableSeats < 1 || availableSeats > maxSeats) {
      Alert.alert("Seats Required", `Choose available seats from 1 to ${maxSeats}.`);
      return;
    }
    if (!rideOfferForm.departureTown.trim() || !departureAt || !rideOfferForm.carType.trim() || !numberPlate) {
      Alert.alert("Missing Details", "Departure town, departure date/time, car model, and number plate are required.");
      return;
    }
    if (!rideOfferForm.departureMeetingPoint.trim() || !rideOfferForm.contact.trim()) {
      Alert.alert("Missing Details", "Departure meeting point and contact are required.");
      return;
    }
    if (Number.isNaN(new Date(departureAt).getTime())) {
      Alert.alert("Invalid Date", "Choose the departure date and time from the calendar picker.");
      return;
    }
    if (!Number.isFinite(farePerSeat) || farePerSeat < 0) {
      Alert.alert("Invalid Fare", "Enter a valid fare per seat, or 0 for free.");
      return;
    }
    if (rideOfferForm.requiresCommitmentFee && (!Number.isFinite(commitmentFee) || commitmentFee <= 0)) {
      Alert.alert("Invalid Commitment Fee", "Enter a commitment fee greater than 0, or turn the fee off.");
      return;
    }

    const payload = {
      registrationId: effectiveRegistrationId,
      eventId: selectedRideShareEventId,
      availableSeats,
      vehicleType: rideOfferForm.vehicleType,
      departureTown: rideOfferForm.departureTown.trim(),
      departureAt,
      departureMeetingPoint: rideOfferForm.departureMeetingPoint.trim(),
      contact: rideOfferForm.contact.trim(),
      preferredContactMethod: rideOfferForm.preferredContactMethod,
      driverSex: rideOfferForm.driverSex,
      bootSpace: rideOfferForm.bootSpace,
      requiresCommitmentFee: rideOfferForm.requiresCommitmentFee,
      commitmentFee: rideOfferForm.requiresCommitmentFee ? commitmentFee : 0,
      farePerSeat,
      carType: rideOfferForm.carType.trim(),
      numberPlate,
      preferredSex: rideOfferForm.preferredSex,
    };

    if (editingRideOfferId) {
      updateRideOfferMutation.mutate({ ...payload, offerId: editingRideOfferId });
      return;
    }

    createRideOfferMutation.mutate(payload);
  };

  const handleCancelRideOffer = (offerId: string) => {
    Alert.alert("Cancel Car Listing", "Cancel this car and any active ride requests?", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel Listing",
        style: "destructive",
        onPress: () => cancelRideOfferMutation.mutate({ registrationId: effectiveRegistrationId, offerId }),
      },
    ]);
  };

  const runRideOfferStatusAction = (
    offerId: string,
    action: "approve" | "hide" | "unhide" | "delete",
    reason?: string | null
  ) => {
    updateRideOfferStatusMutation.mutate({
      registrationId: effectiveRegistrationId,
      offerId,
      action,
      reason,
    });
  };

  const handleRideOfferStatusAction = (
    offer: any,
    action: "approve" | "hide" | "unhide" | "delete"
  ) => {
    if (offer.canModerate && !offer.isDriver && (action === "hide" || action === "delete")) {
      setRideModerationDraft({
        offerId: offer.offerId,
        action,
        title: action === "hide" ? "Hide car listing" : "Delete car listing",
      });
      setRideModerationReason("");
      return;
    }

    if (action === "delete") {
      Alert.alert("Delete Car Listing", "Delete this car and cancel active ride requests?", [
        { text: "Keep", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => runRideOfferStatusAction(offer.offerId, action) },
      ]);
      return;
    }

    runRideOfferStatusAction(offer.offerId, action);
  };

  const openListingContact = (listing: any, message: string) => {
    const contact = listing?.contact || listing?.host?.phone || listing?.driver?.phone;
    const method = listing?.preferredContactMethod || "any";
    const phone = cleanPhoneNumber(contact);
    if (!phone) {
      Alert.alert("No Contact", "The owner has not added a callable or WhatsApp contact.");
      return;
    }
    const url = method === "calls_only" ? `tel:${phone}` : buildWhatsAppUrl(phone, message);
    Linking.openURL(url).catch(() => {
      if (method !== "calls_only") {
        Linking.openURL(`tel:${phone}`).catch(() =>
          Alert.alert("Contact Error", "Could not open WhatsApp or the phone dialer.")
        );
        return;
      }
      Alert.alert("Contact Error", "Could not open the phone dialer.");
    });
  };

  const handleRideContact = (offer: any) => {
    openListingContact(
      offer,
      `Hello, I saw your RunNation ride-share listing for ${offer.eventName}. Is a seat still available?`
    );
  };

  const handleRideBook = (offer: any) => {
    requestRideBookingMutation.mutate({
      registrationId: effectiveRegistrationId,
      offerId: offer.offerId,
    });
    openListingContact(
      offer,
      `Hello, I requested a seat in your RunNation ride-share listing for ${offer.eventName}.`
    );
  };

  const shareBookingReceipt = async (kind: "ride" | "accommodation", listing: any) => {
    const booking = listing.userBooking;
    const lines = [
      "RunNation Booking Receipt",
      `Receipt type: ${kind === "ride" ? "Ride Share" : "Accommodation"}`,
      `Status: ${booking?.status || "confirmed"}`,
      `Event: ${listing.eventName || "RunNation event"}`,
      kind === "ride"
        ? `Route: ${listing.departureTown || "Departure"} to ${listing.eventLocation || "event venue"}`
        : `Stay: ${listing.accommodationName || "Accommodation"}`,
      kind === "ride"
        ? `Departure: ${formatRideDateTime(listing.departureAt)}`
        : `Location: ${listing.locationName || listing.eventLocation || "event venue"}`,
      kind === "ride"
        ? `Driver: ${listing.driver?.name || "RunNation user"}`
        : `Host: ${listing.host?.name || "RunNation user"}`,
      kind === "ride"
        ? `Vehicle: ${formatRideVehicleType(listing.vehicleType)} ${listing.carType || ""}`.trim()
        : `Accommodation type: ${formatAccommodationType(listing.accommodationType)}`,
      kind === "ride"
        ? `Fare: ${listing.farePerSeat ? formatMoneyAmount(listing.farePerSeat) : "Free"}`
        : `Price: ${listing.pricePerRoom ? formatMoneyAmount(listing.pricePerRoom) : "Free"}`,
      kind === "accommodation" && booking?.occupants?.length
        ? `Occupants: ${booking.occupants.map((occupant: any) => `${occupant.name} (${occupant.sex})`).join(", ")}`
        : "",
      `Booking ID: ${booking?.bookingId || "N/A"}`,
      `Generated: ${new Date().toLocaleString("en-GB")}`,
      "",
      "Use this receipt to identify a confirmed RunNation event booking for safety and coordination.",
    ].filter(Boolean);
    const contentLines = lines.map((line, index) => `BT /F1 ${index === 0 ? 18 : 11} Tf 50 ${780 - index * 24} Td (${escapePdfText(line)}) Tj ET`).join("\n");
    const stream = `${contentLines}\n`;
    const objects = [
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
      "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
      "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
      `5 0 obj << /Length ${stream.length} >> stream\n${stream}endstream endobj`,
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (const object of objects) {
      offsets.push(pdf.length);
      pdf += `${object}\n`;
    }
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    const path = `${FileSystem.cacheDirectory}runnation-${kind}-receipt-${Date.now()}.pdf`;
    await FileSystem.writeAsStringAsync(path, encodeBase64(pdf), { encoding: FileSystem.EncodingType.Base64 });
    await Share.share({
      title: "RunNation booking receipt",
      message: `RunNation ${kind === "ride" ? "ride-share" : "accommodation"} receipt for ${listing.eventName || "event booking"}`,
      url: path,
    });
  };

  const startEditAccommodationOffer = (offer: any) => {
    setEditingAccommodationOfferId(offer.offerId);
    setAccommodationForm({
      eventId: offer.eventId || selectedAccommodationEventId,
      accommodationName: offer.accommodationName || "",
      locationName: offer.locationName || "",
      accommodationType: (offer.accommodationType === "lone" ? "single" : offer.accommodationType || "single") as AccommodationType,
      lodgingTypes: Array.isArray(offer.lodgingTypes) ? offer.lodgingTypes : [],
      roomsAvailable: String(offer.roomsAvailable || 1),
      locationPin: offer.locationPin || "",
      pricePerRoom: offer.pricePerRoom ? String(offer.pricePerRoom) : "",
      roomDescription: offer.roomDescription || "",
      notPermitted: offer.notPermitted || "",
      features: Array.isArray(offer.features) ? offer.features : [],
      contact: offer.contact || "",
      preferredContactMethod: (offer.preferredContactMethod || "any") as RideContactPreference,
      preferredGuestSex: (offer.preferredGuestSex || "Any") as "Any" | "Male" | "Female",
      requiresCommitmentFee: offer.requiresCommitmentFee === true,
      commitmentFee: offer.commitmentFee ? String(offer.commitmentFee) : "",
    });
    setShowAccommodationForm(true);
  };

  const handleCreateAccommodationOffer = () => {
    if (!effectiveRegistrationId) {
      Alert.alert("Login Required", "Please log in before listing accommodation.");
      return;
    }
    if (!selectedAccommodationEventId) {
      Alert.alert("Choose Event", "Select a race before listing accommodation.");
      return;
    }
    const roomsAvailable = Number.parseInt(accommodationForm.roomsAvailable, 10);
    const pricePerRoom = Number.parseInt(accommodationForm.pricePerRoom || "0", 10);
    const commitmentFee = Number.parseInt(accommodationForm.commitmentFee || "0", 10);
    if (!Number.isFinite(roomsAvailable) || roomsAvailable < 1) {
      Alert.alert("Rooms Required", "Choose at least 1 available room.");
      return;
    }
    if (!Number.isInteger(pricePerRoom) || pricePerRoom < 0) {
      Alert.alert("Invalid Price", "Enter pricing as a whole number, or 0 for free.");
      return;
    }
    if (accommodationForm.requiresCommitmentFee && (!Number.isInteger(commitmentFee) || commitmentFee <= 0)) {
      Alert.alert("Invalid Commitment Fee", "Enter a whole number greater than 0, or turn the fee off.");
      return;
    }
    if (!accommodationForm.accommodationName.trim() || !accommodationForm.locationName.trim()) {
      Alert.alert("Missing Details", "Accommodation name and location are required.");
      return;
    }
    if (!accommodationForm.roomDescription.trim() || !accommodationForm.contact.trim()) {
      Alert.alert("Missing Details", "Room description and contact are required.");
      return;
    }

    const payload = {
      registrationId: effectiveRegistrationId,
      eventId: selectedAccommodationEventId,
      accommodationName: accommodationForm.accommodationName.trim(),
      locationName: accommodationForm.locationName.trim(),
      accommodationType: accommodationForm.accommodationType,
      lodgingTypes: accommodationForm.lodgingTypes,
      roomsAvailable,
      locationPin: accommodationForm.locationPin.trim() || undefined,
      pricePerRoom,
      roomDescription: accommodationForm.roomDescription.trim(),
      notPermitted: accommodationForm.notPermitted.trim() || undefined,
      features: accommodationForm.features,
      contact: accommodationForm.contact.trim(),
      preferredContactMethod: accommodationForm.preferredContactMethod,
      preferredGuestSex: accommodationForm.preferredGuestSex,
      requiresCommitmentFee: accommodationForm.requiresCommitmentFee,
      commitmentFee: accommodationForm.requiresCommitmentFee ? commitmentFee : 0,
    };

    if (editingAccommodationOfferId) {
      updateAccommodationOfferMutation.mutate({ ...payload, offerId: editingAccommodationOfferId });
      return;
    }

    createAccommodationOfferMutation.mutate(payload);
  };

  const handleAccommodationContact = (offer: any) => {
    openListingContact(
      offer,
      `Hello, I saw your RunNation accommodation listing for ${offer.eventName}. Is it still available?`
    );
  };

  const getAccommodationBookingDraft = (offerId: string) => {
    return accommodationBookingDrafts[offerId] ?? { occupants: [{ name: "", sex: "Male" as RideDriverSex }] };
  };

  const setAccommodationOccupantCount = (offerId: string, count: number) => {
    setAccommodationBookingDrafts((current) => {
      const draft = current[offerId] ?? { occupants: [{ name: "", sex: "Male" as RideDriverSex }] };
      const occupants = [...draft.occupants];
      while (occupants.length < count) occupants.push({ name: "", sex: "Male" as RideDriverSex });
      return { ...current, [offerId]: { occupants: occupants.slice(0, count) } };
    });
  };

  const updateAccommodationOccupant = (
    offerId: string,
    index: number,
    patch: Partial<{ name: string; sex: RideDriverSex }>
  ) => {
    setAccommodationBookingDrafts((current) => {
      const draft = current[offerId] ?? { occupants: [{ name: "", sex: "Male" as RideDriverSex }] };
      const occupants = draft.occupants.map((occupant, occupantIndex) =>
        occupantIndex === index ? { ...occupant, ...patch } : occupant
      );
      return { ...current, [offerId]: { occupants } };
    });
  };

  const toggleAccommodationFeature = (feature: AccommodationFeature) => {
    setAccommodationForm((current) => ({
      ...current,
      features: current.features.includes(feature)
        ? current.features.filter((value) => value !== feature)
        : [...current.features, feature],
    }));
  };

  const toggleLodgingType = (lodgingType: LodgingType) => {
    setAccommodationForm((current) => ({
      ...current,
      lodgingTypes: current.lodgingTypes.includes(lodgingType)
        ? current.lodgingTypes.filter((value) => value !== lodgingType)
        : [...current.lodgingTypes, lodgingType],
    }));
  };

  const handleAccommodationBook = (offer: any) => {
    const draft = getAccommodationBookingDraft(offer.offerId);
    const occupants = draft.occupants
      .map((occupant) => ({ name: occupant.name.trim(), sex: occupant.sex }))
      .filter((occupant) => occupant.name);
    if (occupants.length !== draft.occupants.length) {
      Alert.alert("Occupant Names Required", "Please enter the name and sex for every occupant.");
      return;
    }
    if (occupants.length > Number(offer.roomsRemaining || 0)) {
      Alert.alert("Not Enough Space", "This accommodation does not have enough available spaces.");
      return;
    }
    requestAccommodationBookingMutation.mutate({
      registrationId: effectiveRegistrationId,
      offerId: offer.offerId,
      occupants,
    });
    openListingContact(
      offer,
      `Hello, I requested your RunNation accommodation listing for ${offer.eventName} for ${occupants.length} occupant(s).`
    );
  };

  const handleCancelAccommodationOffer = (offerId: string) => {
    Alert.alert("Cancel Accommodation", "Cancel this accommodation listing and active booking requests?", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel Listing",
        style: "destructive",
        onPress: () => cancelAccommodationOfferMutation.mutate({ registrationId: effectiveRegistrationId, offerId }),
      },
    ]);
  };

  const renderFilterChips = (
    value: string,
    options: Array<{ value: string; label: string }>,
    onSelect: (value: string) => void
  ) => (
    <View style={styles.filterChipRow}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            style={[styles.filterChip, selected && styles.filterChipActive]}
            onPress={() => onSelect(option.value)}
          >
            <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderRideSharePanel = () => (
    <View style={styles.rideSharePanel}>
      <View style={styles.rideShareHero}>
        <View style={styles.rideShareHeroIcon}>
          <Car size={22} color={appColors.primary} />
        </View>
        <View style={styles.rideShareHeroTextBlock}>
          <Text style={styles.rideShareHeroTitle}>Event Ride Share</Text>
          <Text style={styles.rideShareHeroText}>
            Find a car to the race, or list seats for runners leaving from your town. Drivers get 30 days free, then a separate ride-share listing fee applies.
          </Text>
        </View>
      </View>

      <>
        <View style={styles.rideShareRegisterHeader}>
          <Text style={styles.rideShareSectionTitle}>Register my car</Text>
          <Pressable
            style={[styles.rideShareAddButton, rideShareEventOptions.length === 0 && styles.rideShareAddButtonDisabled]}
            onPress={() => setShowRideOfferForm((current) => !current)}
            disabled={rideShareEventOptions.length === 0}
          >
            <Plus size={18} color={rideShareEventOptions.length === 0 ? appColors.textSecondary : appColors.white} />
          </Pressable>
        </View>
        {rideShareEventOptions.length === 0 ? (
          <Text style={styles.rideShareNoRunsNote}>No Registered Runs</Text>
        ) : null}

        {showRideOfferForm ? (
          <View style={styles.rideShareFormCard}>
            <Pressable
              style={[
                styles.rideShareSelectButton,
                rideShareEventOptions.length === 0 && styles.rideShareSelectButtonDisabled,
              ]}
              onPress={() => rideShareEventOptions.length > 0 && setShowRideEventPicker(true)}
              disabled={rideShareEventOptions.length === 0}
            >
              <View style={styles.rideShareSelectTextBlock}>
                <Text style={styles.rideShareFieldLabel}>Run</Text>
                <Text style={[styles.rideShareSelectText, !selectedRideShareEvent && styles.rideShareSelectTextMuted]} numberOfLines={1}>
                  {selectedRideShareEvent?.event_name || "No Registered Runs"}
                </Text>
              </View>
              <ChevronDown size={18} color={appColors.textSecondary} />
            </Pressable>
            <Pressable
              style={styles.rideShareSelectButton}
              onPress={() => setShowVehicleTypePicker(true)}
            >
              <View style={styles.rideShareSelectTextBlock}>
                <Text style={styles.rideShareFieldLabel}>Car type</Text>
                <Text style={styles.rideShareSelectText} numberOfLines={1}>
                  {formatRideVehicleType(rideOfferForm.vehicleType)}
                </Text>
              </View>
              <ChevronDown size={18} color={appColors.textSecondary} />
            </Pressable>
            <View style={styles.rideShareInputRow}>
              <Pressable
                style={[styles.rideShareSelectButton, styles.rideShareSmallInput]}
                onPress={() => setShowSeatPicker(true)}
              >
                <View style={styles.rideShareSelectTextBlock}>
                  <Text style={styles.rideShareFieldLabel}>Available seats</Text>
                  <Text style={styles.rideShareSelectText}>{rideOfferForm.availableSeats}</Text>
                </View>
                <ChevronDown size={18} color={appColors.textSecondary} />
              </Pressable>
              <TextInput
                value={rideOfferForm.farePerSeat}
                onChangeText={(text) => setRideOfferForm((current) => ({ ...current, farePerSeat: text }))}
                placeholder="Fare / seat"
                placeholderTextColor={appColors.textSecondary}
                keyboardType="decimal-pad"
                style={styles.rideShareInput}
              />
            </View>
            <TextInput
              value={rideOfferForm.departureTown}
              onChangeText={(text) => setRideOfferForm((current) => ({ ...current, departureTown: text }))}
              placeholder="Departure town e.g Kampala-Kyanja"
              placeholderTextColor={appColors.textSecondary}
              style={styles.rideShareInput}
            />
            <Pressable
              style={styles.rideShareDateButton}
              onPress={() => {
                setDepartureCalendarMonth(new Date(selectedDepartureDate.getFullYear(), selectedDepartureDate.getMonth(), 1));
                if (!rideOfferForm.departureAt) {
                  const next = new Date();
                  next.setMinutes(next.getMinutes() < 30 ? 30 : 0);
                  if (next.getMinutes() === 0) next.setHours(next.getHours() + 1);
                  setRideOfferForm((current) => ({ ...current, departureAt: formatLocalDateTimeInput(next) }));
                }
                setShowDeparturePicker(true);
              }}
            >
              <Calendar size={16} color={appColors.primary} />
              <View style={styles.rideShareSelectTextBlock}>
                <Text style={styles.rideShareFieldLabel}>Departure date and time</Text>
                <Text style={[styles.rideShareSelectText, !rideOfferForm.departureAt && styles.rideShareSelectTextMuted]} numberOfLines={1}>
                  {formatRideDateTimeField(rideOfferForm.departureAt) || "Choose from calendar"}
                </Text>
              </View>
            </Pressable>
            <TextInput
              value={rideOfferForm.departureMeetingPoint}
              onChangeText={(text) => setRideOfferForm((current) => ({ ...current, departureMeetingPoint: text }))}
              placeholder="Departure Meeting point e.g The Local Restaurant-Kyanja"
              placeholderTextColor={appColors.textSecondary}
              style={styles.rideShareInput}
            />
            <TextInput
              value={rideOfferForm.contact}
              onChangeText={(text) => setRideOfferForm((current) => ({ ...current, contact: text }))}
              placeholder="Contact: e.g 256701111111"
              placeholderTextColor={appColors.textSecondary}
              keyboardType="phone-pad"
              style={styles.rideShareInput}
            />
            <Pressable
              style={styles.rideShareSelectButton}
              onPress={() => setShowContactPreferencePicker(true)}
            >
              <View style={styles.rideShareSelectTextBlock}>
                <Text style={styles.rideShareFieldLabel}>Preferred means of contact</Text>
                <Text style={styles.rideShareSelectText} numberOfLines={1}>
                  {formatRideContactPreference(rideOfferForm.preferredContactMethod)}
                </Text>
              </View>
              <ChevronDown size={18} color={appColors.textSecondary} />
            </Pressable>
            <Pressable
              style={styles.rideShareSelectButton}
              onPress={() => setShowDriverSexPicker(true)}
            >
              <View style={styles.rideShareSelectTextBlock}>
                <Text style={styles.rideShareFieldLabel}>Driver sex</Text>
                <Text style={styles.rideShareSelectText} numberOfLines={1}>
                  {formatRideDriverSex(rideOfferForm.driverSex)}
                </Text>
              </View>
              <ChevronDown size={18} color={appColors.textSecondary} />
            </Pressable>
            <Pressable
              style={styles.rideShareSelectButton}
              onPress={() => setShowBootSpacePicker(true)}
            >
              <View style={styles.rideShareSelectTextBlock}>
                <Text style={styles.rideShareFieldLabel}>Boot space</Text>
                <Text style={styles.rideShareSelectText} numberOfLines={1}>
                  {formatRideBootSpace(rideOfferForm.bootSpace)}
                </Text>
              </View>
              <ChevronDown size={18} color={appColors.textSecondary} />
            </Pressable>
            <View style={styles.rideShareCommitmentBox}>
              <Pressable
                style={styles.rideShareCommitmentToggle}
                onPress={() =>
                  setRideOfferForm((current) => ({
                    ...current,
                    requiresCommitmentFee: !current.requiresCommitmentFee,
                    commitmentFee: current.requiresCommitmentFee ? "" : current.commitmentFee,
                  }))
                }
              >
                <View style={[styles.rideShareCheckbox, rideOfferForm.requiresCommitmentFee && styles.rideShareCheckboxActive]}>
                  {rideOfferForm.requiresCommitmentFee ? <CheckCircle2 size={14} color={appColors.white} /> : null}
                </View>
                <View style={styles.rideShareSelectTextBlock}>
                  <Text style={styles.rideShareFieldLabel}>Commitment fee</Text>
                  <Text style={styles.rideShareSelectText}>Require fee before confirming booking</Text>
                </View>
              </Pressable>
              {rideOfferForm.requiresCommitmentFee ? (
                <TextInput
                  value={rideOfferForm.commitmentFee}
                  onChangeText={(text) => setRideOfferForm((current) => ({ ...current, commitmentFee: text }))}
                  placeholder="Commitment fee amount"
                  placeholderTextColor={appColors.textSecondary}
                  keyboardType="decimal-pad"
                  style={styles.rideShareInput}
                />
              ) : null}
            </View>
            <TextInput
              value={rideOfferForm.carType}
              onChangeText={(text) => setRideOfferForm((current) => ({ ...current, carType: text }))}
              placeholder="Car model, e.g. Toyota Noah"
              placeholderTextColor={appColors.textSecondary}
              style={styles.rideShareInput}
            />
            <TextInput
              value={rideOfferForm.numberPlate}
              onChangeText={(text) => setRideOfferForm((current) => ({ ...current, numberPlate: text }))}
              placeholder="Number plate, stored privately for safety"
              placeholderTextColor={appColors.textSecondary}
              autoCapitalize="characters"
              style={styles.rideShareInput}
            />
            <View style={styles.rideShareSexRow}>
              <Text style={styles.preferenceTitle}>Sex</Text>
              {(["Any", "Male", "Female"] as const).map((value) => (
                <Pressable
                  key={value}
                  style={[styles.rideShareSexButton, rideOfferForm.preferredSex === value && styles.rideShareSexButtonActive]}
                  onPress={() => setRideOfferForm((current) => ({ ...current, preferredSex: value }))}
                >
                  <Text style={[styles.rideShareSexText, rideOfferForm.preferredSex === value && styles.rideShareSexTextActive]}>
                    {value === "Any" ? "Any sex" : value}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[
                styles.rideSharePrimaryButton,
                (createRideOfferMutation.isPending || updateRideOfferMutation.isPending) && styles.rideShareButtonDisabled,
              ]}
              onPress={handleCreateRideOffer}
              disabled={createRideOfferMutation.isPending || updateRideOfferMutation.isPending}
            >
              <Text style={styles.rideSharePrimaryButtonText}>
                {createRideOfferMutation.isPending || updateRideOfferMutation.isPending
                  ? editingRideOfferId ? "Saving..." : "Registering..."
                  : editingRideOfferId ? "Save my car" : "Register my car"}
              </Text>
            </Pressable>
          </View>
        ) : null}

          <View style={styles.rideShareListHeader}>
            <Text style={styles.rideShareSectionTitle}>Available Cars</Text>
            <View style={styles.filterHeaderActions}>
              <Text style={styles.rideShareCountText}>{filteredRideShareOffers.length}/{rideShareOffers.length} listed</Text>
              <Pressable
                style={[styles.filterButton, showRideFilters && styles.filterButtonActive]}
                onPress={() => setShowRideFilters((current) => !current)}
              >
                <List size={13} color={showRideFilters ? appColors.white : appColors.primary} />
                <Text style={[styles.filterButtonText, showRideFilters && styles.filterButtonTextActive]}>Filter</Text>
              </Pressable>
            </View>
          </View>

          {showRideFilters ? (
            <View style={styles.filterPanel}>
              <Text style={styles.filterGroupLabel}>Car type</Text>
              {renderFilterChips(
                rideFilters.vehicleType,
                [{ value: "all", label: "All" }, ...RIDE_VEHICLE_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))],
                (value) => setRideFilters((current) => ({ ...current, vehicleType: value as "all" | RideVehicleType }))
              )}
              <Text style={styles.filterGroupLabel}>Available seats</Text>
              {renderFilterChips(
                rideFilters.minSeats,
                [
                  { value: "all", label: "Any" },
                  { value: "1", label: "1+" },
                  { value: "2", label: "2+" },
                  { value: "3", label: "3+" },
                ],
                (value) => setRideFilters((current) => ({ ...current, minSeats: value as "all" | "1" | "2" | "3" }))
              )}
              <Text style={styles.filterGroupLabel}>Driver sex</Text>
              {renderFilterChips(
                rideFilters.driverSex,
                [{ value: "all", label: "Any" }, ...RIDE_DRIVER_SEX_OPTIONS.map((option) => ({ value: option.value, label: option.value }))],
                (value) => setRideFilters((current) => ({ ...current, driverSex: value as "all" | RideDriverSex }))
              )}
              <Text style={styles.filterGroupLabel}>Boot space</Text>
              {renderFilterChips(
                rideFilters.bootSpace,
                [{ value: "all", label: "Any" }, ...RIDE_BOOT_SPACE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))],
                (value) => setRideFilters((current) => ({ ...current, bootSpace: value as "all" | RideBootSpace }))
              )}
              <Text style={styles.filterGroupLabel}>Contact</Text>
              {renderFilterChips(
                rideFilters.contact,
                [{ value: "all", label: "Any" }, ...RIDE_CONTACT_PREFERENCE_OPTIONS],
                (value) => setRideFilters((current) => ({ ...current, contact: value as ContactFilter }))
              )}
              <Text style={styles.filterGroupLabel}>Price</Text>
              {renderFilterChips(
                rideFilters.price,
                [
                  { value: "all", label: "Any" },
                  { value: "free", label: "Free" },
                  { value: "paid", label: "Paid" },
                ],
                (value) => setRideFilters((current) => ({ ...current, price: value as PriceFilter }))
              )}
            </View>
          ) : null}

          {!selectedRideShareEventId ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No Registered Runs</Text>
              <Text style={styles.emptySubtext}>Ride share opens when an approved active run is available.</Text>
            </View>
          ) : rideSharesQuery.isLoading ? (
            <View style={styles.rideShareLoadingCard}>
              <ActivityIndicator color={appColors.primary} />
              <Text style={styles.rideShareMutedText}>Loading cars...</Text>
            </View>
          ) : rideShareOffers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No cars listed yet</Text>
              <Text style={styles.emptySubtext}>Be the first driver to list available seats for this race.</Text>
            </View>
          ) : filteredRideShareOffers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No matching cars</Text>
              <Text style={styles.emptySubtext}>Adjust the filters to see more ride-share options.</Text>
            </View>
          ) : (
            filteredRideShareOffers.map((offer: any) => {
              const booking = offer.userBooking;
              const isPending = booking?.status === "pending";
              const isConfirmed = booking?.status === "confirmed";
              const canRequest = !offer.isDriver && !offer.canModerate && !booking && offer.seatsRemaining > 0 && offer.status === "active";
              return (
                <View key={offer.offerId} style={styles.rideShareOfferCard}>
                  <View style={styles.rideShareOfferHeader}>
                    <View style={styles.rideShareOfferTitleBlock}>
                      <Text style={styles.rideShareOfferEvent} numberOfLines={1}>{offer.eventName}</Text>
                      <Text style={styles.rideShareOfferRoute} numberOfLines={2}>
                        {offer.departureTown} to {offer.eventLocation || "event venue"}
                      </Text>
                    </View>
                    <View style={[styles.rideShareSeatBadge, offer.seatsRemaining <= 0 && styles.rideShareSeatBadgeFull]}>
                      <Users size={13} color={offer.seatsRemaining <= 0 ? "#991B1B" : appColors.primary} />
                      <Text style={[styles.rideShareSeatBadgeText, offer.seatsRemaining <= 0 && styles.rideShareSeatBadgeTextFull]}>
                        {offer.seatsRemaining} available
                      </Text>
                    </View>
                  </View>
                  <View style={styles.rideShareMetaGrid}>
                    <Text style={styles.rideShareMetaText}>Depart: {formatRideDateTime(offer.departureAt)}</Text>
                    {offer.departureMeetingPoint ? (
                      <Text style={styles.rideShareMetaText}>Meeting point: {offer.departureMeetingPoint}</Text>
                    ) : null}
                    {offer.contact ? (
                      <Text style={styles.rideShareMetaText}>Contact: {offer.contact}</Text>
                    ) : null}
                    <Text style={styles.rideShareMetaText}>Contact by: {formatRideContactPreference(offer.preferredContactMethod)}</Text>
                    <Text style={styles.rideShareMetaText}>Fare: {offer.farePerSeat ? formatMoneyAmount(offer.farePerSeat) : "Free"}</Text>
                    <Text style={styles.rideShareMetaText}>Car type: {formatRideVehicleType(offer.vehicleType)}</Text>
                    <Text style={styles.rideShareMetaText}>Car model: {offer.carType}</Text>
                    <Text style={styles.rideShareMetaText}>Driver sex: {formatRideDriverSex(offer.driverSex)}</Text>
                    <Text style={styles.rideShareMetaText}>Boot space: {formatRideBootSpace(offer.bootSpace)}</Text>
                    <Text style={styles.rideShareMetaText}>
                      Commitment fee: {offer.requiresCommitmentFee ? formatMoneyAmount(offer.commitmentFee) : "Not required"}
                    </Text>
                    {offer.status === "pending_approval" ? (
                      <Text style={styles.rideShareStatusText}>Status: Pending organizer/admin approval</Text>
                    ) : offer.status === "hidden" ? (
                      <Text style={styles.rideShareStatusText}>Status: Hidden</Text>
                    ) : null}
                    {offer.moderationReason ? (
                      <Text style={styles.rideShareStatusText}>Reason: {offer.moderationReason}</Text>
                    ) : null}
                    {offer.isDriver ? (
                      <Text style={styles.rideShareMetaText}>Plate: {offer.numberPlate || "Stored privately"}</Text>
                    ) : null}
                    <Text style={styles.rideShareMetaText}>Preferred: {offer.preferredSex || "Any sex"}</Text>
                  </View>
                  <View style={styles.rideShareDriverBox}>
                    <Text style={styles.rideShareDriverName}>Driver: {offer.driver?.name || "RunNation user"}</Text>
                    <Text style={styles.rideShareMutedText}>{formatRideContact(offer.driver)}</Text>
                  </View>

                  {offer.isDriver ? (
                    <View style={styles.rideShareDriverRequests}>
                      <View style={styles.rideShareActionRow}>
                        <Pressable
                          style={styles.rideShareSecondaryButton}
                          onPress={() => startEditRideOffer(offer)}
                        >
                          <Text style={styles.rideShareSecondaryButtonText}>My car</Text>
                        </Pressable>
                        <Pressable
                          style={styles.rideShareSecondaryButton}
                          onPress={() =>
                            setExpandedBookingsOfferId((current) => current === offer.offerId ? null : offer.offerId)
                          }
                        >
                          <Text style={styles.rideShareSecondaryButtonText}>My bookings</Text>
                        </Pressable>
                      </View>
                      <View style={styles.rideShareActionRow}>
                        <Pressable
                          style={styles.rideShareSecondaryButton}
                          onPress={() => handleRideOfferStatusAction(offer, offer.status === "hidden" ? "unhide" : "hide")}
                        >
                          <Text style={styles.rideShareSecondaryButtonText}>{offer.status === "hidden" ? "Unhide" : "Hide"}</Text>
                        </Pressable>
                        <Pressable
                          style={styles.rideShareSecondaryButton}
                          onPress={() => handleRideOfferStatusAction(offer, "delete")}
                        >
                          <Text style={styles.rideShareSecondaryButtonText}>Delete</Text>
                        </Pressable>
                      </View>
                      {expandedBookingsOfferId === offer.offerId ? (
                        <>
                          <Text style={styles.rideShareRequestsTitle}>Requests</Text>
                          {offer.bookings?.length ? offer.bookings.map((request: any) => (
                            <View key={request.bookingId} style={styles.rideShareRequestRow}>
                              <View style={styles.rideShareRequestInfo}>
                                <Text style={styles.rideShareRequestName}>{request.rider?.name || "Runner"}</Text>
                                <Text style={styles.rideShareMutedText}>{formatRideContact(request.rider)}</Text>
                                <Text style={styles.rideShareStatusText}>Status: {request.status}</Text>
                              </View>
                              {request.status === "pending" ? (
                                <View style={styles.rideShareRequestActions}>
                                  <Pressable
                                    style={styles.rideShareConfirmButton}
                                    onPress={() => updateRideBookingMutation.mutate({
                                      registrationId: effectiveRegistrationId,
                                      bookingId: request.bookingId,
                                      decision: "confirmed",
                                    })}
                                  >
                                    <Text style={styles.rideShareConfirmText}>Accept</Text>
                                  </Pressable>
                                  <Pressable
                                    style={styles.rideShareRejectButton}
                                    onPress={() => updateRideBookingMutation.mutate({
                                      registrationId: effectiveRegistrationId,
                                      bookingId: request.bookingId,
                                      decision: "rejected",
                                    })}
                                  >
                                    <Text style={styles.rideShareRejectText}>Decline</Text>
                                  </Pressable>
                                </View>
                              ) : null}
                            </View>
                          )) : (
                            <Text style={styles.rideShareMutedText}>No requests yet.</Text>
                          )}
                          <Pressable
                            style={styles.rideShareSecondaryButton}
                            onPress={() => handleCancelRideOffer(offer.offerId)}
                          >
                            <Text style={styles.rideShareSecondaryButtonText}>Cancel Listing</Text>
                          </Pressable>
                        </>
                      ) : null}
                    </View>
                  ) : (
                    <View style={styles.rideShareActionRow}>
                      {isPending || isConfirmed ? (
                        <>
                          <View style={[styles.rideShareStatusPill, isConfirmed && styles.rideShareStatusPillConfirmed]}>
                            <Text style={[styles.rideShareStatusPillText, isConfirmed && styles.rideShareStatusPillTextConfirmed]}>
                              {isConfirmed ? "Confirmed" : "Pending"}
                            </Text>
                          </View>
                          <Pressable
                            style={styles.rideShareSecondaryButton}
                            onPress={() => withdrawRideBookingMutation.mutate({
                              registrationId: effectiveRegistrationId,
                              bookingId: booking.bookingId,
                            })}
                          >
                            <Text style={styles.rideShareSecondaryButtonText}>Withdraw</Text>
                          </Pressable>
                          {isConfirmed ? (
                            <Pressable
                              style={styles.rideShareSecondaryButton}
                              onPress={() => void shareBookingReceipt("ride", offer)}
                            >
                              <Text style={styles.rideShareSecondaryButtonText}>Receipt</Text>
                            </Pressable>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <Pressable
                            style={styles.rideShareSecondaryButton}
                            onPress={() => handleRideContact(offer)}
                          >
                            <Text style={styles.rideShareSecondaryButtonText}>Contact</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.rideSharePrimaryButton, !canRequest && styles.rideShareButtonDisabled]}
                            disabled={!canRequest || requestRideBookingMutation.isPending}
                            onPress={() => handleRideBook(offer)}
                          >
                            <Text style={styles.rideSharePrimaryButtonText}>
                              {offer.seatsRemaining <= 0 ? "Full" : "Book"}
                            </Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  )}
                  {offer.canModerate && !offer.isDriver ? (
                    <View style={styles.rideShareDriverRequests}>
                      {offer.status === "pending_approval" ? (
                        <Pressable
                          style={styles.rideShareConfirmButton}
                          onPress={() => handleRideOfferStatusAction(offer, "approve")}
                        >
                          <Text style={styles.rideShareConfirmText}>Approve listing</Text>
                        </Pressable>
                      ) : null}
                      <View style={styles.rideShareActionRow}>
                        <Pressable
                          style={styles.rideShareSecondaryButton}
                          onPress={() => handleRideOfferStatusAction(offer, offer.status === "hidden" ? "unhide" : "hide")}
                        >
                          <Text style={styles.rideShareSecondaryButtonText}>{offer.status === "hidden" ? "Unhide" : "Hide"}</Text>
                        </Pressable>
                        <Pressable
                          style={styles.rideShareSecondaryButton}
                          onPress={() => handleRideOfferStatusAction(offer, "delete")}
                        >
                          <Text style={styles.rideShareSecondaryButtonText}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        <Modal visible={showRideEventPicker} transparent animationType="fade" onRequestClose={() => setShowRideEventPicker(false)}>
          <View style={styles.rideShareModalBackdrop}>
            <View style={styles.rideSharePickerModal}>
              <Text style={styles.rideSharePickerTitle}>Choose run</Text>
              <ScrollView style={styles.rideSharePickerList}>
                {rideShareEventOptions.map((item: any) => {
                  const isSelected = item.event_id === selectedRideShareEventId;
                  return (
                    <Pressable
                      key={item.event_id}
                      style={[styles.rideShareEventOption, isSelected && styles.rideShareEventOptionActive]}
                      onPress={() => {
                        setRideOfferForm((current) => ({ ...current, eventId: item.event_id }));
                        setShowRideEventPicker(false);
                      }}
                    >
                      <Text style={[styles.rideShareEventOptionText, isSelected && styles.rideShareEventOptionTextActive]} numberOfLines={2}>
                        {item.event_name || "Unnamed run"}
                      </Text>
                      <Text style={styles.rideShareEventOptionMeta} numberOfLines={1}>
                        {formatShortEventDate(item.starts_at || item.startsAt) || "TBA"}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable style={styles.rideShareSecondaryButton} onPress={() => setShowRideEventPicker(false)}>
                <Text style={styles.rideShareSecondaryButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal
          visible={!!rideModerationDraft}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setRideModerationDraft(null);
            setRideModerationReason("");
          }}
        >
          <View style={styles.rideShareModalBackdrop}>
            <View style={styles.rideSharePickerModal}>
              <Text style={styles.rideSharePickerTitle}>{rideModerationDraft?.title || "Moderate car"}</Text>
              <TextInput
                value={rideModerationReason}
                onChangeText={setRideModerationReason}
                placeholder="Reason required"
                placeholderTextColor={appColors.textSecondary}
                multiline
                style={[styles.rideShareInput, styles.rideShareReasonInput]}
              />
              <View style={styles.rideShareActionRow}>
                <Pressable
                  style={styles.rideShareSecondaryButton}
                  onPress={() => {
                    setRideModerationDraft(null);
                    setRideModerationReason("");
                  }}
                >
                  <Text style={styles.rideShareSecondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.rideSharePrimaryButton, !rideModerationReason.trim() && styles.rideShareButtonDisabled]}
                  disabled={!rideModerationReason.trim() || updateRideOfferStatusMutation.isPending}
                  onPress={() => {
                    if (!rideModerationDraft) return;
                    runRideOfferStatusAction(rideModerationDraft.offerId, rideModerationDraft.action, rideModerationReason.trim());
                  }}
                >
                  <Text style={styles.rideSharePrimaryButtonText}>Submit</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showContactPreferencePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowContactPreferencePicker(false)}
        >
          <View style={styles.rideShareModalBackdrop}>
            <View style={styles.rideSharePickerModal}>
              <Text style={styles.rideSharePickerTitle}>Preferred means of contact</Text>
              {RIDE_CONTACT_PREFERENCE_OPTIONS.map((option) => {
                const isSelected = rideOfferForm.preferredContactMethod === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.rideShareEventOption, isSelected && styles.rideShareEventOptionActive]}
                    onPress={() => {
                      setRideOfferForm((current) => ({ ...current, preferredContactMethod: option.value }));
                      setShowContactPreferencePicker(false);
                    }}
                  >
                    <Text style={[styles.rideShareEventOptionText, isSelected && styles.rideShareEventOptionTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable style={styles.rideShareSecondaryButton} onPress={() => setShowContactPreferencePicker(false)}>
                <Text style={styles.rideShareSecondaryButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={showSeatPicker} transparent animationType="fade" onRequestClose={() => setShowSeatPicker(false)}>
          <View style={styles.rideShareModalBackdrop}>
            <View style={styles.rideSharePickerModal}>
              <Text style={styles.rideSharePickerTitle}>Available seats ({selectedVehicleType.label})</Text>
              <View style={styles.rideShareSeatPickerGrid}>
                {seatOptions.map((seat) => {
                  const isSelected = rideOfferForm.availableSeats === String(seat);
                  return (
                    <Pressable
                      key={seat}
                      style={[styles.rideShareSeatPickerOption, isSelected && styles.rideShareTimeOptionActive]}
                      onPress={() => {
                        setRideOfferForm((current) => ({ ...current, availableSeats: String(seat) }));
                        setShowSeatPicker(false);
                      }}
                    >
                      <Text style={[styles.rideShareTimeOptionText, isSelected && styles.rideShareTimeOptionTextActive]}>
                        {seat}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable style={styles.rideShareSecondaryButton} onPress={() => setShowSeatPicker(false)}>
                <Text style={styles.rideShareSecondaryButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={showVehicleTypePicker} transparent animationType="fade" onRequestClose={() => setShowVehicleTypePicker(false)}>
          <View style={styles.rideShareModalBackdrop}>
            <View style={styles.rideSharePickerModal}>
              <Text style={styles.rideSharePickerTitle}>Car type</Text>
              {RIDE_VEHICLE_TYPE_OPTIONS.map((option) => {
                const isSelected = rideOfferForm.vehicleType === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.rideShareEventOption, isSelected && styles.rideShareEventOptionActive]}
                    onPress={() => {
                      setRideOfferForm((current) => ({
                        ...current,
                        vehicleType: option.value,
                        availableSeats: String(Math.min(Number(current.availableSeats || 1), option.maxSeats)),
                      }));
                      setShowVehicleTypePicker(false);
                    }}
                  >
                    <Text style={[styles.rideShareEventOptionText, isSelected && styles.rideShareEventOptionTextActive]}>
                      {option.label}
                    </Text>
                    <Text style={styles.rideShareEventOptionMeta}>Up to {option.maxSeats} passengers</Text>
                  </Pressable>
                );
              })}
              <Pressable style={styles.rideShareSecondaryButton} onPress={() => setShowVehicleTypePicker(false)}>
                <Text style={styles.rideShareSecondaryButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={showDriverSexPicker} transparent animationType="fade" onRequestClose={() => setShowDriverSexPicker(false)}>
          <View style={styles.rideShareModalBackdrop}>
            <View style={styles.rideSharePickerModal}>
              <Text style={styles.rideSharePickerTitle}>Driver sex</Text>
              {RIDE_DRIVER_SEX_OPTIONS.map((option) => {
                const isSelected = rideOfferForm.driverSex === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.rideShareEventOption, isSelected && styles.rideShareEventOptionActive]}
                    onPress={() => {
                      setRideOfferForm((current) => ({ ...current, driverSex: option.value }));
                      setShowDriverSexPicker(false);
                    }}
                  >
                    <Text style={[styles.rideShareEventOptionText, isSelected && styles.rideShareEventOptionTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable style={styles.rideShareSecondaryButton} onPress={() => setShowDriverSexPicker(false)}>
                <Text style={styles.rideShareSecondaryButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={showBootSpacePicker} transparent animationType="fade" onRequestClose={() => setShowBootSpacePicker(false)}>
          <View style={styles.rideShareModalBackdrop}>
            <View style={styles.rideSharePickerModal}>
              <Text style={styles.rideSharePickerTitle}>Boot space</Text>
              {RIDE_BOOT_SPACE_OPTIONS.map((option) => {
                const isSelected = rideOfferForm.bootSpace === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.rideShareEventOption, isSelected && styles.rideShareEventOptionActive]}
                    onPress={() => {
                      setRideOfferForm((current) => ({ ...current, bootSpace: option.value }));
                      setShowBootSpacePicker(false);
                    }}
                  >
                    <Text style={[styles.rideShareEventOptionText, isSelected && styles.rideShareEventOptionTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable style={styles.rideShareSecondaryButton} onPress={() => setShowBootSpacePicker(false)}>
                <Text style={styles.rideShareSecondaryButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={showDeparturePicker} transparent animationType="fade" onRequestClose={() => setShowDeparturePicker(false)}>
          <View style={styles.rideShareModalBackdrop}>
            <View style={styles.rideSharePickerModal}>
              <View style={styles.rideShareCalendarHeader}>
                <Pressable
                  style={styles.rideShareCalendarNav}
                  onPress={() => setDepartureCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                >
                  <Text style={styles.rideShareCalendarNavText}>{"<"}</Text>
                </Pressable>
                <Text style={styles.rideSharePickerTitle}>
                  {departureCalendarMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                </Text>
                <Pressable
                  style={styles.rideShareCalendarNav}
                  onPress={() => setDepartureCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                >
                  <Text style={styles.rideShareCalendarNavText}>{">"}</Text>
                </Pressable>
              </View>
              <View style={styles.rideShareWeekRow}>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                  <Text key={day} style={styles.rideShareWeekText}>{day}</Text>
                ))}
              </View>
              <View style={styles.rideShareCalendarGrid}>
                {departureCalendarDays.map((date, index) => {
                  const isSelected =
                    !!date &&
                    date.getFullYear() === selectedDepartureDate.getFullYear() &&
                    date.getMonth() === selectedDepartureDate.getMonth() &&
                    date.getDate() === selectedDepartureDate.getDate();
                  return (
                    <Pressable
                      key={date ? date.toISOString() : `blank-${index}`}
                      style={[styles.rideShareCalendarDay, isSelected && styles.rideShareCalendarDayActive]}
                      disabled={!date}
                      onPress={() => date && updateDepartureDatePart(date)}
                    >
                      <Text style={[styles.rideShareCalendarDayText, isSelected && styles.rideShareCalendarDayTextActive]}>
                        {date ? date.getDate() : ""}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.rideShareFieldLabel}>Hour</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rideShareTimeOptions}>
                {departureHourOptions.map((hour) => {
                  const isSelected = selectedDepartureDate.getHours() === hour;
                  return (
                    <Pressable
                      key={hour}
                      style={[styles.rideShareTimeOption, isSelected && styles.rideShareTimeOptionActive]}
                      onPress={() => updateDepartureTimePart(hour, selectedDepartureDate.getMinutes())}
                    >
                      <Text style={[styles.rideShareTimeOptionText, isSelected && styles.rideShareTimeOptionTextActive]}>
                        {padDatePart(hour)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={styles.rideShareFieldLabel}>Minutes</Text>
              <View style={styles.rideShareMinuteOptions}>
                {departureMinuteOptions.map((minute) => {
                  const isSelected = selectedDepartureDate.getMinutes() === minute;
                  return (
                    <Pressable
                      key={minute}
                      style={[styles.rideShareTimeOption, isSelected && styles.rideShareTimeOptionActive]}
                      onPress={() => updateDepartureTimePart(selectedDepartureDate.getHours(), minute)}
                    >
                      <Text style={[styles.rideShareTimeOptionText, isSelected && styles.rideShareTimeOptionTextActive]}>
                        {padDatePart(minute)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable style={styles.rideSharePrimaryButton} onPress={() => setShowDeparturePicker(false)}>
                <Text style={styles.rideSharePrimaryButtonText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </>
    </View>
  );

  const renderAccommodationPanel = () => (
    <View style={styles.rideSharePanel}>
      <View style={styles.rideShareHero}>
        <View style={styles.rideShareHeroIcon}>
          <MapPin size={22} color={appColors.primary} />
        </View>
        <View style={styles.rideShareHeroTextBlock}>
          <Text style={styles.rideShareHeroTitle}>Event Accommodation</Text>
          <Text style={styles.rideShareHeroText}>
            Find a place near the race, or list rooms available for runners. Hosts get 30 days free, then a separate accommodation listing fee applies.
          </Text>
        </View>
      </View>

      <View style={styles.rideShareRegisterHeader}>
        <Text style={styles.rideShareSectionTitle}>Add accommodation</Text>
        <Pressable
          style={[styles.rideShareAddButton, rideShareEventOptions.length === 0 && styles.rideShareAddButtonDisabled]}
          onPress={() => setShowAccommodationForm((current) => !current)}
          disabled={rideShareEventOptions.length === 0}
        >
          <Plus size={18} color={rideShareEventOptions.length === 0 ? appColors.textSecondary : appColors.white} />
        </Pressable>
      </View>
      {rideShareEventOptions.length === 0 ? <Text style={styles.rideShareNoRunsNote}>No Registered Runs</Text> : null}

      {showAccommodationForm ? (
        <View style={styles.rideShareFormCard}>
          <Pressable
            style={[styles.rideShareSelectButton, rideShareEventOptions.length === 0 && styles.rideShareSelectButtonDisabled]}
            onPress={() => rideShareEventOptions.length > 0 && setShowAccommodationEventPicker(true)}
            disabled={rideShareEventOptions.length === 0}
          >
            <View style={styles.rideShareSelectTextBlock}>
              <Text style={styles.rideShareFieldLabel}>Run</Text>
              <Text style={[styles.rideShareSelectText, !selectedAccommodationEvent && styles.rideShareSelectTextMuted]} numberOfLines={1}>
                {selectedAccommodationEvent?.event_name || "No Registered Runs"}
              </Text>
            </View>
            <ChevronDown size={18} color={appColors.textSecondary} />
          </Pressable>
          <View style={styles.rideShareSexRow}>
            {(["single", "shared", "mixed"] as AccommodationType[]).map((value) => (
              <Pressable
                key={value}
                style={[styles.rideShareSexButton, accommodationForm.accommodationType === value && styles.rideShareSexButtonActive]}
                onPress={() => setAccommodationForm((current) => ({ ...current, accommodationType: value }))}
              >
                <Text style={[styles.rideShareSexText, accommodationForm.accommodationType === value && styles.rideShareSexTextActive]}>
                  {value === "single" ? "Single" : value === "shared" ? "Shared" : "Mixed"}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.rideShareCommitmentBox}>
            <Text style={styles.rideShareFieldLabel}>Accommodation category</Text>
            <View style={styles.filterChipRow}>
              {LODGING_TYPE_OPTIONS.map((option) => {
                const selected = accommodationForm.lodgingTypes.includes(option.value);
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.amenityChip, selected && styles.amenityChipActive]}
                    onPress={() => toggleLodgingType(option.value)}
                  >
                    {selected ? <CheckCircle2 size={13} color={appColors.primary} /> : null}
                    <Text style={[styles.amenityChipText, selected && styles.amenityChipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <TextInput
            value={accommodationForm.accommodationName}
            onChangeText={(text) => setAccommodationForm((current) => ({ ...current, accommodationName: text }))}
            placeholder="Name e.g Kilembe Highway Motel"
            placeholderTextColor={appColors.textSecondary}
            style={styles.rideShareInput}
          />
          <TextInput
            value={accommodationForm.locationName}
            onChangeText={(text) => setAccommodationForm((current) => ({ ...current, locationName: text }))}
            placeholder="Location e.g Kilembe trading Center"
            placeholderTextColor={appColors.textSecondary}
            style={styles.rideShareInput}
          />
          <View style={styles.rideShareInputRow}>
            <Pressable
              style={[styles.rideShareSelectButton, styles.rideShareSmallInput]}
              onPress={() => setShowAccommodationRoomsPicker(true)}
            >
              <View style={styles.rideShareSelectTextBlock}>
                <Text style={styles.rideShareFieldLabel}>Guest capacity</Text>
                <Text style={styles.rideShareSelectText}>{accommodationForm.roomsAvailable}</Text>
              </View>
              <ChevronDown size={18} color={appColors.textSecondary} />
            </Pressable>
            <TextInput
              value={accommodationForm.pricePerRoom}
              onChangeText={(text) => setAccommodationForm((current) => ({ ...current, pricePerRoom: text.replace(/[^0-9]/g, "") }))}
              placeholder={accommodationForm.accommodationType === "single" ? "Price / room" : "Price / guest"}
              placeholderTextColor={appColors.textSecondary}
              keyboardType="number-pad"
              style={styles.rideShareInput}
            />
          </View>
          <TextInput
            value={accommodationForm.locationPin}
            onChangeText={(text) => setAccommodationForm((current) => ({ ...current, locationPin: text }))}
            placeholder="Location pin e.g Google Maps link"
            placeholderTextColor={appColors.textSecondary}
            keyboardType="url"
            autoCapitalize="none"
            style={styles.rideShareInput}
          />
          <TextInput
            value={accommodationForm.roomDescription}
            onChangeText={(text) => setAccommodationForm((current) => ({ ...current, roomDescription: text }))}
            placeholder="Room description"
            placeholderTextColor={appColors.textSecondary}
            multiline
            style={[styles.rideShareInput, styles.rideShareReasonInput]}
          />
          <View style={styles.rideShareCommitmentBox}>
            <Text style={styles.rideShareFieldLabel}>Features</Text>
            <View style={styles.filterChipRow}>
              {ACCOMMODATION_FEATURE_OPTIONS.map((option) => {
                const selected = accommodationForm.features.includes(option.value);
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.amenityChip, selected && styles.amenityChipActive]}
                    onPress={() => toggleAccommodationFeature(option.value)}
                  >
                    {selected ? <CheckCircle2 size={13} color={appColors.primary} /> : null}
                    <Text style={[styles.amenityChipText, selected && styles.amenityChipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <TextInput
            value={accommodationForm.notPermitted}
            onChangeText={(text) => setAccommodationForm((current) => ({ ...current, notPermitted: text }))}
            placeholder="Not permitted e.g pets, alcohol (optional)"
            placeholderTextColor={appColors.textSecondary}
            multiline
            style={[styles.rideShareInput, styles.rideShareReasonInput]}
          />
          <TextInput
            value={accommodationForm.contact}
            onChangeText={(text) => setAccommodationForm((current) => ({ ...current, contact: text }))}
            placeholder="Contact: e.g 256701111111"
            placeholderTextColor={appColors.textSecondary}
            keyboardType="phone-pad"
            style={styles.rideShareInput}
          />
          <View style={styles.rideShareSexRow}>
            <Text style={styles.preferenceTitle}>Contact</Text>
            {RIDE_CONTACT_PREFERENCE_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.rideShareSexButton, accommodationForm.preferredContactMethod === option.value && styles.rideShareSexButtonActive]}
                onPress={() => setAccommodationForm((current) => ({ ...current, preferredContactMethod: option.value }))}
              >
                <Text style={[styles.rideShareSexText, accommodationForm.preferredContactMethod === option.value && styles.rideShareSexTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.rideShareSexRow}>
            <Text style={styles.preferenceTitle}>Sex</Text>
            {(["Any", "Male", "Female"] as const).map((value) => (
              <Pressable
                key={value}
                style={[styles.rideShareSexButton, accommodationForm.preferredGuestSex === value && styles.rideShareSexButtonActive]}
                onPress={() => setAccommodationForm((current) => ({ ...current, preferredGuestSex: value }))}
              >
                <Text style={[styles.rideShareSexText, accommodationForm.preferredGuestSex === value && styles.rideShareSexTextActive]}>
                  {value === "Any" ? "Any guest" : `${value} guest`}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.rideShareCommitmentBox}>
            <Pressable
              style={styles.rideShareCommitmentToggle}
              onPress={() =>
                setAccommodationForm((current) => ({
                  ...current,
                  requiresCommitmentFee: !current.requiresCommitmentFee,
                  commitmentFee: current.requiresCommitmentFee ? "" : current.commitmentFee,
                }))
              }
            >
              <View style={[styles.rideShareCheckbox, accommodationForm.requiresCommitmentFee && styles.rideShareCheckboxActive]}>
                {accommodationForm.requiresCommitmentFee ? <CheckCircle2 size={14} color={appColors.white} /> : null}
              </View>
              <View style={styles.rideShareSelectTextBlock}>
                <Text style={styles.rideShareFieldLabel}>Commitment fee</Text>
                <Text style={styles.rideShareSelectText}>Require fee before confirming booking</Text>
              </View>
            </Pressable>
            {accommodationForm.requiresCommitmentFee ? (
              <TextInput
                value={accommodationForm.commitmentFee}
                onChangeText={(text) => setAccommodationForm((current) => ({ ...current, commitmentFee: text.replace(/[^0-9]/g, "") }))}
                placeholder="Commitment fee amount"
                placeholderTextColor={appColors.textSecondary}
                keyboardType="number-pad"
                style={styles.rideShareInput}
              />
            ) : null}
          </View>
          <Pressable
            style={[
              styles.rideSharePrimaryButton,
              (createAccommodationOfferMutation.isPending || updateAccommodationOfferMutation.isPending) && styles.rideShareButtonDisabled,
            ]}
            onPress={handleCreateAccommodationOffer}
            disabled={createAccommodationOfferMutation.isPending || updateAccommodationOfferMutation.isPending}
          >
            <Text style={styles.rideSharePrimaryButtonText}>
              {editingAccommodationOfferId ? "Save accommodation" : "Add accommodation"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.rideShareListHeader}>
        <Text style={styles.rideShareSectionTitle}>Available Accommodation</Text>
        <View style={styles.filterHeaderActions}>
          <Text style={styles.rideShareCountText}>{filteredAccommodationOffers.length}/{accommodationOffers.length} listed</Text>
          <Pressable
            style={[styles.filterButton, showAccommodationFilters && styles.filterButtonActive]}
            onPress={() => setShowAccommodationFilters((current) => !current)}
          >
            <List size={13} color={showAccommodationFilters ? appColors.white : appColors.primary} />
            <Text style={[styles.filterButtonText, showAccommodationFilters && styles.filterButtonTextActive]}>Filter</Text>
          </Pressable>
        </View>
      </View>

      {showAccommodationFilters ? (
        <View style={styles.filterPanel}>
          <Text style={styles.filterGroupLabel}>Accommodation type</Text>
          {renderFilterChips(
            accommodationFilters.accommodationType,
            [
              { value: "all", label: "All" },
              { value: "single", label: "Single" },
              { value: "shared", label: "Shared" },
              { value: "mixed", label: "Mixed" },
            ],
            (value) => setAccommodationFilters((current) => ({ ...current, accommodationType: value as "all" | AccommodationType }))
          )}
          <Text style={styles.filterGroupLabel}>Rooms</Text>
          {renderFilterChips(
            accommodationFilters.minRooms,
            [
              { value: "all", label: "Any" },
              { value: "1", label: "1+" },
              { value: "2", label: "2+" },
              { value: "3", label: "3+" },
            ],
            (value) => setAccommodationFilters((current) => ({ ...current, minRooms: value as "all" | "1" | "2" | "3" }))
          )}
          <Text style={styles.filterGroupLabel}>Guest preference</Text>
          {renderFilterChips(
            accommodationFilters.guestSex,
            [
              { value: "all", label: "Any" },
              { value: "Male", label: "Male" },
              { value: "Female", label: "Female" },
            ],
            (value) => setAccommodationFilters((current) => ({ ...current, guestSex: value as "all" | "Male" | "Female" }))
          )}
          <Text style={styles.filterGroupLabel}>Contact</Text>
          {renderFilterChips(
            accommodationFilters.contact,
            [{ value: "all", label: "Any" }, ...RIDE_CONTACT_PREFERENCE_OPTIONS],
            (value) => setAccommodationFilters((current) => ({ ...current, contact: value as ContactFilter }))
          )}
          <Text style={styles.filterGroupLabel}>Price</Text>
          {renderFilterChips(
            accommodationFilters.price,
            [
              { value: "all", label: "Any" },
              { value: "free", label: "Free" },
              { value: "paid", label: "Paid" },
            ],
            (value) => setAccommodationFilters((current) => ({ ...current, price: value as PriceFilter }))
          )}
        </View>
      ) : null}

      {!selectedAccommodationEventId ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No Registered Runs</Text>
          <Text style={styles.emptySubtext}>Accommodation opens when an approved active run is available.</Text>
        </View>
      ) : accommodationsQuery.isLoading ? (
        <View style={styles.rideShareLoadingCard}>
          <ActivityIndicator color={appColors.primary} />
          <Text style={styles.rideShareMutedText}>Loading accommodation...</Text>
        </View>
      ) : accommodationOffers.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No accommodation listed yet</Text>
          <Text style={styles.emptySubtext}>Be the first to list a room or shared stay for this race.</Text>
        </View>
      ) : filteredAccommodationOffers.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No matching accommodation</Text>
          <Text style={styles.emptySubtext}>Adjust the filters to see more stay options.</Text>
        </View>
      ) : (
        filteredAccommodationOffers.map((offer: any) => {
          const booking = offer.userBooking;
          const isPending = booking?.status === "pending";
          const isConfirmed = booking?.status === "confirmed";
          const canRequest = !offer.isHost && !booking && offer.roomsRemaining > 0 && offer.status === "active";
          const bookingDraft = getAccommodationBookingDraft(offer.offerId);
          return (
            <View key={offer.offerId} style={styles.rideShareOfferCard}>
              <View style={styles.rideShareOfferHeader}>
                <View style={styles.rideShareOfferTitleBlock}>
                  <Text style={styles.rideShareOfferEvent} numberOfLines={1}>{offer.accommodationName || offer.eventName}</Text>
                  <Text style={styles.rideShareOfferRoute} numberOfLines={2}>
                    {formatAccommodationType(offer.accommodationType)} | {offer.locationName || offer.eventLocation || "event venue"}
                  </Text>
                </View>
                <View style={[styles.rideShareSeatBadge, offer.roomsRemaining <= 0 && styles.rideShareSeatBadgeFull]}>
                  <Users size={13} color={offer.roomsRemaining <= 0 ? "#991B1B" : appColors.primary} />
                  <Text style={[styles.rideShareSeatBadgeText, offer.roomsRemaining <= 0 && styles.rideShareSeatBadgeTextFull]}>
                    {offer.roomsRemaining} {offer.accommodationType === "shared" ? "spaces" : "rooms"}
                  </Text>
                </View>
              </View>
              <View style={styles.rideShareMetaGrid}>
                <Text style={styles.rideShareMetaText}>Event: {offer.eventName}</Text>
                <Text style={styles.rideShareMetaText}>
                  Price: {offer.pricePerRoom ? formatMoneyAmount(offer.pricePerRoom) : "Free"} / {offer.accommodationType === "single" ? "room" : "guest"}
                </Text>
                {Array.isArray(offer.lodgingTypes) && offer.lodgingTypes.length ? (
                  <Text style={styles.rideShareMetaText}>
                    Category: {offer.lodgingTypes.map((type: string) => formatLodgingType(type)).filter(Boolean).join(", ")}
                  </Text>
                ) : null}
                <Text style={styles.rideShareMetaText}>Contact by: {formatRideContactPreference(offer.preferredContactMethod)}</Text>
                <Text style={styles.rideShareMetaText}>Preferred guest: {offer.preferredGuestSex || "Any sex"}</Text>
                <Text style={styles.rideShareMetaText}>
                  Commitment fee: {offer.requiresCommitmentFee ? formatMoneyAmount(offer.commitmentFee) : "Not required"}
                </Text>
                {offer.locationPin ? (
                  <Pressable
                    onPress={() => {
                      if (isLocationPinLink(offer.locationPin)) {
                        Linking.openURL(offer.locationPin).catch(() =>
                          Alert.alert("Location Pin", "Could not open this location pin.")
                        );
                      }
                    }}
                    disabled={!isLocationPinLink(offer.locationPin)}
                  >
                    <Text style={styles.rideShareMetaText}>
                      Pin: {isLocationPinLink(offer.locationPin) ? "Open location pin" : offer.locationPin}
                    </Text>
                  </Pressable>
                ) : null}
                <Text style={styles.rideShareMetaText}>{offer.roomDescription}</Text>
                {Array.isArray(offer.features) && offer.features.length ? (
                  <Text style={styles.rideShareMetaText}>
                    Features: {offer.features.map((feature: string) => formatAccommodationFeature(feature)).filter(Boolean).join(", ")}
                  </Text>
                ) : null}
                {offer.notPermitted ? (
                  <Text style={styles.rideShareStatusText}>Not permitted: {offer.notPermitted}</Text>
                ) : null}
              </View>
              <View style={styles.rideShareDriverBox}>
                <Text style={styles.rideShareDriverName}>Host: {offer.host?.name || "RunNation user"}</Text>
                <Text style={styles.rideShareMutedText}>{formatRideContact(offer.host)}</Text>
              </View>
              {offer.isHost ? (
                <View style={styles.rideShareDriverRequests}>
                  <View style={styles.rideShareActionRow}>
                    <Pressable style={styles.rideShareSecondaryButton} onPress={() => startEditAccommodationOffer(offer)}>
                      <Text style={styles.rideShareSecondaryButtonText}>My stay</Text>
                    </Pressable>
                    <Pressable
                      style={styles.rideShareSecondaryButton}
                      onPress={() => setExpandedAccommodationBookingsOfferId((current) => current === offer.offerId ? null : offer.offerId)}
                    >
                      <Text style={styles.rideShareSecondaryButtonText}>My bookings</Text>
                    </Pressable>
                  </View>
                  {expandedAccommodationBookingsOfferId === offer.offerId ? (
                    <>
                      <Text style={styles.rideShareRequestsTitle}>Requests</Text>
                      {offer.bookings?.length ? offer.bookings.map((request: any) => (
                        <View key={request.bookingId} style={styles.rideShareRequestRow}>
                          <View style={styles.rideShareRequestInfo}>
                            <Text style={styles.rideShareRequestName}>{request.guest?.name || "Runner"}</Text>
                            <Text style={styles.rideShareMutedText}>{formatRideContact(request.guest)}</Text>
                            <Text style={styles.rideShareMutedText}>
                              Occupants: {(request.occupants || []).map((occupant: any) => `${occupant.name} (${occupant.sex})`).join(", ") || request.occupantCount}
                            </Text>
                            <Text style={styles.rideShareStatusText}>Status: {request.status}</Text>
                          </View>
                          {request.status === "pending" ? (
                            <View style={styles.rideShareRequestActions}>
                              <Pressable
                                style={styles.rideShareConfirmButton}
                                onPress={() => updateAccommodationBookingMutation.mutate({
                                  registrationId: effectiveRegistrationId,
                                  bookingId: request.bookingId,
                                  decision: "confirmed",
                                })}
                              >
                                <Text style={styles.rideShareConfirmText}>Accept</Text>
                              </Pressable>
                              <Pressable
                                style={styles.rideShareRejectButton}
                                onPress={() => updateAccommodationBookingMutation.mutate({
                                  registrationId: effectiveRegistrationId,
                                  bookingId: request.bookingId,
                                  decision: "rejected",
                                })}
                              >
                                <Text style={styles.rideShareRejectText}>Decline</Text>
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      )) : (
                        <Text style={styles.rideShareMutedText}>No requests yet.</Text>
                      )}
                      <Pressable style={styles.rideShareSecondaryButton} onPress={() => handleCancelAccommodationOffer(offer.offerId)}>
                        <Text style={styles.rideShareSecondaryButtonText}>Cancel Listing</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              ) : (
                <View style={styles.rideShareDriverRequests}>
                  {isPending || isConfirmed ? (
                    <>
                      <View style={[styles.rideShareStatusPill, isConfirmed && styles.rideShareStatusPillConfirmed]}>
                        <Text style={[styles.rideShareStatusPillText, isConfirmed && styles.rideShareStatusPillTextConfirmed]}>
                          {isConfirmed ? "Confirmed" : "Pending"}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.rideShareSecondaryButton}
                        onPress={() => withdrawAccommodationBookingMutation.mutate({
                          registrationId: effectiveRegistrationId,
                          bookingId: booking.bookingId,
                        })}
                      >
                        <Text style={styles.rideShareSecondaryButtonText}>Withdraw</Text>
                      </Pressable>
                      {isConfirmed ? (
                        <Pressable
                          style={styles.rideShareSecondaryButton}
                          onPress={() => void shareBookingReceipt("accommodation", offer)}
                        >
                          <Text style={styles.rideShareSecondaryButtonText}>Receipt</Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <View style={styles.bookingDraftBox}>
                        <Text style={styles.rideShareFieldLabel}>Occupants</Text>
                        <View style={styles.rideShareSeatPickerGrid}>
                          {Array.from({ length: Math.min(Number(offer.roomsRemaining || 1), 6) }, (_, index) => index + 1).map((count) => {
                            const isSelected = bookingDraft.occupants.length === count;
                            return (
                              <Pressable
                                key={count}
                                style={[styles.rideShareSeatPickerOption, isSelected && styles.rideShareTimeOptionActive]}
                                onPress={() => setAccommodationOccupantCount(offer.offerId, count)}
                              >
                                <Text style={[styles.rideShareTimeOptionText, isSelected && styles.rideShareTimeOptionTextActive]}>{count}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        {bookingDraft.occupants.map((occupant, index) => (
                          <View key={`${offer.offerId}-occupant-${index}`} style={styles.occupantInputRow}>
                            <TextInput
                              value={occupant.name}
                              onChangeText={(text) => updateAccommodationOccupant(offer.offerId, index, { name: text })}
                              placeholder={`Occupant ${index + 1} name`}
                              placeholderTextColor={appColors.textSecondary}
                              style={[styles.rideShareInput, styles.occupantNameInput]}
                            />
                            {(["Male", "Female"] as RideDriverSex[]).map((sex) => (
                              <Pressable
                                key={sex}
                                style={[styles.occupantSexButton, occupant.sex === sex && styles.rideShareSexButtonActive]}
                                onPress={() => updateAccommodationOccupant(offer.offerId, index, { sex })}
                              >
                                <Text style={[styles.rideShareSexText, occupant.sex === sex && styles.rideShareSexTextActive]}>
                                  {sex}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        ))}
                      </View>
                      <Pressable style={styles.rideShareSecondaryButton} onPress={() => handleAccommodationContact(offer)}>
                        <Text style={styles.rideShareSecondaryButtonText}>Contact</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.rideSharePrimaryButton, !canRequest && styles.rideShareButtonDisabled]}
                        disabled={!canRequest || requestAccommodationBookingMutation.isPending}
                        onPress={() => handleAccommodationBook(offer)}
                      >
                        <Text style={styles.rideSharePrimaryButtonText}>
                          {offer.roomsRemaining <= 0 ? "Full" : "Book"}
                        </Text>
                      </Pressable>
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}

      <Modal visible={showAccommodationEventPicker} transparent animationType="fade" onRequestClose={() => setShowAccommodationEventPicker(false)}>
        <View style={styles.rideShareModalBackdrop}>
          <View style={styles.rideSharePickerModal}>
            <Text style={styles.rideSharePickerTitle}>Choose run</Text>
            <ScrollView style={styles.rideSharePickerList}>
              {rideShareEventOptions.map((item: any) => {
                const isSelected = item.event_id === selectedAccommodationEventId;
                return (
                  <Pressable
                    key={`stay-event-${item.event_id}`}
                    style={[styles.rideShareEventOption, isSelected && styles.rideShareEventOptionActive]}
                    onPress={() => {
                      setAccommodationForm((current) => ({ ...current, eventId: item.event_id }));
                      setShowAccommodationEventPicker(false);
                    }}
                  >
                    <Text style={[styles.rideShareEventOptionText, isSelected && styles.rideShareEventOptionTextActive]} numberOfLines={2}>
                      {item.event_name}
                    </Text>
                    <Text style={styles.rideShareEventOptionMeta} numberOfLines={1}>
                      {formatEventCardDate(item)} | {getEventLocationLabel(item)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.rideShareSecondaryButton} onPress={() => setShowAccommodationEventPicker(false)}>
              <Text style={styles.rideShareSecondaryButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={showAccommodationRoomsPicker} transparent animationType="fade" onRequestClose={() => setShowAccommodationRoomsPicker(false)}>
        <View style={styles.rideShareModalBackdrop}>
          <View style={styles.rideSharePickerModal}>
            <Text style={styles.rideSharePickerTitle}>Guest capacity</Text>
            <View style={styles.rideShareSeatPickerGrid}>
              {Array.from({ length: 30 }, (_, index) => index + 1).map((value) => {
                const isSelected = accommodationForm.roomsAvailable === String(value);
                return (
                  <Pressable
                    key={value}
                    style={[styles.rideShareSeatPickerOption, isSelected && styles.rideShareTimeOptionActive]}
                    onPress={() => {
                      setAccommodationForm((current) => ({ ...current, roomsAvailable: String(value) }));
                      setShowAccommodationRoomsPicker(false);
                    }}
                  >
                    <Text style={[styles.rideShareTimeOptionText, isSelected && styles.rideShareTimeOptionTextActive]}>{value}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={styles.rideShareSecondaryButton} onPress={() => setShowAccommodationRoomsPicker(false)}>
              <Text style={styles.rideShareSecondaryButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );

  const handleUnavailableSignupPress = (status: string) => {
    const alreadySignedUp = status === "registered" || status === "pending" || status === "completed";
    Alert.alert(
      alreadySignedUp ? "Already Signed Up" : "Event Closed",
      alreadySignedUp
        ? "You have already signed up for this event."
        : "This event is closed."
    );
  };

  if (isLoading || profileLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={appColors.primary} />
        <Text style={styles.loadingText}>Loading events...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Error loading events</Text>
        <Text style={styles.errorMessage}>{error.message}</Text>
        <Pressable
          onPress={() => void refetch()}
          disabled={isRefetching}
          style={[styles.retryButton, isRefetching && styles.retryButtonDisabled]}
        >
          <Text style={styles.retryButtonText}>{isRefetching ? "Retrying..." : "Retry"}</Text>
        </Pressable>
      </View>
    );
  }

  if (!hasCountry) {
    return (
      <View style={styles.centered}>
        <Globe2 size={56} color={appColors.primary} />
        <Text style={styles.errorTitle}>Add your country first</Text>
        <Text style={styles.errorMessage}>
          Events are country-aware. Please update your profile country before viewing and joining events.
        </Text>
        <Pressable style={styles.retryButton} onPress={() => router.push("/profile" as any)}>
          <Text style={styles.retryButtonText}>Update Profile</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.eventsMainTabRow}>
        {(["events", "rideShare", "accommodation"] as const).map((value) => (
          <Pressable
            key={value}
            style={[styles.eventsMainTabButton, mainTab === value && styles.eventsMainTabButtonActive]}
            onPress={() => setMainTab(value)}
          >
            <Text style={[styles.eventsMainTabText, mainTab === value && styles.eventsMainTabTextActive]}>
              {value === "events" ? "Calendar" : value === "rideShare" ? "Ride Share" : "Accommodation"}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.topActions}>
        {mainTab === "events" ? (
        <Pressable style={styles.singleFilterButton} onPress={() => setSelectorMode("filters")}>
          <List size={15} color={appColors.primary} />
          <Text style={styles.singleFilterText} numberOfLines={1}>
            Filters: {locationFilterLabel} / {eventTypeFilterLabel} / {eventViewMode === "table" ? "Calendar" : "Cards"}
          </Text>
          <ChevronDown size={14} color={appColors.textSecondary} />
        </Pressable>
        ) : mainTab === "rideShare" ? (
          <View style={styles.singleFilterButton}>
            <Car size={15} color={appColors.primary} />
            <Text style={styles.singleFilterText} numberOfLines={1}>
              Ride Share: {selectedRideShareEvent?.event_name || "Choose a race"}
            </Text>
          </View>
        ) : (
          <View style={styles.singleFilterButton}>
            <MapPin size={15} color={appColors.primary} />
            <Text style={styles.singleFilterText} numberOfLines={1}>
              Accommodation: {selectedAccommodationEvent?.event_name || "Choose a race"}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={mainTab === "rideShare" ? rideSharesQuery.isRefetching : mainTab === "accommodation" ? accommodationsQuery.isRefetching : isRefetching}
            onRefresh={() => {
              if (mainTab === "rideShare") {
                void rideSharesQuery.refetch();
                return;
              }
              if (mainTab === "accommodation") {
                void accommodationsQuery.refetch();
                return;
              }
              void refetch();
            }}
            tintColor={appColors.primary}
            colors={[appColors.primary]}
          />
        }
      >
        {mainTab === "rideShare" ? (
          renderRideSharePanel()
        ) : mainTab === "accommodation" ? (
          renderAccommodationPanel()
        ) : (
          <>
        <View style={styles.eventsTimeTabRow}>
          {(["active", "closed"] as const).map((value) => (
            <Pressable
              key={value}
              style={[styles.eventsTimeTabButton, eventTimeTab === value && styles.eventsTimeTabButtonActive]}
              onPress={() => setEventTimeTab(value)}
            >
              <Text style={[styles.eventsTimeTabText, eventTimeTab === value && styles.eventsTimeTabTextActive]}>
                {value === "active" ? "Active" : "Closed"}
              </Text>
            </Pressable>
          ))}
        </View>
        {visibleEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No events available</Text>
            <Text style={styles.emptySubtext}>
              {eventScope === "local"
                ? "No events are available for your country yet."
                : eventScope === "virtual"
                ? "No virtual events are available yet."
                : "Check back soon for upcoming events."}
            </Text>
          </View>
        ) : eventViewMode === "table" ? (
          <View style={styles.calendarCard}>
            <Text style={styles.calendarTitle}>Calendar</Text>
            <View style={styles.eventTileList}>
              {tableEvents.map((item: any) => {
                const organizerLabel = item.organizer_name || item.club || "RunNation";
                const registeredEvent = registeredEventMap.get(item.event_id);
                const status = getTableEventStatus(item, registeredEvent);
                const eventCountryCode = normalizeCountryCode(item.country_code || item.country);
                const isLocal = item.is_virtual === true || item.isVirtual === true || localCountryCodes.has(eventCountryCode);
                const isSubmitting = enrollEventMutation.isPending || submittedEventIds.includes(item.event_id);
                const eventFull = isEventFull(item);
                const canSignUpFromTable = !status && isLocal && !eventFull;
                const hasPoster = Boolean(item.poster_link || item.posterLink);
                const hasEntrants = getParticipantCount(item) > 0;
                const locationLabel = getEventLocationLabel({
                  ...item,
                  eventLocation: item.event_location || item.eventLocation || registeredEvent?.eventLocation,
                });
                const startLabel = formatShortEventDate(item.starts_at || item.startsAt) || "TBA";
                const endLabel = formatShortEventDate(item.ends_at || item.endsAt);
                const closeLabel = formatFullEventDate(item.registration_closes_at || item.registrationClosesAt);
                const distanceLabel = formatEventDistances(item);
                const locationPin = getEventLocationPin(item);
                const displayStatus =
                  status === "closed"
                    ? closeLabel
                      ? `Registration closed ${closeLabel}`
                      : "Registration closed"
                    : status === "registered"
                      ? "Registered"
                    : status === "pending"
                      ? "Pending"
                    : status === "completed"
                      ? "Completed"
                    : eventFull
                      ? "Full"
                    : isLocal
                      ? closeLabel
                        ? `Active until ${closeLabel}`
                        : "Active"
                    : "View only";
                const statusLabel = isSubmitting
                  ? "..."
                  : canSignUpFromTable
                    ? "sign up"
                  : status === "closed"
                    ? closeLabel
                      ? `closed\n${closeLabel}`
                      : "registration\nclosed"
                  : eventFull
                    ? "full"
                  : displayStatus;

                return (
                  <View key={`calendar-${item.event_id}`} style={styles.eventCalendarTile}>
                    <View style={styles.eventTileBody}>
                      <View style={styles.eventTileTextBlock}>
                        <View style={styles.eventTileLine}>
                          <Text style={styles.eventTileName} numberOfLines={2}>
                            {item.event_name || "Unnamed"}
                          </Text>
                        </View>
                        <Text style={styles.eventTileMeta} numberOfLines={2}>
                          Date: {startLabel}{endLabel && endLabel !== startLabel ? `-${endLabel}` : ""} | Type: {getEventTypeTableLabel(item)} | Fee: {formatEventFee(item)}
                        </Text>
                        <Text style={styles.eventTileSubMeta} numberOfLines={1}>
                          Organizer: {organizerLabel}
                        </Text>
                        <Text style={styles.eventTileSubMeta} numberOfLines={2}>
                          Venue: {locationLabel} | Distances: {distanceLabel}
                        </Text>
                        {locationPin ? (
                          <Text style={styles.eventTileSubMeta} numberOfLines={1}>
                            Pin: {locationPin}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.eventTileActions}>
                        <Pressable
                          style={[styles.eventTileActionButton, styles.eventTilePreviewButton, !hasPoster && styles.eventTableParticipateButtonDisabled]}
                          onPress={() => setSelectedPosterEvent(item)}
                          disabled={!hasPoster}
                        >
                          <Text style={styles.eventTileActionText}>{hasPoster ? "poster" : "no poster"}</Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.eventTileActionButton,
                            styles.eventTileSignupButton,
                            (!canSignUpFromTable || isSubmitting) && styles.eventTableParticipateButtonDisabled,
                          ]}
                          onPress={() => {
                            if (canSignUpFromTable) {
                              handleParticipate(item);
                              return;
                            }
                            if (eventFull) {
                              Alert.alert("Event Full", "This event has reached its participant limit.");
                              return;
                            }
                            handleUnavailableSignupPress(status || "closed");
                          }}
                          disabled={isSubmitting}
                        >
                          <Text style={styles.eventTileActionText}>{statusLabel}</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.eventTileActionButton, styles.eventTileParticipantsButton]}
                          onPress={() => {
                            router.push({
                              pathname: "/participants" as any,
                              params: { eventId: item.event_id, eventMode: getEventModeParam(item) },
                            });
                          }}
                        >
                          <Text style={styles.eventTileActionText}>{hasEntrants ? "entrants" : "no entrants"}</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          visibleEvents.map((item: any) => {
            const eventCountryCode = normalizeCountryCode(item.country_code || item.country);
            const isLocal = item.is_virtual === true || !eventCountryCode || localCountryCodes.has(eventCountryCode);
            const metaCountry = formatCountryName(item.country || item.country_code) || "Global";
            const organizerLabel = item.organizer_name || item.club || "";
            const eventTypeLabel = getEventTypeLabel(item);
            const dateLabel =
              eventTypeLabel === "One Day" || eventTypeLabel === "Recurring"
                ? formatDate(item.starts_at)
                : `${formatDate(item.starts_at)} - ${formatDate(item.ends_at)}`;
            const compactMetaLabel = [
              formatEventCardDate(item),
              metaCountry,
              organizerLabel || "RunNation",
            ].filter(Boolean).join(" | ");
            const registrationCloseLabel = formatShortEventDate(getEventRegistrationCloseDate(item));
            const registrationClosed = isEventRegistrationClosed(item);
            const eventFull = isEventFull(item);
            const registeredEvent = registeredEventMap.get(item.event_id);
            const eventStatus = getTableEventStatus(item, registeredEvent);
            const isConfirmedRegistration = eventStatus === "registered" || eventStatus === "completed";
            const confirmedEventResult = isConfirmedRegistration ? registeredEvent : null;
            const locationPin = getEventLocationPin(item);
            const hasRecordedResult =
              typeof confirmedEventResult?.distanceKm === "number" &&
              !!confirmedEventResult?.timeSeconds;
            return (
            <View key={item.event_id} style={styles.eventCard}>
              <View style={styles.posterMetaStrip}>
                <View style={styles.posterMetaMain}>
                  <View style={styles.posterTitleRow}>
                    <Text style={styles.posterEventName} numberOfLines={1}>{item.event_name}</Text>
                    {item.has_medal ?? item.hasMedal ? (
                      <View style={styles.medalPill}>
                        <Award size={12} color="#a16207" />
                        <Text style={styles.medalPillText}>Medal</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.posterMetaText} numberOfLines={1}>{compactMetaLabel}</Text>
                </View>
                <Text style={[styles.eventScopeBadge, item.is_virtual ? styles.virtualBadge : isLocal ? styles.localBadge : styles.lockedBadge]}>
                  {item.is_virtual ? "Virtual" : isLocal ? "Local" : "View only"}
                </Text>
              </View>

              <View style={styles.posterFrame}>
                {item.has_medal ?? item.hasMedal ? (
                  <View style={styles.posterMedalBadge}>
                    <Award size={14} color="#fff" />
                  </View>
                ) : null}
                <View
                  style={[
                    styles.posterEventTypeBadge,
                    eventTypeLabel === "One Day" ? styles.posterSameDayBadge : eventTypeLabel === "Recurring" ? styles.posterRecurringBadge : styles.posterMultidayBadge,
                  ]}
                >
                  <Text style={styles.posterEventTypeBadgeText}>{eventTypeLabel}</Text>
                </View>
                {hasRecordedResult ? (
                  <View style={styles.posterCompletedBadge}>
                    <CheckCircle2 size={14} color="#fff" />
                    <Text style={styles.posterCompletedBadgeText}>Completed</Text>
                  </View>
                ) : null}
                {item.poster_link ? (
                  <Image
                    source={{ uri: item.poster_link }}
                    style={styles.posterImage}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View style={styles.noPosterState}>
                    <Text style={styles.noPosterText}>NO POSTER</Text>
                  </View>
                )}
              </View>

              <View style={styles.entryRow}>
                <View style={styles.badgePairRow}>
                  <View
                    style={[
                      styles.eventTypeChipInline,
                      eventTypeLabel === "One Day" ? styles.eventTypeChipInlineSameDay : eventTypeLabel === "Recurring" ? styles.eventTypeChipInlineRecurring : styles.eventTypeChipInlineMultiday,
                    ]}
                  >
                    <Text style={styles.eventTypeChipInlineText}>{eventTypeLabel}</Text>
                  </View>
                  <View style={[styles.entryChip, item.entry === "paid" ? styles.entryPaidChip : item.entry === "club_approved" ? styles.entryApprovedChip : styles.entryFreeChip]}>
                    <Text style={[styles.entryChipText, item.entry === "paid" ? styles.entryPaidText : item.entry === "club_approved" ? styles.entryApprovedText : styles.entryFreeText]}>
                      {item.entry === "paid" ? "Paid" : item.entry === "club_approved" ? "Approved" : "Free"}
                    </Text>
                  </View>
                </View>
                {eventStatus ? (
                  <Pressable
                    style={[
                      styles.participateButton,
                      styles.participateButtonDisabled,
                      eventStatus === "closed" && styles.participateButtonClosed,
                    ]}
                    onPress={() => handleUnavailableSignupPress(eventStatus)}
                  >
                    <Text style={styles.participateButtonText}>
                      {eventStatus === "registered" || eventStatus === "completed" ? "Signed Up" : eventStatus === "pending" ? "Pending" : "Closed"}
                    </Text>
                  </Pressable>
                ) : isLocal ? (
                  <Pressable
                    style={[
                      styles.participateButton,
                      (enrollEventMutation.isPending || submittedEventIds.includes(item.event_id) || registrationClosed || eventFull) && styles.participateButtonDisabled,
                      (registrationClosed || eventFull) && styles.participateButtonClosed,
                    ]}
                    onPress={() => {
                      if (submittedEventIds.includes(item.event_id) || registrationClosed) {
                        handleUnavailableSignupPress(submittedEventIds.includes(item.event_id) ? "registered" : "closed");
                        return;
                      }
                      if (eventFull) {
                        Alert.alert("Event Full", "This event has reached its participant limit.");
                        return;
                      }
                      handleParticipate(item);
                    }}
                    disabled={enrollEventMutation.isPending}
                  >
                    <Text style={styles.participateButtonText}>
                      {registrationClosed
                        ? "Closed"
                      : eventFull
                        ? "Full"
                      : submittedEventIds.includes(item.event_id)
                        ? "Signed Up"
                      : enrollEventMutation.isPending
                        ? "Working..."
                        : "Sign Up"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {registrationCloseLabel ? (
                <Text style={[styles.registrationCloseText, registrationClosed && styles.registrationCloseTextClosed]}>
                  Registration closes: {registrationCloseLabel}
                </Text>
              ) : null}

              {locationPin ? (
                <Pressable
                  style={styles.locationPinRow}
                  onPress={() => {
                    if (isLocationPinLink(locationPin)) {
                      Linking.openURL(locationPin).catch(() =>
                        Alert.alert("Location Pin", "Could not open this location pin.")
                      );
                    }
                  }}
                  disabled={!isLocationPinLink(locationPin)}
                >
                  <MapPin size={14} color={appColors.primary} />
                  <Text style={styles.locationPinText} numberOfLines={1}>
                    {isLocationPinLink(locationPin) ? "Open location pin" : `Pin: ${locationPin}`}
                  </Text>
                </Pressable>
              ) : null}

              {isConfirmedRegistration ? (
                <Pressable
                  style={styles.resultPanel}
                  onPress={() =>
                    setSelectedResultEvent({
                      eventName: item.event_name,
                      distanceKm: confirmedEventResult?.distanceKm ?? null,
                      timeSeconds: confirmedEventResult?.timeSeconds ?? null,
                      dateLabel,
                      countryLabel: [metaCountry, organizerLabel].filter(Boolean).join(", ") || "Global",
                      posterLink: item.poster_link || null,
                    })
                  }
                >
                  <Text style={styles.resultPanelTitle}>Your Event Result</Text>
                  {hasRecordedResult ? (
                    <>
                      <View style={styles.resultMetricsRow}>
                        <View style={styles.resultMetric}>
                          <Text style={styles.resultMetricLabel}>Distance</Text>
                          <Text style={styles.resultMetricValue}>{confirmedEventResult?.distanceKm?.toFixed(2)} km</Text>
                        </View>
                        <View style={styles.resultMetricDivider} />
                        <View style={styles.resultMetric}>
                          <Text style={styles.resultMetricLabel}>Time</Text>
                          <Text style={styles.resultMetricValue}>{formatDuration(confirmedEventResult?.timeSeconds)}</Text>
                        </View>
                      </View>
                      <Text style={styles.resultTapHint}>Tap to view result details</Text>
                    </>
                  ) : (
                    <Text style={styles.resultPendingText}>
                      No recorded result yet. Use Workout &gt; Run Event to record this event run.
                    </Text>
                  )}
                </Pressable>
              ) : null}

              {item.entry === "paid" &&
              ((item.entry_fee ?? item.entryFee) !== null &&
              (item.entry_fee ?? item.entryFee) !== undefined
                ? true
                : Boolean(
                    item.payment_details ||
                      item.paymentDetails ||
                      item.organizer_payment_link ||
                      item.organizerPaymentLink ||
                      item.runnation_payment_link_enabled ||
                      item.runnationPaymentLinkEnabled
                  )) ? (
                <Text style={styles.paymentHintText}>
                  {[
                    (item.entry_fee ?? item.entryFee) !== null && (item.entry_fee ?? item.entryFee) !== undefined
                      ? `${item.currency_code || ""} ${formatMoneyAmount(Number(item.entry_fee ?? item.entryFee))}`.trim()
                      : "",
                    item.payment_details || item.paymentDetails || "",
                    item.organizer_payment_link || item.organizerPaymentLink ? "Organizer payment link available" : "",
                    item.runnation_payment_link_enabled || item.runnationPaymentLinkEnabled ? "RunNation payment link coming soon" : "",
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                </Text>
              ) : null}

              {!isLocal && (
                <Text style={styles.jurisdictionNoteCompact}>
                  This is a non-virtual event outside your registered country, so enrollment should remain unavailable.
                </Text>
              )}
            </View>
          );})
        )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={selectorMode !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectorMode(null)}
      >
        <Pressable style={styles.selectorOverlay} onPress={() => setSelectorMode(null)}>
          <Pressable style={styles.selectorCard} onPress={() => {}}>
            <Text style={styles.selectorTitle}>Filters</Text>
            <Text style={styles.selectorSectionTitle}>Location</Text>
            {([
              ["local", compactCountryLabel],
              ["all", "All countries"],
              ["virtual", "Virtual"],
            ] as const).map(([value, label]) => (
              <Pressable
                key={value}
                style={[styles.selectorOption, eventScope === value && styles.selectorOptionActive]}
                onPress={() => setEventScope(value)}
              >
                <Text style={[styles.selectorOptionText, eventScope === value && styles.selectorOptionTextActive]}>{label}</Text>
              </Pressable>
            ))}

            <Text style={styles.selectorSectionTitle}>Event Type</Text>
            {([
              ["all", "All Types"],
              ["same_day", "One Day"],
              ["recurring", "Recurring"],
              ["multiday", "Multiday"],
            ] as const).map(([value, label]) => (
              <Pressable
                key={value}
                style={[styles.selectorOption, eventTypeFilter === value && styles.selectorOptionActive]}
                onPress={() => setEventTypeFilter(value)}
              >
                <Text style={[styles.selectorOptionText, eventTypeFilter === value && styles.selectorOptionTextActive]}>{label}</Text>
              </Pressable>
            ))}

            <Text style={styles.selectorSectionTitle}>View</Text>
            {([
              ["table", "Calendar"],
              ["cards", "Cards"],
            ] as const).map(([value, label]) => (
                <Pressable
                  key={value}
                  style={[styles.selectorOption, eventViewMode === value && styles.selectorOptionActive]}
                  onPress={() => setEventViewMode(value)}
                >
                  <Text style={[styles.selectorOptionText, eventViewMode === value && styles.selectorOptionTextActive]}>{label}</Text>
                </Pressable>
            ))}

            <Pressable style={styles.selectorDoneButton} onPress={() => setSelectorMode(null)}>
              <Text style={styles.selectorDoneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!selectedPosterEvent}
        animationType="fade"
        onRequestClose={() => setSelectedPosterEvent(null)}
      >
        <View style={styles.posterPreviewScreen}>
          <View style={styles.posterPreviewHeader}>
            <Text style={styles.posterPreviewTitle} numberOfLines={1}>
              {selectedPosterEvent?.event_name || selectedPosterEvent?.eventName || "Event poster"}
            </Text>
            <Pressable style={styles.posterPreviewClose} onPress={() => setSelectedPosterEvent(null)}>
              <Text style={styles.posterPreviewCloseText}>X</Text>
            </Pressable>
          </View>
          {selectedPosterEvent?.poster_link || selectedPosterEvent?.posterLink ? (
            <Image
              source={{ uri: selectedPosterEvent.poster_link || selectedPosterEvent.posterLink }}
              style={styles.posterPreviewImage}
              contentFit="contain"
            />
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={!!selectedResultEvent}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedResultEvent(null)}
      >
        <Pressable style={styles.resultModalOverlay} onPress={() => setSelectedResultEvent(null)}>
            <Pressable style={styles.resultModalCard} onPress={() => {}}>
            <Text style={styles.resultModalEyebrow}>Event Result</Text>
            <Text style={styles.resultModalTitle}>{selectedResultEvent?.eventName}</Text>
            <Text style={styles.resultModalMeta}>{selectedResultEvent?.dateLabel}</Text>
            <Text style={styles.resultModalMeta}>{selectedResultEvent?.countryLabel}</Text>

            {!selectedResultEvent?.posterLink ? (
              <View style={styles.generatedPosterPreview}>
                <LinearGradient colors={["#F97316", "#FB923C"]} style={styles.generatedPosterTop}>
                  <Text style={styles.generatedPosterBrand}>RunNation</Text>
                  <Text style={styles.generatedPosterEyebrow}>EVENT RESULT</Text>
                </LinearGradient>
                <View style={styles.generatedPosterBody}>
                  <Text style={styles.generatedPosterEventName} numberOfLines={2}>
                    {selectedResultEvent?.eventName}
                  </Text>
                  <Text style={styles.generatedPosterMeta}>{selectedResultEvent?.dateLabel}</Text>
                  <Text style={styles.generatedPosterMeta}>{selectedResultEvent?.countryLabel}</Text>

                  <View style={styles.generatedPosterStats}>
                    <View style={[styles.generatedPosterStatCard, styles.generatedPosterDistanceCard]}>
                      <Text style={styles.generatedPosterStatLabel}>Distance</Text>
                      <Text style={styles.generatedPosterStatValue}>
                        {typeof selectedResultEvent?.distanceKm === "number"
                          ? `${selectedResultEvent.distanceKm.toFixed(2)} km`
                          : "-"}
                      </Text>
                    </View>
                    <View style={[styles.generatedPosterStatCard, styles.generatedPosterTimeCard]}>
                      <Text style={styles.generatedPosterStatLabel}>Time</Text>
                      <Text style={styles.generatedPosterStatValue}>
                        {formatDuration(selectedResultEvent?.timeSeconds ?? null) || "-"}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : null}

            <View style={styles.shareReadyRow}>
              <CheckCircle2 size={14} color="#047857" />
              <Text style={styles.shareReadyText}>Poster ready to share</Text>
            </View>

            <View style={styles.resultModalStats}>
              <View style={styles.resultModalStat}>
                <Text style={styles.resultModalStatLabel}>Distance</Text>
                <Text style={styles.resultModalStatValue}>
                  {typeof selectedResultEvent?.distanceKm === "number"
                    ? `${selectedResultEvent.distanceKm.toFixed(2)} km`
                    : "-"}
                </Text>
              </View>
              <View style={styles.resultModalStatDivider} />
              <View style={styles.resultModalStat}>
                <Text style={styles.resultModalStatLabel}>Time</Text>
                <Text style={styles.resultModalStatValue}>
                  {formatDuration(selectedResultEvent?.timeSeconds ?? null) || "-"}
                </Text>
              </View>
            </View>

            <Pressable style={styles.resultModalCloseButton} onPress={() => setSelectedResultEvent(null)}>
              <Text style={styles.resultModalCloseText}>Close</Text>
            </Pressable>
            <View style={styles.resultModalActionRow}>
              <Pressable
                style={[styles.resultModalSecondaryButton, isPostingResult && styles.resultModalActionDisabled]}
                onPress={() => void handlePostResultToChat()}
                disabled={isPostingResult || isSharingResult}
              >
                <Text style={styles.resultModalSecondaryText}>{isPostingResult ? "Posting..." : "Post to Chat"}</Text>
              </Pressable>
              <Pressable
                style={[styles.resultModalPrimaryButton, isSharingResult && styles.resultModalActionDisabled]}
                onPress={() => void handleShareResult()}
                disabled={isSharingResult || isPostingResult}
              >
                <Text style={styles.resultModalPrimaryText}>{isSharingResult ? "Sharing..." : "Share"}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: appColors.background,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: appColors.background,
  },
  loadingText: {
    marginTop: 10,
    color: appColors.textSecondary,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: appColors.text,
    marginBottom: 6,
  },
  errorMessage: {
    color: appColors.textSecondary,
    textAlign: "center",
    marginBottom: 14,
  },
  retryButton: {
    backgroundColor: appColors.dark,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonDisabled: {
    opacity: 0.7,
  },
  retryButtonText: {
    color: appColors.white,
    fontWeight: "700",
  },
  topActions: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  compactControlRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  compactDropdownButton: {
    flex: 1,
    minWidth: 0,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: appColors.cardBackground,
    borderWidth: 1,
    borderColor: appColors.border,
  },
  compactDropdownText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "800",
    color: appColors.text,
  },
  singleFilterButton: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: appColors.cardBackground,
    borderWidth: 1,
    borderColor: appColors.border,
  },
  singleFilterText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    color: appColors.text,
    textAlign: "center",
  },
  calendarToggleButton: {
    width: 104,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  calendarToggleText: {
    fontSize: 12,
    fontWeight: "800",
    color: appColors.primary,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  compactCountryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: appColors.cardBackground,
    borderWidth: 1,
    borderColor: appColors.border,
  },
  compactCountryChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: appColors.text,
  },
  filterChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: appColors.cardBackground,
    borderWidth: 1,
    borderColor: appColors.border,
  },
  filterChipActive: {
    backgroundColor: appColors.primary,
    borderColor: appColors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "800",
    color: appColors.textSecondary,
  },
  filterChipTextActive: {
    color: appColors.white,
  },
  amenityChip: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: appColors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFFFFF",
  },
  amenityChipActive: {
    backgroundColor: "#E0F2FE",
    borderColor: appColors.primary,
  },
  amenityChipText: {
    color: appColors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  amenityChipTextActive: {
    color: appColors.primary,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionButtonSmall: {
    flex: 1,
    borderRadius: 10,
    overflow: "hidden",
    shadowColor: appColors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  actionGradientSmall: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  actionTextSmall: {
    color: appColors.white,
    fontWeight: "700",
    fontSize: 13,
  },
  calendarCard: {
    backgroundColor: appColors.cardBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: appColors.border,
    padding: 12,
    gap: 8,
  },
  calendarTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: appColors.text,
    marginBottom: 2,
  },
  calendarEventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: appColors.border,
  },
  calendarDateBox: {
    width: 82,
    minHeight: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7ED",
    paddingHorizontal: 6,
  },
  calendarDateText: {
    fontSize: 11,
    fontWeight: "900",
    color: appColors.primary,
    textAlign: "center",
  },
  calendarEventInfo: {
    flex: 1,
    minWidth: 0,
  },
  calendarEventName: {
    fontSize: 14,
    fontWeight: "900",
    color: appColors.text,
  },
  calendarEventMeta: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "600",
    color: appColors.textSecondary,
  },
  eventTileList: {
    gap: 8,
  },
  eventCalendarTile: {
    borderWidth: 1,
    borderColor: appColors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  eventTileBody: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  eventTileTextBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 5,
  },
  eventTileLine: {
    minHeight: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  eventTileName: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
    color: appColors.text,
  },
  eventTileMeta: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "800",
    color: appColors.text,
  },
  eventTileSubMeta: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "800",
    color: appColors.textSecondary,
  },
  eventTileActions: {
    width: 82,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  eventTileActionButton: {
    width: 82,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  eventTilePreviewButton: {
    backgroundColor: appColors.dark,
  },
  eventTileSignupButton: {
    backgroundColor: appColors.primary,
  },
  eventTileParticipantsButton: {
    backgroundColor: "#2563EB",
  },
  eventTileActionText: {
    fontSize: 9.5,
    lineHeight: 11,
    fontWeight: "900",
    color: appColors.white,
    textTransform: "lowercase",
    textAlign: "center",
  },
  eventTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: appColors.border,
    backgroundColor: "#F8FAFC",
  },
  eventTable: {
    minWidth: 930,
  },
  eventTableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: appColors.border,
  },
  eventTableHeaderText: {
    fontSize: 7,
    fontWeight: "900",
    color: appColors.textSecondary,
    textTransform: "uppercase",
  },
  eventTableCellText: {
    fontSize: 8,
    fontWeight: "700",
    color: appColors.text,
  },
  eventTableDateCell: {
    width: 62,
  },
  eventTableOrganizerCell: {
    width: 82,
  },
  eventTableNameCell: {
    width: 98,
  },
  eventTableTypeCell: {
    width: 50,
  },
  eventTableLocationCell: {
    width: 74,
  },
  eventTableMedalCell: {
    width: 34,
    textAlign: "center",
  },
  eventTableFeeCell: {
    width: 40,
  },
  eventTableDistancesCell: {
    width: 60,
  },
  eventTableActionCell: {
    width: 56,
    textAlign: "center",
  },
  eventTableStatusCell: {
    width: 76,
  },
  eventTableStatusText: {
    fontSize: 10,
    fontWeight: "900",
    color: appColors.textLight,
    textTransform: "lowercase",
  },
  eventTableStatusRegistered: {
    color: "#166534",
  },
  eventTableStatusPending: {
    color: "#92400E",
  },
  eventTableStatusCompleted: {
    color: "#1D4ED8",
  },
  eventTableStatusClosed: {
    color: appColors.textLight,
  },
  eventTableParticipateButton: {
    width: 56,
    minHeight: 21,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: appColors.primary,
  },
  eventTablePreviewButton: {
    width: 56,
    minHeight: 21,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: appColors.dark,
  },
  eventTableParticipantsButton: {
    width: 56,
    minHeight: 21,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: "#2563EB",
  },
  eventTableParticipateButtonDisabled: {
    opacity: 0.65,
  },
  eventTableParticipateText: {
    fontSize: 6,
    fontWeight: "900",
    color: appColors.white,
    textTransform: "lowercase",
  },
  posterPreviewScreen: {
    flex: 1,
    backgroundColor: "#020617",
  },
  posterPreviewHeader: {
    minHeight: 58,
    paddingTop: 16,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  posterPreviewTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    color: appColors.white,
  },
  posterPreviewClose: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  posterPreviewCloseText: {
    color: appColors.white,
    fontSize: 18,
    fontWeight: "900",
  },
  posterPreviewImage: {
    flex: 1,
    width: "100%",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 10,
    gap: 14,
  },
  eventsTimeTabRow: {
    flexDirection: "row",
    gap: 8,
  },
  eventsTimeTabButton: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: appColors.cardBackground,
    borderWidth: 1,
    borderColor: appColors.border,
  },
  eventsTimeTabButtonActive: {
    backgroundColor: appColors.primary,
    borderColor: appColors.primary,
  },
  eventsTimeTabText: {
    fontSize: 13,
    fontWeight: "900",
    color: appColors.textSecondary,
  },
  eventsTimeTabTextActive: {
    color: appColors.white,
  },
  emptyCard: {
    backgroundColor: appColors.cardBackground,
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: appColors.text,
  },
  emptySubtext: {
    marginTop: 6,
    color: appColors.textSecondary,
  },
  eventCard: {
    backgroundColor: appColors.cardBackground,
    borderRadius: 14,
    padding: 10,
    shadowColor: appColors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  posterMetaStrip: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  posterMetaMain: {
    flex: 1,
    gap: 2,
  },
  posterTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eventScopeBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    fontSize: 11,
    fontWeight: "800",
  },
  virtualBadge: {
    backgroundColor: "#DBEAFE",
    color: "#1D4ED8",
  },
  localBadge: {
    backgroundColor: "#DCFCE7",
    color: "#047857",
  },
  lockedBadge: {
    backgroundColor: "#FEE2E2",
    color: "#B91C1C",
  },
  posterEventName: {
    fontSize: 13,
    fontWeight: "800",
    color: appColors.text,
    flexShrink: 1,
  },
  medalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  medalPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#a16207",
  },
  posterMetaText: {
    fontSize: 11,
    color: appColors.textSecondary,
    lineHeight: 15,
  },
  posterFrame: {
    width: "100%",
    aspectRatio: 0.74,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: appColors.border,
  },
  posterImage: {
    width: "100%",
    height: "100%",
  },
  posterMedalBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f59e0b",
  },
  posterCompletedBadge: {
    position: "absolute",
    left: 10,
    bottom: 10,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(22, 101, 52, 0.94)",
  },
  posterEventTypeBadge: {
    position: "absolute",
    left: 10,
    top: 10,
    zIndex: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  posterSameDayBadge: {
    backgroundColor: "rgba(15, 118, 110, 0.94)",
  },
  posterMultidayBadge: {
    backgroundColor: "rgba(180, 83, 9, 0.94)",
  },
  posterRecurringBadge: {
    backgroundColor: "rgba(8, 145, 178, 0.94)",
  },
  posterEventTypeBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  posterCompletedBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  noPosterState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  noPosterText: {
    fontSize: 24,
    fontWeight: "800",
    color: appColors.textLight,
    letterSpacing: 0,
  },
  entryRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  badgePairRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    flex: 1,
  },
  eventTypeChipInline: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  eventTypeChipInlineSameDay: {
    backgroundColor: "#f0fdfa",
    borderColor: "#99f6e4",
  },
  eventTypeChipInlineMultiday: {
    backgroundColor: "#fff7ed",
    borderColor: "#fdba74",
  },
  eventTypeChipInlineRecurring: {
    backgroundColor: "#ecfeff",
    borderColor: "#67e8f9",
  },
  eventTypeChipInlineText: {
    fontSize: 11,
    fontWeight: "800",
    color: appColors.text,
  },
  entryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  entryFreeChip: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
  },
  entryApprovedChip: {
    backgroundColor: "#dbeafe",
    borderColor: "#93c5fd",
  },
  entryPaidChip: {
    backgroundColor: "#fef3c7",
    borderColor: "#fcd34d",
  },
  entryChipText: {
    fontSize: 11,
    fontWeight: "800",
  },
  entryFreeText: {
    color: "#166534",
  },
  entryApprovedText: {
    color: "#1d4ed8",
  },
  entryPaidText: {
    color: "#a16207",
  },
  participateButton: {
    minWidth: 116,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: appColors.primary,
  },
  participateButtonDisabled: {
    opacity: 0.65,
  },
  participateButtonClosed: {
    backgroundColor: "#9CA3AF",
  },
  participateButtonText: {
    color: appColors.white,
    fontSize: 12,
    fontWeight: "800",
  },
  registrationCloseText: {
    marginTop: 6,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
  },
  registrationCloseTextClosed: {
    color: "#991B1B",
  },
  locationPinRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  locationPinText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
    color: appColors.primary,
  },
  registeredBadge: {
    minWidth: 116,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  registeredBadgeText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "800",
  },
  pendingBadge: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FCD34D",
  },
  pendingBadgeText: {
    color: "#92400E",
  },
  completedBadge: {
    backgroundColor: "#DBEAFE",
    borderColor: "#93C5FD",
  },
  completedBadgeText: {
    color: "#1D4ED8",
  },
  resultPanel: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 8,
  },
  resultPanelTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: appColors.text,
  },
  resultMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  resultMetric: {
    flex: 1,
  },
  resultMetricLabel: {
    fontSize: 11,
    color: appColors.textSecondary,
    marginBottom: 4,
  },
  resultMetricValue: {
    fontSize: 14,
    fontWeight: "800",
    color: appColors.text,
  },
  resultMetricDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#CBD5E1",
  },
  resultPendingText: {
    fontSize: 12,
    lineHeight: 18,
    color: appColors.textSecondary,
  },
  resultTapHint: {
    fontSize: 11,
    color: appColors.primary,
    fontWeight: "700",
  },
  resultModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  selectorOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    justifyContent: "flex-start",
    paddingHorizontal: 18,
    paddingTop: 118,
  },
  selectorCard: {
    backgroundColor: appColors.cardBackground,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: appColors.border,
    gap: 8,
  },
  selectorTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: appColors.text,
    marginBottom: 4,
  },
  selectorSectionTitle: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "900",
    color: appColors.textSecondary,
    textTransform: "uppercase",
  },
  selectorOption: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
  },
  selectorOptionActive: {
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  selectorOptionText: {
    fontSize: 14,
    fontWeight: "800",
    color: appColors.text,
  },
  selectorOptionTextActive: {
    color: appColors.primary,
  },
  selectorDoneButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: appColors.primary,
    marginTop: 8,
  },
  selectorDoneText: {
    fontSize: 14,
    fontWeight: "900",
    color: appColors.white,
  },
  resultModalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    backgroundColor: appColors.cardBackground,
    padding: 20,
  },
  resultModalEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    color: appColors.primary,
    marginBottom: 6,
  },
  resultModalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: appColors.text,
    marginBottom: 8,
  },
  resultModalMeta: {
    fontSize: 13,
    color: appColors.textSecondary,
    marginBottom: 4,
  },
  generatedPosterPreview: {
    marginTop: 14,
    marginBottom: 16,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#FED7AA",
    backgroundColor: "#FFF7ED",
  },
  generatedPosterTop: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
  },
  generatedPosterBrand: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },
  generatedPosterEyebrow: {
    color: "#FED7AA",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
  },
  generatedPosterBody: {
    padding: 16,
  },
  generatedPosterEventName: {
    fontSize: 22,
    fontWeight: "800",
    color: appColors.text,
    marginBottom: 8,
  },
  generatedPosterMeta: {
    fontSize: 12,
    color: appColors.textSecondary,
    marginBottom: 4,
  },
  generatedPosterStats: {
    marginTop: 14,
    gap: 10,
  },
  generatedPosterStatCard: {
    borderRadius: 14,
    padding: 14,
  },
  generatedPosterDistanceCard: {
    backgroundColor: "#ECFDF5",
  },
  generatedPosterTimeCard: {
    backgroundColor: "#EFF6FF",
  },
  generatedPosterStatLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: appColors.textSecondary,
    marginBottom: 6,
  },
  generatedPosterStatValue: {
    fontSize: 24,
    fontWeight: "800",
    color: appColors.text,
  },
  shareReadyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  shareReadyText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#047857",
  },
  resultModalStats: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 16,
    marginBottom: 18,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  resultModalStat: {
    flex: 1,
    padding: 16,
  },
  resultModalStatLabel: {
    fontSize: 12,
    color: appColors.textSecondary,
    marginBottom: 6,
  },
  resultModalStatValue: {
    fontSize: 18,
    fontWeight: "800",
    color: appColors.text,
  },
  resultModalStatDivider: {
    width: 1,
    backgroundColor: "#CBD5E1",
  },
  resultModalCloseButton: {
    alignSelf: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    marginBottom: 12,
  },
  resultModalCloseText: {
    color: appColors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  resultModalActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  resultModalSecondaryButton: {
    flex: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  resultModalSecondaryText: {
    color: "#075985",
    fontSize: 13,
    fontWeight: "800",
  },
  resultModalPrimaryButton: {
    flex: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: appColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  resultModalPrimaryText: {
    color: appColors.white,
    fontSize: 13,
    fontWeight: "800",
  },
  resultModalActionDisabled: {
    opacity: 0.7,
  },

  eventsMainTabRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  eventsMainTabButton: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: appColors.border,
    backgroundColor: appColors.cardBackground,
    paddingVertical: 10,
    alignItems: "center",
  },
  eventsMainTabButtonActive: {
    backgroundColor: appColors.primary,
    borderColor: appColors.primary,
  },
  eventsMainTabText: {
    color: appColors.textSecondary,
    fontSize: 13,
    fontWeight: "800",
  },
  eventsMainTabTextActive: {
    color: appColors.white,
  },
  rideSharePanel: {
    gap: 14,
  },
  rideShareHero: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: appColors.border,
  },
  rideShareHeroIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  rideShareHeroTextBlock: {
    flex: 1,
  },
  rideShareHeroTitle: {
    color: appColors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  rideShareHeroText: {
    marginTop: 3,
    color: appColors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  rideShareEventPicker: {
    gap: 8,
    paddingRight: 12,
  },
  rideShareEventChip: {
    width: 180,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: appColors.cardBackground,
    borderWidth: 1,
    borderColor: appColors.border,
  },
  rideShareEventChipActive: {
    borderColor: appColors.primary,
    backgroundColor: "#EFF6FF",
  },
  rideShareEventChipText: {
    color: appColors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  rideShareEventChipTextActive: {
    color: appColors.primary,
  },
  rideShareEventChipMeta: {
    marginTop: 3,
    color: appColors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  rideShareEventChipMetaActive: {
    color: "#1D4ED8",
  },
  rideShareFormCard: {
    borderRadius: 14,
    padding: 14,
    gap: 10,
    backgroundColor: appColors.cardBackground,
    borderWidth: 1,
    borderColor: appColors.border,
  },
  rideShareSectionTitle: {
    color: appColors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  rideShareRegisterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rideShareAddButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appColors.primary,
  },
  rideShareAddButtonDisabled: {
    backgroundColor: "#E5E7EB",
  },
  rideShareNoRunsNote: {
    color: appColors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
  },
  rideShareSelectedEvent: {
    color: appColors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  rideShareFieldLabel: {
    color: appColors.textSecondary,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  rideShareSelectButton: {
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: appColors.border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rideShareSelectButtonDisabled: {
    backgroundColor: "#F3F4F6",
  },
  rideShareSelectTextBlock: {
    flex: 1,
    gap: 2,
  },
  rideShareSelectText: {
    color: appColors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  rideShareSelectTextMuted: {
    color: appColors.textSecondary,
  },
  rideShareDateButton: {
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: appColors.border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rideShareCommitmentBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: appColors.border,
    backgroundColor: "#FFFFFF",
    padding: 10,
    gap: 10,
  },
  rideShareCommitmentToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rideShareCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: appColors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  rideShareCheckboxActive: {
    borderColor: appColors.primary,
    backgroundColor: appColors.primary,
  },
  rideShareInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  rideShareInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: appColors.border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    color: appColors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  rideShareReasonInput: {
    minHeight: 96,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  rideShareSmallInput: {
    flex: 0.55,
  },
  rideShareSexRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  preferenceTitle: {
    width: "100%",
    color: appColors.textSecondary,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  rideShareSexButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: "center",
    borderWidth: 1,
    borderColor: appColors.border,
    backgroundColor: "#FFFFFF",
  },
  rideShareSexButtonActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  rideShareSexText: {
    color: appColors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
  },
  rideShareSexTextActive: {
    color: appColors.white,
  },
  rideSharePrimaryButton: {
    minHeight: 44,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: appColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  rideSharePrimaryButtonText: {
    color: appColors.white,
    fontSize: 13,
    fontWeight: "900",
  },
  rideShareButtonDisabled: {
    opacity: 0.55,
  },
  rideShareModalBackdrop: {
    flex: 1,
    padding: 20,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
  },
  rideSharePickerModal: {
    maxHeight: "88%",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    backgroundColor: appColors.cardBackground,
  },
  rideSharePickerTitle: {
    flex: 1,
    color: appColors.text,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  rideSharePickerList: {
    maxHeight: 320,
  },
  rideShareEventOption: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: appColors.border,
    backgroundColor: "#FFFFFF",
    padding: 12,
    marginBottom: 8,
  },
  rideShareEventOptionActive: {
    borderColor: appColors.primary,
    backgroundColor: "#EFF6FF",
  },
  rideShareEventOptionText: {
    color: appColors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  rideShareEventOptionTextActive: {
    color: appColors.primary,
  },
  rideShareEventOptionMeta: {
    marginTop: 3,
    color: appColors.textSecondary,
    fontSize: 11,
    fontWeight: "800",
  },
  rideShareCalendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rideShareCalendarNav: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  rideShareCalendarNavText: {
    color: appColors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  rideShareWeekRow: {
    flexDirection: "row",
  },
  rideShareWeekText: {
    flex: 1,
    color: appColors.textSecondary,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
  },
  rideShareCalendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  rideShareCalendarDay: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  rideShareCalendarDayActive: {
    backgroundColor: appColors.primary,
  },
  rideShareCalendarDayText: {
    color: appColors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  rideShareCalendarDayTextActive: {
    color: appColors.white,
  },
  rideShareTimeOptions: {
    gap: 6,
    paddingRight: 8,
  },
  rideShareMinuteOptions: {
    flexDirection: "row",
    gap: 6,
  },
  rideShareSeatPickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rideShareSeatPickerOption: {
    width: 48,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#F3F4F6",
  },
  rideShareTimeOption: {
    minWidth: 42,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
    backgroundColor: "#F3F4F6",
  },
  rideShareTimeOptionActive: {
    backgroundColor: appColors.primary,
  },
  rideShareTimeOptionText: {
    color: appColors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  rideShareTimeOptionTextActive: {
    color: appColors.white,
  },
  rideShareListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterButton: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: appColors.border,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#FFFFFF",
  },
  filterButtonActive: {
    backgroundColor: appColors.primary,
    borderColor: appColors.primary,
  },
  filterButtonText: {
    color: appColors.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  filterButtonTextActive: {
    color: appColors.white,
  },
  filterPanel: {
    borderRadius: 14,
    padding: 12,
    gap: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: appColors.border,
  },
  filterGroupLabel: {
    color: appColors.textSecondary,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  filterChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rideShareCountText: {
    color: appColors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
  },
  rideShareLoadingCard: {
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    gap: 8,
    backgroundColor: appColors.cardBackground,
    borderWidth: 1,
    borderColor: appColors.border,
  },
  rideShareOfferCard: {
    borderRadius: 14,
    padding: 14,
    gap: 12,
    backgroundColor: appColors.cardBackground,
    borderWidth: 1,
    borderColor: appColors.border,
  },
  rideShareOfferHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  rideShareOfferTitleBlock: {
    flex: 1,
  },
  rideShareOfferEvent: {
    color: appColors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  rideShareOfferRoute: {
    marginTop: 3,
    color: appColors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  rideShareSeatBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: "#E0F2FE",
  },
  rideShareSeatBadgeFull: {
    backgroundColor: "#FEE2E2",
  },
  rideShareSeatBadgeText: {
    color: appColors.primary,
    fontSize: 11,
    fontWeight: "900",
  },
  rideShareSeatBadgeTextFull: {
    color: "#991B1B",
  },
  rideShareMetaGrid: {
    gap: 5,
  },
  rideShareMetaText: {
    color: appColors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  rideShareDriverBox: {
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#F8FAFC",
  },
  rideShareDriverName: {
    color: appColors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  rideShareMutedText: {
    marginTop: 2,
    color: appColors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  rideShareDriverRequests: {
    gap: 9,
  },
  bookingDraftBox: {
    flex: 1,
    gap: 8,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: appColors.border,
  },
  occupantInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  occupantNameInput: {
    flex: 1,
    minHeight: 40,
  },
  occupantSexButton: {
    minHeight: 40,
    minWidth: 62,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: appColors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  rideShareRequestsTitle: {
    color: appColors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  rideShareRequestRow: {
    gap: 8,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#F8FAFC",
  },
  rideShareRequestInfo: {
    gap: 1,
  },
  rideShareRequestName: {
    color: appColors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  rideShareStatusText: {
    color: appColors.textSecondary,
    fontSize: 11,
    fontWeight: "800",
  },
  rideShareRequestActions: {
    flexDirection: "row",
    gap: 8,
  },
  rideShareConfirmButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: "center",
    backgroundColor: "#DCFCE7",
  },
  rideShareConfirmText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "900",
  },
  rideShareRejectButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: "center",
    backgroundColor: "#FEE2E2",
  },
  rideShareRejectText: {
    color: "#991B1B",
    fontSize: 12,
    fontWeight: "900",
  },
  rideShareActionRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  rideShareSecondaryButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: appColors.border,
    backgroundColor: "#FFFFFF",
  },
  rideShareSecondaryButtonText: {
    color: appColors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  rideShareStatusPill: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF3C7",
  },
  rideShareStatusPillConfirmed: {
    backgroundColor: "#DCFCE7",
  },
  rideShareStatusPillText: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "900",
  },
  rideShareStatusPillTextConfirmed: {
    color: "#166534",
  },
  paymentHintText: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    color: appColors.textSecondary,
  },
  jurisdictionNoteCompact: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    color: appColors.textSecondary,
    fontStyle: "italic",
  },
});
