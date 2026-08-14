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
  Platform,
  Share,
  Linking,
} from "react-native";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Stack, useRouter } from "expo-router";
import { Image } from "expo-image";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  Camera,
  Edit2,
  Save,
  X,
  User,
  Target,
  Users,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  MapPin,
  UserPlus,
  UserCheck,
  PlusCircle,
  Calendar,
  Award,
  BadgeCheck,
  Phone,
  Clock,
  CreditCard,
  Zap,
  Circle,
  Plane,
  Ruler,
  MessageCircle,
} from "lucide-react-native";
import { getAllBadges, getEarnedBadgeCount, getProfileCompleteBadge } from "@/utils/badges";
import type { Badge } from "@/utils/badges";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useTheme } from "@/contexts/ThemeContext";
import { calculateProfileCompletion } from "@/utils/profileCompletion";
import type { ProfileCompletionInputs } from "@/utils/profileCompletion";
import { getServerClient } from "@/lib/server-client";
import { supabase } from "@/lib/supabase";
import { WORLD_COUNTRIES } from "@/constants/countries";
import { clubMatchesTown, filterVisibleClubsForAge, getAgeFromDob, isAtLeastRunNationAge } from "@/utils/specialClubs";
import { useDistanceUnit, type DistanceUnit } from "@/contexts/DistanceUnitContext";
import { useWeightUnit, type WeightUnit } from "@/contexts/WeightUnitContext";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { getGoalDisplayLabel } from "@/utils/goalDisplay";

const FALLBACK_COUNTRIES = WORLD_COUNTRIES;
const RUNNATION_APP_LINK = "https://expo.dev/artifacts/eas/27LbCHM76M74izfEPYt1pN.apk";
const PARA_EQUIPMENT_OPTIONS = [
  { value: "wheelchair", label: "Wheelchair" },
  { value: "handcycle", label: "Handcycle" },
  { value: "prosthetic_blades", label: "Prosthetic blades" },
  { value: "other", label: "Other" },
];

const normalizeCountryLabel = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  const country = FALLBACK_COUNTRIES.find(
    (item) => item.iso_alpha2.toUpperCase() === upper || item.name.toLowerCase() === raw.toLowerCase()
  );
  return (country?.name || raw).trim().toLowerCase();
};

interface UserProfile {
  registration_id: string;
  first_name: string;
  other_names?: string;
  username: string;
  email?: string;
  phone?: string;
  country_code?: string;
  sex?: string;
  city_town_district?: string;
  country?: string;
  travel_country?: string | null;
  travel_country_code?: string | null;
  travel_start_date?: string | null;
  travel_end_date?: string | null;
  club?: string;
  dob?: string;
  email_verified?: boolean;
  has_disability?: boolean | null;
  para_uses_equipment?: boolean | null;
  para_equipment_type?: string | null;
  para_equipment_other?: string | null;
  does_indoor_workouts?: boolean | null;
  has_smart_watch?: boolean | null;
  smart_watch_brand?: string | null;
  smart_watch_model?: string | null;
}

interface GoalItem {
  goal_id: number;
  goal: string;
}

interface UserGoal {
  user_goals_id: number;
  registration_id: string;
  goal: string;
}

interface ClubItem {
  club_id: string;
  club_name: string;
  country: string | null;
  location: string | null;
  description: string | null;
  is_special_club?: boolean | null;
  special_club_code?: string | null;
  age_min?: number | null;
  age_max?: number | null;
  presence_towns?: string[] | string | null;
}

interface ClubMembership {
  id: number;
  registration_id: string;
  club: string | null;
  club_id?: string | null;
  new_member: string | null;
  request_type?: string | null;
  proposed_club_name?: string | null;
  proposed_country?: string | null;
  proposed_description?: string | null;
}

interface ClubWhatsappLink {
  linkId: string;
  clubId: string;
  clubName: string;
  link: string;
}

type EditSection = "profile" | "goals" | "club" | "travel" | "units" | null;
type ClubChoice = "join" | "existing" | "start" | "organizer" | "none" | null;
type UnitFormData = {
  distanceUnit: DistanceUnit;
  weightUnit: WeightUnit;
};

function isGeneralHealthGoal(value: string | null | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "general health" || normalized.includes("general health") || normalized.includes("health");
}

interface ClubStartRequestData {
  clubName: string;
  country: string;
  description: string;
}

interface OrganizerRequestData {
  organizerName: string;
  country: string;
  description: string;
}

export default function ProfileScreen() {
  const { user, roleSession } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { subscriptionStatus, trialDaysRemaining, subscription, isLoading: subLoading } = useSubscription();
  const { colors: themeColors } = useTheme();
  const { distanceUnit, distanceUnitLabel, distanceUnitShortLabel, setDistanceUnit } = useDistanceUnit();
  const { weightUnit, weightUnitLabel, weightUnitShortLabel, setWeightUnit } = useWeightUnit();
  const [editSection, setEditSection] = useState<EditSection>(null);
  const [showEditMenu, setShowEditMenu] = useState(false);
  const [formData, setFormData] = useState<Partial<UserProfile>>({});
  const [unitFormData, setUnitFormData] = useState<UnitFormData>({
    distanceUnit,
    weightUnit,
  });
  const [authProvider, setAuthProvider] = useState<string | null>(null);

  const [selectedGoalIds, setSelectedGoalIds] = useState<number[]>([]);
  const [otherGoalText, setOtherGoalText] = useState("");


  const [clubChoice, setClubChoice] = useState<ClubChoice>(null);
  const [selectedNormalClubId, setSelectedNormalClubId] = useState<string | null>(null);
  const [selectedSpecialClubIds, setSelectedSpecialClubIds] = useState<string[]>([]);
  const [clubStartRequest, setClubStartRequest] = useState<ClubStartRequestData>({
    clubName: "",
    country: "",
    description: "",
  });
  const [organizerRequest, setOrganizerRequest] = useState<OrganizerRequestData>({
    organizerName: "",
    country: "",
    description: "",
  });
  const { data: profileBundle, isLoading } = useQuery({
    queryKey: ["profileBundle", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      return await getServerClient().profile.getBundle.query({ registrationId: user.id });
    },
    enabled: !!user,
    staleTime: 30000,
  });

  const { data: countriesData = FALLBACK_COUNTRIES } = useQuery({
    queryKey: ["profileCountries"],
    queryFn: async () => {
      try {
        return await getServerClient().auth.getCountries.query();
      } catch {
        return FALLBACK_COUNTRIES;
      }
    },
    staleTime: 1000 * 60 * 60,
  });

  const profile = profileBundle?.profile as UserProfile | undefined;
  const profilePhoto = profileBundle?.profilePhoto ?? null;
  const activityStats = useMemo(
    () => ({
      totalDistance: Number(profileBundle?.activityStats?.totalDistance ?? 0) || 0,
      totalActivities: Number(profileBundle?.activityStats?.totalActivities ?? 0) || 0,
    }),
    [profileBundle]
  );

  const distanceBadges = useMemo(() => {
    if (!activityStats) return [];
    return getAllBadges(activityStats.totalDistance, activityStats.totalActivities, 0).filter((b) => b.type === "distance");
  }, [activityStats]);
  const activityBadges = useMemo(() => {
    if (!activityStats) return [];
    return getAllBadges(activityStats.totalDistance, activityStats.totalActivities, 0).filter((b) => b.type === "activity_count");
  }, [activityStats]);

  const goals = useMemo(
    () => (Array.isArray(profileBundle?.goals) ? (profileBundle.goals as GoalItem[]) : []),
    [profileBundle]
  );
  const userGoals = useMemo(
    () => (Array.isArray(profileBundle?.userGoals) ? (profileBundle.userGoals as UserGoal[]) : []),
    [profileBundle]
  );
  const clubs = useMemo(
    () => (Array.isArray(profileBundle?.clubs) ? (profileBundle.clubs as ClubItem[]) : []),
    [profileBundle]
  );
  const countryClubs = useMemo(() => {
    const userCountry = normalizeCountryLabel(profile?.country);
    if (!userCountry) return [];
    return clubs.filter((club) => normalizeCountryLabel(club.country) === userCountry);
  }, [clubs, profile?.country]);
  const visibleClubs = useMemo(
    () => filterVisibleClubsForAge(clubs, countryClubs, getAgeFromDob(profile?.dob), {
      hasDisability: profile?.has_disability,
      doesIndoorWorkouts: profile?.does_indoor_workouts,
      hasSmartWatch: profile?.has_smart_watch,
      hasGeneralHealthGoal: userGoals.some((goal) => isGeneralHealthGoal(goal.goal)),
      userCountry: profile?.country,
    }),
    [
      clubs,
      countryClubs,
      profile?.dob,
      profile?.has_disability,
      profile?.does_indoor_workouts,
      profile?.has_smart_watch,
      profile?.country,
      userGoals,
    ]
  );
  const visibleNormalClubs = useMemo(
    () => visibleClubs.filter((club) => !club.is_special_club && !club.special_club_code),
    [visibleClubs]
  );
  const visibleSpecialClubs = useMemo(
    () => visibleClubs.filter((club) => club.is_special_club || club.special_club_code),
    [visibleClubs]
  );
  const recommendedNormalClubs = useMemo(
    () => visibleNormalClubs.filter((club) => clubMatchesTown(club, profile?.city_town_district)),
    [visibleNormalClubs, profile?.city_town_district]
  );
  const otherNormalClubs = useMemo(
    () => visibleNormalClubs.filter((club) => !clubMatchesTown(club, profile?.city_town_district)),
    [visibleNormalClubs, profile?.city_town_district]
  );
  const countryOptions = useMemo(() => {
    const rows = Array.isArray(countriesData)
      ? (countriesData as { name: string; iso_alpha2: string }[])
      : FALLBACK_COUNTRIES;
    const currentCountries = [
      String(formData.country || profile?.country || ""),
      String(formData.travel_country || profile?.travel_country || ""),
    ].filter(Boolean);
    const extras = currentCountries
      .filter((currentCountry) =>
        !rows.some(
          (country) =>
            String(country.name || "") === currentCountry ||
            String(country.iso_alpha2 || "") === currentCountry
        )
      )
      .map((currentCountry) => ({ name: currentCountry, iso_alpha2: currentCountry }));
    return [...extras, ...rows]
      .map((country) => ({
        name: String(country.name || country.iso_alpha2 || "").trim(),
        iso_alpha2: String(country.iso_alpha2 || country.name || "").trim(),
      }))
      .filter((country) => country.name && country.iso_alpha2);
  }, [countriesData, formData.country, formData.travel_country, profile?.country, profile?.travel_country]);
  const clubMembership = (profileBundle?.clubMembership as ClubMembership | null | undefined) ?? null;
  const clubMemberships = Array.isArray(profileBundle?.clubMemberships)
    ? (profileBundle.clubMemberships as ClubMembership[])
    : [];
  const clubWhatsappLinks = Array.isArray(profileBundle?.clubWhatsappLinks)
    ? (profileBundle.clubWhatsappLinks as ClubWhatsappLink[])
    : [];
  const clubMembershipRows = useMemo(() => {
    const memberships = (clubMemberships.length > 0 ? clubMemberships : clubMembership ? [clubMembership] : [])
      .filter((membership) => membership?.club);

    return memberships.map((membership, index) => {
      const membershipClubName = String(membership.club || "").trim();
      const normalizedMembershipClubName = membershipClubName.toLowerCase();
      const membershipClub = clubs.find(
        (club) => {
          const clubName = String(club.club_name || "").trim().toLowerCase();
          return club.club_id === membership.club_id || clubName === normalizedMembershipClubName;
        }
      );
      const whatsappLink = clubWhatsappLinks.find((link) =>
        (membershipClub?.club_id && link.clubId === membershipClub.club_id) ||
        String(link.clubName || "").trim().toLowerCase() === normalizedMembershipClubName
      ) ?? null;

      return {
        key: `${membership.club_id || membershipClubName}-${membership.new_member || "member"}-${index}`,
        clubId: membership.club_id || membershipClub?.club_id || null,
        clubName: membershipClub?.club_name || membershipClubName,
        status: membership.new_member === "Yes" ? "New Member" : "Existing Member",
        whatsappLink,
      };
    });
  }, [clubMembership, clubMemberships, clubs, clubWhatsappLinks]);

  const isEmailVerified = profile?.email_verified === true;
  const isSocialAuthUser = authProvider === "google" || authProvider === "apple";
  const socialProviderLabel = authProvider === "apple" ? "Apple" : "Google";

  useEffect(() => {
    let isMounted = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      const provider =
        data.user?.app_metadata?.provider ||
        data.user?.identities?.[0]?.provider ||
        null;
      setAuthProvider(typeof provider === "string" ? provider : null);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const [showCompletionModal, setShowCompletionModal] = useState(false);

  const completionInputs = profileBundle?.completionInputs as ProfileCompletionInputs | undefined;

  const completion = useMemo(() => {
    if (!completionInputs) return null;
    return calculateProfileCompletion(completionInputs);
  }, [completionInputs]);

  const completionPct = completion?.percentage ?? 0;

  const earnedBadgeCount = useMemo(() => {
    if (!activityStats) return 0;
    return getEarnedBadgeCount(activityStats.totalDistance, activityStats.totalActivities, completionPct);
  }, [activityStats, completionPct]);

  const profileBadge = useMemo(() => {
    return getProfileCompleteBadge(completionPct);
  }, [completionPct]);
  const bottomNavPadding = Platform.OS === "android" ? Math.max(insets.bottom, 88) + 32 : insets.bottom + 32;

  const handleAdminPortalPress = useCallback(async () => {
    router.push('/admin' as any);
  }, [router]);

  const handleBackPress = useCallback(() => {
    if (typeof (router as any).canGoBack === "function" && (router as any).canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)" as any);
  }, [router]);

  const updateProfileMutation = useMutation({
    mutationFn: async ({
      registration,
      contact,
    }: {
      registration: Partial<UserProfile>;
      contact: { email?: string; country_code?: string; phone?: string };
    }) => {
      if (!user) throw new Error("Not authenticated");
      const registrationPayload: Record<string, string | boolean | null | undefined> = {};
      ([
        "first_name",
        "other_names",
        "username",
        "sex",
        "dob",
        "city_town_district",
        "country",
        "has_disability",
        "para_uses_equipment",
        "para_equipment_type",
        "para_equipment_other",
        "does_indoor_workouts",
        "has_smart_watch",
        "smart_watch_brand",
        "smart_watch_model",
        "travel_country",
        "travel_country_code",
        "travel_start_date",
        "travel_end_date",
      ] as const).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(registration, key)) {
          registrationPayload[key] = registration[key] ?? null;
        }
      });
      const contactPayload: Record<string, string | null | undefined> = {};
      (["email", "country_code", "phone"] as const).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(contact, key)) {
          contactPayload[key] = contact[key] ?? null;
        }
      });
      await getServerClient().profile.updateProfile.mutate({
        registrationId: user.id,
        registration: registrationPayload,
        contact: contactPayload,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profileBundle"] });
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
      await getServerClient().profile.saveGoals.mutate({
        registrationId: user.id,
        goals: goalTexts,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profileBundle"] });
      setEditSection(null);
      Alert.alert("Success", "Goals updated successfully!");
    },
    onError: (error) => {
      console.error("Goals update error:", error);
      Alert.alert("Error", "Failed to update goals");
    },
  });

  const updateClubMutation = useMutation({
    mutationFn: async ({
      club,
      clubId,
      newMember,
      requestType,
      proposedClubName,
      proposedCountry,
      proposedDescription,
      clubMemberships: nextClubMemberships,
    }: {
      club: string | null;
      clubId: string | null;
      newMember: string;
      requestType: "membership" | "start_club" | "event_organizer";
      proposedClubName: string | null;
      proposedCountry: string | null;
      proposedDescription: string | null;
      clubMemberships?: { club: string; clubId: string }[];
    }) => {
      if (!user) throw new Error("Not authenticated");
      await getServerClient().profile.saveClubMembership.mutate({
        registrationId: user.id,
        club,
        clubId,
        newMember,
        requestType,
        proposedClubName,
        proposedCountry,
        proposedDescription,
        clubMemberships: nextClubMemberships,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profileBundle"] });
      setEditSection(null);
      Alert.alert("Success", "Club membership updated!");
    },
    onError: (error) => {
      console.error("Club update error:", error);
      Alert.alert("Error", "Failed to update club membership");
    },
  });

  const leaveClubMutation = useMutation({
    mutationFn: async ({ clubId, club }: { clubId: string | null; club: string }) => {
      if (!user) throw new Error("Not authenticated");
      await getServerClient().profile.leaveClubMembership.mutate({
        registrationId: user.id,
        clubId,
        club,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profileBundle"] });
      Alert.alert("Club Left", "You have left this club.");
    },
    onError: (error) => {
      console.error("Leave club error:", error);
      Alert.alert("Error", "Could not leave this club.");
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (photo: { uri: string; base64?: string | null; mimeType?: string | null }) => {
      if (!user) throw new Error("Not authenticated");
      const imageBase64 =
        photo.base64 ||
        await FileSystem.readAsStringAsync(photo.uri, {
          encoding: "base64",
        });

      await getServerClient().profile.uploadPhoto.mutate({
        registrationId: user.id,
        imageBase64,
        mimeType: photo.mimeType || "image/jpeg",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profileBundle"] });
      void queryClient.invalidateQueries({ queryKey: ["profilePhoto"] });
      void queryClient.invalidateQueries({ queryKey: ["headerProfilePhoto"] });
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
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      uploadPhotoMutation.mutate({
        uri: asset.uri,
        base64: asset.base64,
        mimeType: asset.mimeType,
      });
    }
  };

  const handleEditMenuSelect = useCallback((section: EditSection) => {
    setShowEditMenu(false);
    if (section === "profile" && profile) {
      setFormData({
        first_name: profile.first_name,
        other_names: profile.other_names,
        username: profile.username,
        email: profile.email,
        country_code: profile.country_code,
        phone: profile.phone,
        sex: profile.sex,
        dob: profile.dob,
        city_town_district: profile.city_town_district,
        country: profile.country,
        has_disability: profile.has_disability === true,
        para_uses_equipment: profile.para_uses_equipment === true,
        para_equipment_type: profile.para_equipment_type ?? "",
        para_equipment_other: profile.para_equipment_other ?? "",
        does_indoor_workouts: profile.does_indoor_workouts === true,
        has_smart_watch: profile.has_smart_watch === true,
        smart_watch_brand: profile.smart_watch_brand ?? "",
        smart_watch_model: profile.smart_watch_model ?? "",
      });
    } else if (section === "goals") {
      const userGoalTexts = userGoals.map((ug) => String(ug.goal || "")).filter(Boolean);
      const matchedIds = goals
        .filter((g) => {
          const goalText = String(g.goal || "").toLowerCase();
          return Boolean(goalText) && userGoalTexts.some((ut) => ut.toLowerCase() === goalText);
        })
        .map((g) => g.goal_id);
      setSelectedGoalIds(matchedIds);

      const unmatchedGoals = userGoalTexts.filter(
        (ut) => !goals.some((g) => String(g.goal || "").toLowerCase() === ut.toLowerCase())
      );
      if (unmatchedGoals.length > 0) {
        const otherGoal = goals.find((g) => String(g.goal || "").toLowerCase() === "other");
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
        } else if (clubMembership.request_type === "event_organizer") {
          setClubChoice("organizer");
          setOrganizerRequest({
            organizerName: clubMembership.proposed_club_name || clubMembership.club || "",
            country: clubMembership.proposed_country || profile?.country || "",
            description: clubMembership.proposed_description || "",
          });
        } else if (clubMembership.request_type === "start_club") {
          setClubChoice("start");
          setClubStartRequest({
            clubName: clubMembership.proposed_club_name || clubMembership.club || "",
            country: clubMembership.proposed_country || profile?.country || "",
            description: clubMembership.proposed_description || "",
          });
        } else if (clubMembership.new_member === "Yes") {
          setClubChoice("join");
          const selectedRows = clubMemberships.filter((membership) => membership.club_id || membership.club);
          const selectedClubs = selectedRows
            .map((membership) => clubs.find((club) =>
              club.club_id === membership.club_id ||
              String(club.club_name || "").trim().toLowerCase() === String(membership.club || "").trim().toLowerCase()
            ))
            .filter(Boolean) as ClubItem[];
          setSelectedNormalClubId(selectedClubs.find((club) => !club.is_special_club && !club.special_club_code)?.club_id || null);
          setSelectedSpecialClubIds(selectedClubs.filter((club) => club.is_special_club || club.special_club_code).map((club) => club.club_id));
        } else {
          setClubChoice("existing");
          const selectedRows = clubMemberships.filter((membership) => membership.club_id || membership.club);
          const selectedClubs = selectedRows
            .map((membership) => clubs.find((club) =>
              club.club_id === membership.club_id ||
              String(club.club_name || "").trim().toLowerCase() === String(membership.club || "").trim().toLowerCase()
            ))
            .filter(Boolean) as ClubItem[];
          setSelectedNormalClubId(selectedClubs.find((club) => !club.is_special_club && !club.special_club_code)?.club_id || null);
          setSelectedSpecialClubIds(selectedClubs.filter((club) => club.is_special_club || club.special_club_code).map((club) => club.club_id));
        }
      } else {
        setClubChoice(null);
        setSelectedNormalClubId(null);
        setSelectedSpecialClubIds([]);
        setClubStartRequest({ clubName: "", country: profile?.country || "", description: "" });
        setOrganizerRequest({ organizerName: "", country: profile?.country || "", description: "" });
      }
    } else if (section === "travel" && profile) {
      setFormData({
        travel_country: profile.travel_country ?? "",
        travel_country_code: profile.travel_country_code ?? "",
        travel_start_date: profile.travel_start_date ?? "",
        travel_end_date: profile.travel_end_date ?? "",
      });
    } else if (section === "units") {
      setUnitFormData({
        distanceUnit,
        weightUnit,
      });
    }
    setEditSection(section);
  }, [profile, userGoals, goals, clubMembership, clubMemberships, clubs, distanceUnit, weightUnit]);

  const isValidIsoDate = (value?: string | null) => {
    if (!value) return true;
    const match = value.match(/^\d{4}-\d{2}-\d{2}$/);
    if (!match) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };

  const handleSaveProfile = () => {
    if (!String(formData.dob || "").trim()) {
      Alert.alert("Date of Birth Required", "Please add your date of birth before saving your profile.");
      return;
    }
    if (!String(formData.country || "").trim()) {
      Alert.alert("Nationality Required", "Please add your nationality before saving your profile.");
      return;
    }
    if (formData.dob && !isAtLeastRunNationAge(formData.dob)) {
      Alert.alert("Minimum Age Required", "RunNation registration is available for users aged 8 years and above.");
      return;
    }
    if (formData.has_disability === true && formData.para_uses_equipment === true && !String(formData.para_equipment_type || "").trim()) {
      Alert.alert("Para Equipment", "Please choose the equipment you use.");
      return;
    }
    if (
      formData.has_disability === true &&
      formData.para_uses_equipment === true &&
      formData.para_equipment_type === "other" &&
      !String(formData.para_equipment_other || "").trim()
    ) {
      Alert.alert("Para Equipment", "Please describe the equipment you use.");
      return;
    }

    const { country_code, phone, email, ...regFields } = formData;
    updateProfileMutation.mutate({
      registration: regFields,
      contact: {
        country_code,
        phone,
        email,
      },
    });
  };

  const handleSaveTravel = () => {
    const travelCountry = String(formData.travel_country || "").trim();
    const travelStart = String(formData.travel_start_date || "").trim();
    const travelEnd = String(formData.travel_end_date || "").trim();
    const selectedCountry = countryOptions.find((country) => country.name === travelCountry || country.iso_alpha2 === travelCountry);

    if (!travelCountry && !travelStart && !travelEnd) {
      updateProfileMutation.mutate({
        registration: {
          travel_country: null,
          travel_country_code: null,
          travel_start_date: null,
          travel_end_date: null,
        },
        contact: {},
      });
      return;
    }

    if (!travelCountry || !travelStart || !travelEnd) {
      Alert.alert("Travel Details", "Please choose a destination country and enter both travel dates.");
      return;
    }

    if (!isValidIsoDate(travelStart) || !isValidIsoDate(travelEnd)) {
      Alert.alert("Travel Dates", "Please enter travel dates in YYYY-MM-DD format.");
      return;
    }

    if (travelEnd < travelStart) {
      Alert.alert("Travel Dates", "Travel end date cannot be before the start date.");
      return;
    }

    updateProfileMutation.mutate({
      registration: {
        travel_country: selectedCountry?.name || travelCountry,
        travel_country_code: selectedCountry?.iso_alpha2 || null,
        travel_start_date: travelStart,
        travel_end_date: travelEnd,
      },
      contact: {},
    });
  };

  const handleSaveGoals = () => {
    if (selectedGoalIds.length === 0) {
      Alert.alert("Select Goals", "Please select at least one goal.");
      return;
    }
    const goalTexts = selectedGoalIds.map((id) => {
      const goal = goals.find((g) => g.goal_id === id);
      if (goal?.goal?.toLowerCase() === "other") {
        return otherGoalText || "Other";
      }
      return goal?.goal || "";
    });
    updateGoalsMutation.mutate(goalTexts);
  };

  const handleSaveClub = () => {
    let clubValue: string | null = null;
    let clubIdValue: string | null = null;
    let newMemberValue = "No";
    let selectedMembershipClubs: ClubItem[] = [];

    if (clubChoice === "join") {
      selectedMembershipClubs = [selectedNormalClubId, ...selectedSpecialClubIds]
        .filter(Boolean)
        .map((clubId) => visibleClubs.find((club) => club.club_id === clubId))
        .filter(Boolean) as ClubItem[];
      if (selectedMembershipClubs.length === 0) {
        Alert.alert("Select a Club", "Please choose a normal club, a special club, or one of each.");
        return;
      }
      clubValue = selectedMembershipClubs.map((club) => club.club_name).join(", ") || null;
      clubIdValue = selectedMembershipClubs[0]?.club_id || null;
      newMemberValue = "Yes";
    } else if (clubChoice === "existing") {
      selectedMembershipClubs = [selectedNormalClubId, ...selectedSpecialClubIds]
        .filter(Boolean)
        .map((clubId) => visibleClubs.find((club) => club.club_id === clubId))
        .filter(Boolean) as ClubItem[];
      if (selectedMembershipClubs.length === 0) {
        Alert.alert("Select a Club", "Please choose a normal club, a special club, or one of each.");
        return;
      }
      clubValue = selectedMembershipClubs.map((club) => club.club_name).join(", ") || null;
      clubIdValue = selectedMembershipClubs[0]?.club_id || null;
      newMemberValue = "No";
    } else if (clubChoice === "start") {
      if (!clubStartRequest.clubName.trim()) {
        Alert.alert("Club Name Required", "Please enter the club name you want to start.");
        return;
      }
      if (!clubStartRequest.country.trim()) {
        Alert.alert("Country Required", "Please choose the country for the club request.");
        return;
      }
      clubValue = clubStartRequest.clubName.trim();
      newMemberValue = "Yes";
    } else if (clubChoice === "organizer") {
      if (!organizerRequest.organizerName.trim()) {
        Alert.alert("Organizer Name Required", "Please enter the event organiser name.");
        return;
      }
      if (!organizerRequest.country.trim()) {
        Alert.alert("Country Required", "Please choose the country for the organiser request.");
        return;
      }
      clubValue = organizerRequest.organizerName.trim();
      newMemberValue = "No";
    } else {
      clubValue = null;
      newMemberValue = "No";
    }

    updateClubMutation.mutate({
      club: clubValue,
      clubId: clubIdValue,
      newMember: newMemberValue,
      requestType:
        clubChoice === "start"
          ? "start_club"
          : clubChoice === "organizer"
          ? "event_organizer"
          : "membership",
      proposedClubName:
        clubChoice === "start"
          ? clubStartRequest.clubName.trim()
          : clubChoice === "organizer"
          ? organizerRequest.organizerName.trim()
          : null,
      proposedCountry:
        clubChoice === "start"
          ? clubStartRequest.country.trim()
          : clubChoice === "organizer"
          ? organizerRequest.country.trim()
          : null,
      proposedDescription:
        clubChoice === "start"
          ? clubStartRequest.description.trim()
          : clubChoice === "organizer"
          ? organizerRequest.description.trim()
          : null,
      clubMemberships:
        clubChoice === "join" || clubChoice === "existing"
          ? selectedMembershipClubs.map((club) => ({ club: club.club_name, clubId: club.club_id }))
          : clubChoice === "none"
          ? []
          : undefined,
    });
  };

  const handleLeaveClub = (membership: { clubId: string | null; clubName: string }) => {
    Alert.alert(
      "Leave club?",
      `You will be removed from ${membership.clubName}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => leaveClubMutation.mutate({ clubId: membership.clubId, club: membership.clubName }),
        },
      ]
    );
  };

  const handleSaveUnits = () => {
    setDistanceUnit(unitFormData.distanceUnit);
    setWeightUnit(unitFormData.weightUnit);
    setEditSection(null);
    Alert.alert("Success", "Measurement units updated!");
  };

  const shareMissingClubInvite = async () => {
    const link = RUNNATION_APP_LINK || "RunNation app download link coming soon";
    const message = [
      "Hello Coach/Club Coordinator, I am joining RunNation and could not find our club on the club list.",
      "Please join RunNation and create our club profile so members can connect, register, and appear under the right club.",
      `App link: ${link}`,
      "If you permit me to create it, I can create the club profile from Settings > Join Service Team after completing registration.",
      "RunNation - Where runners belong",
    ].join("\n\n");

    if (Platform.OS === "web") {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        alert("Club invitation message copied.");
        return;
      }
      alert(message);
      return;
    }

    await Share.share({ message });
  };

  const handleCancel = () => {
    setEditSection(null);
    setFormData({});
    setUnitFormData({ distanceUnit, weightUnit });
    setSelectedGoalIds([]);
    setOtherGoalText("");
    setClubChoice(null);
    setSelectedNormalClubId(null);
    setSelectedSpecialClubIds([]);
    setClubStartRequest({ clubName: "", country: profile?.country || "", description: "" });
    setOrganizerRequest({ organizerName: "", country: profile?.country || "", description: "" });
  };

  const toggleGoal = (goalId: number) => {
    setSelectedGoalIds((prev) =>
      prev.includes(goalId) ? prev.filter((id) => id !== goalId) : [...prev, goalId]
    );
  };

  const showsOtherInput = selectedGoalIds.some((id) => {
    const goal = goals.find((g) => g.goal_id === id);
    return goal?.goal?.toLowerCase() === "other";
  });

  const getTrialEndDate = useCallback(() => {
    if (!profile) return "";
    const createdAt = (profile as any).created_at;
    if (!createdAt) return "";
    const created = new Date(createdAt);
    const trialEnd = new Date(created.getTime() + 90 * 24 * 60 * 60 * 1000);
    return trialEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }, [profile]);

  const getSubscriptionEndDate = useCallback(() => {
    if (!subscription?.expires_at) return "";
    const expires = new Date(subscription.expires_at);
    return expires.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }, [subscription]);

  const handleJoinWhatsappGroup = useCallback(async (link: string) => {
    try {
      const supported = await Linking.canOpenURL(link);
      if (!supported) {
        Alert.alert("Cannot Open Link", "This WhatsApp group link is not available on this device.");
        return;
      }
      await Linking.openURL(link);
    } catch {
      Alert.alert("Cannot Open Link", "Please try again or contact your club coordinator.");
    }
  }, []);

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

  const renderYesNoField = (
    label: string,
    detail: string,
    value: boolean,
    onChange: (nextValue: boolean) => void
  ) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.goalHelpText}>{detail}</Text>
      <View style={styles.preferenceChoiceRow}>
        {[
          { label: "No", value: false },
          { label: "Yes", value: true },
        ].map((option) => {
          const isSelected = value === option.value;
          return (
            <TouchableOpacity
              key={`${label}-${option.label}`}
              style={[styles.preferenceChoice, isSelected && styles.preferenceChoiceSelected]}
              onPress={() => onChange(option.value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.preferenceChoiceText, isSelected && styles.preferenceChoiceTextSelected]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

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
            style={styles.editMenuItem}
            onPress={() => handleEditMenuSelect("units")}
            activeOpacity={0.7}
          >
            <View style={[styles.editMenuIcon, { backgroundColor: "#6366f1" }]}>
              <Ruler size={20} color="#fff" />
            </View>
            <View style={styles.editMenuTextWrap}>
              <Text style={styles.editMenuItemTitle}>Measurement Units</Text>
              <Text style={styles.editMenuItemDesc}>Choose distance and weight units</Text>
            </View>
            <ChevronRight size={18} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.editMenuItem}
            onPress={() => handleEditMenuSelect("travel")}
            activeOpacity={0.7}
          >
            <View style={[styles.editMenuIcon, { backgroundColor: "#06b6d4" }]}>
              <Plane size={20} color="#fff" />
            </View>
            <View style={styles.editMenuTextWrap}>
              <Text style={styles.editMenuItemTitle}>Traveling</Text>
              <Text style={styles.editMenuItemDesc}>Access events while you travel</Text>
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
      <View style={styles.profileCompletionNote}>
        <Text style={styles.profileCompletionNoteTitle}>Complete all profile fields</Text>
        <Text style={styles.profileCompletionNoteText}>
          Clubs, reports, goals, events, and special features can depend on details like date of birth, country, sex, disability, and indoor workouts.
        </Text>
      </View>

      {([
        { label: "First Name", key: "first_name" as const, keyboard: "default" as const },
        { label: "Other Names", key: "other_names" as const, keyboard: "default" as const },
        { label: "Username", key: "username" as const, keyboard: "default" as const },
      ] as const).map((field) => (
        <View key={field.key} style={styles.field}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          <TextInput
            style={styles.input}
            value={String(formData[field.key] ?? "")}
            onChangeText={(text) => setFormData({ ...formData, [field.key]: text })}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            keyboardType={field.keyboard}
            autoCapitalize={field.key === "username" ? "none" : "sentences"}
          />
        </View>
      ))}

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Email</Text>
        <View style={styles.emailFieldRow}>
          <TextInput
            style={[styles.input, styles.emailInput]}
            value={String(formData.email ?? "")}
            onChangeText={(text) => setFormData({ ...formData, email: text })}
            placeholder="Enter email"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {isEmailVerified ? (
            <View style={styles.verifiedBadge}>
              <BadgeCheck size={24} color="#1d9bf0" />
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Password Verification</Text>
        <TouchableOpacity
          style={[styles.oauthVerifiedButton, !isSocialAuthUser && styles.passwordVerifyButton]}
          onPress={() => {
            if (isSocialAuthUser) {
              Alert.alert(
                "Already Verified",
                `This account signs in with ${socialProviderLabel}, so password verification is already handled by ${socialProviderLabel}.`
              );
            } else {
              Alert.alert("Password Account", "Password verification is handled when you sign in.");
            }
          }}
          activeOpacity={0.75}
        >
          <BadgeCheck size={18} color={isSocialAuthUser ? "#6b7280" : "#10b981"} />
          <Text style={[styles.oauthVerifiedButtonText, !isSocialAuthUser && styles.passwordVerifyButtonText]}>
            {isSocialAuthUser ? `Verified by ${socialProviderLabel}` : "Verified by password sign-in"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Phone</Text>
        <TextInput
          style={styles.input}
          value={String(formData.phone ?? "")}
          onChangeText={(text) => setFormData({ ...formData, phone: text, country_code: undefined })}
          placeholder="Example: +256 772 345 685"
          keyboardType="phone-pad"
        />
        <Text style={styles.goalHelpText}>Enter the full number, including country code, in one field.</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Sex</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={String(formData.sex ?? "")}
            onValueChange={(value: string) => setFormData({ ...formData, sex: value })}
            style={styles.picker}
          >
            <Picker.Item label="Select sex" value="" />
            <Picker.Item label="Male" value="M" />
            <Picker.Item label="Female" value="F" />
          </Picker>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Date of Birth</Text>
        <TextInput
          style={styles.input}
          value={String(formData.dob ?? "")}
          onChangeText={(text) => setFormData({ ...formData, dob: text })}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>City/Town/District</Text>
        <TextInput
          style={styles.input}
          value={String(formData.city_town_district ?? "")}
          onChangeText={(text) => setFormData({ ...formData, city_town_district: text })}
          placeholder="Enter city/town/district"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Country</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={String(formData.country ?? "")}
            onValueChange={(value: string) => setFormData({ ...formData, country: value })}
            style={styles.picker}
          >
            <Picker.Item label="Select country" value="" />
            {countryOptions.map((country, index) => (
              <Picker.Item key={`profile-country-${country.iso_alpha2}-${index}`} label={country.name} value={country.name} />
            ))}
          </Picker>
        </View>
      </View>

      {renderYesNoField(
        "Do you have any disability?",
        "This controls whether Para Runners appears in your special club options.",
        formData.has_disability === true,
        (value) => setFormData({
          ...formData,
          has_disability: value,
          para_uses_equipment: value ? formData.para_uses_equipment : false,
          para_equipment_type: value ? formData.para_equipment_type : null,
          para_equipment_other: value ? formData.para_equipment_other : null,
        })
      )}

      {formData.has_disability === true ? (
        <>
          {renderYesNoField(
            "Do you use any para sports equipment?",
            "Equipment users stay grouped inside Para club leaderboards; no-equipment para users can also appear in community leaderboards.",
            formData.para_uses_equipment === true,
            (value) => setFormData({
              ...formData,
              para_uses_equipment: value,
              para_equipment_type: value ? formData.para_equipment_type : null,
              para_equipment_other: value ? formData.para_equipment_other : null,
            })
          )}

          {formData.para_uses_equipment === true ? (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Para equipment</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={String(formData.para_equipment_type ?? "")}
                  onValueChange={(value: string) => setFormData({
                    ...formData,
                    para_equipment_type: value,
                    para_equipment_other: value === "other" ? formData.para_equipment_other : null,
                  })}
                  style={styles.picker}
                >
                  <Picker.Item label="Select equipment" value="" />
                  {PARA_EQUIPMENT_OPTIONS.map((option) => (
                    <Picker.Item key={option.value} label={option.label} value={option.value} />
                  ))}
                </Picker>
              </View>
              {formData.para_equipment_type === "other" ? (
                <TextInput
                  style={[styles.input, { marginTop: 10 }]}
                  value={String(formData.para_equipment_other ?? "")}
                  onChangeText={(text) => setFormData({ ...formData, para_equipment_other: text })}
                  placeholder="Enter equipment"
                />
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}

      {renderYesNoField(
        "Do you do indoor workouts?",
        "This controls whether Treadmill Runners appears in your special club options.",
        formData.does_indoor_workouts === true,
        (value) => setFormData({ ...formData, does_indoor_workouts: value })
      )}

      {renderYesNoField(
        "Do you use a smart watch to record your workouts?",
        "If you also choose Monitor my health as a goal, SmartFit Club appears in your special club options.",
        formData.has_smart_watch === true,
        (value) => setFormData({
          ...formData,
          has_smart_watch: value,
          smart_watch_brand: value ? formData.smart_watch_brand : null,
          smart_watch_model: value ? formData.smart_watch_model : null,
        })
      )}

      {formData.has_smart_watch === true ? (
        <View style={styles.smartWatchDetails}>
          <Text style={styles.fieldLabel}>Smart watch details (optional)</Text>
          <TextInput
            style={styles.input}
            value={String(formData.smart_watch_brand ?? "")}
            onChangeText={(text) => setFormData({ ...formData, smart_watch_brand: text })}
            placeholder="Brand, for example Garmin"
          />
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            value={String(formData.smart_watch_model ?? "")}
            onChangeText={(text) => setFormData({ ...formData, smart_watch_model: text })}
            placeholder="Model, for example Forerunner 165"
          />
          <Text style={styles.goalHelpText}>This can appear on approved smart-watch workouts, for example Smartwatch-Garmin Forerunner 165.</Text>
        </View>
      ) : null}

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

  const renderUnitsEdit = () => (
    <View style={styles.infoContainer}>
      <Text style={styles.editSectionTitle}>Measurement Units</Text>
      <Text style={styles.editSectionSubtitle}>Choose how distance and weight appear across RunNation.</Text>

      <View style={styles.unitsCompactTable}>
        <View style={styles.unitsCompactHeaderRow}>
          <Text style={styles.unitsCompactHeaderText}>Distance</Text>
          <Text style={styles.unitsCompactHeaderText}>Weight</Text>
        </View>
        <View style={styles.unitsCompactBodyRow}>
          <View style={styles.unitsCompactCell}>
            <TouchableOpacity
              style={[styles.unitCompactOption, unitFormData.distanceUnit === "kilometers" && styles.unitCompactOptionSelected]}
              onPress={() => setUnitFormData((current) => ({ ...current, distanceUnit: "kilometers" }))}
              activeOpacity={0.75}
            >
              <Text style={[styles.unitCompactOptionText, unitFormData.distanceUnit === "kilometers" && styles.unitCompactOptionTextSelected]}>
                Kilometers
              </Text>
              <Text style={styles.unitCompactOptionDetail}>km</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.unitCompactOption, unitFormData.distanceUnit === "miles" && styles.unitCompactOptionSelected]}
              onPress={() => setUnitFormData((current) => ({ ...current, distanceUnit: "miles" }))}
              activeOpacity={0.75}
            >
              <Text style={[styles.unitCompactOptionText, unitFormData.distanceUnit === "miles" && styles.unitCompactOptionTextSelected]}>
                Miles
              </Text>
              <Text style={styles.unitCompactOptionDetail}>mi</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.unitsCompactCell}>
            <TouchableOpacity
              style={[styles.unitCompactOption, unitFormData.weightUnit === "kg" && styles.unitCompactOptionSelected]}
              onPress={() => setUnitFormData((current) => ({ ...current, weightUnit: "kg" }))}
              activeOpacity={0.75}
            >
              <Text style={[styles.unitCompactOptionText, unitFormData.weightUnit === "kg" && styles.unitCompactOptionTextSelected]}>
                Kilograms
              </Text>
              <Text style={styles.unitCompactOptionDetail}>kg</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.unitCompactOption, unitFormData.weightUnit === "lbs" && styles.unitCompactOptionSelected]}
              onPress={() => setUnitFormData((current) => ({ ...current, weightUnit: "lbs" }))}
              activeOpacity={0.75}
            >
              <Text style={[styles.unitCompactOptionText, unitFormData.weightUnit === "lbs" && styles.unitCompactOptionTextSelected]}>
                Pounds
              </Text>
              <Text style={styles.unitCompactOptionDetail}>lbs</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <X size={20} color="#ef4444" />
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveButton} onPress={handleSaveUnits}>
          <Save size={20} color="#fff" />
          <Text style={styles.saveButtonText}>Save Units</Text>
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
                  {getGoalDisplayLabel(goal.goal)}
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

  const renderTravelEdit = () => (
    <View style={styles.infoContainer}>
      <Text style={styles.editSectionTitle}>Edit Traveling</Text>
      <Text style={styles.editSectionSubtitle}>
        During these dates, Events will show both your profile country and destination country.
      </Text>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Destination Country</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={String(formData.travel_country ?? "")}
            onValueChange={(value: string) => {
              const selectedCountry = countryOptions.find((country) => country.name === value || country.iso_alpha2 === value);
              setFormData({
                ...formData,
                travel_country: selectedCountry?.name || value,
                travel_country_code: selectedCountry?.iso_alpha2 || null,
              });
            }}
            style={styles.picker}
          >
            <Picker.Item label="Select destination country" value="" />
            {countryOptions.map((country, index) => (
              <Picker.Item key={`travel-${country.iso_alpha2}-${index}`} label={country.name} value={country.name} />
            ))}
          </Picker>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Start Date</Text>
        <TextInput
          style={styles.input}
          value={String(formData.travel_start_date ?? "")}
          onChangeText={(value) => setFormData({ ...formData, travel_start_date: value })}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#999"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>End Date</Text>
        <TextInput
          style={styles.input}
          value={String(formData.travel_end_date ?? "")}
          onChangeText={(value) => setFormData({ ...formData, travel_end_date: value })}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#999"
        />
      </View>

      <Text style={styles.editSectionSubtitle}>
        Clear all fields and save to remove travel access.
      </Text>

      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <X size={20} color="#ef4444" />
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSaveTravel}
          disabled={updateProfileMutation.isPending}
        >
          <Save size={20} color="#fff" />
          <Text style={styles.saveButtonText}>
            {updateProfileMutation.isPending ? "Saving..." : "Save Travel"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderClubChoiceOptions = () => {
    const options: { key: ClubChoice; label: string; icon: React.ReactNode; desc: string }[] = [
      { key: "join", label: "Want to join a club", icon: <UserPlus size={20} color="#fff" />, desc: "Browse and join an existing club" },
      { key: "existing", label: "I already have a club", icon: <UserCheck size={20} color="#fff" />, desc: "Select your current club" },
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
                setSelectedNormalClubId(null);
                setSelectedSpecialClubIds([]);
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

  const renderClubListSection = (
    title: string,
    subtitle: string,
    list: ClubItem[],
    type: "normal" | "special"
  ) => (
    <View style={styles.clubGroupSection}>
      <View style={styles.clubGroupHeader}>
        <Text style={styles.clubGroupTitle}>{title}</Text>
        <Text style={styles.clubGroupSubtitle}>{subtitle}</Text>
      </View>
      {list.length === 0 ? (
        <View style={styles.noClubCard}>
          <Text style={styles.noClubText}>
            {type === "normal"
              ? `No normal clubs available in ${profile?.country || "your country"} yet.`
              : "No eligible special clubs available for your profile yet."}
          </Text>
        </View>
      ) : null}
      {list.map((club) => {
        const isSelected = type === "normal" ? selectedNormalClubId === club.club_id : selectedSpecialClubIds.includes(club.club_id);
        return (
          <TouchableOpacity
            key={club.club_id}
            style={[styles.clubDetailCard, isSelected && styles.clubDetailCardSelected]}
            onPress={() => {
              if (type === "normal") {
                setSelectedNormalClubId(isSelected ? null : club.club_id);
                return;
              }
              setSelectedSpecialClubIds((current) =>
                isSelected ? current.filter((clubId) => clubId !== club.club_id) : [...current, club.club_id]
              );
            }}
            activeOpacity={0.7}
          >
            <View style={styles.clubDetailHeader}>
              <View style={[styles.clubRadio, isSelected && styles.clubRadioSelected]}>
                {isSelected && <View style={styles.clubRadioDot} />}
              </View>
              <Text style={[styles.clubDetailName, isSelected && styles.clubDetailNameSelected]}>
                {club.club_name}
              </Text>
              {type === "special" && (
                <View style={styles.specialClubBadge}>
                  <Text style={styles.specialClubBadgeText}>Special</Text>
                </View>
              )}
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
  );

  const renderClubList = (title: string) => (
    <View style={styles.clubSubSection}>
      <Text style={styles.clubSubTitle}>{title}</Text>
      <Text style={styles.clubSelectionHint}>Pick one normal club, one special club, or just one club from either section.</Text>
      <View style={styles.clubsList}>
        {renderClubListSection("Recommended Normal Clubs", "Clubs active in your city/town/district.", recommendedNormalClubs, "normal")}
        {renderClubListSection("Other Normal Clubs", "Other local clubs in your profile country.", otherNormalClubs, "normal")}
        {renderClubListSection("Special Clubs", "Age, disability, or indoor-workout clubs you are eligible for.", visibleSpecialClubs, "special")}
        <TouchableOpacity style={styles.missingClubCard} onPress={() => void shareMissingClubInvite()} activeOpacity={0.75}>
          <Text style={styles.missingClubTitle}>My club is not on this list</Text>
          <Text style={styles.missingClubText}>
            Share RunNation with your club coordinator, or get permission to create the club profile from Settings &gt; Join Service Team after completing registration.
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStartNewClub = () => (
    <View style={styles.startClubCard}>
      <PlusCircle size={36} color="#3b82f6" />
      <Text style={styles.startClubTitle}>Start a New Club</Text>
      <Text style={styles.startClubDesc}>
        Send a structured request inside the app. Admins can review and approve it here without paperwork.
      </Text>
      <TouchableOpacity
        style={styles.downloadButton}
        onPress={() => {
          setClubStartRequest((prev) => ({
            clubName: prev.clubName,
            country: prev.country || profile?.country || "",
            description: prev.description,
          }));
        }}
        activeOpacity={0.7}
      >
        <PlusCircle size={18} color="#fff" />
        <Text style={styles.downloadButtonText}>Fill Club Request</Text>
      </TouchableOpacity>
      <View style={{ width: "100%", gap: 12 }}>
        <TextInput
          style={styles.input}
          placeholder="Proposed club name"
          value={clubStartRequest.clubName}
          onChangeText={(text) => setClubStartRequest((prev) => ({ ...prev, clubName: text }))}
        />
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={clubStartRequest.country}
            onValueChange={(value: string) => setClubStartRequest((prev) => ({ ...prev, country: value }))}
            style={styles.picker}
          >
            <Picker.Item label="Select country" value="" />
            {countryOptions.map((country, index) => (
              <Picker.Item key={`profile-start-${country.iso_alpha2}-${index}`} label={country.name} value={country.name} />
            ))}
          </Picker>
        </View>
        <TextInput
          style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
          placeholder="Describe the club purpose, who it serves, and what makes it ready to launch."
          multiline
          value={clubStartRequest.description}
          onChangeText={(text) => setClubStartRequest((prev) => ({ ...prev, description: text }))}
        />
      </View>
      <Text style={styles.adminEmailNote}>Your request will be sent to admins for review inside the app.</Text>
    </View>
  );

  const renderEventOrganizerRequest = () => (
    <View style={styles.startClubCard}>
      <Calendar size={36} color="#3b82f6" />
      <Text style={styles.startClubTitle}>Event Organiser Request</Text>
      <Text style={styles.startClubDesc}>
        Share the organiser details here, then contact your country admin because organiser approvals require screening before event access is granted.
      </Text>
      <View style={{ width: "100%", gap: 12 }}>
        <TextInput
          style={styles.input}
          placeholder="Organizer name"
          value={organizerRequest.organizerName}
          onChangeText={(text) => setOrganizerRequest((prev) => ({ ...prev, organizerName: text }))}
        />
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={organizerRequest.country}
            onValueChange={(value: string) => setOrganizerRequest((prev) => ({ ...prev, country: value }))}
            style={styles.picker}
          >
            <Picker.Item label="Select country" value="" />
            {countryOptions.map((country, index) => (
              <Picker.Item key={`profile-organizer-${country.iso_alpha2}-${index}`} label={country.name} value={country.name} />
            ))}
          </Picker>
        </View>
        <TextInput
          style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
          placeholder="Describe the organiser and the events they intend to manage."
          multiline
          value={organizerRequest.description}
          onChangeText={(text) => setOrganizerRequest((prev) => ({ ...prev, description: text }))}
        />
      </View>
      <Text style={styles.adminEmailNote}>This request goes into the admin queue and should be followed up with your country admin for screening.</Text>
    </View>
  );

  const renderClubEdit = () => {
    const showSaveButton =
      clubChoice === "none" ||
      clubChoice === "start" ||
      clubChoice === "organizer" ||
      (clubChoice === "join" && (selectedNormalClubId || selectedSpecialClubIds.length > 0)) ||
      (clubChoice === "existing" && (selectedNormalClubId || selectedSpecialClubIds.length > 0));

    return (
      <View style={styles.infoContainer}>
        <Text style={styles.editSectionTitle}>Edit Club & Organiser</Text>
        <Text style={styles.editSectionSubtitle}>
          {clubMembership?.club
            ? `Current club: ${clubMembership.club}`
            : "No club or organiser request set"}
        </Text>

        {renderClubChoiceOptions()}

        {clubChoice === "join" && renderClubList("List of clubs in your country")}
        {clubChoice === "existing" && renderClubList("List of clubs in your country")}
        {clubChoice === "start" && renderStartNewClub()}
        {clubChoice === "organizer" && renderEventOrganizerRequest()}
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

  const renderSubscriptionBanner = () => {
    if (subLoading) return null;

    if (subscriptionStatus === "trial") {
      return (
        <TouchableOpacity style={styles.subBanner} onPress={() => router.push('/subscription')} activeOpacity={0.7}>
          <View style={styles.subBannerIconWrap}>
            <Clock size={18} color="#f59e0b" />
          </View>
          <View style={styles.subBannerContent}>
            <View style={styles.subBannerRow}>
              <View style={styles.subBannerTrialChip}>
                <Text style={styles.subBannerTrialChipText}>FREE PLAN</Text>
              </View>
              <Text style={styles.subBannerDays}>{trialDaysRemaining} days left</Text>
            </View>
            <Text style={styles.subBannerDate}>Free plan ends: {getTrialEndDate()}</Text>
          </View>
          <ChevronRight size={18} color="#A16207" />
        </TouchableOpacity>
      );
    }

    if (subscriptionStatus === "active") {
      return (
        <TouchableOpacity style={[styles.subBanner, styles.subBannerActive]} onPress={() => router.push('/subscription')} activeOpacity={0.7}>
          <View style={[styles.subBannerIconWrap, styles.subBannerIconActive]}>
            <Zap size={18} color="#10b981" />
          </View>
          <View style={styles.subBannerContent}>
            <View style={styles.subBannerRow}>
              <View style={styles.subBannerActiveChip}>
                <Text style={styles.subBannerActiveChipText}>SUBSCRIBED</Text>
              </View>
            </View>
            {subscription?.expires_at ? (
              <Text style={styles.subBannerDateActive}>Renews: {getSubscriptionEndDate()}</Text>
            ) : (
              <Text style={styles.subBannerDateActive}>Active subscription</Text>
            )}
          </View>
          <ChevronRight size={18} color="#047857" />
        </TouchableOpacity>
      );
    }

    if (subscriptionStatus === "expired") {
      return (
        <TouchableOpacity style={[styles.subBanner, styles.subBannerExpired]} onPress={() => router.push('/subscription')} activeOpacity={0.7}>
          <View style={[styles.subBannerIconWrap, styles.subBannerIconExpired]}>
            <CreditCard size={18} color="#ef4444" />
          </View>
          <View style={styles.subBannerContent}>
            <View style={styles.subBannerRow}>
              <View style={styles.subBannerExpiredChip}>
                <Text style={styles.subBannerExpiredChipText}>EXPIRED</Text>
              </View>
            </View>
            <Text style={styles.subBannerDateExpired}>Please renew your subscription</Text>
          </View>
          <ChevronRight size={18} color="#B91C1C" />
        </TouchableOpacity>
      );
    }

    return null;
  };

  const renderAdminPortalBanner = () => {
    if (!roleSession.hasAdminAccess) return null;

    const subtitle = roleSession.isSuperAdmin
      ? "Global platform access enabled"
      : roleSession.isCountryAdmin
        ? "Country management tools available"
          : roleSession.isCountryCoordinator
            ? "Country coordinator tools available"
            : roleSession.isSpecialClubCoordinator
              ? "Special club tools available"
          : roleSession.isEventOrganizer
            ? "Event organizer tools available"
          : roleSession.isMagazineEditor
            ? "Magazine editor tools available"
          : roleSession.isMagazineColumnist
            ? "Magazine columnist terms and role tools available"
          : roleSession.isChatRoomAdministrator
            ? "Chat moderation tools available"
        : "Coordinator tools available";

    const badgeLabel = roleSession.isSuperAdmin
                      ? "GLOBAL ADMIN"
      : roleSession.isCountryAdmin
        ? "COUNTRY ADMIN"
        : roleSession.isCountryCoordinator
          ? "COUNTRY COORDINATOR"
          : roleSession.isSpecialClubCoordinator
            ? "SPECIAL CLUB"
          : roleSession.isEventOrganizer
            ? "EVENT ORGANIZER"
          : roleSession.isMagazineEditor
            ? "MAGAZINE EDITOR"
          : roleSession.isMagazineColumnist
            ? "MAGAZINE COLUMNIST"
          : roleSession.isChatRoomAdministrator
            ? "CHAT ADMIN"
        : "COORDINATOR";

    return (
      <TouchableOpacity
        style={[styles.subBanner, styles.adminBanner]}
        onPress={() => {
          void handleAdminPortalPress();
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.subBannerIconWrap, styles.adminBannerIconWrap]}>
          <BadgeCheck size={18} color="#7C2D12" />
        </View>
        <View style={styles.subBannerContent}>
          <View style={styles.subBannerRow}>
            <View style={styles.adminBadgeChip}>
              <Text style={styles.adminBadgeChipText}>{badgeLabel}</Text>
            </View>
          </View>
          <Text style={styles.adminBannerTitle}>Admin Portal</Text>
          <Text style={styles.adminBannerSubtitle}>{subtitle}</Text>
        </View>
        <ChevronRight size={18} color="#9A3412" />
      </TouchableOpacity>
    );
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

      <Text style={styles.badgeCategoryTitle}>🎓 Profile Completion</Text>
      <View style={styles.badgesGrid}>
        {profileBadge ? renderBadgeItem(profileBadge) : null}
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
          { label: "First Name", value: profile.first_name },
          { label: "Other Names", value: profile.other_names },
          { label: "Username", value: profile.username ? `@${profile.username}` : undefined },
          { label: "Sex", value: profile.sex },
          { label: "City/Town/District", value: profile.city_town_district },
          { label: "Country", value: profile.country },
          {
            label: "Traveling",
            value: profile.travel_country && profile.travel_start_date && profile.travel_end_date
              ? `${profile.travel_country} (${profile.travel_start_date} to ${profile.travel_end_date})`
              : undefined,
          },
          { label: "Date of Birth", value: formatDateOfBirth(profile.dob) },
        ]).map((field) => (
          <View key={field.label} style={styles.field}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <Text style={styles.fieldValue}>{field.value || "Not set"}</Text>
          </View>
        ))}

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Phone</Text>
          <View style={styles.emailViewRow}>
            <Phone size={16} color="#666" style={{ marginLeft: 4 }} />
            <Text style={[styles.fieldValue, styles.emailViewValue]}>
              {profile.phone || "Not set"}
            </Text>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Email</Text>
          <View style={styles.emailViewRow}>
            <Text style={[styles.fieldValue, styles.emailViewValue]}>
              {profile.email || "Not set"}
            </Text>
            {isEmailVerified ? (
              <View style={styles.verifiedBadgeView}>
                <BadgeCheck size={20} color="#1d9bf0" />
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {renderBadgesSection()}

      {userGoals.length > 0 && (
        <View style={styles.weightSection}>
          <Text style={styles.sectionTitle}>Your Goals</Text>
          <View style={styles.goalsTagsRow}>
            {userGoals.map((ug) => (
              <View key={ug.user_goals_id} style={styles.goalTag}>
                <Text style={styles.goalTagText}>{getGoalDisplayLabel(ug.goal)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.weightSection}>
        <Text style={styles.sectionTitle}>Measurement Units</Text>
        <View style={styles.unitsSummaryTable}>
          <View style={styles.unitsCompactHeaderRow}>
            <Text style={styles.unitsCompactHeaderText}>Distance</Text>
            <Text style={styles.unitsCompactHeaderText}>Weight</Text>
          </View>
          <View style={styles.unitsSummaryBodyRow}>
            <Text style={styles.unitsSummaryCellValue}>{distanceUnitLabel} ({distanceUnitShortLabel})</Text>
            <Text style={styles.unitsSummaryCellValue}>{weightUnitLabel} ({weightUnitShortLabel})</Text>
          </View>
        </View>
      </View>

      {clubMembershipRows.length > 0 && (
        <View style={styles.weightSection}>
          <Text style={styles.sectionTitle}>Club Membership</Text>
          <View style={styles.clubMembershipTable}>
            <View style={styles.clubMembershipHeaderRow}>
              <Text style={[styles.clubMembershipHeaderText, styles.clubMembershipClubCell]}>Club Name</Text>
              <Text style={[styles.clubMembershipHeaderText, styles.clubMembershipStatusCell]}>Status</Text>
              <Text style={[styles.clubMembershipHeaderText, styles.clubMembershipActionHeaderCell]}>WhatsApp</Text>
              <Text style={[styles.clubMembershipHeaderText, styles.clubMembershipActionHeaderCell]}>Leave</Text>
            </View>
            {clubMembershipRows.map((membership) => (
              <View key={membership.key} style={styles.clubMembershipRow}>
                <Text style={[styles.clubMembershipCellText, styles.clubMembershipClubCell]} numberOfLines={2}>
                  {membership.clubName}
                </Text>
                <Text style={[styles.clubMembershipCellText, styles.clubMembershipStatusCell]} numberOfLines={2}>
                  {membership.status}
                </Text>
                <View style={styles.clubMembershipActionCell}>
                  {membership.whatsappLink ? (
                    <TouchableOpacity
                      style={styles.whatsappJoinCompactButton}
                      onPress={() => handleJoinWhatsappGroup(membership.whatsappLink!.link)}
                      activeOpacity={0.75}
                    >
                      <MessageCircle size={14} color="#fff" />
                      <Text style={styles.whatsappJoinCompactButtonText}>Join</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.clubMembershipNoLinkText}>-</Text>
                  )}
                </View>
                <View style={styles.clubMembershipActionCell}>
                  <TouchableOpacity
                    style={[styles.clubLeaveButton, leaveClubMutation.isPending && styles.disabledButton]}
                    onPress={() => handleLeaveClub(membership)}
                    disabled={leaveClubMutation.isPending}
                    activeOpacity={0.75}
                  >
                    <X size={13} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );

  return (
    <>
    <Stack.Screen
      options={{
        title: "Profile",
        headerShown: true,
        headerStyle: { backgroundColor: themeColors.headerBackground },
        headerTintColor: themeColors.headerText,
        headerLeft: () => (
          <TouchableOpacity onPress={handleBackPress} style={styles.orangeHeaderBackButton} activeOpacity={0.75}>
            <ChevronLeft size={24} color={themeColors.headerText} />
          </TouchableOpacity>
        ),
      }}
    />
    <SafeAreaView
      edges={Platform.OS === "android" ? ["bottom"] : []}
      style={[styles.container, { backgroundColor: themeColors.background }]}
    >
      <ScrollView
        style={styles.safeScroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomNavPadding }]}
      >
      <View style={styles.header}>
        <View style={styles.photoContainer}>
          {profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={styles.profilePhoto} contentFit="cover" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>
                {profile.first_name?.[0]?.toUpperCase() || "?"}
              </Text>
            </View>
          )}
          <TouchableOpacity style={styles.cameraButton} onPress={pickImage}>
            <Camera size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {completion && (
          <TouchableOpacity
            style={styles.completionPill}
            onPress={() => setShowCompletionModal(true)}
            activeOpacity={0.7}
          >
            <View style={styles.completionCircle}>
              <Text style={styles.completionCircleText}>{completion.percentage}%</Text>
            </View>
            <Text style={styles.completionLabel}>Profile Complete</Text>
          </TouchableOpacity>
        )}

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

      {renderSubscriptionBanner()}
      {renderAdminPortalBanner()}

      {editSection === "profile" && renderProfileEdit()}
      {editSection === "goals" && renderGoalsEdit()}
      {editSection === "club" && renderClubEdit()}
      {editSection === "travel" && renderTravelEdit()}
      {editSection === "units" && renderUnitsEdit()}
      {!editSection && renderProfileView()}

      {renderEditMenu()}

      <Modal
        visible={showCompletionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCompletionModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCompletionModal(false)}
        >
          <View style={styles.completionModalContainer}>
            <View style={styles.completionModalHeader}>
              <Text style={styles.completionModalTitle}>Profile Completion</Text>
              <TouchableOpacity onPress={() => setShowCompletionModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={22} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={styles.completionProgressBarOuter}>
              <View
                style={[
                  styles.completionProgressBarInner,
                  {
                    width: `${completion?.percentage ?? 0}%`,
                    backgroundColor:
                      (completion?.percentage ?? 0) >= 80
                        ? "#10b981"
                        : (completion?.percentage ?? 0) >= 50
                        ? "#f59e0b"
                        : "#ef4444",
                  },
                ]}
              />
            </View>
            <Text
              style={[
                styles.completionProgressText,
                {
                  color:
                    (completion?.percentage ?? 0) >= 80
                      ? "#10b981"
                      : (completion?.percentage ?? 0) >= 50
                      ? "#f59e0b"
                      : "#ef4444",
                },
              ]}
            >
              {completion?.percentage ?? 0}% complete ({completion?.completedCount ?? 0}/{completion?.totalCount ?? 10})
            </Text>
            <View style={styles.completionList}>
              {completion?.items.map((item, index) => (
                <View key={item.id} style={styles.completionItem}>
                  <Text style={styles.completionItemNum}>{index + 1}</Text>
                  {item.completed ? (
                    <View style={styles.completionIconDone}>
                      <Check size={13} color="#fff" />
                    </View>
                  ) : (
                    <View style={styles.completionIconPending}>
                      <Circle size={13} color="#d1d5db" />
                    </View>
                  )}
                  <Text style={[styles.completionItemLabel, item.completed && styles.completionItemLabelDone]}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      </ScrollView>
    </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollContent: {
    paddingBottom: 80,
  },
  safeScroll: {
    flex: 1,
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
  orangeHeaderBackButton: {
    marginLeft: 2,
    padding: 6,
    borderRadius: 999,
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
  profileCompletionNote: {
    backgroundColor: "#ecfdf5",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    padding: 12,
    gap: 4,
  },
  profileCompletionNoteTitle: {
    fontSize: 13,
    fontWeight: "800" as const,
    color: "#065f46",
  },
  profileCompletionNoteText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#047857",
  },
  field: {
    gap: 6,
  },
  smartWatchDetails: {
    gap: 6,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#666",
    textTransform: "uppercase",
  },
  goalHelpText: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 6,
    lineHeight: 16,
  },
  preferenceChoiceRow: {
    flexDirection: "row",
    gap: 10,
  },
  preferenceChoice: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  preferenceChoiceSelected: {
    borderColor: "#10b981",
    backgroundColor: "#ecfdf5",
  },
  preferenceChoiceText: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "700" as const,
  },
  preferenceChoiceTextSelected: {
    color: "#065f46",
  },
  unitSection: {
    gap: 10,
  },
  unitSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unitSectionTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "800" as const,
    textTransform: "uppercase" as const,
  },
  unitOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  unitOptionCardSelected: {
    borderColor: "#6366f1",
    backgroundColor: "#eef2ff",
  },
  unitOptionTextWrap: {
    flex: 1,
    gap: 2,
  },
  unitOptionTitle: {
    color: "#333",
    fontSize: 15,
    fontWeight: "700" as const,
  },
  unitOptionTitleSelected: {
    color: "#3730a3",
  },
  unitOptionDetail: {
    color: "#6b7280",
    fontSize: 12,
    lineHeight: 17,
  },
  unitsCompactTable: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    overflow: "hidden" as const,
  },
  unitsCompactHeaderRow: {
    flexDirection: "row" as const,
    backgroundColor: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  unitsCompactHeaderText: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 7,
    color: "#4b5563",
    fontSize: 11,
    fontWeight: "800" as const,
    textAlign: "center" as const,
    textTransform: "uppercase" as const,
  },
  unitsCompactBodyRow: {
    flexDirection: "row" as const,
  },
  unitsCompactCell: {
    flex: 1,
    padding: 6,
    gap: 6,
  },
  unitCompactOption: {
    minHeight: 34,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  unitCompactOptionSelected: {
    borderColor: "#6366f1",
    backgroundColor: "#eef2ff",
  },
  unitCompactOptionText: {
    color: "#374151",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800" as const,
  },
  unitCompactOptionTextSelected: {
    color: "#3730a3",
  },
  unitCompactOptionDetail: {
    color: "#6b7280",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700" as const,
  },
  unitsSummaryTable: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden" as const,
  },
  unitsSummaryBodyRow: {
    flexDirection: "row" as const,
  },
  unitsSummaryCellValue: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 9,
    color: "#111827",
    fontSize: 12,
    fontWeight: "700" as const,
    textAlign: "center" as const,
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
  pickerContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#10b981",
    overflow: "hidden" as const,
  },
  picker: {
    backgroundColor: "#fff",
    color: "#000",
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
  clubSelectionHint: {
    fontSize: 12,
    color: "#6b7280",
    lineHeight: 17,
  },
  clubsList: {
    gap: 10,
  },
  clubGroupSection: {
    gap: 10,
  },
  clubGroupHeader: {
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 8,
  },
  clubGroupTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "800" as const,
    textTransform: "uppercase" as const,
  },
  clubGroupSubtitle: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
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
  specialClubBadge: {
    borderRadius: 999,
    backgroundColor: "#dbeafe",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  specialClubBadgeText: {
    color: "#1d4ed8",
    fontSize: 10,
    fontWeight: "800" as const,
    textTransform: "uppercase" as const,
  },
  missingClubCard: {
    borderWidth: 1,
    borderColor: "#93c5fd",
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#eff6ff",
    gap: 5,
  },
  missingClubTitle: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#1d4ed8",
  },
  missingClubText: {
    fontSize: 12,
    lineHeight: 17,
    color: "#475569",
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
  emailFieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emailInput: {
    flex: 1,
  },
  phoneFieldRow: {
    flexDirection: "row",
    gap: 8,
  },
  countryCodeInput: {
    width: 80,
  },
  phoneNumberInput: {
    flex: 1,
  },
  oauthVerifiedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
  },
  oauthVerifiedButtonText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#6b7280",
  },
  passwordVerifyButton: {
    backgroundColor: "#ecfdf5",
    borderColor: "#10b981",
  },
  passwordVerifyButtonText: {
    color: "#047857",
  },
  verifiedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  emailViewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emailViewValue: {
    flex: 1,
  },
  verifiedBadgeView: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  pinModalContainer: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    gap: 12,
  },
  pinModalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  pinModalTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#111",
  },
  pinModalDesc: {
    fontSize: 14,
    color: "#666",
    textAlign: "center" as const,
    lineHeight: 20,
  },
  pinDotsRow: {
    flexDirection: "row" as const,
    gap: 16,
    marginVertical: 12,
  },
  pinDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
  },
  pinDotFilled: {
    backgroundColor: "#10b981",
    borderColor: "#10b981",
  },
  pinDotError: {
    borderColor: "#ef4444",
    backgroundColor: "#fef2f2",
  },
  pinHiddenInput: {
    position: "absolute" as const,
    opacity: 0,
    height: 1,
    width: 1,
  },
  pinErrorText: {
    fontSize: 13,
    color: "#ef4444",
    fontWeight: "600" as const,
    textAlign: "center" as const,
  },
  pinModalActions: {
    flexDirection: "row" as const,
    gap: 12,
    width: "100%",
    marginTop: 4,
  },
  pinModalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center" as const,
    backgroundColor: "#f5f5f5",
  },
  pinModalCancelText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#666",
  },
  pinModalSubmit: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center" as const,
    backgroundColor: "#10b981",
  },
  pinModalSubmitDisabled: {
    opacity: 0.5,
  },
  pinModalSubmitText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#fff",
  },
  subBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  subBannerActive: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  subBannerExpired: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  adminBanner: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
  },
  subBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  subBannerIconActive: {
    backgroundColor: "#D1FAE5",
  },
  subBannerIconExpired: {
    backgroundColor: "#FEE2E2",
  },
  adminBannerIconWrap: {
    backgroundColor: "#FFEDD5",
  },
  subBannerContent: {
    flex: 1,
    gap: 3,
  },
  subBannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  subBannerTrialChip: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  subBannerTrialChipText: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: "#fff",
    letterSpacing: 0.5,
  },
  subBannerDays: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#92400E",
  },
  subBannerDate: {
    fontSize: 12,
    color: "#A16207",
  },
  subBannerActiveChip: {
    backgroundColor: "#10B981",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  subBannerActiveChipText: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: "#fff",
    letterSpacing: 0.5,
  },
  subBannerDateActive: {
    fontSize: 12,
    color: "#047857",
  },
  subBannerExpiredChip: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  subBannerExpiredChipText: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: "#fff",
    letterSpacing: 0.5,
  },
  subBannerDateExpired: {
    fontSize: 12,
    color: "#B91C1C",
  },
  adminBannerTitle: {
    fontSize: 15,
    fontWeight: "800" as const,
    color: "#7C2D12",
  },
  adminBannerSubtitle: {
    fontSize: 12,
    color: "#9A3412",
    fontWeight: "500" as const,
  },
  adminBadgeChip: {
    backgroundColor: "#FFEDD5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FDBA74",
    alignSelf: "flex-start",
  },
  adminBadgeChipText: {
    fontSize: 10,
    fontWeight: "800" as const,
    color: "#9A3412",
    letterSpacing: 0.4,
  },
  clubMembershipTable: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  },
  clubMembershipHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingVertical: 9,
    paddingHorizontal: 10,
    gap: 8,
  },
  clubMembershipRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  clubMembershipHeaderText: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: "#6b7280",
    textTransform: "uppercase",
  },
  clubMembershipCellText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#111827",
  },
  clubMembershipClubCell: {
    flex: 1.25,
  },
  clubMembershipStatusCell: {
    flex: 0.9,
  },
  clubMembershipActionCell: {
    flex: 0.55,
    alignItems: "flex-end",
  },
  clubMembershipActionHeaderCell: {
    flex: 0.55,
    textAlign: "right",
  },
  whatsappJoinCompactButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#16A34A",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    minWidth: 66,
  },
  whatsappJoinCompactButtonText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: "#fff",
  },
  clubMembershipNoLinkText: {
    fontSize: 13,
    color: "#9ca3af",
    fontWeight: "800" as const,
    textAlign: "right",
  },
  clubLeaveButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  disabledButton: {
    opacity: 0.6,
  },
  completionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  completionCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  completionCircleText: {
    fontSize: 13,
    fontWeight: "800" as const,
    color: "#10b981",
  },
  completionLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#fff",
  },
  completionModalContainer: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 380,
  },
  completionModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  completionModalTitle: {
    fontSize: 19,
    fontWeight: "700" as const,
    color: "#111",
  },
  completionProgressBarOuter: {
    height: 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  completionProgressBarInner: {
    height: "100%",
    borderRadius: 4,
  },
  completionProgressText: {
    fontSize: 13,
    fontWeight: "600" as const,
    marginBottom: 14,
  },
  completionList: {
    gap: 2,
  },
  completionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  completionItemNum: {
    width: 20,
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#aaa",
    textAlign: "center" as const,
  },
  completionIconDone: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  completionIconPending: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
  },
  completionItemLabel: {
    flex: 1,
    fontSize: 14,
    color: "#555",
    fontWeight: "500" as const,
  },
  completionItemLabelDone: {
    color: "#111",
    fontWeight: "600" as const,
  },
});
