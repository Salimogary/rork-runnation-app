import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Check, Gauge, Share2, Timer, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import * as ImagePicker from "expo-image-picker";

type ApprovedActivity = {
  activity_id: string;
  registration_id: string;
  activity_date: string;
  exercise_type: string;
  distance_km: number;
  steps_count?: number | null;
  start_time: string;
  end_time: string;
  pace_min_per_km: number;
  runnerName: string;
  country: string;
  photoUrl: string | null;
  sourceLabel: string;
};

function timeToSeconds(value?: string | null): number {
  const parts = String(value || "").split(":").map(Number);
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) return 0;
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

function getDurationSeconds(startTime?: string | null, endTime?: string | null): number {
  const start = timeToSeconds(startTime);
  let end = timeToSeconds(endTime);
  if (end < start) end += 24 * 60 * 60;
  return Math.max(0, end - start);
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatPace(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "--'--\"";
  const minutes = Math.floor(value);
  const seconds = Math.round((value - minutes) * 60);
  return `${minutes}'${seconds.toString().padStart(2, "0")}"`;
}

export default function ActivityCompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activityId: rawActivityId } = useLocalSearchParams<{ activityId?: string | string[] }>();
  const activityId = Array.isArray(rawActivityId) ? rawActivityId[0] : rawActivityId;
  const { user, registrationId } = useAuth();
  const effectiveRegistrationId = registrationId || user?.id || "";
  const [shareImageUri, setShareImageUri] = useState<string | null>(null);
  const [showSharePreview, setShowSharePreview] = useState(false);

  const { data: activity, isLoading, error } = useQuery<ApprovedActivity>({
    queryKey: ["approved-activity-complete", activityId, effectiveRegistrationId],
    queryFn: async () => {
      if (!activityId || !effectiveRegistrationId) throw new Error("Activity details are unavailable.");
      const { data: activityRow, error: activityError } = await supabase
        .from("activities")
        .select("activity_id, registration_id, activity_date, exercise_type, distance_km, steps_count, start_time, end_time, pace_min_per_km")
        .eq("activity_id", activityId)
        .eq("registration_id", effectiveRegistrationId)
        .maybeSingle();

      if (activityError || !activityRow) {
        throw new Error(activityError?.message || "Approved activity not found.");
      }

      const [profileResult, photoResult, notificationResult] = await Promise.all([
        supabase
          .from("registrations")
          .select("first_name, other_names, username, country")
          .eq("registration_id", effectiveRegistrationId)
          .maybeSingle(),
        supabase
          .from("user_photos")
          .select("file_path")
          .eq("registration_id", effectiveRegistrationId)
          .order("is_profile_photo", { ascending: false })
          .order("file_name", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("activity_approval_notifications")
          .select("source_label, source_type")
          .eq("activity_id", activityId)
          .eq("registration_id", effectiveRegistrationId)
          .maybeSingle(),
      ]);

      const profile = profileResult.data as any;
      return {
        ...activityRow,
        distance_km: Number(activityRow.distance_km || 0),
        steps_count: Number((activityRow as any).steps_count || 0),
        pace_min_per_km: Number(activityRow.pace_min_per_km || 0),
        runnerName:
          [profile?.first_name, profile?.other_names].filter(Boolean).join(" ").trim() ||
          profile?.username ||
          user?.username ||
          "RunNation Runner",
        country: profile?.country || "RunNation",
        photoUrl: (photoResult.data as any)?.file_path || null,
        sourceLabel: (notificationResult.data as any)?.source_label || "Submitted source",
      };
    },
    enabled: Boolean(activityId && effectiveRegistrationId),
  });

  const durationSeconds = useMemo(
    () => getDurationSeconds(activity?.start_time, activity?.end_time),
    [activity?.end_time, activity?.start_time]
  );

  const buildShareMessage = () => {
    if (!activity) return;
    return [
      `${activity.runnerName} completed a ${activity.exercise_type || "workout"} on RunNation.`,
      activity.exercise_type === "Stairs"
        ? `${Number(activity.steps_count || 0).toLocaleString()} steps in ${formatDuration(durationSeconds)}.`
        : `${activity.distance_km.toFixed(2)} km in ${formatDuration(durationSeconds)}.`,
      activity.exercise_type === "Stairs" ? null : `Average pace: ${formatPace(activity.pace_min_per_km)} /km.`,
    ].filter(Boolean).join("\n");
  };

  const shareActivity = async () => {
    if (!activity) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.95,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    const mimeType = String(asset.mimeType || "").toLowerCase();
    const uri = asset.uri;
    const isImage = mimeType.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(uri);
    if (!isImage) {
      Alert.alert("Image Required", "Please choose an image file.");
      return;
    }
    setShareImageUri(uri);
    setShowSharePreview(true);
  };

  const confirmShareActivity = async () => {
    if (!activity) return;
    const payload: { message: string; url?: string } = {
      message: buildShareMessage() || "",
    };
    if (shareImageUri && Platform.OS === "ios") {
      payload.url = shareImageUri;
    }
    await Share.share(payload);
    setShowSharePreview(false);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color="#F97316" />
        <Text style={styles.loadingText}>Loading approved workout...</Text>
      </View>
    );
  }

  if (error || !activity) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.errorTitle}>Activity unavailable</Text>
        <Text style={styles.errorText}>{error instanceof Error ? error.message : "This activity could not be loaded."}</Text>
        <TouchableOpacity style={styles.errorButton} onPress={() => router.back()}>
          <Text style={styles.errorButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activityDate = new Date(`${String(activity.activity_date).slice(0, 10)}T${activity.start_time || "00:00:00"}`);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 12) + 76 }]}>
        <View style={styles.card}>
          <LinearGradient
            colors={["#020617", "#081A48", "#5B1235", "#F97316"]}
            locations={[0, 0.45, 0.76, 1]}
            style={styles.brandHero}
          >
            <View style={styles.brandGlow} />
            <Image source={require("../assets/images/adaptive-icon-fill.png")} style={styles.logo} resizeMode="cover" />
            <Text style={styles.brandName}>RunNation</Text>
            <Text style={styles.brandTagline}>Where runners belong</Text>
            <View style={styles.approvedPill}>
              <Check size={14} color="#FFFFFF" />
              <Text style={styles.approvedPillText}>{activity.sourceLabel} approved</Text>
            </View>
          </LinearGradient>

          <View style={styles.details}>
            <View style={styles.activityHeading}>
              <View style={styles.activityIcon}>
                <Activity size={20} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.kicker}>RUNNATION {String(activity.exercise_type || "WORKOUT").toUpperCase()}</Text>
                <Text style={styles.title}>Workout completed</Text>
              </View>
            </View>

            <View style={styles.distanceBlock}>
              <Text style={styles.distance}>
                {activity.exercise_type === "Stairs"
                  ? Number(activity.steps_count || 0).toLocaleString()
                  : activity.distance_km.toFixed(2)}
              </Text>
              <Text style={styles.distanceUnit}>{activity.exercise_type === "Stairs" ? "STAIR STEPS" : "KILOMETRES"}</Text>
            </View>

            <View style={styles.runnerRow}>
              {activity.photoUrl ? (
                <Image source={{ uri: activity.photoUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{activity.runnerName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.runnerCopy}>
                <Text style={styles.runnerName} numberOfLines={1}>{activity.runnerName}</Text>
                <Text style={styles.runnerMeta} numberOfLines={1}>{activity.country}</Text>
              </View>
              <Text style={styles.dateText}>
                {activityDate.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                {"\n"}
                {activityDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>

            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Activity size={19} color="#10B981" />
                <Text style={styles.metricValue} numberOfLines={2}>{activity.sourceLabel}</Text>
                <Text style={styles.metricLabel}>Activity source</Text>
              </View>
              <View style={styles.metric}>
                <Timer size={19} color="#F97316" />
                <Text style={styles.metricValue}>{formatDuration(durationSeconds)}</Text>
                <Text style={styles.metricLabel}>Moving time</Text>
              </View>
              {activity.exercise_type === "Stairs" ? (
                <View style={styles.metric}>
                  <Gauge size={19} color="#3B82F6" />
                  <Text style={styles.metricValue}>{Number(activity.steps_count || 0).toLocaleString()}</Text>
                  <Text style={styles.metricLabel}>Steps climbed</Text>
                </View>
              ) : (
                <View style={styles.metric}>
                  <Gauge size={19} color="#3B82F6" />
                  <Text style={styles.metricValue}>{formatPace(activity.pace_min_per_km)}</Text>
                  <Text style={styles.metricLabel}>Average pace /km</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.actions, { bottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity style={styles.actionButton} onPress={() => router.back()} accessibilityLabel="Close activity">
          <X size={23} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={shareActivity} accessibilityLabel="Share activity">
          <Share2 size={23} color="#60A5FA" />
        </TouchableOpacity>
      </View>

      <Modal visible={showSharePreview} transparent animationType="fade" onRequestClose={() => setShowSharePreview(false)}>
        <View style={styles.shareModalBackdrop}>
          <View style={styles.shareModalCard}>
            <View style={styles.sharePreviewFrame}>
              {shareImageUri ? <Image source={{ uri: shareImageUri }} style={styles.sharePreviewImage} /> : null}
              <LinearGradient
                colors={["rgba(2,6,23,0.75)", "rgba(2,6,23,0.15)", "rgba(2,6,23,0.82)"]}
                style={styles.sharePreviewOverlay}
              >
                <Text style={styles.sharePreviewHeader}>RunNation</Text>
                <View style={styles.sharePreviewStats}>
                  <View style={styles.sharePreviewStat}>
                    <Text style={styles.sharePreviewValue}>
                      {activity.exercise_type === "Stairs" ? Number(activity.steps_count || 0).toLocaleString() : activity.distance_km.toFixed(2)}
                    </Text>
                    <Text style={styles.sharePreviewLabel}>{activity.exercise_type === "Stairs" ? "Steps" : "Distance"}</Text>
                  </View>
                  <View style={styles.sharePreviewStat}>
                    <Text style={styles.sharePreviewValue}>{activity.exercise_type === "Stairs" ? "-" : formatPace(activity.pace_min_per_km)}</Text>
                    <Text style={styles.sharePreviewLabel}>Pace</Text>
                  </View>
                  <View style={styles.sharePreviewStat}>
                    <Text style={styles.sharePreviewValue}>{formatDuration(durationSeconds)}</Text>
                    <Text style={styles.sharePreviewLabel}>Time</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
            <View style={styles.shareModalActions}>
              <TouchableOpacity style={styles.shareModalButtonSecondary} onPress={() => setShowSharePreview(false)}>
                <Text style={styles.shareModalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareModalButtonPrimary} onPress={confirmShareActivity}>
                <Text style={styles.shareModalButtonPrimaryText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#030712",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#030712",
  },
  loadingText: {
    marginTop: 12,
    color: "#CBD5E1",
    fontWeight: "700",
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  errorText: {
    marginTop: 8,
    color: "#94A3B8",
    textAlign: "center",
  },
  errorButton: {
    marginTop: 20,
    borderRadius: 22,
    backgroundColor: "#F97316",
    paddingHorizontal: 24,
    paddingVertical: 11,
  },
  errorButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  scrollContent: {
    paddingTop: 20,
  },
  card: {
    overflow: "hidden",
    backgroundColor: "#0F172A",
  },
  brandHero: {
    height: 310,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  brandGlow: {
    position: "absolute",
    right: -70,
    bottom: -90,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(255,160,0,0.25)",
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 24,
  },
  brandName: {
    marginTop: 12,
    color: "#FFFFFF",
    fontSize: 31,
    fontWeight: "900",
  },
  brandTagline: {
    marginTop: 2,
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "700",
  },
  approvedPill: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: "rgba(16,185,129,0.88)",
  },
  approvedPillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  details: {
    padding: 20,
    backgroundColor: "#0F172A",
  },
  activityHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  activityIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F97316",
  },
  kicker: {
    color: "#F97316",
    fontSize: 11,
    fontWeight: "900",
  },
  title: {
    marginTop: 2,
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  distanceBlock: {
    alignItems: "center",
    paddingVertical: 34,
  },
  distance: {
    color: "#FFFFFF",
    fontSize: 70,
    lineHeight: 76,
    fontWeight: "900",
  },
  distanceUnit: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "900",
  },
  runnerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: "#F97316",
  },
  avatarFallback: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F97316",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  runnerCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  runnerName: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  runnerMeta: {
    marginTop: 3,
    color: "#94A3B8",
    fontSize: 12,
  },
  dateText: {
    color: "#CBD5E1",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    textAlign: "right",
  },
  metrics: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  metric: {
    flex: 1,
    minHeight: 118,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1E293B",
    padding: 15,
  },
  metricValue: {
    marginTop: 14,
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  metricLabel: {
    marginTop: 4,
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
  },
  actions: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
    pointerEvents: "box-none",
  },
  actionButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    backgroundColor: "rgba(3,7,24,0.78)",
    elevation: 5,
  },
  shareModalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(2,6,23,0.78)",
  },
  shareModalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sharePreviewFrame: {
    width: "100%",
    aspectRatio: 0.8,
    backgroundColor: "#111827",
  },
  sharePreviewImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  sharePreviewOverlay: {
    flex: 1,
    justifyContent: "space-between",
    padding: 22,
  },
  sharePreviewHeader: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
  },
  sharePreviewStats: {
    flexDirection: "row",
    gap: 10,
  },
  sharePreviewStat: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: "rgba(15,23,42,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  sharePreviewValue: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },
  sharePreviewLabel: {
    marginTop: 3,
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  shareModalActions: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  shareModalButtonSecondary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E293B",
  },
  shareModalButtonSecondaryText: {
    color: "#CBD5E1",
    fontWeight: "900",
  },
  shareModalButtonPrimary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F97316",
  },
  shareModalButtonPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
});
