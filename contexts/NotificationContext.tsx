import { useCallback, useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import createContextHook from "@nkzw/create-context-hook";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { calculateProfileCompletion, fetchProfileCompletionInputs } from "@/utils/profileCompletion";
import { hasFreeAdminSubscriptionAccess } from "@/lib/role-session";
import { sendMorningDigestOnce, setupNotifications, type MorningNotificationItem } from "@/utils/notifications";

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export const [NotificationProvider, useNotifications] = createContextHook(() => {
  const { user, roleSession } = useAuth();
  const hasFreeAdminAccess = hasFreeAdminSubscriptionAccess(roleSession);
  const setupDone = useRef(false);

  useEffect(() => {
    const isExpoGoAndroid = Platform.OS === "android" && Constants.appOwnership === "expo";
    if (!setupDone.current && Platform.OS !== "web" && !isExpoGoAndroid) {
      setupDone.current = true;
      void setupNotifications();
    }
  }, []);

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
