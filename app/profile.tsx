import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import {
  Camera,
  Edit2,
  Save,
  X,
  User,
  Target,
  Users,
  Check,
  ChevronRight,
  Globe,
  MapPin,
  UserPlus,
  UserCheck,
  PlusCircle,
  FileText,
  Download,
  Award,
} from "lucide-react-native";
import { getAllBadges, getEarnedBadgeCount } from "@/utils/badges";
import type { Badge } from "@/utils/badges";

interface UserProfile {
  RegistrationID: string;
  "First Name": string;
  "Other Names"?: string;
  Username: string;
  Email?: string;
  Sex?: string;
  Age?: number;
  Residence?: string;
  Occupation?: string;
  "Weight Current"?: number;
  "Weight Target"?: number;
  Country?: string;
  "Academic Year"?: string;
  FriendID?: string;
  "Date of Birth"?: string;
}

interface GoalItem {
  goal_id: number;
  Goal: string;
}

interface UserGoal {
  user_goals_id: number;
  registration_id: string;
  goal: string;
}

interface ClubItem {
  club_id: number;
  club_name: string;
  country: string | null;
  location: string | null;
  description: string | null;
}

interface ClubMembership {
  id: number;
  registration_id: string;
  club: string | null;
  new_member: string | null;
}

type EditSection = "profile" | "goals" | "club" | null;
type ClubChoice = "join" | "existing" | "start" | "none" | null;

export default function ProfileScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editSection, setEditSection] = useState<EditSection>(null);
  const [showEditMenu, setShowEditMenu] = useState(false);
  const [formData, setFormData] = useState<Partial<UserProfile>>({});

  const [selectedGoalIds, setSelectedGoalIds] = useState<number[]>([]);
  const [otherGoalText, setOtherGoalText] = useState("");


  const [clubChoice, setClubChoice] = useState<ClubChoice>(null);
  const [selectedClubId, setSelectedClubId] = useState<number | null>(null);

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["profile", user?.id, user],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      console.log("Fetching profile for user:", user.id);
      const { data, error } = await supabase
        .from("registrations")
        .select("*")
        .eq("RegistrationID", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching profile:", JSON.stringify(error, null, 2));
        throw new Error(`Profile fetch failed: ${error.message || JSON.stringify(error)}`);
      }
      if (!data) throw new Error("No profile found for this user");
      console.log("Profile fetched:", data);
      return data;
    },
    enabled: !!user,
  });

  const { data: profilePhoto } = useQuery<string | null>({
    queryKey: ["profilePhoto", user?.id, user],
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

  const { data: activityStats } = useQuery<{ totalDistance: number; totalActivities: number }>({
    queryKey: ["badgeStats", user?.id],
    queryFn: async () => {
      if (!user) return { totalDistance: 0, totalActivities: 0 };
      const { data, error } = await supabase
        .from("activities")
        .select("Distance_km, Exercise_Type")
        .eq("RegistrationID", user.id);
      if (error) {
        console.error("[BadgeStats] Error:", error);
        return { totalDistance: 0, totalActivities: 0 };
      }
      const validTypes = ["Run", "Walk", "Treadmill", "Tredmill"];
      const filtered = (data || []).filter((a) => validTypes.includes(a.Exercise_Type || ""));
      const totalDistance = filtered.reduce((sum, a) => sum + (a.Distance_km || 0), 0);
      return { totalDistance, totalActivities: filtered.length };
    },
    enabled: !!user,
    staleTime: 60000,
  });

  const badges = useMemo(() => {
    if (!activityStats) return [];
    return getAllBadges(activityStats.totalDistance, activityStats.totalActivities);
  }, [activityStats]);

  const earnedBadgeCount = useMemo(() => {
    if (!activityStats) return 0;
    return getEarnedBadgeCount(activityStats.totalDistance, activityStats.totalActivities);
  }, [activityStats]);

  const distanceBadges = useMemo(() => badges.filter((b) => b.type === "distance"), [badges]);
  const activityBadges = useMemo(() => badges.filter((b) => b.type === "activity_count"), [badges]);

  const { data: goals = [] } = useQuery<GoalItem[]>({
    queryKey: ["allGoals", user?.id, user],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goals")
        .select("goal_id, Goal")
        .order("goal_id", { ascending: true });
      if (error) {
        console.error("Error fetching goals:", error);
        return [];
      }
      return (data as GoalItem[]) || [];
    },
  });

  const { data: userGoals = [], refetch: refetchUserGoals } = useQuery<UserGoal[]>({
    queryKey: ["userGoals", user?.id, user],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_goals")
        .select("*")
        .eq("registration_id", user.id);
      if (error) {
        console.error("Error fetching user goals:", error);
        return [];
      }
      return (data as UserGoal[]) || [];
    },
    enabled: !!user,
  });

  const { data: clubs = [] } = useQuery<ClubItem[]>({
    queryKey: ["allClubs", user?.id, user],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("club_id, club_name, country, location, description")
        .order("club_name", { ascending: true });
      if (error) {
        console.error("Error fetching clubs:", error);
        return [];
      }
      return (data as ClubItem[]) || [];
    },
  });

  const { data: clubMembership, refetch: refetchClubMembership } = useQuery<ClubMembership | null>({
    queryKey: ["clubMembership", user?.id, user],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("club_membership_request")
        .select("*")
        .eq("registration_id", user.id)
        .maybeSingle();
      if (error) {
        console.error("Error fetching club membership:", error);
        return null;
      }
      return data as ClubMembership | null;
    },
    enabled: !!user,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: Partial<UserProfile>) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("registrations")
        .update(updates)
        .eq("RegistrationID", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setEditSection(null);
      Alert.alert("Success", "Profile updated successfully!");
    },
    onError: (error) => {
      console.error("Update error:", error);
      Alert.alert("Error", "Failed to update profile");
    },
  });

  const updateGoalsMutation = useMutation({
    mutationFn: async (goalTexts: string[]) => {
      if (!user) throw new Error("Not authenticated");

      await supabase.from("user_goals").delete().eq("registration_id", user.id);

      if (goalTexts.length > 0) {
        const rows = goalTexts.map((goal) => ({
          registration_id: user.id,
          goal,
        }));
        const { error } = await supabase.from("user_goals").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      refetchUserGoals();
      setEditSection(null);
      Alert.alert("Success", "Goals updated successfully!");
    },
    onError: (error) => {
      console.error("Goals update error:", error);
      Alert.alert("Error", "Failed to update goals");
    },
  });

  const updateClubMutation = useMutation({
    mutationFn: async ({ club, newMember }: { club: string | null; newMember: string }) => {
      if (!user) throw new Error("Not authenticated");

      if (clubMembership) {
        const { error } = await supabase
          .from("club_membership_request")
          .update({ club, new_member: newMember })
          .eq("registration_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("club_membership_request")
          .insert({ registration_id: user.id, club, new_member: newMember });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      refetchClubMembership();
      setEditSection(null);
      Alert.alert("Success", "Club membership updated!");
    },
    onError: (error) => {
      console.error("Club update error:", error);
      Alert.alert("Error", "Failed to update club membership");
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (photoUri: string) => {
      if (!user) throw new Error("Not authenticated");
      console.log("Starting photo upload for user:", user.id);
      const photoFileName = `${user.id}_${Date.now()}.jpg`;
      const response = await fetch(photoUri);
      const blob = await response.blob();
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      });

      const { error: uploadError } = await supabase.storage
        .from("user-photos")
        .upload(photoFileName, arrayBuffer, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("user-photos").getPublicUrl(photoFileName);
      const publicUrl = urlData.publicUrl;

      await supabase
        .from("user_photos")
        .update({ is_profile_photo: false })
        .eq("registration_id", user.id);

      const { error: insertError } = await supabase.from("user_photos").insert({
        registration_id: user.id,
        file_path: publicUrl,
        file_name: photoFileName,
        file_size: arrayBuffer.byteLength,
        mime_type: "image/jpeg",
        is_profile_photo: true,
      });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profilePhoto"] });
      queryClient.invalidateQueries({ queryKey: ["headerProfilePhoto"] });
      Alert.alert("Success", "Profile photo updated!");
    },
    onError: (error) => {
      console.error("Photo upload error:", error);
      Alert.alert("Error", "Failed to upload photo. Please try again.");
    },
  });

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Permission Required", "Permission to access camera roll is required!");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images" as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      uploadPhotoMutation.mutate(result.assets[0].uri);
    }
  };

  const handleEditMenuSelect = useCallback((section: EditSection) => {
    setShowEditMenu(false);
    if (section === "profile" && profile) {
      setFormData({
        "First Name": profile["First Name"],
        "Other Names": profile["Other Names"],
        Username: profile.Username,
        Email: profile.Email,
        Sex: profile.Sex,
        Age: profile.Age,
        Residence: profile.Residence,
        Occupation: profile.Occupation,
        "Weight Current": profile["Weight Current"],
        "Weight Target": profile["Weight Target"],
        Country: profile.Country,
        "Academic Year": profile["Academic Year"],
      });
    } else if (section === "goals") {
      const userGoalTexts = userGoals.map((ug) => ug.goal);
      const matchedIds = goals
        .filter((g) => userGoalTexts.some((ut) => ut.toLowerCase() === g.Goal.toLowerCase()))
        .map((g) => g.goal_id);
      setSelectedGoalIds(matchedIds);

      const unmatchedGoals = userGoalTexts.filter(
        (ut) => !goals.some((g) => g.Goal.toLowerCase() === ut.toLowerCase())
      );
      if (unmatchedGoals.length > 0) {
        const otherGoal = goals.find((g) => g.Goal.toLowerCase() === "other");
        if (otherGoal && !matchedIds.includes(otherGoal.goal_id)) {
          setSelectedGoalIds((prev) => [...prev, otherGoal.goal_id]);
        }
        setOtherGoalText(unmatchedGoals.join(", "));
      } else {
        setOtherGoalText("");
      }
    } else if (section === "club") {
      if (clubMembership) {
        if (!clubMembership.club) {
          setClubChoice("none");
        } else if (clubMembership.club === "new request") {
          setClubChoice("start");
        } else if (clubMembership.new_member === "Yes") {
          setClubChoice("join");
          const found = clubs.find((c) => c.club_name === clubMembership.club);
          setSelectedClubId(found?.club_id || null);
        } else {
          setClubChoice("existing");
          const found = clubs.find((c) => c.club_name === clubMembership.club);
          setSelectedClubId(found?.club_id || null);
        }
      } else {
        setClubChoice(null);
        setSelectedClubId(null);
      }
    }
    setEditSection(section);
  }, [profile, userGoals, goals, clubMembership, clubs]);

  const handleSaveProfile = () => {
    updateProfileMutation.mutate(formData);
  };

  const handleSaveGoals = () => {
    if (selectedGoalIds.length === 0) {
      Alert.alert("Select Goals", "Please select at least one goal.");
      return;
    }
    const goalTexts = selectedGoalIds.map((id) => {
      const goal = goals.find((g) => g.goal_id === id);
      if (goal?.Goal?.toLowerCase() === "other") {
        return otherGoalText || "Other";
      }
      return goal?.Goal || "";
    });
    updateGoalsMutation.mutate(goalTexts);
  };

  const handleSaveClub = () => {
    let clubValue: string | null = null;
    let newMemberValue = "No";

    if (clubChoice === "join") {
      if (!selectedClubId) {
        Alert.alert("Select a Club", "Please choose a club from the list.");
        return;
      }
      const selectedClub = clubs.find((c) => c.club_id === selectedClubId);
      clubValue = selectedClub?.club_name || null;
      newMemberValue = "Yes";
    } else if (clubChoice === "existing") {
      if (!selectedClubId) {
        Alert.alert("Select a Club", "Please choose your club from the list.");
        return;
      }
      const selectedClub = clubs.find((c) => c.club_id === selectedClubId);
      clubValue = selectedClub?.club_name || null;
      newMemberValue = "No";
    } else if (clubChoice === "start") {
      clubValue = "new request";
      newMemberValue = "Yes";
    } else {
      clubValue = null;
      newMemberValue = "No";
    }

    updateClubMutation.mutate({ club: clubValue, newMember: newMemberValue });
  };

  const handleCancel = () => {
    setEditSection(null);
    setFormData({});
    setSelectedGoalIds([]);
    setOtherGoalText("");
    setClubChoice(null);
    setSelectedClubId(null);
  };

  const toggleGoal = (goalId: number) => {
    setSelectedGoalIds((prev) =>
      prev.includes(goalId) ? prev.filter((id) => id !== goalId) : [...prev, goalId]
    );
  };

  const showsOtherInput = selectedGoalIds.some((id) => {
    const goal = goals.find((g) => g.goal_id === id);
    return goal?.Goal?.toLowerCase() === "other";
  });

  if (isLoading || !profile) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  const renderEditMenu = () => (
    <Modal
      visible={showEditMenu}
      transparent
      animationType="fade"
      onRequestClose={() => setShowEditMenu(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowEditMenu(false)}
      >
        <View style={styles.editMenuContainer}>
          <Text style={styles.editMenuTitle}>What would you like to edit?</Text>

          <TouchableOpacity
            style={styles.editMenuItem}
            onPress={() => handleEditMenuSelect("profile")}
            activeOpacity={0.7}
          >
            <View style={[styles.editMenuIcon, { backgroundColor: "#10b981" }]}>
              <User size={20} color="#fff" />
            </View>
            <View style={styles.editMenuTextWrap}>
              <Text style={styles.editMenuItemTitle}>Profile</Text>
              <Text style={styles.editMenuItemDesc}>Update your personal information</Text>
            </View>
            <ChevronRight size={18} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.editMenuItem}
            onPress={() => handleEditMenuSelect("goals")}
            activeOpacity={0.7}
          >
            <View style={[styles.editMenuIcon, { backgroundColor: "#f59e0b" }]}>
              <Target size={20} color="#fff" />
            </View>
            <View style={styles.editMenuTextWrap}>
              <Text style={styles.editMenuItemTitle}>Goals</Text>
              <Text style={styles.editMenuItemDesc}>Change your fitness goals</Text>
            </View>
            <ChevronRight size={18} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.editMenuItem}
            onPress={() => handleEditMenuSelect("club")}
            activeOpacity={0.7}
          >
            <View style={[styles.editMenuIcon, { backgroundColor: "#3b82f6" }]}>
              <Users size={20} color="#fff" />
            </View>
            <View style={styles.editMenuTextWrap}>
              <Text style={styles.editMenuItemTitle}>Club Membership</Text>
              <Text style={styles.editMenuItemDesc}>Update your club preferences</Text>
            </View>
            <ChevronRight size={18} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.editMenuCancel}
            onPress={() => setShowEditMenu(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.editMenuCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderProfileEdit = () => (
    <View style={styles.infoContainer}>
      <Text style={styles.editSectionTitle}>Edit Profile</Text>

      {([
        { label: "First Name", key: "First Name" as const, keyboard: "default" as const },
        { label: "Other Names", key: "Other Names" as const, keyboard: "default" as const },
        { label: "Username", key: "Username" as const, keyboard: "default" as const },
        { label: "Email", key: "Email" as const, keyboard: "email-address" as const },
        { label: "Sex", key: "Sex" as const, keyboard: "default" as const },
        { label: "Residence", key: "Residence" as const, keyboard: "default" as const },
        { label: "Occupation", key: "Occupation" as const, keyboard: "default" as const },
        { label: "Country", key: "Country" as const, keyboard: "default" as const },
        { label: "Academic Year", key: "Academic Year" as const, keyboard: "default" as const },
      ]).map((field) => (
        <View key={field.key} style={styles.field}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          <TextInput
            style={styles.input}
            value={String(formData[field.key] ?? "")}
            onChangeText={(text) => setFormData({ ...formData, [field.key]: text })}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            keyboardType={field.keyboard}
            autoCapitalize={field.key === "Email" || field.key === "Username" ? "none" : "sentences"}
          />
        </View>
      ))}

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Age</Text>
        <TextInput
          style={styles.input}
          value={formData.Age?.toString() || ""}
          onChangeText={(text) => setFormData({ ...formData, Age: parseInt(text) || undefined })}
          placeholder="Enter your age"
          keyboardType="numeric"
        />
      </View>

      <View style={styles.weightSection}>
        <Text style={styles.sectionTitle}>Weight Goals</Text>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Weight Current (kg)</Text>
          <TextInput
            style={styles.input}
            value={formData["Weight Current"]?.toString() || ""}
            onChangeText={(text) =>
              setFormData({ ...formData, "Weight Current": parseFloat(text) || undefined })
            }
            placeholder="Enter current weight"
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Weight Target (kg)</Text>
          <TextInput
            style={styles.input}
            value={formData["Weight Target"]?.toString() || ""}
            onChangeText={(text) =>
              setFormData({ ...formData, "Weight Target": parseFloat(text) || undefined })
            }
            placeholder="Enter target weight"
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <X size={20} color="#ef4444" />
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSaveProfile}
          disabled={updateProfileMutation.isPending}
        >
          <Save size={20} color="#fff" />
          <Text style={styles.saveButtonText}>
            {updateProfileMutation.isPending ? "Saving..." : "Save"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderGoalsEdit = () => (
    <View style={styles.infoContainer}>
      <Text style={styles.editSectionTitle}>Edit Goals</Text>
      <Text style={styles.editSectionSubtitle}>Select all goals that apply to you.</Text>

      {goals.length === 0 ? (
        <ActivityIndicator color="#10b981" style={{ marginVertical: 20 }} />
      ) : (
        <View style={styles.goalsGrid}>
          {goals.map((goal) => {
            const isSelected = selectedGoalIds.includes(goal.goal_id);
            return (
              <TouchableOpacity
                key={goal.goal_id}
                style={[styles.goalCard, isSelected && styles.goalCardSelected]}
                onPress={() => toggleGoal(goal.goal_id)}
                activeOpacity={0.7}
              >
                <View style={[styles.goalCheckbox, isSelected && styles.goalCheckboxSelected]}>
                  {isSelected && <Check size={14} color="#fff" />}
                </View>
                <Text style={[styles.goalCardText, isSelected && styles.goalCardTextSelected]}>
                  {goal.Goal}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {showsOtherInput && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Specify your other goal</Text>
          <TextInput
            style={styles.input}
            placeholder="Describe your goal..."
            value={otherGoalText}
            onChangeText={setOtherGoalText}
          />
        </View>
      )}

      {selectedGoalIds.length > 0 && (
        <Text style={styles.selectedCount}>
          {selectedGoalIds.length} goal{selectedGoalIds.length !== 1 ? "s" : ""} selected
        </Text>
      )}

      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <X size={20} color="#ef4444" />
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSaveGoals}
          disabled={updateGoalsMutation.isPending}
        >
          <Save size={20} color="#fff" />
          <Text style={styles.saveButtonText}>
            {updateGoalsMutation.isPending ? "Saving..." : "Save Goals"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderClubChoiceOptions = () => {
    const options: { key: ClubChoice; label: string; icon: React.ReactNode; desc: string }[] = [
      { key: "join", label: "Want to join a club", icon: <UserPlus size={20} color="#fff" />, desc: "Browse and join an existing club" },
      { key: "existing", label: "I already have a club", icon: <UserCheck size={20} color="#fff" />, desc: "Select your current club" },
      { key: "start", label: "Want to start a club", icon: <PlusCircle size={20} color="#fff" />, desc: "Download the application form" },
      { key: "none", label: "No thanks", icon: <X size={20} color="#fff" />, desc: "Remove club membership" },
    ];

    return (
      <View style={styles.clubChoiceList}>
        {options.map((opt) => {
          const isSelected = clubChoice === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.clubChoiceCard, isSelected && styles.clubChoiceCardSelected]}
              onPress={() => {
                setClubChoice(opt.key);
                setSelectedClubId(null);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.clubChoiceIcon, isSelected && styles.clubChoiceIconSelected]}>
                {opt.icon}
              </View>
              <View style={styles.clubChoiceTextWrap}>
                <Text style={[styles.clubChoiceLabel, isSelected && styles.clubChoiceLabelSelected]}>
                  {opt.label}
                </Text>
                <Text style={styles.clubChoiceDesc}>{opt.desc}</Text>
              </View>
              <View style={[styles.clubRadio, isSelected && styles.clubRadioSelected]}>
                {isSelected && <View style={styles.clubRadioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderClubList = (title: string) => (
    <View style={styles.clubSubSection}>
      <Text style={styles.clubSubTitle}>{title}</Text>
      {clubs.length === 0 ? (
        <ActivityIndicator color="#10b981" style={{ marginVertical: 20 }} />
      ) : (
        <View style={styles.clubsList}>
          {clubs.map((club) => {
            const isSelected = selectedClubId === club.club_id;
            return (
              <TouchableOpacity
                key={club.club_id}
                style={[styles.clubDetailCard, isSelected && styles.clubDetailCardSelected]}
                onPress={() => setSelectedClubId(isSelected ? null : club.club_id)}
                activeOpacity={0.7}
              >
                <View style={styles.clubDetailHeader}>
                  <View style={[styles.clubRadio, isSelected && styles.clubRadioSelected]}>
                    {isSelected && <View style={styles.clubRadioDot} />}
                  </View>
                  <Text style={[styles.clubDetailName, isSelected && styles.clubDetailNameSelected]}>
                    {club.club_name}
                  </Text>
                </View>
                {(club.country || club.location) && (
                  <View style={styles.clubDetailMeta}>
                    {club.country && (
                      <View style={styles.clubMetaRow}>
                        <Globe size={13} color="#888" />
                        <Text style={styles.clubMetaText}>{club.country}</Text>
                      </View>
                    )}
                    {club.location && (
                      <View style={styles.clubMetaRow}>
                        <MapPin size={13} color="#888" />
                        <Text style={styles.clubMetaText}>{club.location}</Text>
                      </View>
                    )}
                  </View>
                )}
                {club.description && (
                  <Text style={styles.clubDetailDesc}>{club.description}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderStartNewClub = () => (
    <View style={styles.startClubCard}>
      <FileText size={36} color="#3b82f6" />
      <Text style={styles.startClubTitle}>Start a New Club</Text>
      <Text style={styles.startClubDesc}>
        Download the New Club Application Form below. Fill it out and send it to the admin email
        included in the form.
      </Text>
      <TouchableOpacity
        style={styles.downloadButton}
        onPress={() => {
          Alert.alert(
            "Download Form",
            "The New Club Application Form will be available for download. Please send the completed form to admin@maunrunner.com",
            [{ text: "OK" }]
          );
        }}
        activeOpacity={0.7}
      >
        <Download size={18} color="#fff" />
        <Text style={styles.downloadButtonText}>Download Application Form</Text>
      </TouchableOpacity>
      <Text style={styles.adminEmailNote}>Send completed form to: admin@maunrunner.com</Text>
    </View>
  );

  const renderClubEdit = () => {
    const showSaveButton =
      clubChoice === "none" ||
      clubChoice === "start" ||
      (clubChoice === "join" && selectedClubId) ||
      (clubChoice === "existing" && selectedClubId);

    return (
      <View style={styles.infoContainer}>
        <Text style={styles.editSectionTitle}>Edit Club Membership</Text>
        <Text style={styles.editSectionSubtitle}>
          {clubMembership?.club
            ? `Current club: ${clubMembership.club}`
            : "No club membership set"}
        </Text>

        {renderClubChoiceOptions()}

        {clubChoice === "join" && renderClubList("Choose a club to join")}
        {clubChoice === "existing" && renderClubList("Select your current club")}
        {clubChoice === "start" && renderStartNewClub()}
        {clubChoice === "none" && (
          <View style={styles.noClubCard}>
            <Text style={styles.noClubText}>
              No problem! You can always join a club later.
            </Text>
          </View>
        )}

        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <X size={20} color="#ef4444" />
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          {showSaveButton && (
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveClub}
              disabled={updateClubMutation.isPending}
            >
              <Save size={20} color="#fff" />
              <Text style={styles.saveButtonText}>
                {updateClubMutation.isPending ? "Saving..." : "Save"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const formatDateOfBirth = (dob?: string) => {
    if (!dob) return "Not set";
    try {
      const date = new Date(dob);
      return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    } catch {
      return dob;
    }
  };

  const renderBadgeItem = (badge: Badge) => (
    <View
      key={badge.id}
      style={[styles.badgeItem, !badge.earned && styles.badgeItemLocked]}
    >
      <Text style={styles.badgeEmoji}>{badge.icon}</Text>
      <Text
        style={[styles.badgeTitle, !badge.earned && styles.badgeTitleLocked]}
        numberOfLines={1}
      >
        {badge.title}
      </Text>
      {!badge.earned && (
        <View style={styles.badgeLockOverlay}>
          <Text style={styles.badgeLockIcon}>🔒</Text>
        </View>
      )}
    </View>
  );

  const renderBadgesSection = () => (
    <View style={styles.badgesContainer}>
      <View style={styles.badgesHeader}>
        <View style={styles.badgesHeaderLeft}>
          <Award size={20} color="#FF6B35" />
          <Text style={styles.badgesSectionTitle}>Badges</Text>
        </View>
        <View style={styles.badgesCountChip}>
          <Text style={styles.badgesCountText}>{earnedBadgeCount} earned</Text>
        </View>
      </View>

      <View style={styles.badgesStatsRow}>
        <View style={styles.badgesStatCard}>
          <Text style={styles.badgesStatValue}>
            {activityStats?.totalDistance.toFixed(1) ?? "0"} km
          </Text>
          <Text style={styles.badgesStatLabel}>Total Distance</Text>
        </View>
        <View style={styles.badgesStatCard}>
          <Text style={styles.badgesStatValue}>
            {activityStats?.totalActivities ?? 0}
          </Text>
          <Text style={styles.badgesStatLabel}>Total Activities</Text>
        </View>
      </View>

      <Text style={styles.badgeCategoryTitle}>🏅 Distance Milestones</Text>
      <View style={styles.badgesGrid}>
        {distanceBadges.map(renderBadgeItem)}
      </View>

      <Text style={styles.badgeCategoryTitle}>💪 Activity Milestones</Text>
      <View style={styles.badgesGrid}>
        {activityBadges.map(renderBadgeItem)}
      </View>
    </View>
  );

  const renderProfileView = () => (
    <View style={styles.infoContainer}>
      <View style={styles.bioSection}>
        <Text style={styles.sectionTitle}>Bio</Text>
        {([
          { label: "First Name", value: profile["First Name"] },
          { label: "Other Names", value: profile["Other Names"] },
          { label: "Username", value: profile.Username ? `@${profile.Username}` : undefined },
          { label: "Email", value: profile.Email },
          { label: "Sex", value: profile.Sex },
          { label: "Residence", value: profile.Residence },
          { label: "Country", value: profile.Country },
          { label: "Date of Birth", value: formatDateOfBirth(profile["Date of Birth"]) },
        ]).map((field) => (
          <View key={field.label} style={styles.field}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <Text style={styles.fieldValue}>{field.value || "Not set"}</Text>
          </View>
        ))}
      </View>

      {renderBadgesSection()}

      {userGoals.length > 0 && (
        <View style={styles.weightSection}>
          <Text style={styles.sectionTitle}>Your Goals</Text>
          <View style={styles.goalsTagsRow}>
            {userGoals.map((ug) => (
              <View key={ug.user_goals_id} style={styles.goalTag}>
                <Text style={styles.goalTagText}>{ug.goal}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {clubMembership?.club && (
        <View style={styles.weightSection}>
          <Text style={styles.sectionTitle}>Club Membership</Text>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Club</Text>
            <Text style={styles.fieldValue}>{clubMembership.club}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Status</Text>
            <Text style={styles.fieldValue}>
              {clubMembership.new_member === "Yes" ? "New Member" : "Existing Member"}
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <View style={styles.photoContainer}>
          {profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={styles.profilePhoto} contentFit="cover" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>
                {profile["First Name"]?.[0]?.toUpperCase() || "?"}
              </Text>
            </View>
          )}
          <TouchableOpacity style={styles.cameraButton} onPress={pickImage}>
            <Camera size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {!editSection && (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setShowEditMenu(true)}
          >
            <Edit2 size={20} color="#10b981" />
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      {editSection === "profile" && renderProfileEdit()}
      {editSection === "goals" && renderGoalsEdit()}
      {editSection === "club" && renderClubEdit()}
      {!editSection && renderProfileView()}

      {renderEditMenu()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  header: {
    backgroundColor: "#10b981",
    paddingTop: 40,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 16,
  },
  photoContainer: {
    position: "relative",
  },
  profilePhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: "#fff",
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#fff",
  },
  photoPlaceholderText: {
    fontSize: 48,
    fontWeight: "700" as const,
    color: "#10b981",
  },
  cameraButton: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#10b981",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#10b981",
  },
  infoContainer: {
    padding: 20,
    gap: 16,
  },
  editSectionTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#111",
  },
  editSectionSubtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: -8,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#666",
    textTransform: "uppercase",
  },
  fieldValue: {
    fontSize: 17,
    color: "#000",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
  },
  input: {
    fontSize: 17,
    color: "#000",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#10b981",
  },
  bioSection: {
    gap: 12,
  },
  weightSection: {
    marginTop: 8,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#000",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ef4444",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#ef4444",
  },
  saveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#fff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  editMenuContainer: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    gap: 12,
  },
  editMenuTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#111",
    marginBottom: 4,
  },
  editMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#f9fafb",
  },
  editMenuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  editMenuTextWrap: {
    flex: 1,
    gap: 2,
  },
  editMenuItemTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#111",
  },
  editMenuItemDesc: {
    fontSize: 13,
    color: "#888",
  },
  editMenuCancel: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 4,
  },
  editMenuCancelText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#999",
  },
  goalsGrid: {
    gap: 10,
  },
  goalCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  goalCardSelected: {
    borderColor: "#10b981",
    backgroundColor: "#ecfdf5",
  },
  goalCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  goalCheckboxSelected: {
    backgroundColor: "#10b981",
    borderColor: "#10b981",
  },
  goalCardText: {
    fontSize: 15,
    color: "#333",
    flex: 1,
  },
  goalCardTextSelected: {
    color: "#065f46",
    fontWeight: "600" as const,
  },
  selectedCount: {
    fontSize: 14,
    color: "#10b981",
    fontWeight: "600" as const,
    textAlign: "center",
  },
  goalsTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  goalTag: {
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  goalTagText: {
    fontSize: 14,
    color: "#065f46",
    fontWeight: "500" as const,
  },
  clubChoiceList: {
    gap: 10,
  },
  clubChoiceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  clubChoiceCardSelected: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
  },
  clubChoiceIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#9ca3af",
  },
  clubChoiceIconSelected: {
    backgroundColor: "#3b82f6",
  },
  clubChoiceTextWrap: {
    flex: 1,
    gap: 2,
  },
  clubChoiceLabel: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#333",
  },
  clubChoiceLabelSelected: {
    color: "#1d4ed8",
  },
  clubChoiceDesc: {
    fontSize: 12,
    color: "#888",
  },
  clubRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  clubRadioSelected: {
    borderColor: "#3b82f6",
  },
  clubRadioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#3b82f6",
  },
  clubSubSection: {
    gap: 10,
    marginTop: 8,
  },
  clubSubTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#333",
  },
  clubsList: {
    gap: 10,
  },
  clubDetailCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  clubDetailCardSelected: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
  },
  clubDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  clubDetailName: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#333",
    flex: 1,
  },
  clubDetailNameSelected: {
    color: "#1d4ed8",
  },
  clubDetailMeta: {
    flexDirection: "row",
    gap: 16,
    marginLeft: 32,
  },
  clubMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  clubMetaText: {
    fontSize: 12,
    color: "#888",
  },
  clubDetailDesc: {
    fontSize: 13,
    color: "#666",
    marginLeft: 32,
  },
  startClubCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  startClubTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#111",
  },
  startClubDesc: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#3b82f6",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  downloadButtonText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#fff",
  },
  adminEmailNote: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
  },
  noClubCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  noClubText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  badgesContainer: {
    marginTop: 12,
    gap: 14,
  },
  badgesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badgesHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badgesSectionTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#000",
  },
  badgesCountChip: {
    backgroundColor: "#FFF3ED",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FFDACB",
  },
  badgesCountText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#FF6B35",
  },
  badgesStatsRow: {
    flexDirection: "row",
    gap: 10,
  },
  badgesStatCard: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  badgesStatValue: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: "#111",
  },
  badgesStatLabel: {
    fontSize: 12,
    color: "#888",
    fontWeight: "500" as const,
  },
  badgeCategoryTitle: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#333",
    marginTop: 4,
  },
  badgesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  badgeItem: {
    width: 80,
    height: 80,
    backgroundColor: "#fff",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 2,
    borderColor: "#FFD23F",
    shadowColor: "#FFD23F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  badgeItemLocked: {
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    shadowOpacity: 0,
    elevation: 0,
  },
  badgeEmoji: {
    fontSize: 24,
  },
  badgeTitle: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#333",
    textAlign: "center",
  },
  badgeTitleLocked: {
    color: "#bbb",
  },
  badgeLockOverlay: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  badgeLockIcon: {
    fontSize: 10,
  },
});
