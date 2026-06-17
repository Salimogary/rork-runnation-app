import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hasFreeAdminSubscriptionAccess } from '@/lib/role-session';

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'pending';
export type PaymentMethod = 'mtn_mobile_money' | 'airtel_money' | 'mpesa' | 'credit_card';

export interface SubscriptionPlan {
  id: string;
  name: string;
  paymentMethod: PaymentMethod;
  price: number;
  currency: string;
  displayPrice: string;
  period: 'quarterly' | 'yearly';
  periodLabel: string;
  region: 'uganda' | 'international';
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
  userRegion: 'uganda' | 'international';
  availablePlans: SubscriptionPlan[];
  refreshSubscription: () => void;
}

const TRIAL_DURATION_DAYS = 90;

const ALL_PLANS: SubscriptionPlan[] = [
  {
    id: 'ug_mtn_quarterly',
    name: 'MTN Mobile Money - Quarterly',
    paymentMethod: 'mtn_mobile_money',
    price: 20000,
    currency: 'UGX',
    displayPrice: 'UGX 20,000',
    period: 'quarterly',
    periodLabel: 'per quarter',
    region: 'uganda',
    icon: '📱',
  },
  {
    id: 'ug_airtel_quarterly',
    name: 'Airtel Money - Quarterly',
    paymentMethod: 'airtel_money',
    price: 20000,
    currency: 'UGX',
    displayPrice: 'UGX 20,000',
    period: 'quarterly',
    periodLabel: 'per quarter',
    region: 'uganda',
    icon: '📱',
  },
  {
    id: 'ug_mtn_yearly',
    name: 'MTN Mobile Money - Yearly',
    paymentMethod: 'mtn_mobile_money',
    price: 60000,
    currency: 'UGX',
    displayPrice: 'UGX 60,000',
    period: 'yearly',
    periodLabel: 'per year',
    region: 'uganda',
    icon: '📱',
  },
  {
    id: 'ug_airtel_yearly',
    name: 'Airtel Money - Yearly',
    paymentMethod: 'airtel_money',
    price: 60000,
    currency: 'UGX',
    displayPrice: 'UGX 60,000',
    period: 'yearly',
    periodLabel: 'per year',
    region: 'uganda',
    icon: '📱',
  },
  {
    id: 'intl_card_quarterly',
    name: 'Card - Quarterly',
    paymentMethod: 'credit_card',
    price: 5,
    currency: 'USD',
    displayPrice: 'USD 5',
    period: 'quarterly',
    periodLabel: 'per quarter',
    region: 'international',
    icon: '💳',
  },
  {
    id: 'intl_card_yearly',
    name: 'Card - Yearly',
    paymentMethod: 'credit_card',
    price: 15,
    currency: 'USD',
    displayPrice: 'USD 15',
    period: 'yearly',
    periodLabel: 'per year',
    region: 'international',
    icon: '💳',
  },
];

function getRegionFromCountry(country: string | undefined): 'uganda' | 'international' {
  if (!country) return 'international';
  const lower = country.toLowerCase().trim();
  if (lower === 'uganda') return 'uganda';
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
  const { user, roleSession } = useAuth();
  const queryClient = useQueryClient();
  const hasFreeAdminAccess = hasFreeAdminSubscriptionAccess(roleSession);

  const userProfileQuery = useQuery({
    queryKey: ['subscriptionUserProfile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('registrations')
        .select('country, created_at, subscription')
        .eq('registration_id', user.id)
        .single();
      if (error) {
        console.log('[Subscription] Error fetching user profile:', error);
        return null;
      }
      console.log('[Subscription] User profile data:', data);
      return data as { country: string | null; created_at: string; subscription: number | null } | null;
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
    if (userProfileQuery.data?.created_at) return userProfileQuery.data.created_at;
    if (user?.createdAt) return user.createdAt;
    return new Date().toISOString();
  }, [userProfileQuery.data, user]);

  const trialDaysRemaining = useMemo(() => {
    if (hasFreeAdminAccess) return TRIAL_DURATION_DAYS;
    return calculateTrialDaysRemaining(createdAt);
  }, [createdAt, hasFreeAdminAccess]);

  const trialExpired = hasFreeAdminAccess ? false : trialDaysRemaining <= 0;

  const userRegion = useMemo(() => {
    return getRegionFromCountry(userProfileQuery.data?.country ?? undefined);
  }, [userProfileQuery.data]);

  const subscriptionStatus = useMemo<SubscriptionStatus>(() => {
    const subColumn = userProfileQuery.data?.subscription;
    console.log('[Subscription] subscription column value:', subColumn);

    if (hasFreeAdminAccess) return 'active';

    if (subColumn === 3) return 'active';
    if (subColumn === 2) return 'expired';
    if (subColumn === 1) return 'trial';

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
  }, [userProfileQuery.data?.subscription, subscriptionQuery.data, trialExpired, hasFreeAdminAccess]);

  const isSubscribed = hasFreeAdminAccess || subscriptionStatus === 'active' || subscriptionStatus === 'trial';

  const availablePlans = useMemo(() => {
    return ALL_PLANS.filter(p => p.region === userRegion);
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

const defaultSubscriptionValue: SubscriptionContextValue = {
  subscriptionStatus: 'trial',
  isLoading: true,
  trialDaysRemaining: 90,
  trialExpired: false,
  isSubscribed: true,
  subscription: null,
  userRegion: 'international',
  availablePlans: [],
  refreshSubscription: () => {},
};

export function useSubscription(): SubscriptionContextValue {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    console.warn('[SubscriptionContext] useSubscription called outside SubscriptionProvider, returning defaults');
    return defaultSubscriptionValue;
  }
  return context;
}
