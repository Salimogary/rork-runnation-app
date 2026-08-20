import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import type { SubscriptionPlan, PaymentMethod } from '@/contexts/SubscriptionContext';
import { trpc } from '@/lib/trpc';
import { useMutation } from '@tanstack/react-query';
import { useState, useCallback, useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import {
  CreditCard,
  ChevronRight,
  Shield,
  CalendarDays,
  X,
  HeartHandshake,
} from 'lucide-react-native';
import colors from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';
import { hasFreeAdminSubscriptionAccess } from '@/lib/role-session';

type MobilePaymentMethod = Exclude<PaymentMethod, 'credit_card'>;
type SubscriptionTableRow = {
  key: string;
  subscription: string;
  roleExemption: boolean;
  plan: string;
  status: string;
  from: string | null;
  to: string | null;
  payable: boolean;
  source: 'membership' | 'listing' | 'club';
  raw?: any;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message && error.message !== '[object Object]') {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, any>;
    const candidate =
      record.message ||
      record.data?.message ||
      record.shape?.message ||
      record.cause?.message ||
      record.error?.message;
    if (typeof candidate === 'string' && candidate && candidate !== '[object Object]') {
      return candidate;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return 'Failed to submit subscription. Please try again.';
    }
  }
  return typeof error === 'string' && error ? error : 'Failed to submit subscription. Please try again.';
}

function formatDateLabel(value?: string | null): string {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not set';
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getDaysRemaining(value?: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = parsed.getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

function inferUgandaMobileMoneyMethod(phone: string): MobilePaymentMethod {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("256") ? digits.slice(3) : digits.replace(/^0/, "");
  if (local.startsWith("70") || local.startsWith("75")) return "airtel_money";
  return "mtn_mobile_money";
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user, roleSession } = useAuth();
  const { colors: themeColors } = useTheme();
  const trpcUtils = trpc.useUtils();
  const {
    subscriptionStatus,
    availablePlans,
    userRegion,
    subscription,
    refreshSubscription,
  } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [selectedPaymentRow, setSelectedPaymentRow] = useState<SubscriptionTableRow | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showClubPayments, setShowClubPayments] = useState(true);
  const [showOtherPayments, setShowOtherPayments] = useState(false);
  const hasRoleExemption = hasFreeAdminSubscriptionAccess(roleSession);

  const { data: clubPayments = [], isLoading: clubPaymentsLoading, error: clubPaymentsError, refetch: refetchClubPayments } = trpc.profile.getClubPaymentStatus.useQuery(
    { registrationId: user?.id ?? '00000000-0000-0000-0000-000000000000' },
    { enabled: !!user?.id && showClubPayments && !hasRoleExemption }
  );
  const { data: listingSubscriptions = [], isLoading: listingSubscriptionsLoading } = trpc.profile.getListingSubscriptions.useQuery(
    { registrationId: user?.id ?? '00000000-0000-0000-0000-000000000000' },
    { enabled: !!user?.id && !hasRoleExemption }
  );
  const createSubscriptionPaymentMutation = trpc.payments.createSubscriptionPayment.useMutation();
  const createListingSubscriptionPaymentMutation = trpc.payments.createListingSubscriptionPayment.useMutation();
  const createClubPaymentMutation = trpc.payments.createClubPayment.useMutation();

  const handleSelectPlan = useCallback((plan: SubscriptionPlan) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlan(plan);
    setShowPaymentForm(true);
    setPhoneNumber('');
  }, []);

  const openPaymentForRow = useCallback((row: SubscriptionTableRow) => {
    if (!row.payable) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPaymentRow(row);
    setSelectedPlan(null);
    setPhoneNumber('');
    setShowPaymentForm(true);
    if (row.source === 'club') {
      setSelectedPlan({
        id: `club_${row.raw?.paymentId || row.key}`,
        name: row.subscription,
        paymentMethod: 'mtn_mobile_money',
        price: Number(row.raw?.amount || 0),
        currency: row.raw?.currency || 'UGX',
        displayPrice: `${row.raw?.currency || 'UGX'} ${Number(row.raw?.amount || 0).toLocaleString()}`,
        period: 'quarterly',
        periodLabel: 'club fee',
        region: userRegion,
        icon: 'club',
      });
    }
  }, [userRegion]);

  const subscribeMutation = useMutation({
    mutationFn: async ({
      plan,
      phone,
    }: {
      plan: SubscriptionPlan;
      phone: string;
    }) => {
      if (!user) throw new Error('Not signed in');
      if (plan.paymentMethod === 'credit_card') {
        throw new Error('Card payments are not available yet. Please use mobile money.');
      }
      const paymentMethod: MobilePaymentMethod =
        userRegion === 'uganda'
          ? inferUgandaMobileMoneyMethod(phone)
          : (plan.paymentMethod as MobilePaymentMethod);

      return await createSubscriptionPaymentMutation.mutateAsync({
        registrationId: user.id,
        planId: plan.id,
        paymentMethod,
        amount: plan.price,
        currency: plan.currency,
        phoneNumber: phone,
      });
    },
    onSuccess: (payment) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshSubscription();
      setShowPaymentForm(false);
      setSelectedPlan(null);
      setPhoneNumber('');
      if (payment?.checkoutUrl) {
        void Linking.openURL(payment.checkoutUrl);
      }
      const msg = payment?.paymentInstruction
        ? payment.paymentInstruction
        : 'Your payment has been started. Approve the prompt on your phone. Once payment is confirmed, your subscription will be activated automatically.';
      if (Platform.OS !== 'web') {
        Alert.alert('Payment Started', msg);
      } else {
        alert(msg);
      }
    },
    onError: (error) => {
      console.error('[Subscription] Error:', error);
      const msg = getErrorMessage(error);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', msg);
      } else {
        alert(msg);
      }
    },
  });

  const getPaymentPlansForRow = useCallback((row: SubscriptionTableRow | null): SubscriptionPlan[] => {
    if (!row || row.source === 'membership') return availablePlans;
    if (row.source === 'club') return selectedPlan ? [selectedPlan] : [];
    const raw = row.raw || {};
    return [
      {
        id: `${row.key}_quarterly`,
        name: 'Quarterly',
        paymentMethod: 'mtn_mobile_money',
        price: Number(raw.quarterlyFeeAmount || 0),
        currency: raw.feeCurrency || 'UGX',
        displayPrice: `${raw.feeCurrency || 'UGX'} ${Number(raw.quarterlyFeeAmount || 0).toLocaleString()}`,
        period: 'quarterly',
        periodLabel: 'per quarter',
        region: userRegion,
        icon: 'listing',
      },
      {
        id: `${row.key}_annual`,
        name: 'Annual',
        paymentMethod: 'mtn_mobile_money',
        price: Number(raw.annualFeeAmount || 0),
        currency: raw.feeCurrency || 'UGX',
        displayPrice: `${raw.feeCurrency || 'UGX'} ${Number(raw.annualFeeAmount || 0).toLocaleString()}`,
        period: 'yearly',
        periodLabel: 'per year',
        region: userRegion,
        icon: 'listing',
      },
    ];
  }, [availablePlans, selectedPlan, userRegion]);

  const paymentPlans = getPaymentPlansForRow(selectedPaymentRow);

  const handleSubscribe = useCallback(() => {
    if (!selectedPlan) return;
    if (
      selectedPlan.paymentMethod !== 'credit_card' &&
      phoneNumber.trim().length < 9
    ) {
      const msg = 'Please enter a valid phone number';
      if (Platform.OS !== 'web') {
        Alert.alert('Invalid Phone', msg);
      } else {
        alert(msg);
      }
      return;
    }
    const paymentMethod: MobilePaymentMethod =
      userRegion === 'uganda'
        ? inferUgandaMobileMoneyMethod(phoneNumber)
        : selectedPlan.paymentMethod === 'mpesa'
          ? 'mpesa'
          : 'mtn_mobile_money';

    if (selectedPaymentRow?.source === 'listing') {
      const listingKind = selectedPaymentRow.raw?.key === 'ride_share' ? 'ride_share' : 'accommodation';
      createListingSubscriptionPaymentMutation.mutate(
        {
          registrationId: user?.id || '',
          listingKind,
          tier: selectedPlan.period === 'yearly' ? 'annual' : 'quarterly',
          paymentMethod,
          phoneNumber: phoneNumber.trim(),
        },
        {
          onSuccess: (payment: any) => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            void trpcUtils.profile.getListingSubscriptions.invalidate();
            setShowPaymentForm(false);
            setSelectedPaymentRow(null);
            setSelectedPlan(null);
            setPhoneNumber('');
            if (payment?.checkoutUrl) void Linking.openURL(payment.checkoutUrl);
            Alert.alert('Payment Started', payment?.paymentInstruction || 'Your payment has been started.');
          },
          onError: (error: any) => Alert.alert('Error', getErrorMessage(error)),
        }
      );
      return;
    }

    if (selectedPaymentRow?.source === 'club') {
      createClubPaymentMutation.mutate(
        {
          registrationId: user?.id || '',
          paymentId: selectedPaymentRow.raw?.paymentId,
          paymentMethod,
          phoneNumber: phoneNumber.trim(),
        },
        {
          onSuccess: (payment: any) => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            void refetchClubPayments();
            setShowPaymentForm(false);
            setSelectedPaymentRow(null);
            setSelectedPlan(null);
            setPhoneNumber('');
            if (payment?.checkoutUrl) void Linking.openURL(payment.checkoutUrl);
            Alert.alert('Payment Started', payment?.paymentInstruction || 'Your club payment has been started.');
          },
          onError: (error: any) => Alert.alert('Error', getErrorMessage(error)),
        }
      );
      return;
    }

    subscribeMutation.mutate({ plan: selectedPlan, phone: phoneNumber.trim() });
  }, [
    createClubPaymentMutation,
    createListingSubscriptionPaymentMutation,
    phoneNumber,
    refetchClubPayments,
    selectedPaymentRow,
    selectedPlan,
    subscribeMutation,
    trpcUtils.profile.getListingSubscriptions,
    user?.id,
    userRegion,
  ]);

  const getPhonePlaceholder = useCallback(() => {
    if (!selectedPlan) return '';
    if (userRegion === 'uganda') return '0770 or 0750 000 000';
    switch (selectedPlan.paymentMethod) {
      case 'mtn_mobile_money':
        return '0770 000 000';
      case 'airtel_money':
        return '0750 000 000';
      case 'mpesa':
        return '0712 000 000';
      default:
        return '';
    }
  }, [selectedPlan, userRegion]);

  const isMobilePayment =
    selectedPlan?.paymentMethod !== 'credit_card';
  const isPayableStatus = (status: string, isCurrent?: boolean) => {
    const normalized = String(status || '').toLowerCase();
    return !isCurrent && !['active', 'trial', 'paid', 'pending', 'approved'].includes(normalized);
  };

  const subscriptionRows = useMemo<SubscriptionTableRow[]>(() => {
    if (hasRoleExemption) {
      return [];
    }

    const membershipRow: SubscriptionTableRow = {
      key: 'membership',
      subscription: 'App Subscription',
      roleExemption: false,
      plan: subscriptionStatus === 'active'
          ? 'paid'
          : subscriptionStatus === 'trial'
            ? 'trial'
            : 'paid',
      status: subscriptionStatus,
      from: subscription?.started_at ?? null,
      to: subscription?.expires_at ?? null,
      payable: subscriptionStatus === 'expired' || subscriptionStatus === 'trial',
      source: 'membership',
    };

    const listingRows = listingSubscriptions
      .filter((item: any) => String(item.key || '') !== 'membership')
      .map((item: any) => ({
      key: `listing-${String(item.key)}`,
      subscription: String(item.label || item.key),
      roleExemption: false,
      plan: String(item.tier || 'not_started').replace(/_/g, ' '),
      status: String(item.status || 'not_started').replace(/_/g, ' '),
      from: item.startsAt ?? null,
      to: item.expiresAt ?? item.trialEndsAt ?? null,
      payable: item.key === 'ride_share' || item.key === 'accommodation'
        ? isPayableStatus(item.status, item.isCurrent)
        : false,
      source: 'listing' as const,
      raw: item,
    }));

    const clubRows = showClubPayments
      ? clubPayments.map((payment: any) => ({
          key: `club-${payment.paymentId}`,
          subscription: payment.title || 'Club membership',
          roleExemption: false,
          plan: 'club',
          status: String(payment.status || 'unpaid'),
          from: payment.createdAt ?? null,
          to: payment.dueDate ?? null,
          payable: payment.status !== 'paid',
          source: 'club' as const,
          raw: payment,
        }))
      : [];

    return [membershipRow, ...listingRows, ...clubRows].filter((row, index, rows) => (
      rows.findIndex((candidate) => candidate.key === row.key) === index
    ));
  }, [
    clubPayments,
    hasRoleExemption,
    listingSubscriptions,
    showClubPayments,
    subscription?.expires_at,
    subscription?.started_at,
    subscriptionStatus,
  ]);

  if (subscriptionStatus === 'pending') {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.pendingContainer}>
          <View style={styles.pendingIconWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
          <Text style={styles.pendingTitle}>Payment Pending</Text>
          <Text style={styles.pendingText}>
            Your subscription payment is being processed. You will get full access
            once it is confirmed.
          </Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={refreshSubscription}
          >
            <Text style={styles.refreshButtonText}>Refresh Status</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => router.replace('/(tabs)' as never)}
          >
            <Text style={styles.backLinkText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.subscriptionTableSection, { backgroundColor: themeColors.cardBackground }]}>
          <View style={styles.subscriptionTableHeader}>
            <Text style={[styles.subscriptionTableTitle, { color: themeColors.text }]}>Payments</Text>
            {!hasRoleExemption ? (
              <TouchableOpacity
                style={styles.otherPaymentsButton}
                onPress={() => setShowOtherPayments((value) => !value)}
                activeOpacity={0.75}
              >
                <Text style={styles.otherPaymentsButtonText}>Other payments</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {!hasRoleExemption ? (
            <>
              <Text style={[styles.subscriptionTableNote, { color: themeColors.textSecondary }]}>
                App subscription, ride share subscription, accommodation subscription, and assigned club payments are listed separately.
              </Text>

              <View style={styles.paymentShortcutRow}>
                <TouchableOpacity
                  style={styles.paymentShortcutButton}
                  activeOpacity={0.75}
                  onPress={() => router.push('/settings' as never)}
                >
                  <HeartHandshake size={16} color="#fff" />
                  <Text style={styles.paymentShortcutText}>Donate</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {!hasRoleExemption && showOtherPayments ? (
            <View style={styles.otherPaymentPanel}>
              <TouchableOpacity
                style={styles.otherPaymentTile}
                onPress={() => {
                  setShowClubPayments(true);
                  void refetchClubPayments();
                }}
              >
                <Text style={[styles.otherPaymentTileTitle, { color: themeColors.text }]}>My club subscription</Text>
                <Text style={[styles.otherPaymentTileText, { color: themeColors.textSecondary }]}>Show assigned club fees below.</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.otherPaymentTile}
                onPress={() => router.push('/(tabs)/events' as never)}
              >
                <Text style={[styles.otherPaymentTileTitle, { color: themeColors.text }]}>Event fees</Text>
                <Text style={[styles.otherPaymentTileText, { color: themeColors.textSecondary }]}>Open Calendar to manage event payments.</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {listingSubscriptionsLoading || (showClubPayments && clubPaymentsLoading) ? (
            <Text style={[styles.clubPaymentMeta, { color: themeColors.textSecondary }]}>Loading payments...</Text>
          ) : clubPaymentsError && showClubPayments ? (
            <Text style={[styles.clubPaymentMeta, { color: themeColors.textSecondary }]}>Club payment status is not available right now.</Text>
          ) : subscriptionRows.length === 0 ? (
            <View style={styles.noPaymentsCard}>
              <CreditCard size={28} color={themeColors.textSecondary} />
              <Text style={[styles.noPaymentsTitle, { color: themeColors.text }]}>No payments for your profile</Text>
              <Text style={[styles.noPaymentsText, { color: themeColors.textSecondary }]}>
                Your current role does not require app, listing, or club subscription payments.
              </Text>
            </View>
          ) : (
            <View style={styles.paymentCardList}>
              {subscriptionRows.map((row) => {
                const daysRemaining = getDaysRemaining(row.to);
                const isHealthy = row.status === 'active' || row.status === 'trial' || row.status === 'paid';
                return (
                  <View key={row.key} style={[styles.paymentItemCard, { borderColor: themeColors.border, backgroundColor: themeColors.inputBackground }]}>
                    <View style={styles.paymentItemTopRow}>
                      <View style={styles.paymentItemTitleWrap}>
                        <Text style={[styles.paymentItemTitle, { color: themeColors.text }]}>{row.subscription}</Text>
                        <Text style={[styles.paymentItemMeta, { color: themeColors.textSecondary }]}>
                          {row.roleExemption ? 'Role exemption' : row.plan} • {formatDateLabel(row.from)} to {formatDateLabel(row.to)}
                        </Text>
                      </View>
                      <View style={[styles.paymentStatusBadge, isHealthy ? styles.paymentStatusHealthy : styles.paymentStatusDue]}>
                        <Text style={[styles.paymentStatusText, isHealthy ? styles.paymentStatusTextHealthy : styles.paymentStatusTextDue]}>{row.status}</Text>
                      </View>
                    </View>
                    <View style={styles.paymentCountdownBand}>
                      <Text style={styles.paymentCountdownValue}>{daysRemaining === null ? '-' : daysRemaining}</Text>
                      <Text style={styles.paymentCountdownLabel}>
                        {daysRemaining === 1 ? 'day left in this tier' : 'days left in this tier'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.payButton, !row.payable && styles.payButtonDisabled]}
                      onPress={() => openPaymentForRow(row)}
                      disabled={!row.payable}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.payButtonText, !row.payable && styles.payButtonTextDisabled]}>
                        {row.payable ? 'Pay' : 'No payment due'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {showPaymentForm && selectedPaymentRow && (
          <View style={styles.paymentFormSection}>
            <View style={styles.paymentFormHeader}>
              <Text style={styles.paymentFormTitle}>
                {selectedPaymentRow.subscription} payment
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowPaymentForm(false);
                  setSelectedPaymentRow(null);
                  setSelectedPlan(null);
                }}
              >
                <X size={20} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.paymentPlanGrid}>
              {paymentPlans.map((plan) => {
                const isSelected = selectedPlan?.id === plan.id;
                return (
                  <TouchableOpacity
                    key={plan.id}
                    style={[styles.planCard, isSelected && styles.planCardSelected]}
                    onPress={() => handleSelectPlan(plan)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.planLeft}>
                      <View style={[styles.planIconWrap, { backgroundColor: '#FFF3E8' }]}>
                        <CalendarDays size={23} color={colors.primary} />
                      </View>
                      <View style={styles.planInfo}>
                        <Text style={styles.planName}>{plan.name}</Text>
                        <Text style={styles.planPeriod}>
                          {plan.period === 'yearly' ? '12 months access' : plan.periodLabel}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.planRight}>
                      <Text style={styles.planPrice}>{plan.displayPrice}</Text>
                      <ChevronRight size={18} color={isSelected ? colors.primary : '#ccc'} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedPlan ? (
              <>
                <View style={styles.paymentSummary}>
                  <Text style={styles.paymentSummaryLabel}>Amount</Text>
                  <Text style={styles.paymentSummaryValue}>
                    {selectedPlan.displayPrice} {selectedPlan.periodLabel}
                  </Text>
                </View>
                <Text style={styles.paymentProviderText}>
                  Select mobile money, card, or bank where available. Mobile money connects directly to Flutterwave now.
                </Text>

                {isMobilePayment ? (
                  <View style={styles.phoneInputSection}>
                    <Text style={styles.inputLabel}>Mobile money phone number</Text>
                    <TextInput
                      style={styles.phoneInput}
                      placeholder={getPhonePlaceholder()}
                      placeholderTextColor="#999"
                      value={phoneNumber}
                      onChangeText={setPhoneNumber}
                      keyboardType="phone-pad"
                      maxLength={15}
                    />
                    <Text style={styles.phoneHint}>
                      You will receive a payment prompt on this number
                    </Text>
                  </View>
                ) : (
                  <View style={styles.stripeNotice}>
                    <CreditCard size={24} color="#1E40AF" />
                    <Text style={styles.stripeNoticeText}>
                      You will be redirected to a secure card payment page to complete your payment.
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.subscribeButton,
                    (subscribeMutation.isPending ||
                      createSubscriptionPaymentMutation.isPending ||
                      createListingSubscriptionPaymentMutation.isPending ||
                      createClubPaymentMutation.isPending ||
                      (isMobilePayment && phoneNumber.trim().length < 9)) &&
                      styles.subscribeButtonDisabled,
                  ]}
                  onPress={handleSubscribe}
                  disabled={
                    subscribeMutation.isPending ||
                    createSubscriptionPaymentMutation.isPending ||
                    createListingSubscriptionPaymentMutation.isPending ||
                    createClubPaymentMutation.isPending ||
                    (isMobilePayment && phoneNumber.trim().length < 9)
                  }
                  activeOpacity={0.8}
                >
                  {subscribeMutation.isPending ||
                  createSubscriptionPaymentMutation.isPending ||
                  createListingSubscriptionPaymentMutation.isPending ||
                  createClubPaymentMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.subscribeButtonText}>
                      {isMobilePayment ? 'Pay with mobile money' : 'Pay by card'}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.paymentSummary}>
                <Text style={styles.paymentSummaryLabel}>Next</Text>
                <Text style={styles.paymentSummaryValue}>Select period</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.securityNote}>
          <Shield size={16} color="#999" />
          <Text style={styles.securityText}>
            Payments are processed securely. Your access period follows the
            plan you choose. Cancel anytime via settings.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  heroSection: {
    alignItems: 'center' as const,
    paddingVertical: 32,
    gap: 12,
  },
  crownWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FFF8E7',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 8,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800' as const,
    color: '#1A1A1A',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center' as const,
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  datesCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  datesHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 14,
  },
  datesIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFF3E8',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  datesTitleWrap: {
    flex: 1,
    gap: 2,
  },
  datesTitle: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: '#1A1A1A',
  },
  datesText: {
    fontSize: 12,
    color: '#777',
    lineHeight: 17,
  },
  dateRows: {
    gap: 8,
  },
  dateRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#666',
  },
  dateValue: {
    flex: 1,
    textAlign: 'right' as const,
    fontSize: 13,
    fontWeight: '800' as const,
    color: '#1A1A1A',
  },
  dateValueActive: {
    color: colors.primary,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#999',
    letterSpacing: 1,
    marginBottom: 0,
  },
  pricingSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  pricingHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    marginBottom: 10,
  },
  pricingBadge: {
    borderRadius: 999,
    backgroundColor: '#FFF3E8',
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '800' as const,
    color: colors.primary,
  },
  listingSubscriptionsSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  listingSubscriptionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  listingSubscriptionLeft: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  listingSubscriptionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFF3E8',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  otherPaymentsSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  otherPaymentsHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  otherPaymentsIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFF3E8',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  otherPaymentsTitleWrap: {
    flex: 1,
    gap: 2,
  },
  otherPaymentsTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#1A1A1A',
  },
  otherPaymentsText: {
    fontSize: 12,
    color: '#777',
    lineHeight: 17,
  },
  otherPaymentsButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  otherPaymentsButtonText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#fff',
  },
  clubPaymentsList: {
    gap: 10,
    marginTop: 14,
  },
  clubPaymentRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  clubPaymentInfo: {
    flex: 1,
  },
  clubPaymentTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#1A1A1A',
  },
  clubPaymentMeta: {
    fontSize: 12,
    color: '#777',
    lineHeight: 18,
  },
  clubPaymentStatus: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clubPaymentStatusPaid: {
    backgroundColor: '#DCFCE7',
  },
  clubPaymentStatusPending: {
    backgroundColor: '#FEF3C7',
  },
  clubPaymentStatusUnpaid: {
    backgroundColor: '#FEE2E2',
  },
  clubPaymentStatusText: {
    fontSize: 11,
    fontWeight: '800' as const,
    textTransform: 'uppercase' as const,
  },
  clubPaymentStatusTextPaid: {
    color: '#15803D',
  },
  clubPaymentStatusTextPending: {
    color: '#B45309',
  },
  clubPaymentStatusTextUnpaid: {
    color: '#B91C1C',
  },
  pricingNote: {
    fontSize: 13,
    color: '#666',
    marginBottom: 14,
    lineHeight: 19,
  },
  subscriptionTableSection: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  subscriptionTableHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
    marginBottom: 6,
  },
  subscriptionTableTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
  },
  subscriptionTableNote: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  paymentShortcutRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 12,
  },
  paymentShortcutButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  paymentShortcutText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800' as const,
  },
  otherPaymentPanel: {
    gap: 10,
    marginBottom: 12,
  },
  otherPaymentTile: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
  },
  otherPaymentTileTitle: {
    fontSize: 14,
    fontWeight: '800' as const,
  },
  otherPaymentTileText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
  },
  paymentCardList: {
    gap: 12,
  },
  noPaymentsCard: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    padding: 18,
  },
  noPaymentsTitle: {
    fontSize: 16,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
  },
  noPaymentsText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center' as const,
  },
  paymentItemCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  paymentItemTopRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
  },
  paymentItemTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  paymentItemTitle: {
    fontSize: 16,
    fontWeight: '900' as const,
  },
  paymentItemMeta: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
  },
  paymentStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  paymentStatusHealthy: {
    backgroundColor: '#DCFCE7',
  },
  paymentStatusDue: {
    backgroundColor: '#FEF3C7',
  },
  paymentStatusText: {
    fontSize: 11,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
  },
  paymentStatusTextHealthy: {
    color: '#15803D',
  },
  paymentStatusTextDue: {
    color: '#B45309',
  },
  paymentCountdownBand: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  paymentCountdownValue: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900' as const,
    color: '#1D4ED8',
  },
  paymentCountdownLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800' as const,
    color: '#1E40AF',
  },
  subscriptionTable: {
    minWidth: 760,
  },
  subscriptionTableRow: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    minHeight: 44,
    borderBottomWidth: 1,
  },
  subscriptionTableHead: {
    borderBottomWidth: 0,
    borderRadius: 8,
  },
  subscriptionCell: {
    width: 108,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  subscriptionHeadText: {
    fontSize: 11,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
  },
  subscriptionCellText: {
    fontSize: 12,
    fontWeight: '700' as const,
    lineHeight: 16,
  },
  payCell: {
    justifyContent: 'center' as const,
  },
  payButton: {
    minHeight: 30,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 10,
  },
  payButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  payButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900' as const,
  },
  payButtonTextDisabled: {
    color: '#6B7280',
  },
  paymentPlanGrid: {
    gap: 10,
    marginBottom: 12,
  },
  planCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  planCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#FFF7F3',
  },
  planLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    flex: 1,
  },
  planIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  planInfo: {
    flex: 1,
    gap: 2,
  },
  planName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1A1A1A',
  },
  planPeriod: {
    fontSize: 13,
    color: '#999',
  },
  planRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    flexShrink: 0,
  },
  planPrice: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: colors.primary,
  },
  paymentFormSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  paymentFormHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 16,
  },
  paymentFormTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#1A1A1A',
  },
  paymentSummary: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    backgroundColor: '#F8F8F8',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  paymentProviderText: {
    fontSize: 12,
    color: '#777',
    lineHeight: 18,
    marginBottom: 14,
  },
  paymentSummaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  paymentSummaryValue: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#1A1A1A',
  },
  phoneInputSection: {
    gap: 8,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#333',
  },
  phoneInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  phoneHint: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic' as const,
  },
  stripeNotice: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  stripeNoticeText: {
    flex: 1,
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },
  subscribeButton: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  subscribeButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  subscribeButtonText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#fff',
  },
  securityNote: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    color: '#999',
    lineHeight: 18,
  },
  skipButton: {
    alignItems: 'center' as const,
    padding: 16,
  },
  skipButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.primary,
    textDecorationLine: 'underline' as const,
  },
  pendingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 40,
    gap: 16,
  },
  pendingIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF3E0',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 8,
  },
  pendingTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#1A1A1A',
  },
  pendingText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center' as const,
    lineHeight: 22,
  },
  refreshButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
  backLink: {
    marginTop: 8,
  },
  backLinkText: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '500' as const,
  },
});
