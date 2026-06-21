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
  TextInput,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Edit2, LogOut, Check, Circle, X } from "lucide-react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { hasFreeAdminSubscriptionAccess } from "@/lib/role-session";
import { getEarnedBadgeCount } from "@/utils/badges";
import { calculateProfileCompletion, fetchProfileCompletionInputs } from "@/utils/profileCompletion";
import type { ProfileCompletionInputs } from "@/utils/profileCompletion";
import { getServerClient } from "@/lib/server-client";
import * as StoreReview from "expo-store-review";
import {
  getAppRatingPromptState,
  isWithinAppRatingCooldown,
  setAppRatingPromptState,
  type AppRatingSentiment,
} from "@/utils/appRatingPrompt";


interface HeaderUserProfile {
  first_name: string;
  other_names?: string;
  username?: string;
  email?: string;
  created_at?: string;
  sex?: string;
  city_town_district?: string;
  country?: string;
  dob?: string;
  email_verified?: boolean;
}

export default function HeaderProfile() {
  const { user, signOut, roleSession } = useAuth();
  const router = useRouter();
  const { colors: themeColors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [menuVisible, setMenuVisible] = useState(false);
  const [checklistVisible, setChecklistVisible] = useState(false);
  const [ratingSentimentVisible, setRatingSentimentVisible] = useState(false);
  const [ratingAskVisible, setRatingAskVisible] = useState(false);
  const [ratingFeedbackVisible, setRatingFeedbackVisible] = useState(false);
  const [ratingFeedbackText, setRatingFeedbackText] = useState("");
  const [ratingSentiment, setRatingSentiment] = useState<AppRatingSentiment | null>(null);
  const ratingPromptChecked = React.useRef(false);


  const { data: profile } = useQuery<HeaderUserProfile>({
    queryKey: ["headerProfile", user?.id, user],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("registrations")
        .select('first_name, other_names, username, created_at, sex, city_town_district, country, dob, email_verified, contacts(email)')
        .eq("registration_id", user.id)
        .maybeSingle();
      if (error) {
        console.error('[HeaderProfile] Error fetching profile:', JSON.stringify(error));
        throw error;
      }
      console.log('[HeaderProfile] Profile data:', data);
      const contactEmail = (data as any)?.contacts?.[0]?.email ?? (data as any)?.contacts?.email ?? undefined;
      return { ...data, email: contactEmail, first_name: data?.first_name || "User" } as HeaderUserProfile;
    },
    enabled: !!user,
  });

  const { data: profilePhoto } = useQuery<string | null>({
    queryKey: ["headerProfilePhoto", user?.id, user],
    queryFn: async () => {
      if (!user) return null;
      const [{ data: profilePhoto }, { data: latestPhoto }] = await Promise.all([
        supabase
          .from("user_photos")
          .select("file_path")
          .eq("registration_id", user.id)
          .eq("is_profile_photo", true)
          .maybeSingle(),
        supabase
          .from("user_photos")
          .select("file_path")
          .eq("registration_id", user.id)
          .order("is_profile_photo", { ascending: false })
          .order("file_name", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      return profilePhoto?.file_path || latestPhoto?.file_path || null;
    },
    enabled: !!user,
  });

  const { data: badgeStats } = useQuery<{ totalDistance: number; totalActivities: number }>({
    queryKey: ["headerBadgeCount", user?.id],
    queryFn: async () => {
      if (!user) return { totalDistance: 0, totalActivities: 0 };
      const { data, error } = await supabase
        .from("activities")
        .select("distance_km, exercise_type")
        .eq("registration_id", user.id);
      if (error) {
        console.error("[HeaderBadges] Error:", error);
        return { totalDistance: 0, totalActivities: 0 };
      }
      const validTypes = ["Run", "Walk", "Treadmill", "Tredmill"];
      const filtered = (data || []).filter((a) => validTypes.includes(a.exercise_type || ""));
      const totalDistance = filtered.reduce((sum, a) => sum + (a.distance_km || 0), 0);
      const totalActivities = filtered.length;
      return { totalDistance, totalActivities };
    },
    enabled: !!user,
    staleTime: 60000,
  });

  const hasFreeAdminAccess = hasFreeAdminSubscriptionAccess(roleSession);

  const { data: completionInputs } = useQuery<ProfileCompletionInputs>({
    queryKey: ["profileCompletion", user?.id, hasFreeAdminAccess],
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
          hasAtLeastOneBadge: false,
          hasRatedApp: false,
        };
      }

      return fetchProfileCompletionInputs(user.id, hasFreeAdminAccess);
    },
    enabled: !!user,
    staleTime: 30000,
  });

  const { data: existingRating, isLoading: existingRatingLoading } = useQuery<{ rating_id: number } | null>({
    queryKey: ["appRatingCompletion", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("app_ratings")
        .select("rating_id")
        .eq("registration_id", user.id)
        .maybeSingle();
      if (error) {
        console.warn("[App Rating] Could not load rating state:", error);
        return null;
      }
      return data as { rating_id: number } | null;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const submitRatingMutation = useMutation({
    mutationFn: async ({ rating, feedback }: { rating: number; feedback: string | null }) => {
      if (!user?.id) throw new Error("Not signed in");
      await getServerClient().feedback.submitRating.mutate({
        registrationId: user.id,
        rating,
        feedback,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["appRatingCompletion", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["profileCompletion", user?.id] });
    },
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: async (feedback: string) => {
      if (!user?.id) throw new Error("Not signed in");
      await getServerClient().feedback.submitSuggestion.mutate({
        registrationId: user.id,
        suggestion: `[APP RATING FEEDBACK] ${feedback}`,
      });
    },
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

  const firstName = profile?.first_name || "User";
  const firstLetter = firstName[0]?.toUpperCase() || "U";
  const percentage = completion?.percentage ?? 0;

  const recordRatingPromptState = React.useCallback(async (state: Parameters<typeof setAppRatingPromptState>[1]) => {
    if (!user?.id) return;
    await setAppRatingPromptState(user.id, state);
  }, [user?.id]);

  React.useEffect(() => {
    if (
      ratingPromptChecked.current ||
      !user?.id ||
      !profile ||
      !badgeStats ||
      existingRatingLoading ||
      existingRating
    ) {
      return;
    }

    const accountCreatedAt = new Date(profile.created_at || user.createdAt || "");
    if (Number.isNaN(accountCreatedAt.getTime())) return;

    const accountAgeDays = (Date.now() - accountCreatedAt.getTime()) / (24 * 60 * 60 * 1000);
    if (accountAgeDays < 7 || badgeStats.totalActivities < 5 || badgeStats.totalDistance < 30) {
      return;
    }

    ratingPromptChecked.current = true;
    void getAppRatingPromptState(user.id).then((state) => {
      if (state.lastSubmittedAt || isWithinAppRatingCooldown(state.lastPromptedAt)) {
        return;
      }
      void setAppRatingPromptState(user.id, { lastPromptedAt: new Date().toISOString() });
      setRatingSentimentVisible(true);
    });
  }, [badgeStats, existingRating, existingRatingLoading, profile, user?.createdAt, user?.id]);

  const handleRatingSentiment = async (sentiment: AppRatingSentiment) => {
    setRatingSentiment(sentiment);
    setRatingSentimentVisible(false);
    await recordRatingPromptState({
      lastPromptedAt: new Date().toISOString(),
      lastSentiment: sentiment,
    });

    if (sentiment === "needs_improvement") {
      setRatingFeedbackVisible(true);
      return;
    }

    setRatingAskVisible(true);
  };

  const handleRateRunNation = async () => {
    const nowIso = new Date().toISOString();
    const backendRating = ratingSentiment === "love" ? 5 : 4;

    try {
      if (Platform.OS !== "web") {
        let openedRatingSurface = false;
        const isAvailable = await StoreReview.isAvailableAsync();
        if (isAvailable) {
          await StoreReview.requestReview();
          openedRatingSurface = true;
        } else if (Platform.OS === "android") {
          const storeUrl = "market://details?id=app.rork.runnation_app";
          const canOpenStore = await Linking.canOpenURL(storeUrl);
          if (canOpenStore) {
            await Linking.openURL(storeUrl);
            openedRatingSurface = true;
          }
        }

        if (!openedRatingSurface) {
          throw new Error("No native rating surface is available on this device.");
        }
      } else {
        const storeUrl = "https://play.google.com/store/apps/details?id=app.rork.runnation_app";
        const canOpenStore = await Linking.canOpenURL(storeUrl);
        if (canOpenStore) {
          await Linking.openURL(storeUrl);
        } else {
          throw new Error("No store rating URL is available on this device.");
        }
      }

      await recordRatingPromptState({
        lastSubmittedAt: nowIso,
        lastSentiment: ratingSentiment || "good",
      });
      submitRatingMutation.mutate({
        rating: backendRating,
        feedback: "User accepted the RunNation store rating prompt.",
      });
      setRatingAskVisible(false);
    } catch (error) {
      console.warn("[App Rating] Store review failed:", error);
      Alert.alert("Rating Unavailable", "RunNation could not open the rating dialog right now. Please try again later.");
    }
  };

  const handleMaybeLaterRating = async () => {
    await recordRatingPromptState({
      lastPromptedAt: new Date().toISOString(),
      lastSentiment: ratingSentiment || "good",
    });
    setRatingAskVisible(false);
  };

  const handleSubmitRatingFeedback = async () => {
    const feedback = ratingFeedbackText.trim();
    if (!feedback) {
      Alert.alert("Feedback Required", "Please tell us what we can improve.");
      return;
    }

    try {
      await submitFeedbackMutation.mutateAsync(feedback);
      await recordRatingPromptState({
        lastPromptedAt: new Date().toISOString(),
        lastSentiment: "needs_improvement",
      });
      setRatingFeedbackVisible(false);
      setRatingFeedbackText("");
      Alert.alert("Thank You", "Your feedback was sent to the RunNation team.");
    } catch (error) {
      console.warn("[App Rating] Feedback submit failed:", error);
      Alert.alert("Could Not Send", "Please try again from Settings > Feedback.");
    }
  };

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

      <Modal
        visible={ratingSentimentVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRatingSentimentVisible(false)}
      >
        <View style={styles.ratingOverlay}>
          <View style={[styles.ratingContainer, { backgroundColor: themeColors.modalBackground }]}>
            <Text style={[styles.ratingTitle, { color: themeColors.text }]}>How are you enjoying RunNation?</Text>
            <View style={styles.ratingChoiceList}>
              <TouchableOpacity style={styles.ratingChoiceButton} onPress={() => void handleRatingSentiment("love")}>
                <Text style={styles.ratingChoiceText}>😀 Love it</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ratingChoiceButton} onPress={() => void handleRatingSentiment("good")}>
                <Text style={styles.ratingChoiceText}>🙂 It&apos;s good</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ratingChoiceButton} onPress={() => void handleRatingSentiment("needs_improvement")}>
                <Text style={styles.ratingChoiceText}>😕 Needs improvement</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={ratingAskVisible}
        transparent
        animationType="fade"
        onRequestClose={() => void handleMaybeLaterRating()}
      >
        <View style={styles.ratingOverlay}>
          <View style={[styles.ratingContainer, { backgroundColor: themeColors.modalBackground }]}>
            <Text style={[styles.ratingTitle, { color: themeColors.text }]}>🏃 Loving your journey?</Text>
            <Text style={[styles.ratingBodyText, { color: themeColors.textSecondary }]}>
              Every step you take helps grow the RunNation community. If you&apos;ve enjoyed training,
              tracking your progress, or connecting with fellow runners, a quick ⭐⭐⭐⭐⭐ rating helps more runners discover us.
            </Text>
            <View style={styles.ratingActionRow}>
              <TouchableOpacity
                style={[styles.ratingSecondaryButton, { borderColor: themeColors.border }]}
                onPress={() => void handleMaybeLaterRating()}
              >
                <Text style={[styles.ratingSecondaryText, { color: themeColors.text }]}>Maybe Later</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ratingPrimaryButton}
                onPress={() => void handleRateRunNation()}
                disabled={submitRatingMutation.isPending}
              >
                <Text style={styles.ratingPrimaryText}>Rate RunNation</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={ratingFeedbackVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRatingFeedbackVisible(false)}
      >
        <View style={styles.ratingOverlay}>
          <View style={[styles.ratingContainer, { backgroundColor: themeColors.modalBackground }]}>
            <Text style={[styles.ratingTitle, { color: themeColors.text }]}>Help us improve</Text>
            <Text style={[styles.ratingBodyText, { color: themeColors.textSecondary }]}>
              Tell the RunNation team what felt off. We will use this feedback before asking you for a store rating.
            </Text>
            <TextInput
              style={[
                styles.ratingFeedbackInput,
                {
                  color: themeColors.text,
                  borderColor: themeColors.border,
                  backgroundColor: isDark ? "#111827" : "#F9FAFB",
                },
              ]}
              value={ratingFeedbackText}
              onChangeText={setRatingFeedbackText}
              placeholder="What should we improve?"
              placeholderTextColor={themeColors.textLight}
              multiline
              maxLength={600}
              textAlignVertical="top"
            />
            <View style={styles.ratingActionRow}>
              <TouchableOpacity
                style={[styles.ratingSecondaryButton, { borderColor: themeColors.border }]}
                onPress={() => setRatingFeedbackVisible(false)}
              >
                <Text style={[styles.ratingSecondaryText, { color: themeColors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ratingPrimaryButton, submitFeedbackMutation.isPending && styles.ratingButtonDisabled]}
                onPress={() => void handleSubmitRatingFeedback()}
                disabled={submitFeedbackMutation.isPending}
              >
                <Text style={styles.ratingPrimaryText}>
                  {submitFeedbackMutation.isPending ? "Sending..." : "Send Feedback"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  ratingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  ratingContainer: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    padding: 20,
    backgroundColor: "#fff",
  },
  ratingTitle: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: "#111",
    marginBottom: 12,
  },
  ratingBodyText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#555",
    marginBottom: 16,
  },
  ratingChoiceList: {
    gap: 10,
  },
  ratingChoiceButton: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  ratingChoiceText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#111827",
  },
  ratingActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  ratingPrimaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF6B35",
    paddingHorizontal: 12,
  },
  ratingPrimaryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800" as const,
  },
  ratingSecondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  ratingSecondaryText: {
    fontSize: 14,
    fontWeight: "700" as const,
  },
  ratingFeedbackInput: {
    minHeight: 120,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    marginBottom: 14,
  },
  ratingButtonDisabled: {
    opacity: 0.65,
  },
});
