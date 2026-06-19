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
  Animated,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import type { SubscriptionPlan, PaymentMethod } from '@/contexts/SubscriptionContext';
import { trpc } from '@/lib/trpc';
import { useMutation } from '@tanstack/react-query';
import { useState, useRef, useEffect, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import {
  Crown,
  CreditCard,
  Smartphone,
  ChevronRight,
  Shield,
  CalendarDays,
  X,
} from 'lucide-react-native';
import colors from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';

const PAYMENT_ICONS: Record<PaymentMethod, { icon: typeof Smartphone; color: string; bg: string }> = {
  mtn_mobile_money: { icon: Smartphone, color: '#FFCC00', bg: '#FFF8DC' },
  airtel_money: { icon: Smartphone, color: '#ED1C24', bg: '#FEF2F2' },
  mpesa: { icon: Smartphone, color: '#4CAF50', bg: '#F0FDF4' },
  credit_card: { icon: CreditCard, color: '#1E40AF', bg: '#EFF6FF' },
};
type MobilePaymentMethod = Exclude<PaymentMethod, 'credit_card'>;

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

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function getPlanDurationDays(plan: SubscriptionPlan | null): number {
  if (!plan) return 0;
  return plan.period === 'yearly' ? 365 : 90;
}

function inferUgandaMobileMoneyMethod(phone: string): MobilePaymentMethod {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("256") ? digits.slice(3) : digits.replace(/^0/, "");
  if (local.startsWith("70") || local.startsWith("75")) return "airtel_money";
  return "mtn_mobile_money";
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors: themeColors } = useTheme();
  const {
    subscriptionStatus,
    trialDaysRemaining,
    trialExpired,
    availablePlans,
    userRegion,
    userCountry,
    subscription,
    refreshSubscription,
  } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showClubPayments, setShowClubPayments] = useState(false);

  const { data: clubPayments = [], isLoading: clubPaymentsLoading, error: clubPaymentsError, refetch: refetchClubPayments } = trpc.profile.getClubPaymentStatus.useQuery(
    { registrationId: user?.id ?? '00000000-0000-0000-0000-000000000000' },
    { enabled: !!user?.id && showClubPayments }
  );
  const createSubscriptionPaymentMutation = trpc.payments.createSubscriptionPayment.useMutation();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [fadeAnim, slideAnim, pulseAnim]);

  const handleSelectPlan = useCallback((plan: SubscriptionPlan) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlan(plan);
    setShowPaymentForm(true);
    setPhoneNumber('');
  }, []);

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
        throw new Error('Card payments are not available in Flutterwave sandbox yet. Please use mobile money for testing.');
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
        : 'Your Flutterwave payment has been started. Approve the prompt on your phone. Once Flutterwave confirms it, your subscription will be activated automatically.';
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
    subscribeMutation.mutate({ plan: selectedPlan, phone: phoneNumber.trim() });
  }, [selectedPlan, phoneNumber, subscribeMutation]);

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
  const selectedDurationDays = getPlanDurationDays(selectedPlan);
  const currentExpiryDate = subscription?.expires_at ? new Date(subscription.expires_at) : null;
  const renewalBaseDate =
    currentExpiryDate && currentExpiryDate > new Date()
      ? currentExpiryDate
      : new Date();
  const renewalExpiryDate = selectedPlan ? addDays(renewalBaseDate, selectedDurationDays) : null;
  const regionPriceSummary =
    userRegion === 'uganda'
      ? 'UGX 20,000 per quarter or UGX 60,000 per year'
      : `${availablePlans[0]?.displayPrice || 'USD 5'} per quarter or ${availablePlans[1]?.displayPrice || 'USD 15'} per year`;

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
        <Animated.View
          style={[
            styles.heroSection,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Animated.View
            style={[styles.crownWrap, { transform: [{ scale: pulseAnim }] }]}
          >
            <Crown size={48} color="#FFD700" fill="#FFD700" />
          </Animated.View>

          <Text style={styles.heroTitle}>Go Premium</Text>
          <Text style={styles.heroSubtitle}>
            {subscriptionStatus === 'active'
              ? 'Your premium plan is active.'
              : trialExpired
              ? 'Your free plan has ended. Subscribe to continue using all features.'
              : `You have ${trialDaysRemaining} day${trialDaysRemaining !== 1 ? 's' : ''} left on your free plan.`}
          </Text>
        </Animated.View>

        <View style={styles.datesCard}>
          <View style={styles.datesHeader}>
            <View style={styles.datesIconWrap}>
              <CalendarDays size={20} color={colors.primary} />
            </View>
            <View style={styles.datesTitleWrap}>
              <Text style={styles.datesTitle}>Subscription dates</Text>
              <Text style={styles.datesText}>
                Choose a plan below to preview your renewal date.
              </Text>
            </View>
          </View>
          <View style={styles.dateRows}>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Current expiry</Text>
              <Text style={styles.dateValue}>
                {subscriptionStatus === 'trial'
                  ? `${trialDaysRemaining} day${trialDaysRemaining !== 1 ? 's' : ''} trial left`
                  : formatDateLabel(subscription?.expires_at)}
              </Text>
            </View>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Renewed until</Text>
              <Text style={[styles.dateValue, selectedPlan && styles.dateValueActive]}>
                {renewalExpiryDate ? formatDateLabel(renewalExpiryDate.toISOString()) : 'Select Quarterly or Yearly'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.pricingSection}>
          <View style={styles.pricingHeader}>
            <Text style={styles.sectionLabel}>RUNNATION SUBSCRIPTION</Text>
            <Text style={styles.pricingBadge}>{userRegion === 'uganda' ? 'Uganda' : userCountry || 'Rest of world'}</Text>
          </View>
          <Text style={styles.pricingNote}>
            {regionPriceSummary}. For non-Uganda countries, this is the local currency equivalent of USD 5 quarterly or USD 15 yearly where a local currency is configured.
          </Text>

          {availablePlans.map((plan) => {
            const paymentConfig = PAYMENT_ICONS[plan.paymentMethod];
            const isSelected = selectedPlan?.id === plan.id;

            return (
              <TouchableOpacity
                key={plan.id}
                style={[
                  styles.planCard,
                  isSelected && styles.planCardSelected,
                ]}
                onPress={() => handleSelectPlan(plan)}
                activeOpacity={0.7}
              >
                <View style={styles.planLeft}>
                  <View
                    style={[
                      styles.planIconWrap,
                      { backgroundColor: paymentConfig.bg },
                    ]}
                  >
                    <CalendarDays size={23} color={paymentConfig.color} />
                  </View>
                  <View style={styles.planInfo}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planPeriod}>
                      {plan.period === 'yearly' ? '12 months access' : '3 months access'}
                    </Text>
                  </View>
                </View>
                <View style={styles.planRight}>
                  <Text style={styles.planPrice}>{plan.displayPrice}</Text>
                  <ChevronRight
                    size={18}
                    color={isSelected ? colors.primary : '#ccc'}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.otherPaymentsSection}>
          <View style={styles.otherPaymentsHeader}>
            <View style={styles.otherPaymentsIconWrap}>
              <CreditCard size={20} color={colors.primary} />
            </View>
            <View style={styles.otherPaymentsTitleWrap}>
              <Text style={styles.otherPaymentsTitle}>Other payments</Text>
              <Text style={styles.otherPaymentsText}>Club membership fees and collections created by your club coordinator.</Text>
            </View>
            <TouchableOpacity
              style={styles.otherPaymentsButton}
              onPress={() => {
                setShowClubPayments((value) => !value);
                if (!showClubPayments) void refetchClubPayments();
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.otherPaymentsButtonText}>{showClubPayments ? 'Hide' : 'View'}</Text>
            </TouchableOpacity>
          </View>

          {showClubPayments ? (
            <View style={styles.clubPaymentsList}>
              {clubPaymentsLoading ? (
                <Text style={styles.clubPaymentMeta}>Loading club payment status...</Text>
              ) : clubPaymentsError ? (
                <Text style={styles.clubPaymentMeta}>Club payment status is not available right now.</Text>
              ) : clubPayments.length === 0 ? (
                <Text style={styles.clubPaymentMeta}>No club payments are assigned to you yet.</Text>
              ) : (
                clubPayments.map((payment: any) => (
                  <View key={payment.paymentId} style={styles.clubPaymentRow}>
                    <View style={styles.clubPaymentInfo}>
                      <Text style={styles.clubPaymentTitle}>{payment.title}</Text>
                      <Text style={styles.clubPaymentMeta}>
                        {payment.clubName} - {payment.currency} {Number(payment.amount || 0).toLocaleString()}
                        {payment.dueDate ? ` - Due ${payment.dueDate}` : ''}
                      </Text>
                    </View>
                    <View style={[
                      styles.clubPaymentStatus,
                      payment.status === 'paid' ? styles.clubPaymentStatusPaid : payment.status === 'pending' ? styles.clubPaymentStatusPending : styles.clubPaymentStatusUnpaid,
                    ]}>
                      <Text style={[
                        styles.clubPaymentStatusText,
                        payment.status === 'paid' ? styles.clubPaymentStatusTextPaid : payment.status === 'pending' ? styles.clubPaymentStatusTextPending : styles.clubPaymentStatusTextUnpaid,
                      ]}>
                        {payment.status}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </View>

        {showPaymentForm && selectedPlan && (
          <View style={styles.paymentFormSection}>
            <View style={styles.paymentFormHeader}>
              <Text style={styles.paymentFormTitle}>
                {selectedPlan.name} subscription
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowPaymentForm(false);
                  setSelectedPlan(null);
                }}
              >
                <X size={20} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.paymentSummary}>
              <Text style={styles.paymentSummaryLabel}>Amount</Text>
              <Text style={styles.paymentSummaryValue}>
                {selectedPlan.displayPrice} {selectedPlan.periodLabel}
              </Text>
            </View>
            <Text style={styles.paymentProviderText}>
              Processed by Flutterwave. Available payment methods depend on your country and Flutterwave account settings.
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
                  You will be redirected to a secure payment page powered by
                  Flutterwave to complete your payment.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.subscribeButton,
                (subscribeMutation.isPending ||
                  createSubscriptionPaymentMutation.isPending ||
                  (isMobilePayment && phoneNumber.trim().length < 9)) &&
                  styles.subscribeButtonDisabled,
              ]}
              onPress={handleSubscribe}
              disabled={
                subscribeMutation.isPending ||
                createSubscriptionPaymentMutation.isPending ||
                (isMobilePayment && phoneNumber.trim().length < 9)
              }
              activeOpacity={0.8}
            >
              {subscribeMutation.isPending || createSubscriptionPaymentMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.subscribeButtonText}>
                  {isMobilePayment
                    ? 'Continue to Flutterwave'
                    : 'Pay with Flutterwave'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.securityNote}>
          <Shield size={16} color="#999" />
          <Text style={styles.securityText}>
            Payments are processed securely. Your access period follows the
            plan you choose. Cancel anytime via settings.
          </Text>
        </View>

        {!trialExpired && (
          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => {
              router.replace('/(tabs)' as never);
            }}
          >
            <Text style={styles.skipButtonText}>
              Continue with Free Plan ({trialDaysRemaining} days left)
            </Text>
          </TouchableOpacity>
        )}

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
