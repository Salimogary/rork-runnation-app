import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Edit2, LogOut, Check, Circle, X } from "lucide-react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getEarnedBadgeCount } from "@/utils/badges";
import { calculateProfileCompletion } from "@/utils/profileCompletion";
import type { ProfileCompletionInputs } from "@/utils/profileCompletion";


interface HeaderUserProfile {
  "First Name": string;
  "Other Names"?: string;
  Username?: string;
  Email?: string;
  Sex?: string;
  "City/Town/District"?: string;
  Country?: string;
  dob?: string;
  email_verified?: boolean;
}

export default function HeaderProfile() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { colors: themeColors, isDark } = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);
  const [checklistVisible, setChecklistVisible] = useState(false);


  const { data: profile } = useQuery<HeaderUserProfile>({
    queryKey: ["headerProfile", user?.id, user],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("registrations")
        .select('"First Name", "Other Names", "Username", "Email", "Sex", "City/Town/District", "Country", dob, email_verified')
        .eq("RegistrationID", user.id)
        .maybeSingle();
      if (error) {
        console.error('[HeaderProfile] Error fetching profile:', JSON.stringify(error));
        throw error;
      }
      console.log('[HeaderProfile] Profile data:', data);
      return data || { "First Name": "User" };
    },
    enabled: !!user,
  });

  const { data: profilePhoto } = useQuery<string | null>({
    queryKey: ["headerProfilePhoto", user?.id, user],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("user_photos")
        .select("file_path")
        .eq("registration_id", user.id)
        .eq("is_profile_photo", true)
        .maybeSingle();
      return data?.file_path || null;
    },
    enabled: !!user,
  });

  const { data: badgeStats } = useQuery<{ totalDistance: number; totalActivities: number }>({
    queryKey: ["headerBadgeCount", user?.id],
    queryFn: async () => {
      if (!user) return { totalDistance: 0, totalActivities: 0 };
      const { data, error } = await supabase
        .from("activities")
        .select("Distance_km, Exercise_Type")
        .eq("RegistrationID", user.id);
      if (error) {
        console.error("[HeaderBadges] Error:", error);
        return { totalDistance: 0, totalActivities: 0 };
      }
      const validTypes = ["Run", "Walk", "Treadmill", "Tredmill"];
      const filtered = (data || []).filter((a) => validTypes.includes(a.Exercise_Type || ""));
      const totalDistance = filtered.reduce((sum, a) => sum + (a.Distance_km || 0), 0);
      const totalActivities = filtered.length;
      return { totalDistance, totalActivities };
    },
    enabled: !!user,
    staleTime: 60000,
  });

  const { data: completionInputs } = useQuery<ProfileCompletionInputs>({
    queryKey: ["profileCompletion", user?.id],
    queryFn: async () => {
      if (!user) {
        return {
          allFieldsFilled: false,
          hasProfilePhoto: false,
          hasGoal: false,
          hasClub: false,
          hasFiveActivities: false,
          hasSubscription: false,
          hasTargets: false,
          hasEventEnrollment: false,
          hasVerifiedEmail: false,
          hasAtLeastOneBadge: false,
        };
      }

      const [
        profileRes,
        photoRes,
        goalsRes,
        clubRes,
        activitiesRes,
        subscriptionRes,
        fitnessGoalRes,
        weightTargetRes,
        enrollmentRes,
      ] = await Promise.all([
        supabase
          .from("registrations")
          .select('"First Name", "Other Names", "Username", "Email", "Sex", "City/Town/District", "Country", dob, email_verified')
          .eq("RegistrationID", user.id)
          .maybeSingle(),
        supabase
          .from("user_photos")
          .select("file_path")
          .eq("registration_id", user.id)
          .eq("is_profile_photo", true)
          .maybeSingle(),
        supabase
          .from("user_goals")
          .select("user_goals_id")
          .eq("registration_id", user.id)
          .limit(1),
        supabase
          .from("club_membership_request")
          .select("club")
          .eq("registration_id", user.id)
          .maybeSingle(),
        supabase
          .from("activities")
          .select("Distance_km, Exercise_Type")
          .eq("RegistrationID", user.id),
        supabase
          .from("subscriptions")
          .select("status, expires_at")
          .eq("registration_id", user.id)
          .maybeSingle(),
        supabase
          .from("fitness_goal")
          .select("id")
          .eq("registration_id", user.id)
          .limit(1),
        supabase
          .from("weight_target_goal")
          .select("id")
          .eq("registration_id", user.id)
          .limit(1),
        supabase
          .from("event_enrollments")
          .select("EnrollmentID")
          .eq("RegistrationID", user.id)
          .limit(1),
      ]);

      const p = profileRes.data as HeaderUserProfile | null;
      const allFieldsFilled = !!(
        p &&
        p["First Name"] &&
        p["Other Names"] &&
        p.Username &&
        p.Email &&
        p.Sex &&
        p["City/Town/District"] &&
        p.Country &&
        p.dob
      );

      const hasProfilePhoto = !!photoRes.data?.file_path;
      const hasGoal = (goalsRes.data?.length ?? 0) > 0;
      const hasClub = !!(clubRes.data?.club && clubRes.data.club !== "");

      const validTypes = ["Run", "Walk", "Treadmill", "Tredmill"];
      const filteredActivities = (activitiesRes.data || []).filter((a: any) =>
        validTypes.includes(a.Exercise_Type || "")
      );
      const hasFiveActivities = filteredActivities.length >= 5;

      const totalDistance = filteredActivities.reduce((sum: number, a: any) => sum + (a.Distance_km || 0), 0);
      const totalActivities = filteredActivities.length;
      const hasAtLeastOneBadge = getEarnedBadgeCount(totalDistance, totalActivities) > 0;

      const sub = subscriptionRes.data;
      let hasSubscription = false;
      if (sub && sub.status === "active") {
        if (sub.expires_at) {
          hasSubscription = new Date(sub.expires_at) > new Date();
        } else {
          hasSubscription = true;
        }
      }

      const hasTargets =
        (fitnessGoalRes.data?.length ?? 0) > 0 ||
        (weightTargetRes.data?.length ?? 0) > 0;

      const hasEventEnrollment = (enrollmentRes.data?.length ?? 0) > 0;
      const hasVerifiedEmail = p?.email_verified === true;

      return {
        allFieldsFilled,
        hasProfilePhoto,
        hasGoal,
        hasClub,
        hasFiveActivities,
        hasSubscription,
        hasTargets,
        hasEventEnrollment,
        hasVerifiedEmail,
        hasAtLeastOneBadge,
      };
    },
    enabled: !!user,
    staleTime: 30000,
  });

  const completion = useMemo(() => {
    if (!completionInputs) return null;
    return calculateProfileCompletion(completionInputs);
  }, [completionInputs]);

  const badgeCount = useMemo(() => {
    if (!badgeStats) return 0;
    const pct = completion?.percentage ?? 0;
    return getEarnedBadgeCount(badgeStats.totalDistance, badgeStats.totalActivities, pct);
  }, [badgeStats, completion]);

  const handleEdit = () => {
    setMenuVisible(false);
    router.push("/profile" as any);
  };

  const handleSignOut = async () => {
    setMenuVisible(false);
    if (Platform.OS !== "web") {
      Alert.alert("Sign Out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            const { error } = await signOut();
            if (!error) {
              router.replace("/register" as any);
            }
          },
        },
      ]);
    } else {
      const { error } = await signOut();
      if (!error) {
        router.replace("/register" as any);
      }
    }
  };

  const firstName = profile?.["First Name"] || "User";
  const firstLetter = firstName[0]?.toUpperCase() || "U";
  const percentage = completion?.percentage ?? 0;

  const getPercentageColor = (pct: number): string => {
    if (pct >= 80) return "#10b981";
    if (pct >= 50) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.profileButton, { backgroundColor: isDark ? '#2A2A2A' : '#f0f0f0' }]}
        onPress={() => setMenuVisible(true)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarWrapper}>
          {profilePhoto ? (
            <Image
              source={{ uri: profilePhoto }}
              style={styles.profileImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.profilePlaceholder}>
              <Text style={styles.placeholderText}>{firstLetter}</Text>
            </View>
          )}
          {badgeCount > 0 && (
            <View style={styles.badgeCountBubble}>
              <Text style={styles.badgeCountText}>{badgeCount}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.percentagePill,
            { backgroundColor: getPercentageColor(percentage) + "18" },
          ]}
          onPress={(e) => {
            e.stopPropagation?.();
            setChecklistVisible(true);
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        >
          <Text
            style={[
              styles.percentageText,
              { color: getPercentageColor(percentage) },
            ]}
          >
            {percentage}%
          </Text>
        </TouchableOpacity>

        <Text style={[styles.nameText, { color: isDark ? '#F0F0F0' : '#000' }]} numberOfLines={1}>
          {firstName}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.menuContainer, { backgroundColor: themeColors.modalBackground }]}>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleEdit}
                  activeOpacity={0.7}
                >
                  <Edit2 size={20} color={themeColors.text} />
                  <Text style={[styles.menuItemText, { color: themeColors.text }]}>Edit</Text>
                </TouchableOpacity>
                <View style={[styles.menuDivider, { backgroundColor: themeColors.border }]} />
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleSignOut}
                  activeOpacity={0.7}
                >
                  <LogOut size={20} color="#ef4444" />
                  <Text style={[styles.menuItemText, styles.signOutText]}>
                    Sign out
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={checklistVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setChecklistVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setChecklistVisible(false)}>
          <View style={styles.checklistOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.checklistContainer, { backgroundColor: themeColors.modalBackground }]}>
                <View style={[styles.checklistHeader, { borderBottomColor: themeColors.border }]}>
                  <View style={styles.checklistTitleRow}>
                    <Text style={[styles.checklistTitle, { color: themeColors.text }]}>Profile Completion</Text>
                    <TouchableOpacity
                      onPress={() => setChecklistVisible(false)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={22} color={themeColors.iconDefault} />
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.progressBarOuter, { backgroundColor: themeColors.skeleton }]}>
                    <View
                      style={[
                        styles.progressBarInner,
                        {
                          width: `${percentage}%`,
                          backgroundColor: getPercentageColor(percentage),
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.checklistPercentage,
                      { color: getPercentageColor(percentage) },
                    ]}
                  >
                    {percentage}% complete ({completion?.completedCount ?? 0}/
                    {completion?.totalCount ?? 10})
                  </Text>
                </View>

                <ScrollView
                  style={styles.checklistScroll}
                  showsVerticalScrollIndicator={false}
                >
                  {completion?.items.map((item, index) => (
                    <View key={item.id} style={[styles.checklistItem, { borderBottomColor: themeColors.divider }]}>
                      <View style={styles.checklistNumberWrap}>
                        <Text style={styles.checklistNumber}>{index + 1}</Text>
                      </View>
                      {item.completed ? (
                        <View style={styles.checkIconDone}>
                          <Check size={14} color="#fff" />
                        </View>
                      ) : (
                        <View style={styles.checkIconPending}>
                          <Circle size={14} color="#d1d5db" />
                        </View>
                      )}
                      <Text
                        style={[
                          styles.checklistLabel,
                          { color: themeColors.textSecondary },
                          item.completed && [styles.checklistLabelDone, { color: themeColors.text }],
                        ]}
                      >
                        {item.label}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginRight: 16,
  },
  profileButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 20,
  },
  avatarWrapper: {
    position: "relative" as const,
  },
  profileImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e0e0e0",
  },
  badgeCountBubble: {
    position: "absolute" as const,
    top: -4,
    right: -6,
    backgroundColor: "#FF6B35",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 2,
    borderColor: "#f0f0f0",
    paddingHorizontal: 3,
  },
  badgeCountText: {
    fontSize: 10,
    fontWeight: "800" as const,
    color: "#fff",
  },
  profilePlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#fff",
  },
  nameText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#000",
    maxWidth: 80,
  },
  percentagePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  percentageText: {
    fontSize: 11,
    fontWeight: "800" as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: Platform.OS === "ios" ? 90 : 60,
    paddingRight: 16,
  },
  menuContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    minWidth: 180,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: "500" as const,
    color: "#000",
  },
  signOutText: {
    color: "#ef4444",
  },
  menuDivider: {
    height: 1,
    backgroundColor: "#e0e0e0",
    marginHorizontal: 12,
  },
  checklistOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  checklistContainer: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "100%",
    maxWidth: 380,
    maxHeight: "80%",
    overflow: "hidden",
  },
  checklistHeader: {
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  checklistTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  checklistTitle: {
    fontSize: 19,
    fontWeight: "700" as const,
    color: "#111",
  },
  progressBarOuter: {
    height: 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressBarInner: {
    height: "100%",
    borderRadius: 4,
  },
  checklistPercentage: {
    fontSize: 13,
    fontWeight: "600" as const,
  },
  checklistScroll: {
    padding: 16,
    paddingTop: 8,
  },
  checklistItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f7f7f7",
  },
  checklistNumberWrap: {
    width: 22,
    alignItems: "center",
  },
  checklistNumber: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#aaa",
  },
  checkIconDone: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  checkIconPending: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
  },
  checklistLabel: {
    flex: 1,
    fontSize: 14,
    color: "#555",
    fontWeight: "500" as const,
  },
  checklistLabelDone: {
    color: "#111",
    fontWeight: "600" as const,
  },
});
