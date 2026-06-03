import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, Platform, Modal, TextInput, ActivityIndicator, Share, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, Bell, MapPin, Moon, Sun, Mail, FileText, ChevronRight, X as XIcon, MessageSquare, Paperclip, EyeOff, Eye, Lock, Trash2, AlertTriangle, Star, Share2, Crown, HelpCircle, Phone, Globe, Volume2, VolumeX, Info, Handshake, Check } from "lucide-react-native";
import { Linking } from "react-native";
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  canOpenServiceTeamEntry,
  getServiceTeamEntrySubtitle,
  isServiceTeamMinor,
} from "@/utils/serviceTeam";
import * as Haptics from "expo-haptics";
import { getNotificationsEnabled, setNotificationsEnabled as saveNotificationsEnabled } from "@/utils/notifications";
import { getServerClient } from "@/lib/server-client";
import { hasAdminPortalAccess as getHasAdminPortalAccess } from "@/lib/role-session";
import { formatCountryName } from "@/constants/country-utils";
import { WORLD_COUNTRIES } from "@/constants/countries";
import { getActivityVoiceAssistantEnabled, setActivityVoiceAssistantEnabled as saveActivityVoiceAssistantEnabled } from "@/utils/activityVoice";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

function normalizeSettingsCountryCode(country: string | null | undefined): string | null {
  const value = String(country || "").trim();
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper.length === 2) return upper;
  const match = WORLD_COUNTRIES.find((item) => item.name.toLowerCase() === value.toLowerCase());
  return match?.iso_alpha2?.toUpperCase() ?? null;
}

const SPECIAL_CLUB_COORDINATOR_ROLE_NAMES = new Set([
  "junior_runners_club_coordinator",
  "golden_age_runners_club_coordinator",
  "treadmill_runners_club_coordinator",
  "para_runners_club_coordinator",
  "smartfit_club_coordinator",
]);

const SERVICE_APPLICANT_LINKS_HELPER =
  "Optional: add up to 3 links where admins can learn more about your background and suitability for this role—for example a website, LinkedIn profile, social handle, or published article.";

const SERVICE_APPLICANT_STATEMENT_HELPER =
  "Optional: briefly explain why admins should consider you for this role. Use 25-250 words if you choose to add it.";

const RUNNATION_APK_LINK = "https://expo.dev/artifacts/eas/jvd4kbNdrsg88bDMm7oBe2.apk";

const REQUIRED_FRONTEND_FAQS = [
  {
    faq_id: "frontend-special-club-eligibility",
    question: "Who can join each special club?",
    answer:
      "Junior Runners is for users aged 8 to 15. Golden Age Runners is for users aged 60 and above. Para Runners is available when your profile says you have a disability. Treadmill Runners is available when your profile says you do indoor workouts. SmartFit Club is available when your profile says you use a smart watch to record workouts and you have selected General Health as one of your goals.",
    display_order: 190,
  },
];

const DONATION_CURRENCY_BY_COUNTRY: Record<string, string> = {
  UG: "UGX",
  KE: "KES",
  TZ: "TZS",
  RW: "RWF",
  GH: "GHS",
  ZM: "ZMW",
  MW: "MWK",
  NG: "NGN",
  ZA: "ZAR",
  US: "USD",
  GB: "GBP",
  EU: "EUR",
};

const MOBILE_MONEY_COUNTRIES = new Set(["UG", "KE", "TZ", "RW", "GH", "ZM", "MW", "CM", "CI", "SN"]);

type DonationPaymentMethod = "card" | "mobile_money";
type ServiceRoleAvailabilityGrouping = "grouped" | "flat";
type ChatReportTab = "complaint" | "feedback";

function formatSettingsDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function getServiceRoleButtonLabel(roleName: string, countryName: string): string {
  switch (roleName) {
    case "club_coordinator":
      return "Create Club";
    case "country_coordinator":
      return `Take up ${countryName} Coordinator Role`;
    case "event_organizer":
      return `Create an Event Organizer profile in ${countryName}.`;
    case "shop_manager":
      return `Create a Shop Manager profile in ${countryName}.`;
    case "junior_runners_club_coordinator":
      return "Take up the Junior Runners Club Coordinator role.";
    case "golden_age_runners_club_coordinator":
      return "Take up the Golden Age Runners Club Coordinator role.";
    case "treadmill_runners_club_coordinator":
      return "Take up the Treadmill Runners Club Coordinator role.";
    case "para_runners_club_coordinator":
      return "Take up the Para Runners Club Coordinator role.";
    case "smartfit_club_coordinator":
      return "Take up the SmartFit Club Coordinator role.";
    case "magazine_editor":
      return "Apply to lead The Running Post as Magazine Editor.";
    case "chat_room_administrator":
      return "Apply to screen Chat Abuse Reports.";
    default:
      return "Take up role";
  }
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export default function SettingsScreen() {
  const { signOut, user, registrationId, roleSession, privateMode, setPrivateMode, verifyPin, deleteAccount } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [activityVoiceAssistantEnabled, setActivityVoiceAssistantEnabled] = useState(true);

  useEffect(() => {
    void getNotificationsEnabled().then(setNotificationsEnabled);
    void getActivityVoiceAssistantEnabled().then(setActivityVoiceAssistantEnabled);
  }, []);
  const [locationEnabled, setLocationEnabled] = useState(true);
  const { isDark, setDarkMode, colors: themeColors } = useTheme();
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState<"bug" | "feature" | "support" | "billing">("feature");
  const [feedbackAttachment, setFeedbackAttachment] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePin, setDeletePin] = useState('');
  const [deletePinError, setDeletePinError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'pin'>('confirm');
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const { subscriptionStatus, trialDaysRemaining, subscription } = useSubscription();
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [donationAmount, setDonationAmount] = useState("");
  const [donationRemarks, setDonationRemarks] = useState("");
  const [donationPaymentMethod, setDonationPaymentMethod] = useState<DonationPaymentMethod>("card");
  const [showServiceTeamModal, setShowServiceTeamModal] = useState(false);
  const [serviceRoleAvailabilityGrouping, setServiceRoleAvailabilityGrouping] = useState<ServiceRoleAvailabilityGrouping>("grouped");
  const [selectedServiceRole, setSelectedServiceRole] = useState<any | null>(null);
  const [showChatReportModal, setShowChatReportModal] = useState(false);
  const [chatReportTab, setChatReportTab] = useState<ChatReportTab>("complaint");
  const [chatReportDescription, setChatReportDescription] = useState("");
  const [chatReportReason, setChatReportReason] = useState<"abuse" | "hate" | "disrespect" | "divisive" | "sectarian" | "pornographic" | "spam" | "other">("abuse");
  const [chatReportScreenshot, setChatReportScreenshot] = useState<{ uri: string; mimeType?: string | null; fileName?: string | null } | null>(null);
  const [serviceWebsiteUrl, setServiceWebsiteUrl] = useState("");
  const [serviceLinkedinUrl, setServiceLinkedinUrl] = useState("");
  const [serviceSocialUrl, setServiceSocialUrl] = useState("");
  const [serviceApplicantStatements, setServiceApplicantStatements] = useState<Record<string, string>>({});
  const [serviceContactConsents, setServiceContactConsents] = useState<Record<string, boolean>>({});
  const [serviceContactInstructions, setServiceContactInstructions] = useState<Record<string, string>>({});
  const [serviceProposedNames, setServiceProposedNames] = useState<Record<string, string>>({});
  const [serviceProposedLocations, setServiceProposedLocations] = useState<Record<string, string>>({});
  const [serviceProposedDescriptions, setServiceProposedDescriptions] = useState<Record<string, string>>({});
  const [expandedFaqIds, setExpandedFaqIds] = useState<string[]>([]);
  const adminTapCount = useRef<number>(0);
  const adminTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const helpGridColumns = width >= 700 ? 2 : 1;
  const hasAdminPortalAccess = getHasAdminPortalAccess(roleSession);

  const handleVersionTap = useCallback(() => {
    adminTapCount.current += 1;
    if (adminTapTimer.current) {
      clearTimeout(adminTapTimer.current);
    }
    if (adminTapCount.current >= 5) {
      adminTapCount.current = 0;
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.push('/admin-login' as any);
      return;
    }
    adminTapTimer.current = setTimeout(() => {
      adminTapCount.current = 0;
    }, 2000);
  }, [router]);

  const handleAdminPortalPress = useCallback(async () => {
    router.push('/admin' as any);
  }, [router]);

  const { data: supportContacts = [], isLoading: isLoadingContacts } = trpc.support.getAdminContacts.useQuery(
    undefined,
    { enabled: showHelpModal }
  );

  const { data: faqEntries = [], isLoading: isLoadingFaqs, error: faqError } = trpc.support.getFaqEntries.useQuery(
    undefined,
    { enabled: showFaqModal }
  );
  const displayedFaqEntries = useMemo(() => {
    const rows = Array.isArray(faqEntries) ? faqEntries : [];
    const existingQuestions = new Set(
      rows.map((faq: any) => String(faq.question || "").trim().toLowerCase())
    );
    return [
      ...rows,
      ...REQUIRED_FRONTEND_FAQS.filter(
        (faq) => !existingQuestions.has(faq.question.trim().toLowerCase())
      ),
    ].sort((a: any, b: any) => {
      const orderDiff = Number(a.display_order ?? 0) - Number(b.display_order ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return String(a.faq_id).localeCompare(String(b.faq_id));
    });
  }, [faqEntries]);

  const effectiveRegistrationId = registrationId || user?.id || "";
  const { data: serviceProfile, isLoading: isLoadingServiceProfile } = trpc.profile.getBundle.useQuery(
    { registrationId: effectiveRegistrationId },
    { enabled: !!effectiveRegistrationId }
  );
  const serviceProfileAny = serviceProfile as any;
  const serviceCountryCode = normalizeSettingsCountryCode(
    serviceProfileAny?.profile?.country_code || serviceProfileAny?.profile?.country
  );
  const serviceCountryName = formatCountryName(serviceCountryCode) || formatCountryName(serviceProfileAny?.profile?.country) || "Your country";
  const chatReportRegistrationId = registrationId || user?.id || "";

  const {
    data: myChatReports = [],
    isLoading: isLoadingMyChatReports,
    error: myChatReportsError,
    refetch: refetchMyChatReports,
  } = trpc.social.getMyChatReports.useQuery(
    { registrationId: chatReportRegistrationId },
    {
      enabled: Boolean(showChatReportModal && chatReportRegistrationId),
    }
  );
  const donationCurrency = DONATION_CURRENCY_BY_COUNTRY[serviceCountryCode || ""] || "USD";
  const donationPaymentOptions = useMemo<Array<{ key: DonationPaymentMethod; label: string; caption: string }>>(() => {
    const options: Array<{ key: DonationPaymentMethod; label: string; caption: string }> = [
      { key: "card", label: "Card", caption: "Visa, Mastercard or bank card" },
    ];
    if (serviceCountryCode && MOBILE_MONEY_COUNTRIES.has(serviceCountryCode)) {
      options.push({ key: "mobile_money", label: "Mobile money", caption: `${serviceCountryName} mobile wallet` });
    }
    return options;
  }, [serviceCountryCode, serviceCountryName]);

  useEffect(() => {
    if (!donationPaymentOptions.some((option) => option.key === donationPaymentMethod)) {
      setDonationPaymentMethod("card");
    }
  }, [donationPaymentMethod, donationPaymentOptions]);
  const {
    data: serviceTeamData,
    isLoading: isLoadingServiceRoles,
    error: serviceTeamError,
    refetch: refetchServiceTeamRoles,
  } = trpc.serviceTeam.getRoles.useQuery(
    { countryCode: serviceCountryCode || "" },
    { enabled: !!serviceCountryCode }
  );
  const serviceProfileDob = serviceProfileAny?.profile?.dob as string | undefined;
  const serviceTeamEntryEnabled = useMemo(() => {
    if (serviceTeamData?.canOpenServiceTeam !== undefined) {
      if (!serviceCountryCode && !serviceTeamData.existingRole) {
        return !isServiceTeamMinor(serviceProfileDob);
      }
      return serviceTeamData.canOpenServiceTeam;
    }
    return canOpenServiceTeamEntry(serviceProfileDob, serviceTeamData?.roles, !!serviceTeamData?.existingRole);
  }, [serviceCountryCode, serviceProfileDob, serviceTeamData]);
  const serviceTeamEntrySubtitle = useMemo(
    () => getServiceTeamEntrySubtitle(serviceProfileDob, serviceTeamData?.roles),
    [serviceProfileDob, serviceTeamData?.roles]
  );
  const handleServiceTeamPress = useCallback(() => {
    if (serviceTeamEntryEnabled) {
      setShowServiceTeamModal(true);
      return;
    }
    const message = isServiceTeamMinor(serviceProfileDob)
      ? "Users under 18 can apply only when the Junior Runners Club Coordinator role is vacant. Check back when the role becomes available."
      : "Add your date of birth in Profile to check service team eligibility.";
    if (Platform.OS !== "web") {
      Alert.alert("Join Service Team", message);
    } else {
      alert(message);
    }
  }, [serviceProfileDob, serviceTeamEntryEnabled]);
  const requestServiceRoleMutation = trpc.serviceTeam.requestRole.useMutation({
    onSuccess: () => {
      if (Platform.OS !== "web") {
        Alert.alert("Request Submitted", "Your service team request has been sent for admin approval.");
      } else {
        alert("Your service team request has been sent for admin approval.");
      }
      setServiceWebsiteUrl("");
      setServiceLinkedinUrl("");
      setServiceSocialUrl("");
      setServiceApplicantStatements({});
      setServiceContactConsents({});
      setServiceContactInstructions({});
      setServiceProposedNames({});
      setServiceProposedLocations({});
      setServiceProposedDescriptions({});
      setSelectedServiceRole(null);
      setShowServiceTeamModal(false);
      void refetchServiceTeamRoles();
    },
    onError: (error) => {
      if (Platform.OS !== "web") {
        Alert.alert("Request Failed", error.message || "Could not submit the role request.");
      } else {
        alert(error.message || "Could not submit the role request.");
      }
    },
  });


  const handleSignOut = async () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await signOut();
    router.replace('/register' as any);
  };

  const showComingSoon = (feature: string) => {
    if (Platform.OS !== 'web') {
      Alert.alert("Coming Soon", `${feature} will be available in a future update.`);
    } else {
      alert(`${feature} will be available in a future update.`);
    }
  };

  const toggleFaq = (faqId: string) => {
    setExpandedFaqIds((current) =>
      current.includes(faqId) ? current.filter((id) => id !== faqId) : [...current, faqId]
    );
  };

  const openWhatsApp = async (phone: string) => {
    const digits = phone.replace(/[^\d]/g, "");
    const url = `https://wa.me/${digits}`;
    if (Platform.OS === "web") {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    await Linking.openURL(url);
  };

  const openEmail = async (email: string) => {
    const url = `mailto:${email}`;
    if (Platform.OS === "web") {
      window.open(url, "_self");
      return;
    }
    await Linking.openURL(url);
  };

  const formatHelpPhone = (phone: string) => {
    const raw = phone.trim();
    if (raw.startsWith("0")) return raw;
    if (raw.startsWith("+")) return raw;

    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length === 12 && digits.startsWith("256")) {
      return `0${digits.slice(3)}`;
    }
    if (digits.length === 9) {
      return `0${digits}`;
    }
    return raw;
  };

  const APP_STORE_URL = '';
  const APP_DOWNLOAD_LINK = RUNNATION_APK_LINK;

  const { data: existingRating } = useQuery<{ rating: number; feedback: string | null } | null>({
    queryKey: ['appRating', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const regId = user.id;
      if (!regId) return null;
      const { data, error } = await supabase
        .from('app_ratings')
        .select('rating, feedback')
        .eq('registration_id', regId)
        .maybeSingle();
      if (error) {
        console.log('Error fetching existing rating:', error);
        return null;
      }
      return data;
    },
    enabled: !!user,
  });

  const suggestionMutation = useMutation({
    mutationFn: async (suggestion: string) => {
      const regId = user?.id;
      if (!regId) throw new Error('Not registered');
      await getServerClient().feedback.submitSuggestion.mutate({
        registrationId: regId,
        suggestion: suggestion.trim(),
      });
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowFeedbackModal(false);
      setFeedbackText('');
      setFeedbackCategory('feature');
      setFeedbackAttachment(null);
      if (Platform.OS !== 'web') {
        Alert.alert('Thank You!', 'Your suggestion has been submitted. We appreciate your feedback!');
      } else {
        alert('Thank you! Your suggestion has been submitted.');
      }
    },
    onError: (error) => {
      console.error('Error submitting suggestion:', error);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', 'Failed to submit suggestion. Please try again.');
      } else {
        alert('Failed to submit suggestion. Please try again.');
      }
    },
  });

  const getServiceRoleAllowsApplicantLinks = useCallback((roleName: string) => {
    return roleName !== "event_organizer" && roleName !== "club_coordinator";
  }, []);

  const submitServiceRoleRequest = useCallback((role: any) => {
    if (!serviceCountryCode || !role?.roleName) return;

    const roleAllowsApplicantLinks = getServiceRoleAllowsApplicantLinks(role.roleName);
    const applicantStatement = serviceApplicantStatements[role.roleName] || "";
    const contactConsent = serviceContactConsents[role.roleName] === true;
    const contactInstructions = serviceContactInstructions[role.roleName] || "";
    const needsProposedProfile = role.roleName === "club_coordinator" || role.roleName === "event_organizer";
    const proposedName = serviceProposedNames[role.roleName] || "";
    const proposedLocation = serviceProposedLocations[role.roleName] || "";
    const proposedDescription = serviceProposedDescriptions[role.roleName] || "";
    const statementWordCount = countWords(applicantStatement);

    if (needsProposedProfile && (!proposedName.trim() || !proposedLocation.trim())) {
      const message =
        role.roleName === "club_coordinator"
          ? "Please add the proposed club name and location before submitting."
          : "Please add the organizer profile name and base location before submitting.";
      if (Platform.OS !== "web") {
        Alert.alert("Join Service Team", message);
      } else {
        alert(message);
      }
      return;
    }

    if (applicantStatement.trim() && (statementWordCount < 25 || statementWordCount > 250)) {
      const message = "The optional role statement must be 25-250 words.";
      if (Platform.OS !== "web") {
        Alert.alert("Join Service Team", message);
      } else {
        alert(message);
      }
      return;
    }

    requestServiceRoleMutation.mutate({
      roleName: role.roleName as any,
      countryCode: serviceCountryCode,
      websiteUrl: roleAllowsApplicantLinks ? serviceWebsiteUrl : null,
      linkedinUrl: roleAllowsApplicantLinks ? serviceLinkedinUrl : null,
      socialUrl: roleAllowsApplicantLinks ? serviceSocialUrl : null,
      applicantStatement: applicantStatement.trim() || null,
      contactConsent,
      contactInstructions: contactConsent ? contactInstructions.trim() || null : null,
      proposedName: needsProposedProfile ? proposedName.trim() : null,
      proposedLocation: needsProposedProfile ? proposedLocation.trim() : null,
      proposedDescription: needsProposedProfile ? proposedDescription.trim() || null : null,
    });
  }, [
    getServiceRoleAllowsApplicantLinks,
    requestServiceRoleMutation,
    serviceApplicantStatements,
    serviceContactConsents,
    serviceContactInstructions,
    serviceCountryCode,
    serviceLinkedinUrl,
    serviceProposedDescriptions,
    serviceProposedLocations,
    serviceProposedNames,
    serviceSocialUrl,
    serviceWebsiteUrl,
  ]);

  const serviceRoleGroups = useMemo(() => {
    const roles = serviceTeamData?.roles ?? [];
    const groupForRole = (role: any) => {
      if (role.status === "available") return "Available";
      if (role.hasPendingRequest || role.status === "pending") return "Pending";
      if (role.status === "coming_soon") return "Coming Soon";
      if (role.status === "filled") return "Filled";
      return "Other";
    };
    if (serviceRoleAvailabilityGrouping === "flat") {
      return [{ title: "All Roles", roles }];
    }
    return ["Available", "Pending", "Coming Soon", "Filled", "Other"]
      .map((title) => ({ title, roles: roles.filter((role: any) => groupForRole(role) === title) }))
      .filter((group) => group.roles.length > 0);
  }, [serviceRoleAvailabilityGrouping, serviceTeamData?.roles]);

  const donationMutation = useMutation({
    mutationFn: async () => {
      const regId = registrationId || user?.id;
      if (!regId) throw new Error("Please sign in before donating.");
      const amount = Number(donationAmount.replace(/,/g, "").trim());
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Please enter a valid donation amount.");
      }

      await getServerClient().support.submitDonation.mutate({
        registrationId: regId,
        amount,
        currency: donationCurrency,
        countryCode: serviceCountryCode,
        paymentMethod: donationPaymentMethod,
        remarks: donationRemarks.trim() || null,
      });
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDonateModal(false);
      setDonationAmount("");
      setDonationRemarks("");
      setDonationPaymentMethod("card");
      const message = "Thank you for standing with RunNation. Your donation details have been recorded, and the team will use them to follow through with the selected payment option.";
      if (Platform.OS !== "web") {
        Alert.alert("Thank You", message);
      } else {
        alert(message);
      }
    },
    onError: (error: any) => {
      const message = error?.message || "Could not record the donation right now.";
      if (Platform.OS !== "web") {
        Alert.alert("Donation Not Sent", message);
      } else {
        alert(message);
      }
    },
  });

  const encodeReportScreenshot = async (uri: string, mimeType?: string | null) => {
    const resolvedMimeType = mimeType || (uri.toLowerCase().includes(".png") ? "image/png" : "image/jpeg");
    if (Platform.OS === "web") {
      const response = await fetch(uri);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
        reader.onerror = () => reject(new Error("Could not read screenshot."));
        reader.readAsDataURL(blob);
      });
      return { base64, mimeType: resolvedMimeType };
    }

    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
    return { base64, mimeType: resolvedMimeType };
  };

  const pickChatReportScreenshot = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Required", "Please allow photo access to attach a screenshot.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images" as any,
      allowsEditing: false,
      quality: 0.75,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setChatReportScreenshot({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName ?? "chat-report-screenshot",
      });
    }
  };

  const chatReportMutation = useMutation({
    mutationFn: async () => {
      const regId = registrationId || user?.id;
      if (!regId) throw new Error("Please sign in before submitting a report.");
      if (!chatReportDescription.trim() || chatReportDescription.trim().length < 10) {
        throw new Error("Please add a brief description of at least 10 characters.");
      }

      const screenshotPayload = chatReportScreenshot
        ? await encodeReportScreenshot(chatReportScreenshot.uri, chatReportScreenshot.mimeType)
        : null;

      await getServerClient().social.reportContent.mutate({
        registrationId: regId,
        postId: null,
        commentId: null,
        reasonCategory: chatReportReason,
        description: chatReportDescription.trim(),
        screenshotBase64: screenshotPayload?.base64 ?? null,
        screenshotMimeType: screenshotPayload?.mimeType ?? null,
      });
    },
    onSuccess: () => {
      void refetchMyChatReports();
      setShowChatReportModal(false);
      setChatReportDescription("");
      setChatReportReason("abuse");
      setChatReportScreenshot(null);
      Alert.alert("Report Submitted", "Thank you. An admin will review the chat report.");
    },
    onError: (error: any) => {
      Alert.alert("Report Failed", error?.message || "Could not submit report.");
    },
  });

  const ratingMutation = useMutation({
    mutationFn: async ({ rating, feedback }: { rating: number; feedback: string }) => {
      const regId = user?.id;
      if (!regId) throw new Error('Not registered');
      await getServerClient().feedback.submitRating.mutate({
        registrationId: regId,
        rating,
        feedback: feedback.trim() || null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appRating'] });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRatingModal(false);
      setSelectedRating(0);
      setRatingFeedback('');
      if (Platform.OS !== 'web') {
        Alert.alert('Thank You!', 'Your rating has been submitted. We appreciate your feedback!');
      } else {
        alert('Thank you! Your rating has been submitted.');
      }
    },
    onError: (error) => {
      console.error('Error submitting rating:', error);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', 'Failed to submit rating. Please try again.');
      } else {
        alert('Failed to submit rating. Please try again.');
      }
    },
  });

  const handleRateUs = () => {
    if (!user) {
      if (Platform.OS !== 'web') {
        Alert.alert('Sign In Required', 'Please sign in to rate the app.');
      } else {
        alert('Please sign in to rate the app.');
      }
      return;
    }
    if (existingRating) {
      setSelectedRating(existingRating.rating);
      setRatingFeedback(existingRating.feedback || '');
    } else {
      setSelectedRating(0);
      setRatingFeedback('');
    }
    setShowRatingModal(true);
  };

  const handleShareApp = () => {
    const link = APP_DOWNLOAD_LINK || APP_STORE_URL;
    const shareMessage =
      Platform.OS === "ios"
        ? "RunNation iOS: coming soon"
        : link
          ? `RunNation Android APK: ${String(link)}`
          : 'RunNation Android APK: download link coming soon.';
    if (Platform.OS === 'web') {
      if (navigator.clipboard) {
        void navigator.clipboard.writeText(shareMessage);
        alert('Link copied to clipboard!');
      } else {
        alert(shareMessage);
      }
    } else {
      void Share.share({ message: shareMessage });
    }
  };

  const getRatingLabel = (rating: number): string => {
    switch (rating) {
      case 1: return 'Poor';
      case 2: return 'Fair';
      case 3: return 'Good';
      case 4: return 'Great';
      case 5: return 'Excellent';
      default: return 'Tap a star';
    }
  };

  const feedbackCategories: Array<{ key: "bug" | "feature" | "support" | "billing"; label: string }> = [
    { key: "feature", label: "Feature" },
    { key: "bug", label: "Bug" },
    { key: "support", label: "Support" },
    { key: "billing", label: "Billing" },
  ];
  const bottomNavPadding = Platform.OS === "android" ? Math.max(insets.bottom, 88) + 24 : insets.bottom + 24;

  return (
    <SafeAreaView
      edges={Platform.OS === "android" ? ["bottom"] : []}
      style={[styles.container, { backgroundColor: themeColors.background }]}
    >
      <ScrollView
        style={styles.safeScroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomNavPadding }]}
      >
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>Subscription</Text>
        <TouchableOpacity
          style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]}
          onPress={() => router.push('/subscription' as any)}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: '#FFF8E7' }]}>
              <Crown size={22} color="#FFD700" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>
                {subscriptionStatus === 'active'
                  ? 'Premium Active'
                  : subscriptionStatus === 'trial'
                    ? 'Free Plan'
                    : subscriptionStatus === 'pending'
                      ? 'Payment Pending'
                      : 'Subscribe'}
              </Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>
                {subscriptionStatus === 'active' && subscription?.expires_at
                  ? `Expires ${new Date(subscription.expires_at).toLocaleDateString()}`
                  : subscriptionStatus === 'trial'
                    ? `${trialDaysRemaining} day${trialDaysRemaining !== 1 ? 's' : ''} remaining`
                    : subscriptionStatus === 'pending'
                      ? 'Awaiting payment confirmation'
                      : 'Your free plan has ended — subscribe now'}
              </Text>
            </View>
          </View>
          <View style={[
            styles.subscriptionBadge,
            subscriptionStatus === 'active' && styles.subscriptionBadgeActive,
            subscriptionStatus === 'trial' && styles.subscriptionBadgeTrial,
            subscriptionStatus === 'pending' && styles.subscriptionBadgePending,
            subscriptionStatus === 'expired' && styles.subscriptionBadgeExpired,
          ]}>
            <Text style={styles.subscriptionBadgeText}>
              {subscriptionStatus === 'active' ? 'PRO'
                : subscriptionStatus === 'trial' ? 'FREE'
                : subscriptionStatus === 'pending' ? 'PENDING'
                : 'EXPIRED'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>Preferences</Text>
        
        <TouchableOpacity 
          style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]} 
          onPress={() => {
            const next = !notificationsEnabled;
            setNotificationsEnabled(next);
            void saveNotificationsEnabled(next);
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <View style={styles.settingLeft}>
            <View style={styles.iconContainer}>
              <Bell size={22} color="#10b981" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Notifications</Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>Enable push notifications</Text>
            </View>
          </View>
          <View style={[styles.radioButton, notificationsEnabled && styles.radioButtonActive]}>
            {notificationsEnabled && <View style={styles.radioButtonInner} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]}
          onPress={() => {
            const next = !activityVoiceAssistantEnabled;
            setActivityVoiceAssistantEnabled(next);
            void saveActivityVoiceAssistantEnabled(next);
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: activityVoiceAssistantEnabled ? '#ECFDF5' : '#F3F4F6' }]}>
              {activityVoiceAssistantEnabled ? (
                <Volume2 size={22} color="#10b981" />
              ) : (
                <VolumeX size={22} color="#6b7280" />
              )}
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Activity Voice Assistant</Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>
                {activityVoiceAssistantEnabled ? 'Start and finish voice prompts on' : 'Start and finish voice prompts off'}
              </Text>
            </View>
          </View>
          <View style={[styles.radioButton, activityVoiceAssistantEnabled && styles.radioButtonActive]}>
            {activityVoiceAssistantEnabled && <View style={styles.radioButtonInner} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]} 
          onPress={() => setLocationEnabled(!locationEnabled)}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1E3A5F' : '#f5f5f5' }]}>
              <MapPin size={22} color="#3b82f6" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Location</Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>Enable location services</Text>
            </View>
          </View>
          <View style={[styles.radioButton, locationEnabled && styles.radioButtonActive]}>
            {locationEnabled && <View style={styles.radioButtonInner} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]} 
          onPress={() => {
            setDarkMode(!isDark);
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#312E81' : '#F3F0FF' }]}>
              {isDark ? <Sun size={22} color="#A78BFA" /> : <Moon size={22} color="#8b5cf6" />}
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Dark Mode</Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>{isDark ? 'Dark theme active' : 'Enable dark theme'}</Text>
            </View>
          </View>
          <View style={[styles.radioButton, isDark && styles.radioButtonActive]}>
            {isDark && <View style={styles.radioButtonInner} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]} 
          onPress={() => setPrivateMode(!privateMode)}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#3B2000' : '#f5f5f5' }, privateMode && styles.iconContainerActive]}>
              <EyeOff size={22} color={privateMode ? "#fff" : "#f97316"} />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Private Mode</Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>Hide your data from public views</Text>
            </View>
          </View>
          <View style={[styles.radioButton, privateMode && styles.radioButtonActive]}>
            {privateMode && <View style={styles.radioButtonInner} />}
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>Support</Text>

        <TouchableOpacity
          style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]}
          onPress={() => router.push("/about-us" as any)}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#0D3320' : '#ECFDF5' }]}>
              <Info size={22} color="#10b981" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>About RunNation</Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>Where runners belong</Text>
            </View>
          </View>
          <ChevronRight size={20} color={themeColors.iconMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]}
          onPress={() => setShowDonateModal(true)}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#3B1111' : '#FEF2F2' }]}>
              <Handshake size={22} color="#ef4444" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Donate</Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>Help RunNation keep serving runners</Text>
            </View>
          </View>
          <ChevronRight size={20} color={themeColors.iconMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.settingItem,
            { backgroundColor: themeColors.cardBackground },
            !serviceTeamEntryEnabled && styles.settingItemDisabled,
          ]}
          onPress={handleServiceTeamPress}
          disabled={!serviceTeamEntryEnabled}
          activeOpacity={serviceTeamEntryEnabled ? 0.7 : 1}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#3B2000' : '#FFF7ED' }]}>
              <Handshake size={22} color={serviceTeamEntryEnabled ? "#f97316" : themeColors.iconMuted} />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: serviceTeamEntryEnabled ? themeColors.text : themeColors.textLight }]}>
                Join Service Team
              </Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>
                {serviceTeamEntrySubtitle}
              </Text>
            </View>
          </View>
          <ChevronRight size={20} color={serviceTeamEntryEnabled ? themeColors.iconMuted : themeColors.textLight} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]}
          onPress={() => setShowHelpModal(true)}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1E3A5F' : '#EFF6FF' }]}>
              <HelpCircle size={22} color="#3b82f6" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Help</Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>Support contacts</Text>
            </View>
          </View>
          <ChevronRight size={20} color={themeColors.iconMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]}
          onPress={() => setShowChatReportModal(true)}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#3B1111' : '#FEF2F2' }]}>
              <AlertTriangle size={22} color="#dc2626" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Report Chat Abuse</Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>Send screenshot and offence details for admin review</Text>
            </View>
          </View>
          <ChevronRight size={20} color={themeColors.iconMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]}
          onPress={() => router.push("/policy" as any)}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#312E81' : '#f5f5f5' }]}>
              <FileText size={22} color="#8b5cf6" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Policy, Terms and Conditions</Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>View our policies and terms</Text>
            </View>
          </View>
          <ChevronRight size={20} color={themeColors.iconMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]}
          onPress={() => setShowFaqModal(true)}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
              <FileText size={22} color="#4b5563" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>FAQ</Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>Quick answers to common RunNation questions</Text>
            </View>
          </View>
          <ChevronRight size={20} color={themeColors.iconMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]}
          onPress={() => setShowFeedbackModal(true)}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1E3A5F' : '#f5f5f5' }]}>
              <MessageSquare size={22} color="#3b82f6" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Suggestions</Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>Share thoughts and ideas to help improve the app</Text>
            </View>
          </View>
          <ChevronRight size={20} color={themeColors.iconMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]}
          onPress={handleRateUs}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#3B2800' : '#FFF7ED' }]}>
              <Star size={22} color="#f59e0b" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Rate Us</Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>
                {existingRating ? `You rated ${existingRating.rating}/5 — tap to update` : 'Love the app? Leave us a rating'}
              </Text>
            </View>
          </View>
          <ChevronRight size={20} color={themeColors.iconMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]}
          onPress={handleShareApp}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1E3A5F' : '#EFF6FF' }]}>
              <Share2 size={22} color="#3b82f6" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Share App</Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>Invite friends to join</Text>
            </View>
          </View>
          <ChevronRight size={20} color={themeColors.iconMuted} />
        </TouchableOpacity>
      </View>

      {user && hasAdminPortalAccess && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>Admin</Text>
          <TouchableOpacity
            style={[styles.settingItem, { backgroundColor: themeColors.cardBackground }]}
            onPress={() => {
              void handleAdminPortalPress();
            }}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#ECFDF5' }]}>
                <Crown size={22} color="#10b981" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: themeColors.text }]}>Admin Portal</Text>
                <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>
                  {roleSession.isSuperAdmin
                    ? 'Global access enabled'
                    : roleSession.isCountryAdmin
                      ? 'Country admin tools available'
                      : roleSession.isCountryCoordinator
                        ? 'Country coordinator tools available'
                        : roleSession.isSpecialClubCoordinator
                          ? 'Special club tools available'
                        : roleSession.isEventOrganizer
                          ? 'Event organizer tools available'
                      : 'Coordinator tools available'}
                </Text>
              </View>
            </View>
            <ChevronRight size={20} color={themeColors.iconMuted} />
          </TouchableOpacity>
        </View>
      )}

      {user && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <LogOut size={22} color="#fff" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}

      {user && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>Danger Zone</Text>
          <TouchableOpacity
            style={[styles.deleteAccountButton, { backgroundColor: themeColors.cardBackground }]}
            onPress={() => {
              setShowDeleteModal(true);
              setDeleteStep('confirm');
              setDeletePin('');
              setDeletePinError('');
            }}
          >
            <Trash2 size={22} color="#dc2626" />
            <Text style={styles.deleteAccountText}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity activeOpacity={1} onPress={handleVersionTap}>
          <Text style={[styles.footerText, { color: themeColors.textLight }]}>Version 1.0.0</Text>
        </TouchableOpacity>
        {user && 'username' in user && user.username && (
          <Text style={[styles.footerSubtext, { color: themeColors.textLight }]}>Signed in as: {user.username}</Text>
        )}
      </View>

      <Modal
        visible={showFeedbackModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFeedbackModal(false)}
      >
        <View style={[styles.detailModalOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={[styles.detailModalContent, { backgroundColor: themeColors.modalBackground }]}>
            <View style={[styles.detailHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.detailTitle, { color: themeColors.text }]}>Suggestions</Text>
              <TouchableOpacity onPress={() => {
                setShowFeedbackModal(false);
                setFeedbackText("");
                setFeedbackCategory("feature");
                setFeedbackAttachment(null);
              }}>
                <XIcon size={24} color={themeColors.iconDefault} />
              </TouchableOpacity>
            </View>

            <View style={styles.feedbackBody}>
              <View style={styles.feedbackCategoryRow}>
                {feedbackCategories.map((category) => {
                  const isActive = feedbackCategory === category.key;
                  return (
                    <TouchableOpacity
                      key={category.key}
                      style={[
                        styles.feedbackCategoryChip,
                        isActive && styles.feedbackCategoryChipActive,
                      ]}
                      onPress={() => setFeedbackCategory(category.key)}
                    >
                      <Text
                        style={[
                          styles.feedbackCategoryChipText,
                          isActive && styles.feedbackCategoryChipTextActive,
                        ]}
                      >
                        {category.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[styles.feedbackLabel, { color: themeColors.text }]}>Your Feedback</Text>
              <TextInput
                style={[styles.feedbackInput, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                placeholder="Describe the issue or idea in a few clear sentences..."
                placeholderTextColor={themeColors.textLight}
                multiline
                maxLength={300}
                value={feedbackText}
                onChangeText={setFeedbackText}
                textAlignVertical="top"
              />
              <Text style={[styles.characterCount, { color: themeColors.textLight }]}>{feedbackText.length}/300</Text>

              <TouchableOpacity
                style={[styles.attachButton, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder }]}
                onPress={() => showComingSoon("Attachment")}
              >
                <Paperclip size={20} color="#3b82f6" />
                <Text style={styles.attachButtonText}>
                  {feedbackAttachment ? "Change Attachment" : "Attach File (Optional)"}
                </Text>
              </TouchableOpacity>

              {feedbackAttachment && (
                <View style={styles.attachmentPreview}>
                  <Text style={styles.attachmentText}>{feedbackAttachment}</Text>
                  <TouchableOpacity onPress={() => setFeedbackAttachment(null)}>
                    <XIcon size={18} color="#666" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={[styles.feedbackActions, { borderTopColor: themeColors.border }]}>
              <TouchableOpacity
                style={[styles.cancelFeedbackButton, { backgroundColor: themeColors.inputBackground }]}
                onPress={() => {
                  setShowFeedbackModal(false);
                  setFeedbackText("");
                  setFeedbackCategory("feature");
                  setFeedbackAttachment(null);
                }}
              >
                <Text style={[styles.cancelFeedbackText, { color: themeColors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitFeedbackButton,
                  (!feedbackText.trim() || suggestionMutation.isPending) && styles.submitFeedbackButtonDisabled
                ]}
                onPress={() => {
                  if (feedbackText.trim() && !suggestionMutation.isPending) {
                    if (!user) {
                      if (Platform.OS !== 'web') {
                        Alert.alert('Sign In Required', 'Please sign in to submit a suggestion.');
                      } else {
                        alert('Please sign in to submit a suggestion.');
                      }
                      return;
                    }
                    suggestionMutation.mutate(`[${feedbackCategory.toUpperCase()}] ${feedbackText.trim()}`);
                  }
                }}
                disabled={!feedbackText.trim() || suggestionMutation.isPending}
              >
                {suggestionMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitFeedbackText}>Send Feedback</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDonateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDonateModal(false)}
      >
        <View style={[styles.detailModalOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={[styles.detailModalContent, { backgroundColor: themeColors.modalBackground }]}>
            <View style={[styles.detailHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.detailTitle, { color: themeColors.text }]}>Donate</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowDonateModal(false);
                  setDonationAmount("");
                  setDonationRemarks("");
                  setDonationPaymentMethod("card");
                }}
              >
                <XIcon size={24} color={themeColors.iconDefault} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.donationScroll} contentContainerStyle={styles.donationBody}>
              <Text style={[styles.donationCaption, { color: themeColors.textSecondary }]}>
                RunNation is still a young startup with a big mission: to keep runners connected, included, and supported wherever they are. Any gift, small or large, helps keep the app running, improve the tools clubs depend on, and carry this community further.
              </Text>

              <View style={styles.donationFieldGroup}>
                <Text style={[styles.feedbackLabel, { color: themeColors.text }]}>Amount ({donationCurrency})</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  placeholder={`Enter amount in ${donationCurrency}`}
                  placeholderTextColor={themeColors.textLight}
                  keyboardType="decimal-pad"
                  value={donationAmount}
                  onChangeText={setDonationAmount}
                />
              </View>

              <View style={styles.donationFieldGroup}>
                <Text style={[styles.feedbackLabel, { color: themeColors.text }]}>Payment option</Text>
                <View style={styles.donationMethodGrid}>
                  {donationPaymentOptions.map((option) => {
                    const isActive = donationPaymentMethod === option.key;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        style={[
                          styles.donationMethodButton,
                          { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder },
                          isActive && styles.donationMethodButtonActive,
                        ]}
                        onPress={() => setDonationPaymentMethod(option.key)}
                      >
                        <Text style={[styles.donationMethodLabel, { color: isActive ? "#dc2626" : themeColors.text }]}>
                          {option.label}
                        </Text>
                        <Text style={[styles.donationMethodCaption, { color: themeColors.textSecondary }]}>
                          {option.caption}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {!serviceCountryCode || !MOBILE_MONEY_COUNTRIES.has(serviceCountryCode) ? (
                  <Text style={[styles.donationHint, { color: themeColors.textLight }]}>
                    Mobile money appears automatically where it is supported for the user country.
                  </Text>
                ) : null}
              </View>

              <View style={styles.donationFieldGroup}>
                <Text style={[styles.feedbackLabel, { color: themeColors.text }]}>Remarks (optional)</Text>
                <TextInput
                  style={[styles.feedbackInput, styles.feedbackTextArea, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  placeholder="You can add donor particulars, a reason for the gift, or a short note to the RunNation team."
                  placeholderTextColor={themeColors.textLight}
                  multiline
                  maxLength={1000}
                  value={donationRemarks}
                  onChangeText={setDonationRemarks}
                  textAlignVertical="top"
                />
                <Text style={[styles.characterCount, { color: themeColors.textLight }]}>{donationRemarks.length}/1000</Text>
              </View>
            </ScrollView>

            <View style={[styles.feedbackActions, { borderTopColor: themeColors.border }]}>
              <TouchableOpacity
                style={[styles.cancelFeedbackButton, { backgroundColor: themeColors.inputBackground }]}
                onPress={() => {
                  setShowDonateModal(false);
                  setDonationAmount("");
                  setDonationRemarks("");
                  setDonationPaymentMethod("card");
                }}
              >
                <Text style={[styles.cancelFeedbackText, { color: themeColors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitFeedbackButton,
                  styles.donationSubmitButton,
                  (!donationAmount.trim() || donationMutation.isPending) && styles.submitFeedbackButtonDisabled,
                ]}
                onPress={() => {
                  if (!donationMutation.isPending) {
                    donationMutation.mutate();
                  }
                }}
                disabled={!donationAmount.trim() || donationMutation.isPending}
              >
                {donationMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitFeedbackText}>Send Donation</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDeleteModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={[styles.detailModalOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={[styles.pinModalContent, { backgroundColor: themeColors.modalBackground }]}>
            {deleteStep === 'confirm' ? (
              <>
                <View style={[styles.detailHeader, { borderBottomColor: themeColors.border }]}>
                  <Text style={[styles.detailTitle, { color: themeColors.text }]}>Delete Account</Text>
                  <TouchableOpacity onPress={() => setShowDeleteModal(false)}>
                    <XIcon size={24} color={themeColors.iconDefault} />
                  </TouchableOpacity>
                </View>

                <View style={styles.deleteWarningBody}>
                  <View style={[styles.deleteWarningIcon, { backgroundColor: isDark ? '#3B1515' : '#fef2f2' }]}>
                    <AlertTriangle size={32} color="#dc2626" />
                  </View>
                  <Text style={styles.deleteWarningTitle}>Are you sure?</Text>
                  <Text style={[styles.deleteWarningText, { color: themeColors.textSecondary }]}>
                    This action is permanent and cannot be undone. All your data including activities, goals, club memberships, and event participation will be permanently deleted.
                  </Text>
                </View>

                <View style={[styles.feedbackActions, { borderTopColor: themeColors.border }]}>
                  <TouchableOpacity
                    style={[styles.cancelFeedbackButton, { backgroundColor: themeColors.inputBackground }]}
                    onPress={() => setShowDeleteModal(false)}
                  >
                    <Text style={[styles.cancelFeedbackText, { color: themeColors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteConfirmStepButton}
                    onPress={() => setDeleteStep('pin')}
                  >
                    <Text style={styles.submitFeedbackText}>Continue</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.detailHeader, { borderBottomColor: themeColors.border }]}>
                  <Text style={[styles.detailTitle, { color: themeColors.text }]}>Verify Password</Text>
                  <TouchableOpacity onPress={() => {
                    setShowDeleteModal(false);
                    setDeletePin('');
                    setDeletePinError('');
                  }}>
                    <XIcon size={24} color={themeColors.iconDefault} />
                  </TouchableOpacity>
                </View>

                <View style={styles.pinModalBody}>
                  <View style={[styles.deleteLockIcon, { backgroundColor: isDark ? '#3B1515' : '#fef2f2' }]}>
                    <Lock size={28} color="#dc2626" />
                  </View>
                  <Text style={[styles.pinModalSubtitle, { color: themeColors.textSecondary }]}>Enter your password to confirm account deletion</Text>

                  <TextInput
                    style={[styles.input, { width: '100%' }]}
                    value={deletePin}
                    onChangeText={(text) => {
                      setDeletePin(text);
                      if (deletePinError) setDeletePinError('');
                    }}
                    secureTextEntry
                    autoFocus
                    editable={!isDeleting}
                  />

                  {!!deletePinError && (
                    <Text style={styles.pinErrorText}>{deletePinError}</Text>
                  )}
                </View>

                <View style={[styles.feedbackActions, { borderTopColor: themeColors.border }]}>
                  <TouchableOpacity
                    style={[styles.cancelFeedbackButton, { backgroundColor: themeColors.inputBackground }]}
                    onPress={() => {
                      setDeleteStep('confirm');
                      setDeletePin('');
                      setDeletePinError('');
                    }}
                  >
                    <Text style={[styles.cancelFeedbackText, { color: themeColors.textSecondary }]}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.deleteConfirmButton,
                      (!deletePin.trim() || isDeleting) && styles.submitFeedbackButtonDisabled
                    ]}
                    onPress={async () => {
                      if (!deletePin.trim()) {
                        setDeletePinError('Enter your password');
                        return;
                      }
                      setIsDeleting(true);
                      setDeletePinError('');
                      try {
                        const valid = await verifyPin(deletePin);
                        if (valid) {
                          const result = await deleteAccount();
                          if (result.error) {
                            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                            setDeletePinError(result.error.message);
                          } else {
                            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            setShowDeleteModal(false);
                            if (Platform.OS !== 'web') {
                              Alert.alert('Account Deleted', 'Your account has been permanently deleted.');
                            } else {
                              alert('Your account has been permanently deleted.');
                            }
                            router.replace('/register' as any);
                          }
                        } else {
                          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                          setDeletePinError('Incorrect password. Please try again.');
                          setDeletePin('');
                        }
                      } catch {
                        setDeletePinError('Verification failed. Try again.');
                        setDeletePin('');
                      } finally {
                        setIsDeleting(false);
                      }
                    }}
                    disabled={!deletePin.trim() || isDeleting}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.submitFeedbackText}>Delete Account</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showRatingModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRatingModal(false)}
      >
        <View style={styles.detailModalOverlay}>
          <View style={[styles.ratingModalContent, { backgroundColor: themeColors.modalBackground }]}>
            <View style={[styles.detailHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.detailTitle, { color: themeColors.text }]}>Rate Our App</Text>
              <TouchableOpacity onPress={() => {
                setShowRatingModal(false);
                setSelectedRating(0);
                setRatingFeedback('');
              }}>
                <XIcon size={24} color={themeColors.iconDefault} />
              </TouchableOpacity>
            </View>

            <View style={styles.ratingBody}>
              <View style={styles.ratingStarsContainer}>
                <Text style={[styles.ratingPrompt, { color: themeColors.text }]}>How would you rate your experience?</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => {
                        setSelectedRating(star);
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={styles.starButton}
                    >
                      <Star
                        size={40}
                        color={star <= selectedRating ? '#f59e0b' : '#d1d5db'}
                        fill={star <= selectedRating ? '#f59e0b' : 'transparent'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[
                  styles.ratingLabel,
                  selectedRating > 0 && styles.ratingLabelActive,
                ]}>
                  {getRatingLabel(selectedRating)}
                </Text>
              </View>

              <View style={styles.ratingFeedbackSection}>
                <Text style={[styles.feedbackLabel, { color: themeColors.text }]}>Additional Feedback (Optional)</Text>
                <TextInput
                  style={[styles.ratingFeedbackInput, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  placeholder="Tell us what you think..."
                  placeholderTextColor={themeColors.textLight}
                  multiline
                  maxLength={200}
                  value={ratingFeedback}
                  onChangeText={setRatingFeedback}
                  textAlignVertical="top"
                />
                <Text style={[styles.characterCount, { color: themeColors.textLight }]}>{ratingFeedback.length}/200</Text>
              </View>
            </View>

            <View style={[styles.feedbackActions, { borderTopColor: themeColors.border }]}>
              <TouchableOpacity
                style={[styles.cancelFeedbackButton, { backgroundColor: themeColors.inputBackground }]}
                onPress={() => {
                  setShowRatingModal(false);
                  setSelectedRating(0);
                  setRatingFeedback('');
                }}
              >
                <Text style={[styles.cancelFeedbackText, { color: themeColors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitRatingButton,
                  (selectedRating === 0 || ratingMutation.isPending) && styles.submitFeedbackButtonDisabled
                ]}
                onPress={() => {
                  if (selectedRating > 0) {
                    ratingMutation.mutate({ rating: selectedRating, feedback: ratingFeedback });
                  }
                }}
                disabled={selectedRating === 0 || ratingMutation.isPending}
              >
                {ratingMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitFeedbackText}>
                    {existingRating ? 'Update Rating' : 'Submit Rating'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showHelpModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowHelpModal(false)}
      >
        <View style={[styles.detailModalOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={[styles.helpModalContent, { backgroundColor: themeColors.modalBackground }]}>
            <View style={[styles.detailHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.detailTitle, { color: themeColors.text }]}>Help</Text>
              <TouchableOpacity onPress={() => setShowHelpModal(false)}>
                <XIcon size={24} color={themeColors.iconDefault} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.helpBody}>
              <Text style={[styles.helpSectionLabel, { color: themeColors.textSecondary }]}>ADMIN CONTACTS</Text>

              {isLoadingContacts ? (
                <View style={styles.helpLoadingContainer}>
                  <ActivityIndicator size="small" color="#3b82f6" />
                  <Text style={[styles.helpLoadingText, { color: themeColors.textSecondary }]}>Loading contacts...</Text>
                </View>
              ) : supportContacts.length === 0 ? (
                <View style={styles.helpEmptyContainer}>
                  <Text style={[styles.helpEmptyText, { color: themeColors.textLight }]}>No admin contacts available yet</Text>
                </View>
              ) : (
                <View style={helpGridColumns > 1 ? styles.helpContactGrid : undefined}>
                {supportContacts.map((contact) => (
                  (() => {
                    const phone = contact.phone ?? null;
                    const email = contact.email ?? null;
                    return (
                      <View
                        key={contact.id}
                        style={[
                          styles.helpContactCard,
                          helpGridColumns > 1 && styles.helpContactCardGrid,
                          { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }
                        ]}
                      >
                        <View style={styles.helpContactHeader}>
                          <View style={styles.helpCountryRow}>
                            <Globe size={12} color={themeColors.textSecondary} />
                            <Text style={[styles.helpCountryText, { color: themeColors.textSecondary }]}>
                              {formatCountryName(contact.countryCode) || contact.countryLabel}
                            </Text>
                          </View>
                          <Text style={[styles.helpContactName, { color: themeColors.text }]}>{contact.name}</Text>
                        </View>

                        <View style={styles.helpContactDetails}>
                          {phone ? (
                            <View style={styles.helpDetailRow}>
                              <Text style={[styles.helpDetailText, { color: themeColors.text }]}>{formatHelpPhone(phone)}</Text>
                              <TouchableOpacity
                                style={[styles.helpMiniButton, { backgroundColor: isDark ? '#0D3320' : '#ECFDF5' }]}
                                onPress={() => void openWhatsApp(phone)}
                              >
                                <Phone size={14} color="#10b981" />
                                <Text style={[styles.helpMiniButtonText, { color: '#10b981' }]}>WhatsApp</Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}
                          {email ? (
                            <View style={styles.helpDetailRow}>
                              <Text style={[styles.helpDetailText, { color: themeColors.text }]} numberOfLines={1}>
                                {email}
                              </Text>
                              <TouchableOpacity
                                style={[styles.helpMiniButton, { backgroundColor: isDark ? '#1E3A5F' : '#EFF6FF' }]}
                                onPress={() => void openEmail(email)}
                              >
                                <Mail size={14} color="#3b82f6" />
                                <Text style={[styles.helpMiniButtonText, { color: '#3b82f6' }]}>Email</Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  })()
                ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showChatReportModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowChatReportModal(false)}
      >
        <View style={[styles.detailModalOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={[styles.detailModalContent, { backgroundColor: themeColors.modalBackground }]}>
            <View style={[styles.detailHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.detailTitle, { color: themeColors.text }]}>Report Chat Abuse</Text>
              <TouchableOpacity onPress={() => setShowChatReportModal(false)}>
                <XIcon size={24} color={themeColors.iconDefault} />
              </TouchableOpacity>
            </View>

            <View style={styles.reportTabBar}>
              {[
                { key: "complaint", label: "Make Complaint" },
                { key: "feedback", label: "Feedback" },
              ].map((tab) => {
                const active = chatReportTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[styles.reportTabButton, active && styles.reportTabButtonActive]}
                    onPress={() => setChatReportTab(tab.key as ChatReportTab)}
                  >
                    <Text style={[styles.reportTabText, active && styles.reportTabTextActive]}>{tab.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {chatReportTab === "complaint" ? (
              <ScrollView style={styles.feedbackForm}>
                <Text style={[styles.feedbackLabel, { color: themeColors.text }]}>Offence type</Text>
                <View style={styles.categoryGrid}>
                  {[
                    { key: "abuse", label: "Abusive" },
                    { key: "hate", label: "Hateful" },
                    { key: "disrespect", label: "Disrespectful" },
                    { key: "divisive", label: "Divisive" },
                    { key: "sectarian", label: "Sectarian" },
                    { key: "pornographic", label: "Pornographic" },
                    { key: "spam", label: "Spam" },
                    { key: "other", label: "Other" },
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.key}
                      style={[
                        styles.categoryButton,
                        chatReportReason === item.key && styles.categoryButtonActive,
                      ]}
                      onPress={() => setChatReportReason(item.key as any)}
                    >
                      <Text style={[
                        styles.categoryButtonText,
                        chatReportReason === item.key && styles.categoryButtonTextActive,
                      ]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.feedbackLabel, { color: themeColors.text }]}>Brief description</Text>
                <TextInput
                  style={[styles.feedbackInput, styles.feedbackTextArea, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  value={chatReportDescription}
                  onChangeText={setChatReportDescription}
                  placeholder="Explain what happened and why it should be reviewed."
                  placeholderTextColor={themeColors.textLight}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                />

                <TouchableOpacity
                  style={[styles.attachButton, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder }]}
                  onPress={pickChatReportScreenshot}
                >
                  <Paperclip size={20} color="#dc2626" />
                  <Text style={styles.attachButtonText}>
                    {chatReportScreenshot ? "Change Screenshot" : "Attach Screenshot"}
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.feedbackHintText, { color: themeColors.textSecondary }]}>
                  Please attach a screenshot that clearly shows the user name, date, and offensive content.
                </Text>

                {chatReportScreenshot ? (
                  <View style={styles.attachmentPreview}>
                    <Text style={styles.attachmentText}>{chatReportScreenshot.fileName || "Screenshot attached"}</Text>
                    <TouchableOpacity onPress={() => setChatReportScreenshot(null)}>
                      <XIcon size={18} color="#666" />
                    </TouchableOpacity>
                  </View>
                ) : null}

                <View style={styles.feedbackActions}>
                  <TouchableOpacity
                    style={[styles.cancelFeedbackButton, { backgroundColor: themeColors.inputBackground }]}
                    onPress={() => setShowChatReportModal(false)}
                  >
                    <Text style={[styles.cancelFeedbackText, { color: themeColors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitFeedbackButton, (!chatReportDescription.trim() || chatReportMutation.isPending) && styles.submitFeedbackButtonDisabled]}
                    disabled={!chatReportDescription.trim() || chatReportMutation.isPending}
                    onPress={() => chatReportMutation.mutate()}
                  >
                    <Text style={styles.submitFeedbackText}>
                      {chatReportMutation.isPending ? "Submitting..." : "Submit Report"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              <ScrollView style={styles.feedbackForm} horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chatFeedbackTable}>
                  <View style={[styles.chatFeedbackRow, styles.chatFeedbackHeader]}>
                    <View style={[styles.chatFeedbackCell, { width: 95 }]}><Text style={styles.chatFeedbackHeaderText}>Date</Text></View>
                    <View style={[styles.chatFeedbackCell, { width: 110 }]}><Text style={styles.chatFeedbackHeaderText}>Type</Text></View>
                    <View style={[styles.chatFeedbackCell, { width: 115 }]}><Text style={styles.chatFeedbackHeaderText}>Status</Text></View>
                    <View style={[styles.chatFeedbackCell, { width: 220 }]}><Text style={styles.chatFeedbackHeaderText}>Complaint</Text></View>
                    <View style={[styles.chatFeedbackCell, { width: 240 }]}><Text style={styles.chatFeedbackHeaderText}>Admin Feedback</Text></View>
                  </View>
                  {isLoadingMyChatReports ? (
                    <View style={styles.chatFeedbackEmpty}>
                      <Text style={[styles.chatFeedbackText, { color: themeColors.textSecondary }]}>Loading feedback...</Text>
                    </View>
                  ) : myChatReportsError ? (
                    <View style={styles.chatFeedbackEmpty}>
                      <Text style={styles.chatFeedbackError}>Could not load feedback.</Text>
                    </View>
                  ) : (myChatReports as any[]).length === 0 ? (
                    <View style={styles.chatFeedbackEmpty}>
                      <Text style={[styles.chatFeedbackText, { color: themeColors.textSecondary }]}>No chat report feedback yet.</Text>
                    </View>
                  ) : (
                    (myChatReports as any[]).map((report) => (
                      <View key={report.reportId} style={styles.chatFeedbackRow}>
                        <View style={[styles.chatFeedbackCell, { width: 95 }]}><Text style={styles.chatFeedbackText}>{formatSettingsDate(report.createdAt)}</Text></View>
                        <View style={[styles.chatFeedbackCell, { width: 110 }]}><Text style={styles.chatFeedbackText}>{report.reasonCategory}</Text></View>
                        <View style={[styles.chatFeedbackCell, { width: 115 }]}><Text style={[styles.chatFeedbackText, styles.chatFeedbackStatus]}>{report.status}</Text></View>
                        <View style={[styles.chatFeedbackCell, { width: 220 }]}><Text style={styles.chatFeedbackText} numberOfLines={4}>{report.description}</Text></View>
                        <View style={[styles.chatFeedbackCell, { width: 240 }]}>
                          <Text style={styles.chatFeedbackText} numberOfLines={4}>
                            {report.adminNotes || (report.status === "pending" ? "Awaiting admin review." : "Reviewed. No note added.")}
                          </Text>
                          {report.reviewedAt ? <Text style={styles.chatFeedbackMuted}>Reviewed {formatSettingsDate(report.reviewedAt)}</Text> : null}
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showServiceTeamModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowServiceTeamModal(false)}
      >
        <View style={[styles.detailModalOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={[styles.helpModalContent, { backgroundColor: themeColors.modalBackground }]}>
            <View style={[styles.detailHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.detailTitle, { color: themeColors.text }]}>Join Service Team</Text>
              <TouchableOpacity onPress={() => setShowServiceTeamModal(false)}>
                <XIcon size={24} color={themeColors.iconDefault} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.helpBody}>
              <Text style={[styles.helpSectionLabel, { color: themeColors.textSecondary }]}>
                {(serviceTeamData?.countryName || serviceCountryName).toUpperCase()}
              </Text>
              <Text style={[styles.serviceIntroText, { color: themeColors.textSecondary }]}>
                {serviceTeamData?.isMinorApplicant
                  ? "Users under 18 may apply only for the Junior Runners Club Coordinator role when it is vacant. Other service roles require you to be 18 or older."
                  : "Take up a role or opportunity in the community. Roles are shown by country and update from the live RunNation role assignments."}
              </Text>

              {isLoadingServiceProfile || isLoadingServiceRoles ? (
                <View style={styles.helpLoadingContainer}>
                  <ActivityIndicator size="small" color="#f97316" />
                  <Text style={[styles.helpLoadingText, { color: themeColors.textSecondary }]}>Checking service roles...</Text>
                </View>
              ) : !serviceCountryCode ? (
                <View style={styles.helpEmptyContainer}>
                  <Text style={[styles.helpEmptyText, { color: themeColors.textLight }]}>
                    Add your country in your profile to see local service team opportunities.
                  </Text>
                </View>
              ) : serviceTeamError ? (
                <View style={styles.helpEmptyContainer}>
                  <Text style={[styles.helpEmptyText, { color: themeColors.textLight }]}>
                    Could not load service roles right now.
                  </Text>
                </View>
              ) : serviceTeamData?.existingRole ? (
                <View style={[styles.serviceRoleCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
                  <View style={styles.serviceRoleHeader}>
                    <Text style={[styles.serviceRoleTitle, { color: themeColors.text }]}>Role already active</Text>
                    <View style={[styles.serviceStatusPill, styles.serviceStatusFilled]}>
                      <Text style={[styles.serviceStatusText, styles.serviceStatusTextFilled]}>Active</Text>
                    </View>
                  </View>
                  <Text style={[styles.serviceRoleDescription, { color: themeColors.textSecondary }]}>
                    You already have a role: {serviceTeamData.existingRole.roleLabel} in {serviceTeamData.existingRole.countryName || serviceTeamData.existingRole.countryCode || serviceCountryName}.
                  </Text>
                </View>
              ) : (
                <View style={styles.serviceTableSection}>
                  <View style={styles.serviceGroupToggle}>
                    {[
                      { key: "grouped", label: "Group by availability" },
                      { key: "flat", label: "All roles" },
                    ].map((option) => (
                      <TouchableOpacity
                        key={option.key}
                        style={[
                          styles.serviceGroupToggleButton,
                          serviceRoleAvailabilityGrouping === option.key && styles.serviceGroupToggleButtonActive,
                        ]}
                        onPress={() => setServiceRoleAvailabilityGrouping(option.key as ServiceRoleAvailabilityGrouping)}
                      >
                        <Text
                          style={[
                            styles.serviceGroupToggleText,
                            serviceRoleAvailabilityGrouping === option.key && styles.serviceGroupToggleTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {serviceRoleGroups.map((group) => (
                    <View key={group.title} style={styles.serviceTableGroup}>
                      <Text style={[styles.serviceTableGroupTitle, { color: themeColors.textSecondary }]}>
                        {group.title.toUpperCase()} ({group.roles.length})
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={[styles.serviceRoleTable, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
                          <View style={[styles.serviceRoleTableRow, styles.serviceRoleTableHeader, { borderBottomColor: themeColors.border }]}>
                            <Text style={[styles.serviceRoleCellHeader, styles.serviceRoleColRole, { color: themeColors.textSecondary }]}>Role</Text>
                            <Text style={[styles.serviceRoleCellHeader, styles.serviceRoleColSlots, { color: themeColors.textSecondary }]}>Slots</Text>
                            <Text style={[styles.serviceRoleCellHeader, styles.serviceRoleColStatus, { color: themeColors.textSecondary }]}>Availability</Text>
                            <Text style={[styles.serviceRoleCellHeader, styles.serviceRoleColAction, { color: themeColors.textSecondary }]}>Preview</Text>
                          </View>
                          {group.roles.map((role: any) => {
                            const available = role.status === "available";
                            const comingSoon = role.status === "coming_soon";
                            return (
                              <View
                                key={role.roleName}
                                style={[
                                  styles.serviceRoleTableRow,
                                  comingSoon && styles.serviceRoleTableRowMuted,
                                  { borderBottomColor: themeColors.border },
                                ]}
                              >
                                <Text style={[styles.serviceRoleCellText, styles.serviceRoleColRole, { color: themeColors.text }]} numberOfLines={2}>
                                  {role.label}
                                </Text>
                                <Text style={[styles.serviceRoleCellText, styles.serviceRoleColSlots, { color: themeColors.textSecondary }]}>
                                  {role.slotsUsed}/{role.slotsTotal}
                                </Text>
                                <View style={styles.serviceRoleColStatus}>
                                  <View
                                    style={[
                                      styles.serviceStatusPill,
                                      available && styles.serviceStatusAvailable,
                                      comingSoon && styles.serviceStatusSoon,
                                      role.hasPendingRequest && styles.serviceStatusSoon,
                                      role.status === "filled" && styles.serviceStatusFilled,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.serviceStatusText,
                                        available && styles.serviceStatusTextAvailable,
                                        comingSoon && styles.serviceStatusTextSoon,
                                        role.hasPendingRequest && styles.serviceStatusTextSoon,
                                        role.status === "filled" && styles.serviceStatusTextFilled,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {role.statusLabel}
                                    </Text>
                                  </View>
                                </View>
                                <View style={styles.serviceRoleColAction}>
                                  <TouchableOpacity
                                    style={styles.servicePreviewButton}
                                    onPress={() => setSelectedServiceRole(role)}
                                  >
                                    <Eye size={15} color="#fff" />
                                    <Text style={styles.servicePreviewButtonText}>Preview</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedServiceRole}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedServiceRole(null)}
      >
        <View style={[styles.detailModalOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={[styles.detailModalContent, { backgroundColor: themeColors.modalBackground }]}>
            <View style={[styles.detailHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.detailTitle, { color: themeColors.text }]}>Role Preview</Text>
              <TouchableOpacity onPress={() => setSelectedServiceRole(null)}>
                <XIcon size={24} color={themeColors.iconDefault} />
              </TouchableOpacity>
            </View>

            {selectedServiceRole ? (() => {
              const role = selectedServiceRole;
              const available = role.status === "available";
              const roleAllowsApplicantLinks = getServiceRoleAllowsApplicantLinks(role.roleName);
              const applicantStatement = serviceApplicantStatements[role.roleName] || "";
              const contactConsent = serviceContactConsents[role.roleName] === true;
              const contactInstructions = serviceContactInstructions[role.roleName] || "";
              const needsProposedProfile = role.roleName === "club_coordinator" || role.roleName === "event_organizer";
              const proposedName = serviceProposedNames[role.roleName] || "";
              const proposedLocation = serviceProposedLocations[role.roleName] || "";
              const proposedDescription = serviceProposedDescriptions[role.roleName] || "";

              return (
                <ScrollView style={styles.servicePreviewBody}>
                  <View style={styles.servicePreviewTitleRow}>
                    <Text style={[styles.servicePreviewTitle, { color: themeColors.text }]}>{role.label}</Text>
                    <View
                                    style={[
                                      styles.serviceStatusPill,
                                      available && styles.serviceStatusAvailable,
                                      role.status === "coming_soon" && styles.serviceStatusSoon,
                                      role.hasPendingRequest && styles.serviceStatusSoon,
                                      role.status === "filled" && styles.serviceStatusFilled,
                      ]}
                    >
                      <Text
                        style={[
                                        styles.serviceStatusText,
                                        available && styles.serviceStatusTextAvailable,
                                        role.status === "coming_soon" && styles.serviceStatusTextSoon,
                                        role.hasPendingRequest && styles.serviceStatusTextSoon,
                                        role.status === "filled" && styles.serviceStatusTextFilled,
                        ]}
                      >
                        {role.statusLabel}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.serviceRoleDescription, { color: themeColors.textSecondary }]}>
                    {role.description}
                  </Text>

                  {needsProposedProfile && role.available ? (
                    <View style={styles.serviceApplicantLinks}>
                      <Text style={[styles.serviceActivitiesTitle, { color: themeColors.text }]}>
                        {role.roleName === "club_coordinator" ? "Club Details" : "Organizer Details"}
                      </Text>
                      <TextInput
                        style={[styles.serviceLinkInput, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                        value={proposedName}
                        onChangeText={(text) => setServiceProposedNames((current) => ({ ...current, [role.roleName]: text }))}
                        placeholder={role.roleName === "club_coordinator" ? "Club name" : "Organizer profile name"}
                        placeholderTextColor={themeColors.textLight}
                        autoCapitalize="words"
                      />
                      <TextInput
                        style={[styles.serviceLinkInput, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                        value={proposedLocation}
                        onChangeText={(text) => setServiceProposedLocations((current) => ({ ...current, [role.roleName]: text }))}
                        placeholder={role.roleName === "club_coordinator" ? "Club location or home town" : "Organizer base location"}
                        placeholderTextColor={themeColors.textLight}
                        autoCapitalize="words"
                      />
                      <TextInput
                        style={[
                          styles.serviceStatementInput,
                          { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text },
                        ]}
                        value={proposedDescription}
                        onChangeText={(text) => setServiceProposedDescriptions((current) => ({ ...current, [role.roleName]: text }))}
                        placeholder={role.roleName === "club_coordinator" ? "Brief club description, target runners, meeting plan, or community need." : "Brief organizer description, event focus, experience, or planned event type."}
                        placeholderTextColor={themeColors.textLight}
                        multiline
                        textAlignVertical="top"
                      />
                    </View>
                  ) : null}

                  {role.activities.length > 0 ? (
                    <View style={styles.serviceActivities}>
                      <Text style={[styles.serviceActivitiesTitle, { color: themeColors.text }]}>Job Details</Text>
                      {role.activities.map((activity: string) => (
                        <Text key={activity} style={[styles.serviceActivityText, { color: themeColors.textSecondary }]}>
                          - {activity}
                        </Text>
                      ))}
                    </View>
                  ) : null}

                  {roleAllowsApplicantLinks && role.available ? (
                    <View style={styles.serviceApplicantLinks}>
                      <Text style={[styles.serviceActivitiesTitle, { color: themeColors.text }]}>Applicant Links (optional)</Text>
                      <Text style={[styles.serviceRoleDescription, { color: themeColors.textSecondary }]}>
                        {SERVICE_APPLICANT_LINKS_HELPER}
                      </Text>
                      <TextInput
                        style={[styles.serviceLinkInput, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                        value={serviceWebsiteUrl}
                        onChangeText={setServiceWebsiteUrl}
                        placeholder=""
                        placeholderTextColor={themeColors.textLight}
                        autoCapitalize="none"
                        keyboardType="url"
                      />
                      <TextInput
                        style={[styles.serviceLinkInput, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                        value={serviceLinkedinUrl}
                        onChangeText={setServiceLinkedinUrl}
                        placeholder=""
                        placeholderTextColor={themeColors.textLight}
                        autoCapitalize="none"
                        keyboardType="url"
                      />
                      <TextInput
                        style={[styles.serviceLinkInput, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                        value={serviceSocialUrl}
                        onChangeText={setServiceSocialUrl}
                        placeholder=""
                        placeholderTextColor={themeColors.textLight}
                        autoCapitalize="none"
                        keyboardType="url"
                      />
                    </View>
                  ) : null}

                  {role.available ? (
                    <View style={styles.serviceApplicantLinks}>
                      <Text style={[styles.serviceActivitiesTitle, { color: themeColors.text }]}>Why Consider You? (optional)</Text>
                      <Text style={[styles.serviceRoleDescription, { color: themeColors.textSecondary }]}>
                        {SERVICE_APPLICANT_STATEMENT_HELPER}
                      </Text>
                      <TextInput
                        style={[
                          styles.serviceStatementInput,
                          { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text },
                        ]}
                        value={applicantStatement}
                        onChangeText={(text) => setServiceApplicantStatements((current) => ({ ...current, [role.roleName]: text }))}
                        placeholder="Briefly share your experience, motivation, availability, or community contribution."
                        placeholderTextColor={themeColors.textLight}
                        multiline
                        textAlignVertical="top"
                      />
                      <Text style={[styles.serviceWordCountText, { color: themeColors.textSecondary }]}>
                        {countWords(applicantStatement)} / 25-250 words
                      </Text>
                    </View>
                  ) : null}

                  {role.available ? (
                    <View style={styles.serviceApplicantLinks}>
                      <TouchableOpacity
                        style={styles.serviceCheckboxRow}
                        activeOpacity={0.85}
                        onPress={() => setServiceContactConsents((current) => ({ ...current, [role.roleName]: !contactConsent }))}
                      >
                        <View style={[styles.serviceCheckboxBox, contactConsent && styles.serviceCheckboxBoxChecked]}>
                          {contactConsent ? <Check size={13} color="#fff" /> : null}
                        </View>
                        <Text style={[styles.serviceCheckboxText, { color: themeColors.text }]}>
                          I want to be contacted if I am selected for this role.
                        </Text>
                      </TouchableOpacity>
                      {contactConsent ? (
                        <TextInput
                          style={[styles.serviceLinkInput, { backgroundColor: themeColors.inputBackground, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                          value={contactInstructions}
                          onChangeText={(text) => setServiceContactInstructions((current) => ({ ...current, [role.roleName]: text }))}
                          placeholder="e.g. WhatsApp me on +25612356774"
                          placeholderTextColor={themeColors.textLight}
                          autoCapitalize="sentences"
                        />
                      ) : null}
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.serviceTakeRoleButton,
                      (!role.available || requestServiceRoleMutation.isPending) && styles.serviceTakeRoleButtonDisabled,
                    ]}
                    disabled={!role.available || requestServiceRoleMutation.isPending}
                    onPress={() => submitServiceRoleRequest(role)}
                  >
                    {requestServiceRoleMutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.serviceTakeRoleText}>
                        {role.hasPendingRequest
                          ? "Pending Approval"
                          : role.available
                            ? getServiceRoleButtonLabel(role.roleName, serviceTeamData?.countryName || serviceCountryName)
                            : "Not available"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              );
            })() : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showFaqModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFaqModal(false)}
      >
        <View style={[styles.detailModalOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={[styles.helpModalContent, { backgroundColor: themeColors.modalBackground }]}>
            <View style={[styles.detailHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.detailTitle, { color: themeColors.text }]}>FAQ</Text>
              <TouchableOpacity onPress={() => setShowFaqModal(false)}>
                <XIcon size={24} color={themeColors.iconDefault} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.helpBody}>
              <Text style={[styles.helpSectionLabel, { color: themeColors.textSecondary }]}>COMMON QUESTIONS</Text>

              {isLoadingFaqs ? (
                <View style={styles.helpLoadingContainer}>
                  <ActivityIndicator size="small" color="#3b82f6" />
                  <Text style={[styles.helpLoadingText, { color: themeColors.textSecondary }]}>Loading FAQs...</Text>
                </View>
              ) : faqError ? (
                <View style={styles.helpEmptyContainer}>
                  <Text style={[styles.helpEmptyText, { color: themeColors.textLight }]}>
                    Could not load FAQ entries right now.
                  </Text>
                </View>
              ) : displayedFaqEntries.length === 0 ? (
                <View style={styles.helpEmptyContainer}>
                  <Text style={[styles.helpEmptyText, { color: themeColors.textLight }]}>No FAQ entries available</Text>
                </View>
              ) : (
                displayedFaqEntries.map((faq: any) => {
                  const expanded = expandedFaqIds.includes(String(faq.faq_id));
                  return (
                    <TouchableOpacity
                      key={faq.faq_id}
                      activeOpacity={0.85}
                      onPress={() => toggleFaq(String(faq.faq_id))}
                      style={[styles.faqCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}
                    >
                      <View style={styles.faqHeader}>
                        <Text style={[styles.faqQuestion, { color: themeColors.text }]}>{faq.question}</Text>
                        <ChevronRight
                          size={18}
                          color={themeColors.iconMuted}
                          style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
                        />
                      </View>
                      {expanded ? (
                        <Text style={[styles.faqAnswer, { color: themeColors.textSecondary }]}>{faq.answer}</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollContent: {
    paddingBottom: 72,
  },
  safeScroll: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#666",
    textTransform: "uppercase",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  settingItemDisabled: {
    opacity: 0.55,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
  },
  settingTextContainer: {
    flex: 1,
    gap: 2,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#000",
  },
  settingSubtitle: {
    fontSize: 13,
    color: "#666",
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#ef4444",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#fff",
  },
  footer: {
    alignItems: "center",
    padding: 32,
    gap: 8,
  },
  footerText: {
    fontSize: 13,
    color: "#999",
  },
  footerSubtext: {
    fontSize: 12,
    color: "#bbb",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  modalHeader2: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    padding: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  modalTitle2: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: "#000",
  },
  pendingList: {
    flex: 1,
  },
  emptyState: {
    padding: 40,
    alignItems: "center" as const,
  },
  emptyStateText: {
    fontSize: 16,
    color: "#999",
  },
  pendingItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: "#fff",
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  pendingInfo: {
    flex: 1,
    gap: 4,
  },
  pendingType: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#000",
  },
  pendingDate: {
    fontSize: 14,
    color: "#666",
  },
  pendingStats: {
    flexDirection: "row" as const,
    gap: 16,
    marginTop: 4,
  },
  pendingStat: {
    fontSize: 13,
    color: "#10b981",
    fontWeight: "600" as const,
  },
  detailModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end" as const,
  },
  detailModalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  detailHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  detailTitle: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: "#000",
  },
  detailBody: {
    padding: 20,
  },
  detailSection: {
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: "row" as const,
    gap: 20,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#666",
    marginBottom: 6,
  },
  detailValue: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: "#000",
  },
  activityImage: {
    width: "100%",
    height: 300,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
  },
  actionButtons: {
    flexDirection: "row" as const,
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  rejectButton: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: "#ef4444",
    padding: 16,
    borderRadius: 12,
  },
  approveButton: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: "#10b981",
    padding: 16,
    borderRadius: 12,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#fff",
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
  },
  radioButtonActive: {
    borderColor: "#10b981",
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#10b981",
  },
  unitTogglePill: {
    minWidth: 48,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: "center" as const,
  },
  unitToggleText: {
    fontSize: 13,
    fontWeight: "900" as const,
    textTransform: "uppercase" as const,
  },
  iconContainerActive: {
    backgroundColor: "#f97316",
  },
  feedbackBody: {
    padding: 20,
    gap: 16,
  },
  donationScroll: {
    maxHeight: 520,
  },
  donationBody: {
    padding: 20,
    gap: 16,
  },
  donationCaption: {
    fontSize: 15,
    lineHeight: 22,
  },
  donationFieldGroup: {
    gap: 8,
  },
  donationMethodGrid: {
    flexDirection: "row" as const,
    gap: 10,
    flexWrap: "wrap" as const,
  },
  donationMethodButton: {
    flexGrow: 1,
    flexBasis: 150,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  donationMethodButtonActive: {
    borderColor: "#ef4444",
    backgroundColor: "#fef2f2",
  },
  donationMethodLabel: {
    fontSize: 15,
    fontWeight: "800" as const,
  },
  donationMethodCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
  donationHint: {
    fontSize: 12,
    lineHeight: 16,
  },
  donationSubmitButton: {
    backgroundColor: "#ef4444",
  },
  feedbackCategoryRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  feedbackForm: {
    padding: 20,
  },
  reportTabBar: {
    flexDirection: "row" as const,
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  reportTabButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "#f3f4f6",
  },
  reportTabButtonActive: {
    backgroundColor: "#111827",
  },
  reportTabText: {
    fontSize: 13,
    fontWeight: "800" as const,
    color: "#6b7280",
  },
  reportTabTextActive: {
    color: "#fff",
  },
  chatFeedbackTable: {
    minWidth: 780,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    overflow: "hidden" as const,
  },
  chatFeedbackRow: {
    flexDirection: "row" as const,
    minHeight: 46,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  chatFeedbackHeader: {
    minHeight: 34,
    backgroundColor: "#f9fafb",
  },
  chatFeedbackCell: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    justifyContent: "center" as const,
    borderRightWidth: 1,
    borderRightColor: "#f3f4f6",
  },
  chatFeedbackHeaderText: {
    fontSize: 10,
    fontWeight: "900" as const,
    color: "#4b5563",
    textTransform: "uppercase" as const,
  },
  chatFeedbackText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#111827",
  },
  chatFeedbackStatus: {
    fontWeight: "800" as const,
    color: "#d97706",
  },
  chatFeedbackMuted: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 13,
    color: "#6b7280",
  },
  chatFeedbackError: {
    fontSize: 12,
    color: "#dc2626",
    fontWeight: "800" as const,
  },
  chatFeedbackEmpty: {
    minHeight: 72,
    justifyContent: "center" as const,
    paddingHorizontal: 12,
  },
  categoryGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    marginBottom: 16,
  },
  categoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#f5f5f5",
  },
  categoryButtonActive: {
    backgroundColor: "#fee2e2",
  },
  categoryButtonText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#666",
  },
  categoryButtonTextActive: {
    color: "#dc2626",
  },
  feedbackCategoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
  },
  feedbackCategoryChipActive: {
    backgroundColor: "#dbeafe",
  },
  feedbackCategoryChipText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#4b5563",
  },
  feedbackCategoryChipTextActive: {
    color: "#1d4ed8",
  },
  feedbackLabel: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#000",
  },
  feedbackHintText: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: -4,
    marginBottom: 8,
  },
  feedbackInput: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#000",
    minHeight: 120,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  feedbackTextArea: {
    minHeight: 120,
    textAlignVertical: "top" as const,
  },
  input: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#000",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  characterCount: {
    fontSize: 13,
    color: "#999",
    textAlign: "right" as const,
    marginTop: -8,
  },
  attachButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  attachButtonText: {
    fontSize: 15,
    color: "#3b82f6",
    fontWeight: "500" as const,
  },
  attachmentPreview: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: 12,
    backgroundColor: "#e0f2fe",
    borderRadius: 8,
  },
  attachmentText: {
    fontSize: 14,
    color: "#0369a1",
    flex: 1,
  },
  feedbackActions: {
    flexDirection: "row" as const,
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  cancelFeedbackButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    alignItems: "center" as const,
  },
  cancelFeedbackText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#666",
  },
  submitFeedbackButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#3b82f6",
    alignItems: "center" as const,
  },
  submitFeedbackButtonDisabled: {
    backgroundColor: "#cbd5e1",
  },
  submitFeedbackText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#fff",
  },
  pinModalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 20,
  },
  pinModalBody: {
    padding: 24,
    alignItems: "center" as const,
    gap: 16,
  },
  pinLockIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fef2f2",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 4,
  },
  pinModalSubtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center" as const,
  },
  pinDotsRow: {
    flexDirection: "row" as const,
    gap: 16,
    marginTop: 8,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#ccc",
    backgroundColor: "transparent",
  },
  pinDotFilled: {
    backgroundColor: "#ef4444",
    borderColor: "#ef4444",
  },
  pinDotError: {
    borderColor: "#ef4444",
  },
  hiddenPinInput: {
    position: "absolute" as const,
    opacity: 0,
    height: 0,
    width: 0,
  },
  pinErrorText: {
    fontSize: 14,
    color: "#ef4444",
    fontWeight: "500" as const,
  },
  signOutConfirmButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#ef4444",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  deleteAccountButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 12,
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#dc2626",
  },
  deleteAccountText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#dc2626",
  },
  deleteWarningBody: {
    padding: 24,
    alignItems: "center" as const,
    gap: 12,
  },
  deleteWarningIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fef2f2",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 4,
  },
  deleteWarningTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#dc2626",
  },
  deleteWarningText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center" as const,
    lineHeight: 20,
  },
  deleteConfirmStepButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#dc2626",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  deleteConfirmButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#dc2626",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  deleteLockIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fef2f2",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 4,
  },
  deletePinDotFilled: {
    backgroundColor: "#dc2626",
    borderColor: "#dc2626",
  },
  ratingModalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 20,
  },
  ratingBody: {
    padding: 24,
    gap: 24,
  },
  ratingStarsContainer: {
    alignItems: "center" as const,
    gap: 12,
  },
  ratingPrompt: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#333",
    textAlign: "center" as const,
  },
  starsRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginTop: 8,
  },
  starButton: {
    padding: 4,
  },
  ratingLabel: {
    fontSize: 15,
    fontWeight: "500" as const,
    color: "#999",
    marginTop: 4,
  },
  ratingLabelActive: {
    color: "#f59e0b",
    fontWeight: "600" as const,
  },
  ratingFeedbackSection: {
    gap: 8,
  },
  ratingFeedbackInput: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#000",
    minHeight: 80,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  submitRatingButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#f59e0b",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  subscriptionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
  },
  subscriptionBadgeActive: {
    backgroundColor: "#D1FAE5",
  },
  subscriptionBadgeTrial: {
    backgroundColor: "#FFF8E7",
  },
  subscriptionBadgePending: {
    backgroundColor: "#FFF3E0",
  },
  subscriptionBadgeExpired: {
    backgroundColor: "#FEE2E2",
  },
  subscriptionBadgeText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#333",
    letterSpacing: 0.5,
  },
  helpModalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
  },
  helpBody: {
    padding: 20,
  },
  helpSectionLabel: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#666",
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  helpLoadingContainer: {
    alignItems: "center" as const,
    paddingVertical: 40,
    gap: 12,
  },
  helpLoadingText: {
    fontSize: 14,
    color: "#999",
  },
  helpEmptyContainer: {
    alignItems: "center" as const,
    paddingVertical: 40,
  },
  helpEmptyText: {
    fontSize: 15,
    color: "#999",
  },
  helpContactGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  helpContactCard: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  helpContactCardGrid: {
    width: "48.8%",
    marginBottom: 0,
  },
  helpContactHeader: {
    marginBottom: 8,
    gap: 2,
  },
  helpCountryRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  helpCountryText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: "#666",
  },
  helpContactName: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#000",
    marginTop: 1,
  },
  helpContactDetails: {
    gap: 6,
  },
  helpDetailRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  helpDetailText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500" as const,
  },
  helpMiniButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  helpMiniButtonText: {
    fontSize: 11,
    fontWeight: "700" as const,
  },
  helpContactActions: {
    gap: 8,
  },
  helpActionButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  helpActionText: {
    fontSize: 14,
    fontWeight: "500" as const,
  },
  serviceIntroText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  serviceTableSection: {
    gap: 12,
    paddingBottom: 12,
  },
  serviceGroupToggle: {
    flexDirection: "row" as const,
    gap: 8,
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 4,
  },
  serviceGroupToggleButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 8,
  },
  serviceGroupToggleButtonActive: {
    backgroundColor: "#111827",
  },
  serviceGroupToggleText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: "#6b7280",
    textAlign: "center" as const,
  },
  serviceGroupToggleTextActive: {
    color: "#fff",
  },
  serviceTableGroup: {
    gap: 7,
  },
  serviceTableGroupTitle: {
    fontSize: 11,
    fontWeight: "900" as const,
    letterSpacing: 0.3,
  },
  serviceRoleTable: {
    minWidth: 640,
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden" as const,
  },
  serviceRoleTableRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    minHeight: 44,
    borderBottomWidth: 1,
  },
  serviceRoleTableRowMuted: {
    opacity: 0.55,
  },
  serviceRoleTableHeader: {
    minHeight: 32,
    backgroundColor: "#f9fafb",
  },
  serviceRoleCellHeader: {
    fontSize: 9,
    fontWeight: "900" as const,
    textTransform: "uppercase" as const,
    paddingHorizontal: 8,
  },
  serviceRoleCellText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700" as const,
    paddingHorizontal: 8,
  },
  serviceRoleColRole: {
    width: 260,
  },
  serviceRoleColSlots: {
    width: 70,
    textAlign: "center" as const,
  },
  serviceRoleColStatus: {
    width: 180,
    alignItems: "flex-start" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 8,
  },
  serviceRoleColAction: {
    width: 120,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  servicePreviewButton: {
    minHeight: 30,
    borderRadius: 7,
    paddingHorizontal: 10,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 5,
    backgroundColor: "#2563eb",
  },
  servicePreviewButtonText: {
    fontSize: 11,
    fontWeight: "900" as const,
    color: "#fff",
  },
  servicePreviewBody: {
    padding: 20,
    maxHeight: 620,
  },
  servicePreviewTitleRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    justifyContent: "space-between" as const,
    gap: 10,
    marginBottom: 10,
  },
  servicePreviewTitle: {
    flex: 1,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "800" as const,
  },
  serviceRoleCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  serviceRoleHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 10,
    marginBottom: 8,
  },
  serviceRoleTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700" as const,
  },
  serviceRoleDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  serviceActivities: {
    marginTop: 10,
    gap: 4,
  },
  serviceActivitiesTitle: {
    fontSize: 12,
    fontWeight: "800" as const,
    textTransform: "uppercase" as const,
  },
  serviceActivityText: {
    fontSize: 13,
    lineHeight: 18,
  },
  serviceApplicantLinks: {
    marginTop: 12,
    gap: 8,
  },
  serviceLinkInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  serviceStatementInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 104,
    lineHeight: 19,
  },
  serviceWordCountText: {
    fontSize: 11,
    fontWeight: "700" as const,
    textAlign: "right" as const,
  },
  serviceCheckboxRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  serviceCheckboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#f97316",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  serviceCheckboxBoxChecked: {
    backgroundColor: "#f97316",
  },
  serviceCheckboxText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700" as const,
    lineHeight: 18,
  },
  serviceTakeRoleButton: {
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center" as const,
    backgroundColor: "#f97316",
  },
  serviceTakeRoleButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  serviceTakeRoleText: {
    fontSize: 14,
    fontWeight: "800" as const,
    color: "#fff",
  },
  serviceStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#F3F4F6",
  },
  serviceStatusAvailable: {
    backgroundColor: "#D1FAE5",
  },
  serviceStatusSoon: {
    backgroundColor: "#FFF7ED",
  },
  serviceStatusFilled: {
    backgroundColor: "#FEE2E2",
  },
  serviceStatusText: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: "#6B7280",
  },
  serviceStatusTextAvailable: {
    color: "#047857",
  },
  serviceStatusTextSoon: {
    color: "#f97316",
  },
  serviceStatusTextFilled: {
    color: "#dc2626",
  },
  faqCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  faqHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 10,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700" as const,
  },
  faqAnswer: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
  },
});
