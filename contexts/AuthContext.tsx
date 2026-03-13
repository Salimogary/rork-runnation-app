import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import * as Crypto from 'expo-crypto';

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
  pin: string;
  confirmPin: string;
  photoUri?: string;
}

interface AuthContextValue {
  user: UserData | null;
  isLoading: boolean;
  registrationId: string;
  privateMode: boolean;
  setPrivateMode: (enabled: boolean) => Promise<void>;
  signIn: (username: string, pin: string) => Promise<{ error: { message: string } | null }>;
  signUp: (username: string, pin: string, registrationData?: Partial<RegistrationData>) => Promise<{ error: { message: string } | null; registrationId?: string }>;
  signOut: () => Promise<{ error: { message: string } | null }>;
  deleteAccount: () => Promise<{ error: { message: string } | null }>;
  verifyPin: (pin: string) => Promise<boolean>;
  getBiometricStatus: (username: string) => Promise<boolean>;
  disableBiometric: (username: string) => Promise<void>;
}

const STORAGE_KEYS = {
  CURRENT_USER: 'current_user',
  USERS: 'users_data',
  PRIVATE_MODE: 'private_mode',
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [privateMode, setPrivateModeState] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState<{ [key: string]: { count: number; timestamp: number } }>({});

  useEffect(() => {
    const init = async () => {
      try {
        const currentUserJson = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        if (currentUserJson) {
          setUser(JSON.parse(currentUserJson));
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
      } finally {
        setIsLoading(false);
      }

      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.PRIVATE_MODE);
        if (stored !== null) {
          setPrivateModeState(stored === 'true');
        }
      } catch (error) {
        console.error('Error loading private mode:', error);
      }
    };
    void init();
  }, []);

  const setPrivateMode = useCallback(async (enabled: boolean) => {
    try {
      setPrivateModeState(enabled);
      await AsyncStorage.setItem(STORAGE_KEYS.PRIVATE_MODE, enabled ? 'true' : 'false');
      console.log('[AuthContext] Private mode set to:', enabled);
    } catch (error) {
      console.error('Error saving private mode:', error);
    }
  }, []);

  const signIn = useCallback(async (username: string, pin: string) => {
    try {
      const attempts = loginAttempts[username.toLowerCase()];
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
          } else {
            setLoginAttempts(prev => {
              const updated = { ...prev };
              delete updated[username.toLowerCase()];
              return updated;
            });
          }
        }
      }

      const pinHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        pin
      );

      const { data: userData, error: queryError } = await supabase
        .from('registrations')
        .select('registration_id, username, email, created_at')
        .eq('username', username.toLowerCase())
        .eq('pin_hash', pinHash)
        .single();

      if (queryError || !userData) {
        console.log('Sign in query error:', queryError);
        setLoginAttempts(prev => {
          const current = prev[username.toLowerCase()] || { count: 0, timestamp: Date.now() };
          return {
            ...prev,
            [username.toLowerCase()]: {
              count: current.count + 1,
              timestamp: Date.now(),
            },
          };
        });
        return { error: { message: 'Username not found or incorrect PIN' } };
      }

      const userObj: UserData = {
        id: userData.registration_id,
        username: userData.username,
        createdAt: userData.created_at || new Date().toISOString(),
      };

      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(userObj));
      await secureStorage.setItem(`biometric_enabled_${username.toLowerCase()}`, 'true');

      setLoginAttempts(prev => {
        const updated = { ...prev };
        delete updated[username.toLowerCase()];
        return updated;
      });
      setUser(userObj);
      return { error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { error: { message: 'Sign in failed' } };
    }
  }, [loginAttempts]);

  const signUp = useCallback(async (username: string, pin: string, registrationData?: Partial<RegistrationData>) => {
    try {
      const { data: existingUser } = await supabase
        .from('registrations')
        .select('username')
        .eq('username', username.toLowerCase())
        .single();

      if (existingUser) {
        return { error: { message: 'Username already exists' } };
      }

      const pinHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        pin
      );

      if (registrationData) {
        let registrationId: string | null = null;
        try {
          const residenceValue = registrationData.residence;

          const { data: newUserData, error: insertError } = await supabase
            .from('registrations')
            .insert({
              first_name: registrationData.firstName,
              other_names: registrationData.otherNames,
              username: username.toLowerCase(),
              sex: registrationData.sex,
              dob: registrationData.dob ? (() => { const match = registrationData.dob!.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return match ? `${match[3]}-${match[2]}-${match[1]}` : registrationData.dob; })() : null,
              'city / town / district': residenceValue,
              country: registrationData.country,
              pin_hash: pinHash,
            })
            .select('registration_id, username, created_at')
            .single();

          if (insertError || !newUserData) {
            console.error('registrations insert error:', insertError);
            return { error: { message: insertError?.message || 'Failed to create account' } };
          }

          registrationId = newUserData.registration_id;

          if (registrationData.photoUri) {
            try {
              const photoUri = registrationData.photoUri;
              const photoFileName = `${registrationId}_${Date.now()}.jpg`;

              const response = await fetch(photoUri);
              const blob = await response.blob();
              const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as ArrayBuffer);
                reader.onerror = reject;
                reader.readAsArrayBuffer(blob);
              });

              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('user-photos')
                .upload(photoFileName, arrayBuffer, {
                  contentType: 'image/jpeg',
                  upsert: false,
                });

              if (uploadError) {
                console.error('Photo upload error:', JSON.stringify(uploadError, null, 2));
              } else if (uploadData) {
                const { data: urlData } = supabase.storage
                  .from('user-photos')
                  .getPublicUrl(photoFileName);

                const { error: photoError } = await supabase
                  .from('user_photos')
                  .insert({
                    registration_id: registrationId,
                    file_path: urlData.publicUrl,
                    file_name: photoFileName,
                    file_size: blob.size,
                    mime_type: 'image/jpeg',
                    is_profile_photo: true,
                  });

                if (photoError) {
                  console.error('Photo insert error:', JSON.stringify(photoError, null, 2));
                }
              }
            } catch (photoError) {
              console.error('Failed to save photo:', photoError instanceof Error ? photoError.message : JSON.stringify(photoError, null, 2));
            }
          }

          const newUser: UserData = {
            id: registrationId!,
            username: newUserData.username,
            createdAt: newUserData.created_at || new Date().toISOString(),
          };

          await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(newUser));
          setUser(newUser);
          return { error: null, registrationId: registrationId! };
        } catch (dbError) {
          console.error('Failed to save registration data:', dbError);
          if (registrationId) {
            await supabase.from('registrations').delete().eq('registration_id', registrationId);
          }
          return { error: { message: 'Failed to save registration data. Please try again.' } };
        }
      } else {
        return { error: { message: 'Registration data is required' } };
      }
    } catch (error) {
      console.error('Sign up error:', error);
      return { error: { message: 'Sign up failed' } };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      setUser(null);
      return { error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      return { error: { message: 'Sign out failed' } };
    }
  }, []);

  const deleteAccount = useCallback(async (): Promise<{ error: { message: string } | null }> => {
    if (!user) return { error: { message: 'No user logged in' } };
    const regId = user.id;
    try {
      console.log('[AuthContext] Deleting account for:', regId);

      const deletions = [
        supabase.from('activities').delete().eq('RegistrationID', regId),
        supabase.from('pending_activities').delete().eq('RegistrationID', regId),
        supabase.from('user_goals').delete().eq('registration_id', regId),
        supabase.from('user_photos').delete().eq('registration_id', regId),
        supabase.from('club_membership_request').delete().eq('registration_id', regId),
        supabase.from('contacts').delete().eq('registration_id', regId),
        supabase.from('Events Participants').delete().eq('RegistrationID', regId),
        supabase.from('event_enrollments').delete().eq('RegistrationID', regId),
        supabase.from('External Activity Submissions').delete().eq('RegistrationID', regId),
      ];

      const results = await Promise.allSettled(deletions);
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.warn(`[AuthContext] Deletion step ${i} failed:`, r.reason);
        } else if (r.value?.error) {
          console.warn(`[AuthContext] Deletion step ${i} error:`, r.value.error.message);
        }
      });

      const { error: regDeleteError } = await supabase
        .from('registrations')
        .delete()
        .eq('registration_id', regId);

      if (regDeleteError) {
        console.error('[AuthContext] Failed to delete registration:', regDeleteError);
        return { error: { message: 'Failed to delete account. Please contact support.' } };
      }

      await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      setUser(null);
      console.log('[AuthContext] Account deleted successfully');
      return { error: null };
    } catch (error) {
      console.error('[AuthContext] Delete account error:', error);
      return { error: { message: 'Failed to delete account. Please try again.' } };
    }
  }, [user]);

  const getBiometricStatus = useCallback(async (username: string): Promise<boolean> => {
    const status = await secureStorage.getItem(`biometric_enabled_${username.toLowerCase()}`);
    return status === 'true';
  }, []);

  const disableBiometric = useCallback(async (username: string) => {
    await secureStorage.deleteItem(`biometric_enabled_${username.toLowerCase()}`);
  }, []);

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const pinHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        pin
      );
      const { data, error } = await supabase
        .from('registrations')
        .select('registration_id')
        .eq('registration_id', user.id)
        .eq('pin_hash', pinHash)
        .single();

      if (error || !data) {
        console.log('[AuthContext] PIN verification failed');
        return false;
      }
      return true;
    } catch (error) {
      console.error('[AuthContext] PIN verification error:', error);
      return false;
    }
  }, [user]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    registrationId: user?.id || '',
    privateMode,
    setPrivateMode,
    signIn,
    signUp,
    signOut,
    deleteAccount,
    verifyPin,
    getBiometricStatus,
    disableBiometric,
  }), [user, isLoading, privateMode, setPrivateMode, signIn, signUp, signOut, deleteAccount, verifyPin, getBiometricStatus, disableBiometric]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

const defaultAuthValue: AuthContextValue = {
  user: null,
  isLoading: true,
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
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    console.warn('[AuthContext] useAuth called outside AuthProvider, returning defaults');
    return defaultAuthValue;
  }
  return context;
}
