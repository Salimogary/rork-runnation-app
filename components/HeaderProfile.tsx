import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Edit2, LogOut } from "lucide-react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getEarnedBadgeCount } from "@/utils/badges";

interface UserProfile {
  "First Name": string;
  "Other Names"?: string;
}

export default function HeaderProfile() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["headerProfile", user?.id, user],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      
      const { data, error } = await supabase
        .from("registrations")
        .select('"First Name", "Other Names"')
        .eq("RegistrationID", user.id)
        .maybeSingle();

      if (error) throw error;
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

  const { data: badgeCount = 0 } = useQuery<number>({
    queryKey: ["headerBadgeCount", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase
        .from("activities")
        .select("Distance_km")
        .eq("RegistrationID", user.id);
      if (error) {
        console.error("[HeaderBadges] Error:", error);
        return 0;
      }
      const totalDistance = (data || []).reduce((sum, a) => sum + (a.Distance_km || 0), 0);
      const totalActivities = (data || []).length;
      return getEarnedBadgeCount(totalDistance, totalActivities);
    },
    enabled: !!user,
    staleTime: 60000,
  });

  const handleEdit = () => {
    setMenuVisible(false);
    router.push("/profile" as any);
  };

  const handleSignOut = async () => {
    setMenuVisible(false);
    
    if (Platform.OS !== 'web') {
      Alert.alert(
        "Sign Out",
        "Are you sure you want to sign out?",
        [
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
        ]
      );
    } else {
      const { error } = await signOut();
      if (!error) {
        router.replace("/register" as any);
      }
    }
  };

  const firstName = profile?.["First Name"] || "User";
  const firstLetter = firstName[0]?.toUpperCase() || "U";

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.profileButton}
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
        <Text style={styles.nameText} numberOfLines={1}>
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
              <View style={styles.menuContainer}>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleEdit}
                  activeOpacity={0.7}
                >
                  <Edit2 size={20} color="#000" />
                  <Text style={styles.menuItemText}>Edit</Text>
                </TouchableOpacity>

                <View style={styles.menuDivider} />

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
    gap: 8,
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
    maxWidth: 100,
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
    shadowOffset: {
      width: 0,
      height: 4,
    },
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
});
