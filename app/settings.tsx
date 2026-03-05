import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, Platform, Modal, Image, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, Bell, MapPin, Moon, Mail, FileText, ChevronRight, CheckCircle, XCircle, ClipboardList, X as XIcon, MessageSquare, Paperclip, Shield, EyeOff, Lock, Trash2, AlertTriangle } from "lucide-react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useState } from "react";
import * as Haptics from "expo-haptics";

interface PendingActivity {
  PendingActivityID: string;
  RegistrationID: string;
  Exercise_Type: string;
  Distance_Entered: number;
  Distance_Unit: string;
  Time_Entered: string;
  Photo_Path: string;
  Status: string;
  Admin_Notes: string | null;
  Created_At: string;
  Reviewed_At: string | null;
  Reviewed_By: string | null;
}

export default function SettingsScreen() {
  const { signOut, user, privateMode, setPrivateMode, verifyPin, deleteAccount } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<PendingActivity | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
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
  const IS_ADMIN = true;

  const handleSignOut = () => {
    setShowPinModal(true);
    setSignOutPin('');
    setSignOutPinError('');
  };

  const handlePinVerifyAndSignOut = async () => {
    if (signOutPin.length !== 4) {
      setSignOutPinError('Enter your 4-digit PIN');
      return;
    }
    setIsVerifyingPin(true);
    setSignOutPinError('');
    try {
      const valid = await verifyPin(signOutPin);
      if (valid) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowPinModal(false);
        setSignOutPin('');
        await signOut();
        router.replace('/(tabs)' as any);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setSignOutPinError('Incorrect PIN. Please try again.');
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

  const { data: pendingActivities = [] } = useQuery<PendingActivity[]>({
    queryKey: ["pendingActivities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_activities")
        .select("*")
        .eq("Status", "pending")
        .order("Created_At", { ascending: false });

      if (error) {
        console.error("Error fetching pending activities:", error);
        throw new Error(error.message);
      }

      return data || [];
    },
    enabled: IS_ADMIN,
  });

  const approveMutation = useMutation({
    mutationFn: async (activity: PendingActivity) => {
      const timeParts = activity.Time_Entered.split(':');
      const hours = parseInt(timeParts[0] || '0', 10);
      const minutes = parseInt(timeParts[1] || '0', 10);
      const totalMinutes = hours * 60 + minutes;
      
      let distanceKm = activity.Distance_Entered;
      if (activity.Distance_Unit === 'mi') {
        distanceKm = activity.Distance_Entered * 1.60934;
      }

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - totalMinutes * 60 * 1000);
      const calculatedPace = totalMinutes > 0 ? (distanceKm / (totalMinutes / 60)) : 0;

      const { data, error } = await supabase
        .from("activities")
        .insert({
          RegistrationID: activity.RegistrationID,
          Activity_Date: new Date().toISOString().split('T')[0],
          Exercise_Type: activity.Exercise_Type,
          Distance_km: distanceKm,
          Start_Time: startTime.toISOString().split('T')[1].split('.')[0],
          End_Time: endTime.toISOString().split('T')[1].split('.')[0],
          Pace_km_h: calculatedPace,
        })
        .select();

      if (error) throw error;

      const { error: deleteError } = await supabase
        .from("pending_activities")
        .delete()
        .eq("PendingActivityID", activity.PendingActivityID);

      if (deleteError) throw deleteError;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingActivities"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      setSelectedActivity(null);
      Alert.alert("Success", "Activity approved and added to records");
    },
    onError: (error) => {
      console.error("Error approving activity:", error);
      Alert.alert("Error", "Failed to approve activity");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (activityId: string) => {
      const { error } = await supabase
        .from("pending_activities")
        .delete()
        .eq("PendingActivityID", activityId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingActivities"] });
      setSelectedActivity(null);
      Alert.alert("Success", "Activity rejected");
    },
    onError: (error) => {
      console.error("Error rejecting activity:", error);
      Alert.alert("Error", "Failed to reject activity");
    },
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleDateString("en-US", { month: "short" });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const formatTimeInterval = (interval: string): string => {
    const parts = interval.split(':');
    const hours = parseInt(parts[0] || '0', 10);
    const minutes = parseInt(parts[1] || '0', 10);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <ScrollView style={styles.container}>
      {IS_ADMIN && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Admin</Text>
          
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => setShowApprovalModal(true)}
          >
            <View style={styles.settingLeft}>
              <View style={styles.iconContainer}>
                <ClipboardList size={22} color="#8b5cf6" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingTitle}>Pending Approvals</Text>
                <Text style={styles.settingSubtitle}>
                  {pendingActivities.length} treadmill activities pending
                </Text>
              </View>
            </View>
            <ChevronRight size={20} color="#999" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        
        <TouchableOpacity 
          style={styles.settingItem} 
          onPress={() => setNotificationsEnabled(!notificationsEnabled)}
        >
          <View style={styles.settingLeft}>
            <View style={styles.iconContainer}>
              <Bell size={22} color="#10b981" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Notifications</Text>
              <Text style={styles.settingSubtitle}>Enable push notifications</Text>
            </View>
          </View>
          <View style={[styles.radioButton, notificationsEnabled && styles.radioButtonActive]}>
            {notificationsEnabled && <View style={styles.radioButtonInner} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.settingItem} 
          onPress={() => setLocationEnabled(!locationEnabled)}
        >
          <View style={styles.settingLeft}>
            <View style={styles.iconContainer}>
              <MapPin size={22} color="#3b82f6" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Location</Text>
              <Text style={styles.settingSubtitle}>Enable location services</Text>
            </View>
          </View>
          <View style={[styles.radioButton, locationEnabled && styles.radioButtonActive]}>
            {locationEnabled && <View style={styles.radioButtonInner} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.settingItem} 
          onPress={() => setDarkModeEnabled(!darkModeEnabled)}
        >
          <View style={styles.settingLeft}>
            <View style={styles.iconContainer}>
              <Moon size={22} color="#8b5cf6" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Dark Mode</Text>
              <Text style={styles.settingSubtitle}>Enable dark theme</Text>
            </View>
          </View>
          <View style={[styles.radioButton, darkModeEnabled && styles.radioButtonActive]}>
            {darkModeEnabled && <View style={styles.radioButtonInner} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.settingItem} 
          onPress={() => setPrivateMode(!privateMode)}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, privateMode && styles.iconContainerActive]}>
              <EyeOff size={22} color={privateMode ? "#fff" : "#f97316"} />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Private Mode</Text>
              <Text style={styles.settingSubtitle}>Hide your data from public views</Text>
            </View>
          </View>
          <View style={[styles.radioButton, privateMode && styles.radioButtonActive]}>
            {privateMode && <View style={styles.radioButtonInner} />}
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => showComingSoon("Contact Admin")}
        >
          <View style={styles.settingLeft}>
            <View style={styles.iconContainer}>
              <Mail size={22} color="#f59e0b" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Contact Admin</Text>
              <Text style={styles.settingSubtitle}>Get in touch with administrators</Text>
            </View>
          </View>
          <ChevronRight size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => router.push("/policy" as any)}
        >
          <View style={styles.settingLeft}>
            <View style={styles.iconContainer}>
              <FileText size={22} color="#8b5cf6" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Policy, Terms and Conditions</Text>
              <Text style={styles.settingSubtitle}>View our policies and terms</Text>
            </View>
          </View>
          <ChevronRight size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => setShowFeedbackModal(true)}
        >
          <View style={styles.settingLeft}>
            <View style={styles.iconContainer}>
              <MessageSquare size={22} color="#3b82f6" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Send Feedback</Text>
              <Text style={styles.settingSubtitle}>Share your thoughts and suggestions</Text>
            </View>
          </View>
          <ChevronRight size={20} color="#999" />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Access</Text>
        
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => router.push("/admin-login" as any)}
        >
          <View style={styles.settingLeft}>
            <View style={styles.iconContainer}>
              <Shield size={22} color="#ef4444" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Admin Login</Text>
              <Text style={styles.settingSubtitle}>Access admin dashboard</Text>
            </View>
          </View>
          <ChevronRight size={20} color="#999" />
        </TouchableOpacity>
      </View>

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
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <TouchableOpacity
            style={styles.deleteAccountButton}
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
        <Text style={styles.footerText}>Version 1.0.0</Text>
        {user && 'username' in user && user.username && (
          <Text style={styles.footerSubtext}>Signed in as: {user.username}</Text>
        )}
      </View>

      <Modal
        visible={showApprovalModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowApprovalModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader2}>
            <Text style={styles.modalTitle2}>Pending Approvals</Text>
            <TouchableOpacity onPress={() => setShowApprovalModal(false)}>
              <XIcon size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.pendingList}>
            {pendingActivities.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No pending activities</Text>
              </View>
            ) : (
              pendingActivities.map((activity) => (
                <TouchableOpacity
                  key={activity.PendingActivityID}
                  style={styles.pendingItem}
                  onPress={() => setSelectedActivity(activity)}
                >
                  <View style={styles.pendingInfo}>
                    <Text style={styles.pendingType}>{activity.Exercise_Type}</Text>
                    <Text style={styles.pendingDate}>{formatDate(activity.Created_At)}</Text>
                    <View style={styles.pendingStats}>
                      <Text style={styles.pendingStat}>
                        {activity.Distance_Entered.toFixed(2)} {activity.Distance_Unit}
                      </Text>
                      <Text style={styles.pendingStat}>
                        {formatTimeInterval(activity.Time_Entered)}
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={20} color="#999" />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={showFeedbackModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFeedbackModal(false)}
      >
        <View style={styles.detailModalOverlay}>
          <View style={styles.detailModalContent}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Send Feedback</Text>
              <TouchableOpacity onPress={() => {
                setShowFeedbackModal(false);
                setFeedbackText("");
                setFeedbackAttachment(null);
              }}>
                <XIcon size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.feedbackBody}>
              <Text style={styles.feedbackLabel}>Your Feedback</Text>
              <TextInput
                style={styles.feedbackInput}
                placeholder="Share your thoughts, suggestions, or report issues..."
                placeholderTextColor="#999"
                multiline
                maxLength={300}
                value={feedbackText}
                onChangeText={setFeedbackText}
                textAlignVertical="top"
              />
              <Text style={styles.characterCount}>{feedbackText.length}/300</Text>

              <TouchableOpacity
                style={styles.attachButton}
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

            <View style={styles.feedbackActions}>
              <TouchableOpacity
                style={styles.cancelFeedbackButton}
                onPress={() => {
                  setShowFeedbackModal(false);
                  setFeedbackText("");
                  setFeedbackAttachment(null);
                }}
              >
                <Text style={styles.cancelFeedbackText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitFeedbackButton,
                  !feedbackText.trim() && styles.submitFeedbackButtonDisabled
                ]}
                onPress={() => {
                  if (feedbackText.trim()) {
                    if (Platform.OS !== 'web') {
                      Alert.alert("Success", "Your feedback has been sent to the admin!");
                    } else {
                      alert("Your feedback has been sent to the admin!");
                    }
                    setShowFeedbackModal(false);
                    setFeedbackText("");
                    setFeedbackAttachment(null);
                  }
                }}
                disabled={!feedbackText.trim()}
              >
                <Text style={styles.submitFeedbackText}>Send Feedback</Text>
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
        <View style={styles.detailModalOverlay}>
          <View style={styles.pinModalContent}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Verify PIN</Text>
              <TouchableOpacity onPress={() => {
                setShowPinModal(false);
                setSignOutPin('');
                setSignOutPinError('');
              }}>
                <XIcon size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.pinModalBody}>
              <View style={styles.pinLockIcon}>
                <Lock size={28} color="#ef4444" />
              </View>
              <Text style={styles.pinModalSubtitle}>Enter your PIN to sign out</Text>

              <View style={styles.pinDotsRow}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.pinDot,
                      signOutPin.length > i && styles.pinDotFilled,
                      signOutPinError ? styles.pinDotError : null,
                    ]}
                  />
                ))}
              </View>

              <TextInput
                style={styles.hiddenPinInput}
                value={signOutPin}
                onChangeText={(text) => {
                  const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
                  setSignOutPin(digits);
                  if (signOutPinError) setSignOutPinError('');
                }}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                autoFocus
                editable={!isVerifyingPin}
              />

              {!!signOutPinError && (
                <Text style={styles.pinErrorText}>{signOutPinError}</Text>
              )}
            </View>

            <View style={styles.feedbackActions}>
              <TouchableOpacity
                style={styles.cancelFeedbackButton}
                onPress={() => {
                  setShowPinModal(false);
                  setSignOutPin('');
                  setSignOutPinError('');
                }}
              >
                <Text style={styles.cancelFeedbackText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.signOutConfirmButton,
                  (signOutPin.length !== 4 || isVerifyingPin) && styles.submitFeedbackButtonDisabled
                ]}
                onPress={handlePinVerifyAndSignOut}
                disabled={signOutPin.length !== 4 || isVerifyingPin}
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
        <View style={styles.detailModalOverlay}>
          <View style={styles.pinModalContent}>
            {deleteStep === 'confirm' ? (
              <>
                <View style={styles.detailHeader}>
                  <Text style={styles.detailTitle}>Delete Account</Text>
                  <TouchableOpacity onPress={() => setShowDeleteModal(false)}>
                    <XIcon size={24} color="#666" />
                  </TouchableOpacity>
                </View>

                <View style={styles.deleteWarningBody}>
                  <View style={styles.deleteWarningIcon}>
                    <AlertTriangle size={32} color="#dc2626" />
                  </View>
                  <Text style={styles.deleteWarningTitle}>Are you sure?</Text>
                  <Text style={styles.deleteWarningText}>
                    This action is permanent and cannot be undone. All your data including activities, goals, club memberships, and event participation will be permanently deleted.
                  </Text>
                </View>

                <View style={styles.feedbackActions}>
                  <TouchableOpacity
                    style={styles.cancelFeedbackButton}
                    onPress={() => setShowDeleteModal(false)}
                  >
                    <Text style={styles.cancelFeedbackText}>Cancel</Text>
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
                <View style={styles.detailHeader}>
                  <Text style={styles.detailTitle}>Verify PIN</Text>
                  <TouchableOpacity onPress={() => {
                    setShowDeleteModal(false);
                    setDeletePin('');
                    setDeletePinError('');
                  }}>
                    <XIcon size={24} color="#666" />
                  </TouchableOpacity>
                </View>

                <View style={styles.pinModalBody}>
                  <View style={styles.deleteLockIcon}>
                    <Lock size={28} color="#dc2626" />
                  </View>
                  <Text style={styles.pinModalSubtitle}>Enter your PIN to confirm account deletion</Text>

                  <View style={styles.pinDotsRow}>
                    {[0, 1, 2, 3].map((i) => (
                      <View
                        key={i}
                        style={[
                          styles.pinDot,
                          deletePin.length > i && styles.deletePinDotFilled,
                          deletePinError ? styles.pinDotError : null,
                        ]}
                      />
                    ))}
                  </View>

                  <TextInput
                    style={styles.hiddenPinInput}
                    value={deletePin}
                    onChangeText={(text) => {
                      const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
                      setDeletePin(digits);
                      if (deletePinError) setDeletePinError('');
                    }}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                    autoFocus
                    editable={!isDeleting}
                  />

                  {!!deletePinError && (
                    <Text style={styles.pinErrorText}>{deletePinError}</Text>
                  )}
                </View>

                <View style={styles.feedbackActions}>
                  <TouchableOpacity
                    style={styles.cancelFeedbackButton}
                    onPress={() => {
                      setDeleteStep('confirm');
                      setDeletePin('');
                      setDeletePinError('');
                    }}
                  >
                    <Text style={styles.cancelFeedbackText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.deleteConfirmButton,
                      (deletePin.length !== 4 || isDeleting) && styles.submitFeedbackButtonDisabled
                    ]}
                    onPress={async () => {
                      if (deletePin.length !== 4) {
                        setDeletePinError('Enter your 4-digit PIN');
                        return;
                      }
                      setIsDeleting(true);
                      setDeletePinError('');
                      try {
                        const valid = await verifyPin(deletePin);
                        if (valid) {
                          const result = await deleteAccount();
                          if (result.error) {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                            setDeletePinError(result.error.message);
                          } else {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            setShowDeleteModal(false);
                            if (Platform.OS !== 'web') {
                              Alert.alert('Account Deleted', 'Your account has been permanently deleted.');
                            } else {
                              alert('Your account has been permanently deleted.');
                            }
                            router.replace('/(tabs)' as any);
                          }
                        } else {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                          setDeletePinError('Incorrect PIN. Please try again.');
                          setDeletePin('');
                        }
                      } catch {
                        setDeletePinError('Verification failed. Try again.');
                        setDeletePin('');
                      } finally {
                        setIsDeleting(false);
                      }
                    }}
                    disabled={deletePin.length !== 4 || isDeleting}
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
        visible={selectedActivity !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedActivity(null)}
      >
        <View style={styles.detailModalOverlay}>
          <View style={styles.detailModalContent}>
            {selectedActivity && (
              <>
                <View style={styles.detailHeader}>
                  <Text style={styles.detailTitle}>Review Activity</Text>
                  <TouchableOpacity onPress={() => setSelectedActivity(null)}>
                    <XIcon size={24} color="#666" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.detailBody}>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Type</Text>
                    <Text style={styles.detailValue}>{selectedActivity.Exercise_Type}</Text>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Submitted At</Text>
                    <Text style={styles.detailValue}>{formatDate(selectedActivity.Created_At)}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Distance</Text>
                      <Text style={styles.detailValue}>{selectedActivity.Distance_Entered.toFixed(2)} {selectedActivity.Distance_Unit}</Text>
                    </View>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Time</Text>
                      <Text style={styles.detailValue}>
                        {formatTimeInterval(selectedActivity.Time_Entered)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Treadmill Photo</Text>
                    <Image
                      source={{ uri: selectedActivity.Photo_Path }}
                      style={styles.activityImage}
                      resizeMode="contain"
                    />
                  </View>
                </ScrollView>

                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() => rejectMutation.mutate(selectedActivity.PendingActivityID)}
                    disabled={rejectMutation.isPending}
                  >
                    <XCircle size={22} color="#fff" />
                    <Text style={styles.actionButtonText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.approveButton}
                    onPress={() => approveMutation.mutate(selectedActivity)}
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle size={22} color="#fff" />
                    <Text style={styles.actionButtonText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
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
});
