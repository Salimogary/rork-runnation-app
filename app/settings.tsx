import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, Platform, Modal, TextInput, ActivityIndicator, Share, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, Bell, MapPin, Moon, Sun, Mail, FileText, ChevronRight, X as XIcon, MessageSquare, Paperclip, EyeOff, Lock, Trash2, AlertTriangle, Star, Share2, Crown, HelpCircle, Phone, Globe, Volume2, VolumeX } from "lucide-react-native";
import { Linking } from "react-native";
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTheme } from '@/contexts/ThemeContext';

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { useState, useEffect, useRef, useCallback } from "react";
import * as Haptics from "expo-haptics";
import { getNotificationsEnabled, setNotificationsEnabled as saveNotificationsEnabled } from "@/utils/notifications";
import { getServerClient } from "@/lib/server-client";
import { formatCountryName } from "@/constants/country-utils";
import { getActivityVoiceAssistantEnabled, setActivityVoiceAssistantEnabled as saveActivityVoiceAssistantEnabled } from "@/utils/activityVoice";

export default function SettingsScreen() {
  const { signOut, user, roleSession, privateMode, setPrivateMode, verifyPin, deleteAccount } = useAuth();
  const router = useRouter();
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
  const [showPinModal, setShowPinModal] = useState(false);
  const [signOutPin, setSignOutPin] = useState('');
  const [signOutPinError, setSignOutPinError] = useState('');
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
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
  const [expandedFaqIds, setExpandedFaqIds] = useState<string[]>([]);
  const adminTapCount = useRef<number>(0);
  const adminTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const helpGridColumns = width >= 700 ? 2 : 1;

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

  const { data: faqEntries = [], isLoading: isLoadingFaqs } = trpc.support.getFaqEntries.useQuery(
    undefined,
    { enabled: showFaqModal }
  );


  const handleSignOut = () => {
    setShowPinModal(true);
    setSignOutPin('');
    setSignOutPinError('');
  };

  const handlePinVerifyAndSignOut = async () => {
    if (!signOutPin.trim()) {
      setSignOutPinError('Enter your password');
      return;
    }
    setIsVerifyingPin(true);
    setSignOutPinError('');
    try {
      const valid = await verifyPin(signOutPin);
      if (valid) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowPinModal(false);
        setSignOutPin('');
        await signOut();
        router.replace('/register' as any);
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setSignOutPinError('Incorrect password. Please try again.');
        setSignOutPin('');
      }
    } catch {
      setSignOutPinError('Verification failed. Try again.');
      setSignOutPin('');
    } finally {
      setIsVerifyingPin(false);
    }
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
  const APP_DOWNLOAD_LINK = '';

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
    const shareMessage = link
      ? `Check out this awesome fitness app! Download it here: ${String(link)}`
      : 'Check out this awesome fitness app! Download link coming soon.';
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

  return (
    <ScrollView style={[styles.container, { backgroundColor: themeColors.background }]}>
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
          onPress={() => setShowHelpModal(true)}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1E3A5F' : '#EFF6FF' }]}>
              <HelpCircle size={22} color="#3b82f6" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Help</Text>
              <Text style={[styles.settingSubtitle, { color: themeColors.textSecondary }]}>Support desk contacts</Text>
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

      {user && roleSession.hasAdminAccess && (
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
        visible={showPinModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPinModal(false)}
      >
        <View style={[styles.detailModalOverlay, { backgroundColor: themeColors.modalOverlay }]}>
          <View style={[styles.pinModalContent, { backgroundColor: themeColors.modalBackground }]}>
            <View style={[styles.detailHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.detailTitle, { color: themeColors.text }]}>Verify Password</Text>
              <TouchableOpacity onPress={() => {
                setShowPinModal(false);
                setSignOutPin('');
                setSignOutPinError('');
              }}>
                <XIcon size={24} color={themeColors.iconDefault} />
              </TouchableOpacity>
            </View>

            <View style={styles.pinModalBody}>
              <View style={[styles.pinLockIcon, { backgroundColor: isDark ? '#3B1515' : '#fef2f2' }]}>
                <Lock size={28} color="#ef4444" />
              </View>
              <Text style={[styles.pinModalSubtitle, { color: themeColors.textSecondary }]}>Enter your password to sign out</Text>

              <TextInput
                style={[styles.input, { width: '100%' }]}
                value={signOutPin}
                onChangeText={(text) => {
                  setSignOutPin(text);
                  if (signOutPinError) setSignOutPinError('');
                }}
                secureTextEntry
                autoFocus
                editable={!isVerifyingPin}
              />

              {!!signOutPinError && (
                <Text style={styles.pinErrorText}>{signOutPinError}</Text>
              )}
            </View>

            <View style={[styles.feedbackActions, { borderTopColor: themeColors.border }]}>
              <TouchableOpacity
                style={[styles.cancelFeedbackButton, { backgroundColor: themeColors.inputBackground }]}
                onPress={() => {
                  setShowPinModal(false);
                  setSignOutPin('');
                  setSignOutPinError('');
                }}
              >
                <Text style={[styles.cancelFeedbackText, { color: themeColors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.signOutConfirmButton,
                  (!signOutPin.trim() || isVerifyingPin) && styles.submitFeedbackButtonDisabled
                ]}
                onPress={handlePinVerifyAndSignOut}
                disabled={!signOutPin.trim() || isVerifyingPin}
              >
                {isVerifyingPin ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitFeedbackText}>Sign Out</Text>
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
              <Text style={[styles.faqHintText, { color: themeColors.textSecondary }]}>
                FAQ content is sourced from the <Text style={styles.faqHintCode}>public.faq_entries</Text> table, so you can add, edit, or remove entries in Supabase whenever you want.
              </Text>

              {isLoadingFaqs ? (
                <View style={styles.helpLoadingContainer}>
                  <ActivityIndicator size="small" color="#3b82f6" />
                  <Text style={[styles.helpLoadingText, { color: themeColors.textSecondary }]}>Loading FAQs...</Text>
                </View>
              ) : faqEntries.length === 0 ? (
                <View style={styles.helpEmptyContainer}>
                  <Text style={[styles.helpEmptyText, { color: themeColors.textLight }]}>No FAQ entries available</Text>
                </View>
              ) : (
                faqEntries.map((faq: any) => {
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
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
  iconContainerActive: {
    backgroundColor: "#f97316",
  },
  feedbackBody: {
    padding: 20,
    gap: 16,
  },
  feedbackCategoryRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
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
  faqHintText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  faqHintCode: {
    fontWeight: "700" as const,
    color: "#374151",
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
