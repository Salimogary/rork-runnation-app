import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'pending';
export type PaymentMethod = 'mtn_mobile_money' | 'airtel_money' | 'mpesa' | 'credit_card';

export interface SubscriptionPlan {
  id: string;
  name: string;
  paymentMethod: PaymentMethod;
  price: number;
  currency: string;
  displayPrice: string;
  region: 'uganda' | 'kenya' | 'international';
  icon: string;
}

export interface SubscriptionData {
  subscription_id: number;
  registration_id: string;
  status: string;
  payment_method: string | null;
  payment_reference: string | null;
  amount: number | null;
  currency: string | null;
  started_at: string;
  expires_at: string | null;
  created_at: string;
}

interface SubscriptionContextValue {
  subscriptionStatus: SubscriptionStatus;
  isLoading: boolean;
  trialDaysRemaining: number;
  trialExpired: boolean;
  isSubscribed: boolean;
  subscription: SubscriptionData | null;
  userRegion: 'uganda' | 'kenya' | 'international';
  availablePlans: SubscriptionPlan[];
  refreshSubscription: () => void;
}

const TRIAL_DURATION_DAYS = 90;

const ALL_PLANS: SubscriptionPlan[] = [
  {
    id: 'ug_mtn',
    name: 'MTN Mobile Money',
    paymentMethod: 'mtn_mobile_money',
    price: 25000,
    currency: 'UGX',
    displayPrice: 'UGX 25,000',
    region: 'uganda',
    icon: '📱',
  },
  {
    id: 'ug_airtel',
    name: 'Airtel Money',
    paymentMethod: 'airtel_money',
    price: 25000,
    currency: 'UGX',
    displayPrice: 'UGX 25,000',
    region: 'uganda',
    icon: '📱',
  },
  {
    id: 'ke_mpesa',
    name: 'M-Pesa',
    paymentMethod: 'mpesa',
    price: 1000,
    currency: 'KES',
    displayPrice: 'KES 1,000',
    region: 'kenya',
    icon: '📱',
  },
  {
    id: 'intl_card',
    name: 'Credit Card',
    paymentMethod: 'credit_card',
    price: 7,
    currency: 'USD',
    displayPrice: 'USD 7',
    region: 'international',
    icon: '💳',
  },
];

function getRegionFromCountry(country: string | undefined): 'uganda' | 'kenya' | 'international' {
  if (!country) return 'international';
  const lower = country.toLowerCase().trim();
  if (lower === 'uganda') return 'uganda';
  if (lower === 'kenya') return 'kenya';
  return 'international';
}

function calculateTrialDaysRemaining(createdAt: string): number {
  const created = new Date(createdAt);
  const trialEnd = new Date(created.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();
  const remaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, remaining);
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const userProfileQuery = useQuery({
    queryKey: ['subscriptionUserProfile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('registrations')
        .select('Country, "Created_At"')
        .eq('RegistrationID', user.id)
        .single();
      if (error) {
        console.log('[Subscription] Error fetching user profile:', error);
        return null;
      }
      return data as { Country: string | null; Created_At: string } | null;
    },
    enabled: !!user,
  });

  const subscriptionQuery = useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('registration_id', user.id)
        .maybeSingle();
      if (error) {
        console.log('[Subscription] Error fetching subscription:', error);
        return null;
      }
      return data as SubscriptionData | null;
    },
    enabled: !!user,
  });

  const createdAt = useMemo(() => {
    if (userProfileQuery.data?.Created_At) return userProfileQuery.data.Created_At;
    if (user?.createdAt) return user.createdAt;
    return new Date().toISOString();
  }, [userProfileQuery.data, user]);

  const trialDaysRemaining = useMemo(() => {
    return calculateTrialDaysRemaining(createdAt);
  }, [createdAt]);

  const trialExpired = trialDaysRemaining <= 0;

  const userRegion = useMemo(() => {
    return getRegionFromCountry(userProfileQuery.data?.Country ?? undefined);
  }, [userProfileQuery.data]);

  const subscriptionStatus = useMemo<SubscriptionStatus>(() => {
    const sub = subscriptionQuery.data;
    if (sub) {
      if (sub.status === 'active') {
        if (sub.expires_at) {
          const expiresAt = new Date(sub.expires_at);
          if (expiresAt > new Date()) return 'active';
          return 'expired';
        }
        return 'active';
      }
      if (sub.status === 'pending') return 'pending';
      if (sub.status === 'expired') return 'expired';
    }
    if (!trialExpired) return 'trial';
    return 'expired';
  }, [subscriptionQuery.data, trialExpired]);

  const isSubscribed = subscriptionStatus === 'active' || subscriptionStatus === 'trial';

  const availablePlans = useMemo(() => {
    const regionPlans = ALL_PLANS.filter(p => p.region === userRegion);
    const cardPlan = ALL_PLANS.find(p => p.paymentMethod === 'credit_card');
    if (userRegion === 'international') return regionPlans;
    if (cardPlan && !regionPlans.find(p => p.paymentMethod === 'credit_card')) {
      return [...regionPlans, cardPlan];
    }
    return regionPlans;
  }, [userRegion]);

  const refreshSubscription = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['subscription', user?.id] });
    void queryClient.invalidateQueries({ queryKey: ['subscriptionUserProfile', user?.id] });
  }, [queryClient, user?.id]);

  const isLoading = userProfileQuery.isLoading || subscriptionQuery.isLoading;

  const value = useMemo<SubscriptionContextValue>(() => ({
    subscriptionStatus,
    isLoading,
    trialDaysRemaining,
    trialExpired,
    isSubscribed,
    subscription: subscriptionQuery.data ?? null,
    userRegion,
    availablePlans,
    refreshSubscription,
  }), [subscriptionStatus, isLoading, trialDaysRemaining, trialExpired, isSubscribed, subscriptionQuery.data, userRegion, availablePlans, refreshSubscription]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
