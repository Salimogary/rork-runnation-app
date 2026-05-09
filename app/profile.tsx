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
  Mail,
  Phone,
  Clock,
  CreditCard,
  Zap,
  Circle,
  Plane,
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
import { filterVisibleClubsForAge, getAgeFromDob, isAtLeastRunNationAge } from "@/utils/specialClubs";

const FALLBACK_COUNTRIES = WORLD_COUNTRIES;
const RUNNATION_APP_LINK = "";

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

type EditSection = "profile" | "goals" | "club" | "travel" | null;
type ClubChoice = "join" | "existing" | "start" | "organizer" | "none" | null;

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
  const queryClient = useQueryClient();
  const { subscriptionStatus, trialDaysRemaining, subscription, isLoading: subLoading } = useSubscription();
  const { colors: themeColors } = useTheme();
  const [editSection, setEditSection] = useState<EditSection>(null);
  const [showEditMenu, setShowEditMenu] = useState(false);
  const [formData, setFormData] = useState<Partial<UserProfile>>({});
  const [authProvider, setAuthProvider] = useState<string | null>(null);

  const [selectedGoalIds, setSelectedGoalIds] = useState<number[]>([]);
  const [otherGoalText, setOtherGoalText] = useState("");


  const [clubChoice, setClubChoice] = useState<ClubChoice>(null);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
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
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

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
    () => profileBundle?.activityStats ?? { totalDistance: 0, totalActivities: 0 },
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
    () => (profileBundle?.goals as GoalItem[] | undefined) ?? [],
    [profileBundle]
  );
  const userGoals = useMemo(
    () => (profileBundle?.userGoals as UserGoal[] | undefined) ?? [],
    [profileBundle]
  );
  const clubs = useMemo(
    () => (profileBundle?.clubs as ClubItem[] | undefined) ?? [],
    [profileBundle]
  );
  const countryClubs = useMemo(() => {
    const userCountry = normalizeCountryLabel(profile?.country);
    if (!userCountry) return [];
    return clubs.filter((club) => normalizeCountryLabel(club.country) === userCountry);
  }, [clubs, profile?.country]);
  const visibleClubs = useMemo(
    () => filterVisibleClubsForAge(clubs, countryClubs, getAgeFromDob(profile?.dob)),
    [clubs, countryClubs, profile?.dob]
  );
  const countryOptions = useMemo(() => {
    const rows = (countriesData as { name: string; iso_alpha2: string }[]) || FALLBACK_COUNTRIES;
    const currentCountries = [
      String(formData.country || profile?.country || ""),
      String(formData.travel_country || profile?.travel_country || ""),
    ].filter(Boolean);
    const extras = currentCountries
      .filter((currentCountry) => !rows.some((country) => country.name === currentCountry || country.iso_alpha2 === currentCountry))
      .map((currentCountry) => ({ name: currentCountry, iso_alpha2: currentCountry }));
    return [...extras, ...rows];
  }, [countriesData, formData.country, formData.travel_country, profile?.country, profile?.travel_country]);
  const clubMembership = (profileBundle?.clubMembership as ClubMembership | null | undefined) ?? null;

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

  const sendVerificationMutation = useMutation({
    mutationFn: async () => {
      if (!user || !profile?.email) throw new Error("No email found");
      return await getServerClient().profile.sendEmailVerification.mutate({
        registrationId: user.id,
        email: profile.email,
      });
    },
    onSuccess: (result) => {
      const previewCode = "code" in result ? result.code : null;
      const message = previewCode
        ? `A 6-digit verification code has been generated for ${profile?.email}.\n\nFor testing, your code is: ${previewCode}`
        : `A verification code is ready for ${profile?.email}. Enter it when you receive it.`;

      Alert.alert("Verification Code Sent", message, [
        { text: "Enter Code", onPress: () => setShowVerifyModal(true) },
      ]);
    },
    onError: (error) => {
      console.error("[EmailVerify] Send error:", error);
      Alert.alert("Error", "Failed to send verification code. Please try again.");
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      if (!user) throw new Error("Not authenticated");
      await getServerClient().profile.verifyEmailCode.mutate({
        registrationId: user.id,
        code,
      });
    },
    onSuccess: () => {
      setShowVerifyModal(false);
      setVerificationCode("");
      void queryClient.invalidateQueries({ queryKey: ["profileBundle"] });
      Alert.alert("Verified!", "Your email has been verified successfully.");
    },
    onError: (error) => {
      console.error("[EmailVerify] Verify error:", error);
      Alert.alert("Verification Failed", "Invalid or expired code. Please try again.");
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async ({
      registration,
      contact,
    }: {
      registration: Partial<UserProfile>;
      contact: { email?: string; country_code?: string; phone?: string };
    }) => {
      if (!user) throw new Error("Not authenticated");
      const registrationPayload: Record<string, string | null | undefined> = {};
      ([
        "first_name",
        "other_names",
        "username",
        "sex",
        "dob",
        "city_town_district",
        "country",
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
    }: {
      club: string | null;
      clubId: string | null;
      newMember: string;
      requestType: "membership" | "start_club" | "event_organizer";
      proposedClubName: string | null;
      proposedCountry: string | null;
      proposedDescription: string | null;
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

  const uploadPhotoMutation = useMutation({
    mutationFn: async (photoUri: string) => {
      if (!user) throw new Error("Not authenticated");
      const imageBase64 = await FileSystem.readAsStringAsync(photoUri, {
        encoding: "base64",
      });

      await getServerClient().profile.uploadPhoto.mutate({
        registrationId: user.id,
        imageBase64,
        mimeType: "image/jpeg",
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
    });
    if (!result.canceled && result.assets[0]) {
      uploadPhotoMutation.mutate(result.assets[0].uri);
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
      });
    } else if (section === "goals") {
      const userGoalTexts = userGoals.map((ug) => ug.goal);
      const matchedIds = goals
        .filter((g) => userGoalTexts.some((ut) => ut.toLowerCase() === g.goal.toLowerCase()))
        .map((g) => g.goal_id);
      setSelectedGoalIds(matchedIds);

      const unmatchedGoals = userGoalTexts.filter(
        (ut) => !goals.some((g) => g.goal.toLowerCase() === ut.toLowerCase())
      );
      if (unmatchedGoals.length > 0) {
        const otherGoal = goals.find((g) => g.goal.toLowerCase() === "other");
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
    }
    setEditSection(section);
  }, [profile, userGoals, goals, clubMembership, clubs]);

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

    if (clubChoice === "join") {
      if (!selectedClubId) {
        Alert.alert("Select a Club", "Please choose a club from the list.");
        return;
      }
      const selectedClub = visibleClubs.find((c) => c.club_id === selectedClubId);
      clubValue = selectedClub?.club_name || null;
      clubIdValue = selectedClub?.club_id || null;
      newMemberValue = "Yes";
    } else if (clubChoice === "existing") {
      if (!selectedClubId) {
        Alert.alert("Select a Club", "Please choose your club from the list.");
        return;
      }
      const selectedClub = visibleClubs.find((c) => c.club_id === selectedClubId);
      clubValue = selectedClub?.club_name || null;
      clubIdValue = selectedClub?.club_id || null;
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
    });
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
    setSelectedGoalIds([]);
    setOtherGoalText("");
    setClubChoice(null);
    setSelectedClubId(null);
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
          ) : (
            <TouchableOpacity
              style={styles.verifyButton}
              onPress={() => sendVerificationMutation.mutate()}
              disabled={sendVerificationMutation.isPending}
              activeOpacity={0.7}
            >
              {sendVerificationMutation.isPending ? (
                <ActivityIndicator size="small" color="#1d9bf0" />
              ) : (
                <Text style={styles.verifyButtonText}>Verify</Text>
              )}
            </TouchableOpacity>
          )}
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
            {countryOptions.map((country) => (
              <Picker.Item key={country.iso_alpha2} label={country.name} value={country.name} />
            ))}
          </Picker>
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
                  {goal.goal}
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
            {countryOptions.map((country) => (
              <Picker.Item key={`travel-${country.iso_alpha2}`} label={country.name} value={country.name} />
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
      <View style={styles.clubsList}>
        {clubs.length === 0 || visibleClubs.length === 0 ? (
            <View style={styles.noClubCard}>
              <Text style={styles.noClubText}>No clubs available in {profile?.country || "your country"} yet.</Text>
            </View>
        ) : null}
        {visibleClubs.map((club) => {
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
            {countryOptions.map((country) => (
              <Picker.Item key={`profile-start-${country.iso_alpha2}`} label={country.name} value={country.name} />
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
            {countryOptions.map((country) => (
              <Picker.Item key={`profile-organizer-${country.iso_alpha2}`} label={country.name} value={country.name} />
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
      (clubChoice === "join" && selectedClubId) ||
      (clubChoice === "existing" && selectedClubId);

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
          : roleSession.isEventOrganizer
            ? "Event organizer tools available"
        : "Coordinator tools available";

    const badgeLabel = roleSession.isSuperAdmin
                      ? "GLOBAL ADMIN"
      : roleSession.isCountryAdmin
        ? "COUNTRY ADMIN"
        : roleSession.isCountryCoordinator
          ? "COUNTRY COORDINATOR"
          : roleSession.isEventOrganizer
            ? "EVENT ORGANIZER"
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
            ) : profile.email ? (
              <TouchableOpacity
                style={styles.verifyButtonSmall}
                onPress={() => sendVerificationMutation.mutate()}
                disabled={sendVerificationMutation.isPending}
                activeOpacity={0.7}
              >
                {sendVerificationMutation.isPending ? (
                  <ActivityIndicator size="small" color="#1d9bf0" />
                ) : (
                  <Text style={styles.verifyButtonSmallText}>Verify</Text>
                )}
              </TouchableOpacity>
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
    <ScrollView style={[styles.container, { backgroundColor: themeColors.background }]} contentContainerStyle={styles.scrollContent}>
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

      <Modal
        visible={showVerifyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVerifyModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowVerifyModal(false)}
        >
          <View style={styles.verifyModalContainer}>
            <View style={styles.verifyModalIconWrap}>
              <Mail size={32} color="#1d9bf0" />
            </View>
            <Text style={styles.verifyModalTitle}>Enter Verification Code</Text>
            <Text style={styles.verifyModalDesc}>
              Enter the 6-digit code for {profile?.email}
            </Text>
            <TextInput
              style={styles.verifyCodeInput}
              value={verificationCode}
              onChangeText={setVerificationCode}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
              autoFocus
            />
            <View style={styles.verifyModalActions}>
              <TouchableOpacity
                style={styles.verifyModalCancel}
                onPress={() => {
                  setShowVerifyModal(false);
                  setVerificationCode("");
                }}
              >
                <Text style={styles.verifyModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.verifyModalSubmit,
                  verificationCode.length !== 6 && styles.verifyModalSubmitDisabled,
                ]}
                onPress={() => verifyCodeMutation.mutate(verificationCode)}
                disabled={verificationCode.length !== 6 || verifyCodeMutation.isPending}
              >
                {verifyCodeMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.verifyModalSubmitText}>Verify</Text>
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.resendButton}
              onPress={() => sendVerificationMutation.mutate()}
              disabled={sendVerificationMutation.isPending}
            >
              <Text style={styles.resendButtonText}>
                {sendVerificationMutation.isPending ? "Sending..." : "Resend Code"}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
    </>
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
  field: {
    gap: 6,
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
  verifyButton: {
    backgroundColor: "#e8f5fd",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#1d9bf0",
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyButtonText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#1d9bf0",
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
  verifyButtonSmall: {
    backgroundColor: "#e8f5fd",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1d9bf0",
  },
  verifyButtonSmallText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#1d9bf0",
  },
  verifyModalContainer: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: 12,
  },
  verifyModalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#e8f5fd",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  verifyModalTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#111",
  },
  verifyModalDesc: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  verifyCodeInput: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: "#111",
    backgroundColor: "#f5f5f5",
    borderRadius: 14,
    padding: 16,
    width: "100%",
    letterSpacing: 8,
    borderWidth: 2,
    borderColor: "#1d9bf0",
  },
  verifyModalActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginTop: 4,
  },
  verifyModalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  verifyModalCancelText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#666",
  },
  verifyModalSubmit: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#1d9bf0",
  },
  verifyModalSubmitDisabled: {
    opacity: 0.5,
  },
  verifyModalSubmitText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#fff",
  },
  resendButton: {
    paddingVertical: 8,
  },
  resendButtonText: {
    fontSize: 14,
    color: "#1d9bf0",
    fontWeight: "600" as const,
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
  passwordVerifyInput: {
    width: "100%",
    backgroundColor: "#f5f5f5",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111",
    borderWidth: 1.5,
    borderColor: "#10b981",
    marginTop: 8,
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
