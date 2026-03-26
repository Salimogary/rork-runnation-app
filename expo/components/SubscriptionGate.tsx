import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Animated } from 'react-native';
import { Lock } from 'lucide-react-native';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useRouter } from 'expo-router';
import { useRef, useEffect } from 'react';

interface SubscriptionGateProps {
  children: React.ReactNode;
  featureName?: string;
}

export default function SubscriptionGate({ children, featureName }: SubscriptionGateProps) {
  const { isSubscribed } = useSubscription();
  const router = useRouter();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isSubscribed) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
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
    }
  }, [isSubscribed, pulseAnim]);

  if (isSubscribed) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.lockedOverlay}>
        <View style={styles.iconContainer}>
          <Animated.View style={{ opacity: pulseAnim }}>
            <Lock size={48} color="#9CA3AF" />
          </Animated.View>
        </View>
        <Text style={styles.lockedTitle}>Feature Locked</Text>
        <Text style={styles.lockedMessage}>
          {featureName
            ? `"${featureName}" is not available on an expired subscription.`
            : 'This feature is not available on an expired subscription.'}
        </Text>
        <TouchableOpacity
          style={styles.renewButton}
          onPress={() => router.push('/subscription' as any)}
          activeOpacity={0.8}
        >
          <Text style={styles.renewButtonText}>Renew Subscription</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  lockedOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  lockedTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: '#374151',
    marginBottom: 8,
  },
  lockedMessage: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  renewButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 12,
  },
  renewButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700' as const,
  },
});
