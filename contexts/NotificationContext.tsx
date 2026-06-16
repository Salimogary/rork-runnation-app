import { useCallback, useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import createContextHook from "@nkzw/create-context-hook";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { calculateProfileCompletion, fetchProfileCompletionInputs } from "@/utils/profileCompletion";
import { hasFreeAdminSubscriptionAccess } from "@/lib/role-session";
import { registerDevicePushToken, sendLocalNotification, sendMorningDigestOnce, setupNotifications, type MorningNotificationItem } from "@/utils/notifications";

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export const [NotificationProvider, useNotifications] = createContextHook(() => {
  const { user, roleSession } = useAuth();
  const router = useRouter();
  const hasFreeAdminAccess = hasFreeAdminSubscriptionAccess(roleSession);
  const setupDone = useRef(false);
  const registrationId = roleSession.registrationId || user?.id || null;

  const openNotification = useCallback((data?: Record<string, unknown>) => {
    if (data?.type !== "activity_approved" || !data.activityId) return;
    router.push({
      pathname: "/activity-complete",
      params: { activityId: String(data.activityId) },
    } as never);
  }, [router]);

  useEffect(() => {
    const isExpoGoAndroid = Platform.OS === "android" && Constants.appOwnership === "expo";
    if (!setupDone.current && Platform.OS !== "web" && !isExpoGoAndroid) {
      setupDone.current = true;
      void setupNotifications();
    }
  }, []);

  useEffect(() => {
    if (!registrationId || Platform.OS === "web") return;
    void setupNotifications().then((ready) => {
      if (ready) void registerDevicePushToken(registrationId);
    });
  }, [registrationId]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const isExpoGoAndroid = Platform.OS === "android" && Constants.appOwnership === "expo";
    if (isExpoGoAndroid) return;

    let responseSubscription: { remove: () => void } | null = null;
    let mounted = true;

    void import("expo-notifications").then(async (Notifications) => {
      if (!mounted) return;
      responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        openNotification(response.notification.request.content.data as Record<string, unknown>);
      });
      const initialResponse = await Notifications.getLastNotificationResponseAsync();
      if (mounted && initialResponse) {
        openNotification(initialResponse.notification.request.content.data as Record<string, unknown>);
        await Notifications.clearLastNotificationResponseAsync();
      }
    }).catch((error) => {
      console.error("[Notifications] Response listener error:", error);
    });

    return () => {
      mounted = false;
      responseSubscription?.remove();
    };
  }, [openNotification]);

  const deliverApprovedActivities = useCallback(async () => {
    if (!registrationId || Platform.OS === "web") return;
    const { data, error } = await supabase
      .from("activity_approval_notifications")
      .select("notification_id, activity_id, source_label")
      .eq("registration_id", registrationId)
      .is("delivered_at", null)
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) {
      console.error("[Notifications] Could not load approved activities:", error);
      return;
    }

    for (const item of data || []) {
      const sourceLabel = String(item.source_label || "submitted source");
      const sent = await sendLocalNotification(
        "Workout approved",
        `Your ${sourceLabel} workout has been approved. Tap to view your completed activity.`,
        { type: "activity_approved", activityId: item.activity_id }
      );
      if (!sent) continue;
      await supabase
        .from("activity_approval_notifications")
        .update({ delivered_at: new Date().toISOString() })
        .eq("notification_id", item.notification_id);
    }
  }, [registrationId]);

  useEffect(() => {
    if (!registrationId) return;
    void deliverApprovedActivities();

    const interval = setInterval(() => {
      void deliverApprovedActivities();
    }, 60_000);
    const channel = supabase
      .channel(`activity-approvals-${registrationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_approval_notifications",
          filter: `registration_id=eq.${registrationId}`,
        },
        () => void deliverApprovedActivities()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [deliverApprovedActivities, registrationId]);

  const { data: morningItems = [], refetch } = useQuery<MorningNotificationItem[]>({
    queryKey: ["quiet-morning-notifications", user?.id, hasFreeAdminAccess],
    queryFn: async () => {
      if (!user?.id) return [];
      const [
        profileResult,
        goalsResult,
        fitnessTargetResult,
        weightTargetResult,
        enrollmentResult,
        participantsResult,
        appSettingsResult,
        completionInputs,
      ] = await Promise.all([
        supabase.from("registrations").select("country").eq("registration_id", user.id).maybeSingle(),
        supabase.from("user_goals").select("user_goals_id").eq("registration_id", user.id),
        supabase.from("fitness_goal").select("fitness_goal_id").eq("registration_id", user.id).limit(1),
        supabase.from("weight_target_goal").select("weight_target_goal_id").eq("registration_id", user.id).limit(1),
        supabase.from("event_enrollments").select("event_id, status").eq("registration_id", user.id).in("status", ["approved", "registered", "paid"]),
        supabase.from("events_participants").select("event_id").eq("registration_id", user.id),
        supabase.from("app_settings").select("key, value").in("key", ["android_apk_build_number", "ios_build_number"]),
        fetchProfileCompletionInputs(user.id, hasFreeAdminAccess),
      ]);

      const profile = profileResult.data as any;
      const completion = calculateProfileCompletion(completionInputs);
      const items: MorningNotificationItem[] = [];
      if (completion.percentage < 100) {
        items.push({ type: "incomplete_profile", message: `Your profile is ${completion.percentage}% complete.` });
      }
      if ((goalsResult.data?.length || 0) > 0 && (fitnessTargetResult.data?.length || 0) === 0 && (weightTargetResult.data?.length || 0) === 0) {
        items.push({ type: "goals_not_set", message: "You selected goals but still need to set a target." });
      }

      const buildKey = Platform.OS === "ios" ? "ios_build_number" : "android_apk_build_number";
      const availableBuild = Number(appSettingsResult.data?.find((row: any) => row.key === buildKey)?.value || 0);
      const installedBuild = Number(Constants.nativeBuildVersion || 0);
      if (availableBuild > installedBuild) {
        items.push({ type: "app_update", message: "A new RunNation app update is available." });
      }

      const eventIds = Array.from(new Set([
        ...(enrollmentResult.data || []).map((row: any) => row.event_id),
        ...(participantsResult.data || []).map((row: any) => row.event_id),
      ].filter(Boolean)));
      if (eventIds.length > 0) {
        const { data: registeredEvents } = await supabase.from("events").select("event_id, event_name, starts_at").in("event_id", eventIds);
        const today = new Date().toISOString().slice(0, 10);
        const todayEvent = (registeredEvents || []).find((event: any) => dateOnly(event.starts_at) === today);
        if (todayEvent) {
          items.push({ type: "event_reminder", message: `${todayEvent.event_name || "Your event"} is today.` });
        }
      }

      if (profile?.country) {
        const recentCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: organizers } = await supabase.from("event_organizers").select("organizer_id").eq("country", profile.country);
        const organizerIds = (organizers || []).map((row: any) => row.organizer_id).filter(Boolean);
        if (organizerIds.length > 0) {
          const { data: recentEvents } = await supabase
            .from("events")
            .select("event_id, event_name")
            .in("organizer", organizerIds)
            .eq("approval_status", "approved")
            .gte("created_at", recentCutoff)
            .limit(1);
          if (recentEvents?.[0]) {
            items.push({ type: "new_event", message: `New event in your country: ${recentEvents[0].event_name}.` });
          }
        }
      }
      return items;
    },
    enabled: Boolean(user?.id),
    staleTime: 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
  });

  useEffect(() => {
    if (!user?.id || Platform.OS === "web") return;
    void sendMorningDigestOnce(user.id, morningItems);
  }, [morningItems, user?.id]);

  const refreshNotificationData = useCallback(() => {
    void refetch();
  }, [refetch]);

  return useMemo(() => ({ refreshNotificationData }), [refreshNotificationData]);
});
