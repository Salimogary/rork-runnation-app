import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearPersistedQueryCache } from '@/lib/query-cache';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getServerClient } from '@/lib/server-client';
import { EMPTY_ROLE_SESSION, type RoleSession } from '@/lib/role-session';

interface UserData {
  id: string;
  username: string;
  createdAt: string;
}

interface RegistrationData {
  firstName: string;
  otherNames: string;
  username: string;
  email?: string;
  sex: string;
  dob: string;
  residence: string;
  weightCurrent: string;
  weightTarget: string;
  weightMonths: string;
  country: string;
  hasDisability: boolean;
  paraUsesEquipment?: boolean;
  paraEquipmentType?: string;
  paraEquipmentOther?: string;
  doesIndoorWorkouts: boolean;
  hasSmartWatch: boolean;
  pin: string;
  confirmPin: string;
  photoUri?: string;
}

interface AuthContextValue {
  user: UserData | null;
  isLoading: boolean;
  roleSession: RoleSession;
  isRoleSessionLoading: boolean;
  registrationId: string;
  privateMode: boolean;
  setPrivateMode: (enabled: boolean) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
  signUp: (
    username: string,
    password: string,
    registrationData?: Partial<RegistrationData>
  ) => Promise<{ error: { message: string } | null; registrationId?: string }>;
  signOut: () => Promise<{ error: { message: string } | null }>;
  deleteAccount: () => Promise<{ error: { message: string } | null }>;
  verifyPin: (pin: string) => Promise<boolean>;
  getBiometricStatus: (username: string) => Promise<boolean>;
  disableBiometric: (username: string) => Promise<void>;
  refreshRoleSession: () => Promise<RoleSession>;
}

const STORAGE_KEYS = {
  PRIVATE_MODE: 'private_mode',
  CACHED_USER: 'runnation_cached_user',
};

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;

const secureStorage = {
  setItem: async (key: string, value: string) => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },
  getItem: async (key: string) => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  },
  deleteItem: async (key: string) => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function normalizeRoleSession(session: Partial<RoleSession> | null | undefined): RoleSession {
  const normalized = {
    ...EMPTY_ROLE_SESSION,
    ...session,
  };

  if (normalized.source !== 'auth' && normalized.source !== 'legacy' && normalized.source !== 'none') {
    normalized.source = EMPTY_ROLE_SESSION.source;
  }

  return normalized;
}

function buildUserFromSession(session: Session, roleSession: RoleSession): UserData {
  return {
    id: roleSession.registrationId ?? roleSession.authUserId ?? session.user.id,
    username:
      roleSession.username ??
      session.user.user_metadata?.username ??
      session.user.email?.split('@')[0] ??
      'runner',
    createdAt: session.user.created_at ?? new Date().toISOString(),
  };
}

function mapAuthErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'Invalid email or password.';
  }

  if (normalized.includes('email not confirmed')) {
    return 'Please confirm your email address before signing in.';
  }

  return message;
}

function isInvalidRefreshTokenError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();
  return normalized.includes('invalid refresh token') || normalized.includes('refresh token not found');
}

async function purgeStoredSupabaseSession() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const projectRef = supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co/i)?.[1];
  const keyMatches = (key: string) =>
    key.includes('supabase.auth.token') ||
    (projectRef ? key.includes(`sb-${projectRef}-auth-token`) : key.includes('sb-') && key.includes('auth-token'));

  try {
    if (Platform.OS === 'web') {
      const keys = Object.keys(localStorage).filter(keyMatches);
      keys.forEach((key) => localStorage.removeItem(key));
      return;
    }

    const keys = (await AsyncStorage.getAllKeys()).filter(keyMatches);
    if (keys.length > 0) {
      await AsyncStorage.multiRemove(keys);
    }
  } catch (error) {
    console.warn(
      '[AuthContext] Failed to purge stored Supabase session:',
      error instanceof Error ? error.message : error
    );
  }
}

async function clearStaleAuthSession() {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (error) {
    console.warn(
      '[AuthContext] Failed to clear stale auth session:',
      error instanceof Error ? error.message : error
    );
  }
  await purgeStoredSupabaseSession();
}

async function getSafeSession(): Promise<Session | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session;
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      console.warn('[AuthContext] Clearing stale Supabase session after invalid refresh token.');
      await clearStaleAuthSession();
      return null;
    }
    throw error;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [roleSession, setRoleSession] = useState<RoleSession>(EMPTY_ROLE_SESSION);
  const [isRoleSessionLoading, setIsRoleSessionLoading] = useState(false);
  const [privateMode, setPrivateModeState] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState<Record<string, { count: number; timestamp: number }>>({});

  const cacheUser = useCallback(async (nextUser: UserData | null) => {
    try {
      if (nextUser) {
        await AsyncStorage.setItem(STORAGE_KEYS.CACHED_USER, JSON.stringify(nextUser));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.CACHED_USER);
      }
    } catch (error) {
      console.warn('[AuthContext] Could not update cached user:', error);
    }
  }, []);

  const setFallbackSessionState = useCallback((session: Session | null) => {
    if (!session) {
      setUser(null);
      setRoleSession(EMPTY_ROLE_SESSION);
      return;
    }

    const fallbackRoleSession: RoleSession = {
      ...EMPTY_ROLE_SESSION,
      authUserId: session.user.id,
      source: 'auth',
    };

    const fallbackUser = {
      id: session.user.id,
      username:
        session.user.user_metadata?.username ??
        session.user.email?.split('@')[0] ??
        'runner',
      createdAt: session.user.created_at ?? new Date().toISOString(),
    };
    setRoleSession(fallbackRoleSession);
    setUser((currentUser) => {
      if (currentUser) return currentUser;
      void cacheUser(fallbackUser);
      return fallbackUser;
    });
  }, [cacheUser]);

  const hydrateFromSession = useCallback(async (session: Session | null): Promise<RoleSession> => {
    setIsRoleSessionLoading(true);

    try {
      if (!session) {
        setUser(null);
        setRoleSession(EMPTY_ROLE_SESSION);
        return EMPTY_ROLE_SESSION;
      }

      const nextRoleSession = await getServerClient().session.getRoleSession.query({
        registrationId: null,
        username: null,
      });

      const resolvedRoleSession = normalizeRoleSession(nextRoleSession as Partial<RoleSession>);
      setRoleSession(resolvedRoleSession);
      const resolvedUser = buildUserFromSession(session, resolvedRoleSession);
      setUser(resolvedUser);
      void cacheUser(resolvedUser);
      return resolvedRoleSession;
    } catch (error) {
      console.warn(
        '[AuthContext] Failed to hydrate role session from Supabase auth:',
        error instanceof Error ? error.message : error
      );

      const fallbackRoleSession: RoleSession = {
        ...EMPTY_ROLE_SESSION,
        authUserId: session?.user.id ?? null,
        source: session ? 'auth' : 'none',
      };

      setRoleSession(fallbackRoleSession);
      const fallbackUser = session
          ? {
              id: session.user.id,
              username: session.user.email?.split('@')[0] ?? 'runner',
              createdAt: session.user.created_at ?? new Date().toISOString(),
            }
          : null;
      setUser((currentUser) => {
        if (currentUser) return currentUser;
        void cacheUser(fallbackUser);
        return fallbackUser;
      });
      return fallbackRoleSession;
    } finally {
      setIsRoleSessionLoading(false);
    }
  }, [cacheUser]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const cachedUser = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_USER);
        if (mounted && cachedUser) {
          setUser(JSON.parse(cachedUser) as UserData);
        }
      } catch (error) {
        console.warn('[AuthContext] Could not restore cached user:', error);
      }

      try {
        const storedPrivateMode = await AsyncStorage.getItem(STORAGE_KEYS.PRIVATE_MODE);
        if (mounted && storedPrivateMode !== null) {
          setPrivateModeState(storedPrivateMode === 'true');
        }
      } catch (error) {
        console.error('Error loading private mode:', error);
      }

      try {
        const session = await getSafeSession();
        if (!mounted) return;

        setFallbackSessionState(session);
        setIsLoading(false);

        void hydrateFromSession(session).catch((error) => {
          console.warn(
            '[AuthContext] Background role session hydration failed:',
            error instanceof Error ? error.message : error
          );
        });
      } catch (error) {
        console.error('Error checking auth status:', error);
        if (!mounted) return;
        setRoleSession(EMPTY_ROLE_SESSION);
        setIsLoading(false);
      }
    };

    void init();

    return () => {
      mounted = false;
    };
  }, [hydrateFromSession, setFallbackSessionState]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void hydrateFromSession(session).finally(() => {
        setIsLoading(false);
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [hydrateFromSession]);

  const setPrivateMode = useCallback(async (enabled: boolean) => {
    try {
      setPrivateModeState(enabled);
      await AsyncStorage.setItem(STORAGE_KEYS.PRIVATE_MODE, enabled ? 'true' : 'false');
    } catch (error) {
      console.error('Error saving private mode:', error);
    }
  }, []);

  const refreshRoleSession = useCallback(async (): Promise<RoleSession> => {
    const session = await getSafeSession();
    return hydrateFromSession(session);
  }, [hydrateFromSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;

    try {
      if (!cleanEmail.includes('@')) {
        return {
          error: {
            message: 'Use your email address to sign in.',
          },
        };
      }

      if (!cleanPassword) {
        return {
          error: {
            message: 'Please enter your password.',
          },
        };
      }

      await clearStaleAuthSession();

      const attempts = loginAttempts[cleanEmail];
      if (attempts) {
        const timeSinceLockout = Date.now() - attempts.timestamp;

        if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
          if (timeSinceLockout < LOCKOUT_DURATION) {
            const remainingTime = Math.ceil((LOCKOUT_DURATION - timeSinceLockout) / 60000);
            return {
              error: {
                message: `Too many failed attempts. Please try again in ${remainingTime} minutes.`,
              },
            };
          }

          setLoginAttempts((prev) => {
            const updated = { ...prev };
            delete updated[cleanEmail];
            return updated;
          });
        }
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (error) {
        setLoginAttempts((prev) => {
          const current = prev[cleanEmail] || { count: 0, timestamp: Date.now() };
          return {
            ...prev,
            [cleanEmail]: {
              count: current.count + 1,
              timestamp: Date.now(),
            },
          };
        });

        return {
          error: {
            message: mapAuthErrorMessage(error.message),
          },
        };
      }

      setLoginAttempts((prev) => {
        const updated = { ...prev };
        delete updated[cleanEmail];
        return updated;
      });

      const session = await getSafeSession();
      await hydrateFromSession(session);

      return { error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return {
        error: {
          message: error instanceof Error ? error.message : 'Sign in failed',
        },
      };
    }
  }, [hydrateFromSession, loginAttempts]);

  const signUp = useCallback(async (_username: string, password: string, registrationData?: Partial<RegistrationData>) => {
    try {
      if (!registrationData) {
        return { error: { message: 'Registration data is required' } };
      }

      const newUserData = await getServerClient().auth.register.mutate({
        firstName: registrationData.firstName || '',
        otherNames: registrationData.otherNames || '',
        username: registrationData.username || '',
        sex: registrationData.sex || '',
        dob: registrationData.dob || '',
        residence: registrationData.residence || '',
        country: registrationData.country || '',
        hasDisability: registrationData.hasDisability === true,
        paraUsesEquipment: registrationData.hasDisability === true && registrationData.paraUsesEquipment === true,
        paraEquipmentType:
          registrationData.hasDisability === true && registrationData.paraUsesEquipment === true
            ? (registrationData.paraEquipmentType || null) as "wheelchair" | "handcycle" | "prosthetic_blades" | "other" | null
            : null,
        paraEquipmentOther:
          registrationData.hasDisability === true &&
          registrationData.paraUsesEquipment === true &&
          registrationData.paraEquipmentType === "other"
            ? registrationData.paraEquipmentOther || null
            : null,
        doesIndoorWorkouts: registrationData.doesIndoorWorkouts === true,
        hasSmartWatch: registrationData.hasSmartWatch === true,
      });

      return { error: null, registrationId: newUserData.id };
    } catch (error) {
      console.error('Sign up error:', error);
      return {
        error: {
          message: error instanceof Error ? error.message : 'Sign up failed',
        },
      };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setRoleSession(EMPTY_ROLE_SESSION);
      await cacheUser(null);
      await clearPersistedQueryCache();
      return { error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      return { error: { message: 'Sign out failed' } };
    }
  }, [cacheUser]);

  const deleteAccount = useCallback(async (): Promise<{ error: { message: string } | null }> => {
    if (!user) return { error: { message: 'No user logged in' } };

    const regId = user.id;
    try {
      const deletions = [
        supabase.from('activities').delete().eq('registration_id', regId),
        supabase.from('pending_activities').delete().eq('registration_id', regId),
        supabase.from('user_goals').delete().eq('registration_id', regId),
        supabase.from('user_photos').delete().eq('registration_id', regId),
        supabase.from('club_membership_request').delete().eq('registration_id', regId),
        supabase.from('contacts').delete().eq('registration_id', regId),
        supabase.from('events_participants').delete().eq('registration_id', regId),
        supabase.from('event_enrollments').delete().eq('registration_id', regId),
        supabase.from('external_activity_submissions').delete().eq('registration_id', regId),
        supabase.from('profiles').delete().eq('registration_id', regId),
      ];

      await Promise.allSettled(deletions);

      const { error: regDeleteError } = await supabase
        .from('registrations')
        .delete()
        .eq('registration_id', regId);

      if (regDeleteError) {
        return { error: { message: 'Failed to delete account. Please contact support.' } };
      }

      await supabase.auth.signOut();
      setUser(null);
      setRoleSession(EMPTY_ROLE_SESSION);
      await cacheUser(null);
      await clearPersistedQueryCache();

      return { error: null };
    } catch (error) {
      console.error('[AuthContext] Delete account error:', error);
      return { error: { message: 'Failed to delete account. Please try again.' } };
    }
  }, [cacheUser, user]);

  const getBiometricStatus = useCallback(async (username: string): Promise<boolean> => {
    const status = await secureStorage.getItem(`biometric_enabled_${username.toLowerCase()}`);
    return status === 'true';
  }, []);

  const disableBiometric = useCallback(async (username: string) => {
    await secureStorage.deleteItem(`biometric_enabled_${username.toLowerCase()}`);
  }, []);

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser?.email) {
      return false;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: authUser.email,
      password: pin.trim(),
    });

    return !error;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    roleSession,
    isRoleSessionLoading,
    registrationId: roleSession.registrationId || '',
    privateMode,
    setPrivateMode,
    signIn,
    signUp,
    signOut,
    deleteAccount,
    verifyPin,
    getBiometricStatus,
    disableBiometric,
    refreshRoleSession,
  }), [
    deleteAccount,
    disableBiometric,
    getBiometricStatus,
    isLoading,
    isRoleSessionLoading,
    privateMode,
    refreshRoleSession,
    roleSession,
    setPrivateMode,
    signIn,
    signOut,
    signUp,
    user,
    verifyPin,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const defaultAuthValue: AuthContextValue = {
  user: null,
  isLoading: true,
  roleSession: EMPTY_ROLE_SESSION,
  isRoleSessionLoading: false,
  registrationId: '',
  privateMode: false,
  setPrivateMode: async () => {},
  signIn: async () => ({ error: { message: 'Auth not initialized' } }),
  signUp: async () => ({ error: { message: 'Auth not initialized' } }),
  signOut: async () => ({ error: { message: 'Auth not initialized' } }),
  deleteAccount: async () => ({ error: { message: 'Auth not initialized' } }),
  verifyPin: async () => false,
  getBiometricStatus: async () => false,
  disableBiometric: async () => {},
  refreshRoleSession: async () => EMPTY_ROLE_SESSION,
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    console.warn('[AuthContext] useAuth called outside AuthProvider, returning defaults');
    return defaultAuthValue;
  }
  return context;
}
