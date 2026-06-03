import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getServerClient } from '@/lib/server-client';
import { useAuth } from '@/contexts/AuthContext';

type CallbackState = 'working' | 'error';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { refreshRoleSession } = useAuth();
  const [state, setState] = useState<CallbackState>('working');
  const [message, setMessage] = useState('Completing sign-in...');

  const currentUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return window.location.href;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const finishAuth = async () => {
      try {
        const url = new URL(currentUrl);
        const code = url.searchParams.get('code');
        const errorDescription =
          url.searchParams.get('error_description') ?? url.searchParams.get('error');

        if (errorDescription) {
          throw new Error(errorDescription);
        }

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error('Sign-in completed, but no session was created.');
        }

        const provider = String(session.user.app_metadata?.provider || '').toLowerCase();
        if (provider && provider !== 'email') {
          await getServerClient().auth.ensureOauthRegistration.mutate();
        }
        await refreshRoleSession();
        if (provider && provider !== 'email') {
          await AsyncStorage.setItem('hasSeenOnboarding', 'true');
        }

        if (!isMounted) {
          return;
        }

        router.replace(provider === 'email' ? '/register' : '/(tabs)');
      } catch (error) {
        console.error('[AuthCallback] Web OAuth completion error:', error);
        if (!isMounted) {
          return;
        }

        setState('error');
        setMessage(
          error instanceof Error
            ? error.message
            : 'Sign-in could not be completed right now.'
        );
      }
    };

    void finishAuth();

    return () => {
      isMounted = false;
    };
  }, [currentUrl, refreshRoleSession, router]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {state === 'working' ? (
          <>
            <ActivityIndicator size="large" color="#18B777" />
            <Text style={styles.title}>Finishing sign-in</Text>
            <Text style={styles.message}>{message}</Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Sign-in could not finish</Text>
            <Text style={styles.message}>{message}</Text>
            <TouchableOpacity style={styles.button} onPress={() => router.replace('/register')}>
              <Text style={styles.buttonText}>Back to login</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7F6',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  title: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: '700',
    color: '#102418',
    textAlign: 'center',
  },
  message: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: '#4D5B52',
    textAlign: 'center',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#18B777',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
