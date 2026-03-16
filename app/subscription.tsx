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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import type { SubscriptionPlan, PaymentMethod } from '@/contexts/SubscriptionContext';
import { supabase } from '@/lib/supabase';
import { useMutation } from '@tanstack/react-query';
import { useState, useRef, useEffect, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import {
  Crown,
  Check,
  CreditCard,
  Smartphone,
  ChevronRight,
  Shield,
  Zap,
  Trophy,
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

const FEATURES = [
  { icon: Zap, text: 'Unlimited activity tracking', color: '#FF6B35' },
  { icon: Trophy, text: 'Community rankings & medals', color: '#F59E0B' },
  { icon: Shield, text: 'Full event participation', color: '#10B981' },
];

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
    refreshSubscription,
  } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);

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

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      const { error } = await supabase.from('subscriptions').upsert(
        {
          registration_id: user.id,
          status: 'pending',
          payment_method: plan.paymentMethod,
          payment_reference: phone || null,
          amount: plan.price,
          currency: plan.currency,
          started_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: 'registration_id' }
      );

      if (error) throw error;

      const { error: regError } = await supabase
        .from('registrations')
        .update({ subscription: 3 })
        .eq('registration_id', user.id);

      if (regError) {
        console.log('[Subscription] Error updating registration subscription column:', regError);
      }
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshSubscription();
      setShowPaymentForm(false);
      setSelectedPlan(null);
      setPhoneNumber('');
      const msg =
        'Your subscription request has been submitted! You will receive a payment prompt shortly. Once payment is confirmed, your subscription will be activated.';
      if (Platform.OS !== 'web') {
        Alert.alert('Subscription Submitted', msg);
      } else {
        alert(msg);
      }
    },
    onError: (error) => {
      console.error('[Subscription] Error:', error);
      const msg = 'Failed to submit subscription. Please try again.';
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
  }, [selectedPlan]);

  const isMobilePayment =
    selectedPlan?.paymentMethod !== 'credit_card';

  if (subscriptionStatus === 'pending') {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.pendingContainer}>
          <View style={styles.pendingIconWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
          <Text style={styles.pendingTitle}>Payment Pending</Text>
          <Text style={styles.pendingText}>
            Your subscription payment is being processed. You'll get full access
            once it's confirmed.
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
            {trialExpired
              ? 'Your free plan has ended. Subscribe to continue using all features.'
              : `You have ${trialDaysRemaining} day${trialDaysRemaining !== 1 ? 's' : ''} left on your free plan.`}
          </Text>
        </Animated.View>

        <View style={styles.featuresSection}>
          <Text style={styles.sectionLabel}>WHAT YOU GET</Text>
          {FEATURES.map((feature, index) => {
            const IconComponent = feature.icon;
            return (
              <View key={index} style={styles.featureRow}>
                <View
                  style={[
                    styles.featureIconWrap,
                    { backgroundColor: feature.color + '18' },
                  ]}
                >
                  <IconComponent size={20} color={feature.color} />
                </View>
                <Text style={styles.featureText}>{feature.text}</Text>
                <Check size={18} color={colors.success} />
              </View>
            );
          })}
        </View>

        <View style={styles.pricingSection}>
          <Text style={styles.sectionLabel}>ANNUAL SUBSCRIPTION</Text>
          <Text style={styles.pricingNote}>
            {userRegion === 'uganda'
              ? 'Pay with MTN Mobile Money or Airtel Money'
              : userRegion === 'kenya'
                ? 'Pay with M-Pesa'
                : 'Pay with Credit Card'}
          </Text>

          {availablePlans.map((plan) => {
            const paymentConfig = PAYMENT_ICONS[plan.paymentMethod];
            const IconComp = paymentConfig.icon;
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
                    <IconComp size={24} color={paymentConfig.color} />
                  </View>
                  <View style={styles.planInfo}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planPeriod}>per year</Text>
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

        {showPaymentForm && selectedPlan && (
          <View style={styles.paymentFormSection}>
            <View style={styles.paymentFormHeader}>
              <Text style={styles.paymentFormTitle}>
                Pay with {selectedPlan.name}
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
                {selectedPlan.displayPrice}/year
              </Text>
            </View>

            {isMobilePayment ? (
              <View style={styles.phoneInputSection}>
                <Text style={styles.inputLabel}>
                  {selectedPlan.paymentMethod === 'mpesa'
                    ? 'M-Pesa Phone Number'
                    : selectedPlan.paymentMethod === 'mtn_mobile_money'
                      ? 'MTN Phone Number'
                      : 'Airtel Phone Number'}
                </Text>
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
                  Stripe to complete your payment.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.subscribeButton,
                (subscribeMutation.isPending ||
                  (isMobilePayment && phoneNumber.trim().length < 9)) &&
                  styles.subscribeButtonDisabled,
              ]}
              onPress={handleSubscribe}
              disabled={
                subscribeMutation.isPending ||
                (isMobilePayment && phoneNumber.trim().length < 9)
              }
              activeOpacity={0.8}
            >
              {subscribeMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.subscribeButtonText}>
                  {isMobilePayment
                    ? 'Request Payment'
                    : 'Pay with Card'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.securityNote}>
          <Shield size={16} color="#999" />
          <Text style={styles.securityText}>
            Payments are processed securely. Your subscription auto-renews
            annually. Cancel anytime via settings.
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
  featuresSection: {
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
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#999',
    letterSpacing: 1,
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingVertical: 10,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500' as const,
    color: '#333',
  },
  pricingSection: {
    marginBottom: 20,
  },
  pricingNote: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    marginTop: -8,
  },
  planCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
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
  },
  planPrice: {
    fontSize: 18,
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
