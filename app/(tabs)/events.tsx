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
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Calendar, Clock3, Globe2, MapPin, Users, Award, CheckCircle2 } from "lucide-react-native";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { trpc } from "@/lib/trpc";
import appColors from "@/constants/colors";
import { formatCountryName } from "@/constants/country-utils";
import { formatDate } from "../../utils/date";
import { useAuth } from "@/contexts/AuthContext";
import { getServerClient } from "@/lib/server-client";

type EventScope = "local" | "all";
type EventEntryMode = "free" | "club_approved" | "paid";

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

export default function EventsScreen() {
  const router = useRouter();
  const { registrationId, user } = useAuth();
  const trpcUtils = trpc.useUtils();
  const effectiveRegistrationId = registrationId || user?.id || "";
  const [eventScope, setEventScope] = useState<EventScope>("local");
  const [submittedEventIds, setSubmittedEventIds] = useState<string[]>([]);
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

      if (result.mode === "participant") {
        const event = (events || []).find((item: any) => item.event_id === variables.eventId);
        const eventMode = isOneDayEvent(event?.starts_at, event?.ends_at) ? "same-day" : "multiday";
        Alert.alert("Joined Event", result.message || "You have been added to the participant list.", [
          {
            text: "OK",
            onPress: () =>
              router.push({
                pathname: eventMode === "same-day" ? ("/participants" as any) : ("/medal-list" as any),
                params: { eventMode },
              }),
          },
        ]);
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
  const hasCountry = profileCountry.length > 0;
  const compactCountryLabel = formatCountryName(profileCountryCode || profileCountry) || "Global";

  const visibleEvents = useMemo(() => {
    const list = events ?? [];
    if (eventScope === "all") return list;
    return list.filter((item: any) => {
      const eventCountryCode = normalizeCountryCode(item.country_code || item.country);
      return item.is_virtual === true || !eventCountryCode || eventCountryCode === profileCountryCode;
    });
  }, [eventScope, events, profileCountryCode]);

  const registeredEventMap = useMemo(() => {
    return new Map(
      (registeredEvents || [])
        .filter((item): item is NonNullable<typeof item> => !!item)
        .map((item) => [item.eventId, item])
    );
  }, [registeredEvents]);

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

    if (entryMode === "paid") {
      Alert.alert(
        "Event Payment",
        [
          "This event requires payment before you can be confirmed.",
          eventItem.payment_details || "Payment details will be communicated through the event administrators.",
          "Tap Continue to submit your payment participation request.",
        ].join("\n\n"),
        [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", onPress: submit },
        ]
      );
      return;
    }

    submit();
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
      <View style={styles.topActions}>
        <View style={styles.filterRow}>
          <View style={styles.compactCountryChip}>
            <MapPin size={14} color={appColors.primary} />
            <Text style={styles.compactCountryChipText}>{compactCountryLabel}</Text>
          </View>
          <Pressable
            style={[styles.filterChip, eventScope === "local" && styles.filterChipActive]}
            onPress={() => setEventScope("local")}
          >
            <Text style={[styles.filterChipText, eventScope === "local" && styles.filterChipTextActive]}>Local</Text>
          </Pressable>
          <Pressable
            style={[styles.filterChip, eventScope === "all" && styles.filterChipActive]}
            onPress={() => setEventScope("all")}
          >
            <Text style={[styles.filterChipText, eventScope === "all" && styles.filterChipTextActive]}>All Events</Text>
          </Pressable>
        </View>

        <View style={styles.quickActionsRow}>
          <Pressable
            style={styles.actionButtonSmall}
            onPress={() =>
              router.push({
                pathname: "/participants" as any,
                params: { eventMode: "same-day" },
              })
            }
          >
            <LinearGradient colors={appColors.gradient.teal} style={styles.actionGradientSmall}>
              <Users size={14} color={appColors.white} />
              <Text style={styles.actionTextSmall}>Same Day Events</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            style={styles.actionButtonSmall}
            onPress={() =>
              router.push({
                pathname: "/medal-list" as any,
                params: { eventMode: "multiday" },
              })
            }
          >
            <LinearGradient colors={appColors.gradient.orange} style={styles.actionGradientSmall}>
              <Award size={14} color={appColors.white} />
              <Text style={styles.actionTextSmall}>Multiday Events</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={appColors.primary}
            colors={[appColors.primary]}
          />
        }
      >
        {visibleEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No events available</Text>
            <Text style={styles.emptySubtext}>
              {eventScope === "local" ? "No local or virtual events are available for your country yet." : "Check back soon for upcoming events."}
            </Text>
          </View>
        ) : (
          visibleEvents.map((item: any) => {
            const eventCountryCode = normalizeCountryCode(item.country_code || item.country);
            const isLocal = item.is_virtual === true || !eventCountryCode || eventCountryCode === profileCountryCode;
            const metaCountry = formatCountryName(item.country || item.country_code) || "Global";
            const organizerLabel = item.organizer_name || item.club || "";
            const dateLabel = `${formatDate(item.starts_at)} - ${formatDate(item.ends_at)}`;
            const eventTypeLabel = isOneDayEvent(item.starts_at, item.ends_at) ? "Same Day" : "Multiday";
            const registeredEvent = registeredEventMap.get(item.event_id);
            const hasRecordedResult =
              typeof registeredEvent?.distanceKm === "number" &&
              !!registeredEvent?.timeSeconds;
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
                  <Text style={styles.posterMetaText} numberOfLines={1}>{dateLabel}</Text>
                  <Text style={styles.posterMetaText} numberOfLines={1}>
                    {[metaCountry, organizerLabel].filter(Boolean).join(", ") || "Global"}
                  </Text>
                  <Text style={styles.posterMetaText} numberOfLines={1}>
                    Organizer: {organizerLabel || "RunNation"}
                  </Text>
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
                    eventTypeLabel === "Same Day" ? styles.posterSameDayBadge : styles.posterMultidayBadge,
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
                      eventTypeLabel === "Same Day" ? styles.eventTypeChipInlineSameDay : styles.eventTypeChipInlineMultiday,
                    ]}
                  >
                    <Text style={styles.eventTypeChipInlineText}>{eventTypeLabel}</Text>
                  </View>
                  <View style={[styles.entryChip, item.entry === "paid" ? styles.entryPaidChip : item.entry === "club_approved" ? styles.entryApprovedChip : styles.entryFreeChip]}>
                    <Text style={[styles.entryChipText, item.entry === "paid" ? styles.entryPaidText : item.entry === "club_approved" ? styles.entryApprovedText : styles.entryFreeText]}>
                      {item.entry === "paid" ? "Paid" : item.entry === "club_approved" ? "Club Approved" : "Free"}
                    </Text>
                  </View>
                </View>
                {registeredEvent ? (
                  <View style={styles.registeredBadge}>
                    <Text style={styles.registeredBadgeText}>Registered</Text>
                  </View>
                ) : isLocal ? (
                  <Pressable
                    style={[
                      styles.participateButton,
                      (enrollEventMutation.isPending || submittedEventIds.includes(item.event_id)) && styles.participateButtonDisabled,
                    ]}
                    onPress={() => handleParticipate(item)}
                    disabled={enrollEventMutation.isPending || submittedEventIds.includes(item.event_id)}
                  >
                    <Text style={styles.participateButtonText}>
                      {submittedEventIds.includes(item.event_id)
                        ? "Submitted"
                        : enrollEventMutation.isPending
                        ? "Working..."
                        : "Participate"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {registeredEvent ? (
                <Pressable
                  style={styles.resultPanel}
                  onPress={() =>
                    setSelectedResultEvent({
                      eventName: item.event_name,
                      distanceKm: registeredEvent.distanceKm ?? null,
                      timeSeconds: registeredEvent.timeSeconds ?? null,
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
                          <Text style={styles.resultMetricValue}>{registeredEvent.distanceKm?.toFixed(2)} km</Text>
                        </View>
                        <View style={styles.resultMetricDivider} />
                        <View style={styles.resultMetric}>
                          <Text style={styles.resultMetricLabel}>Time</Text>
                          <Text style={styles.resultMetricValue}>{formatDuration(registeredEvent.timeSeconds)}</Text>
                        </View>
                      </View>
                      <Text style={styles.resultTapHint}>Tap to view result details</Text>
                    </>
                  ) : (
                    <Text style={styles.resultPendingText}>
                      No recorded result yet. Use Exercise &gt; Run Event to record this event run.
                    </Text>
                  )}
                </Pressable>
              ) : null}

              {item.entry === "paid" &&
              ((item.entry_fee ?? item.entryFee) !== null &&
              (item.entry_fee ?? item.entryFee) !== undefined
                ? true
                : Boolean(item.payment_details || item.paymentDetails)) ? (
                <Text style={styles.paymentHintText}>
                  {[
                    (item.entry_fee ?? item.entryFee) !== null && (item.entry_fee ?? item.entryFee) !== undefined
                      ? `${item.currency_code || ""} ${formatMoneyAmount(Number(item.entry_fee ?? item.entryFee))}`.trim()
                      : "",
                    item.payment_details || item.paymentDetails || "",
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
      </ScrollView>

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
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 10,
    gap: 14,
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
  participateButtonText: {
    color: appColors.white,
    fontSize: 12,
    fontWeight: "800",
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
