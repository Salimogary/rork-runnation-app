import createContextHook from '@nkzw/create-context-hook';
import { useEffect, useState } from 'react';
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
  email: string;
  sex: string;
  dob: string;
  residence: string;
  runningGoals: string[];
  selectedGoalIds?: number[];
  otherGoal: string;
  weightCurrent: string;
  weightTarget: string;
  weightMonths: string;
  country: string;
  runningClub: string;
  pin: string;
  confirmPin: string;
  photoUri?: string;
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

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [privateMode, setPrivateModeState] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState<{ [key: string]: { count: number; timestamp: number } }>({});

  useEffect(() => {
    checkAuthStatus();
    loadPrivateMode();
  }, []);

  const loadPrivateMode = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.PRIVATE_MODE);
      if (stored !== null) {
        setPrivateModeState(stored === 'true');
      }
    } catch (error) {
      console.error('Error loading private mode:', error);
    }
  };

  const setPrivateMode = async (enabled: boolean) => {
    try {
      setPrivateModeState(enabled);
      await AsyncStorage.setItem(STORAGE_KEYS.PRIVATE_MODE, enabled ? 'true' : 'false');
      console.log('[AuthContext] Private mode set to:', enabled);
    } catch (error) {
      console.error('Error saving private mode:', error);
    }
  };

  const checkAuthStatus = async () => {
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
  };

  const checkLoginAttempts = (username: string): { allowed: boolean; remainingTime?: number } => {
    const attempts = loginAttempts[username.toLowerCase()];
    if (!attempts) return { allowed: true };

    const timeSinceLockout = Date.now() - attempts.timestamp;
    if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
      if (timeSinceLockout < LOCKOUT_DURATION) {
        const remainingTime = Math.ceil((LOCKOUT_DURATION - timeSinceLockout) / 60000);
        return { allowed: false, remainingTime };
      } else {
        setLoginAttempts(prev => {
          const updated = { ...prev };
          delete updated[username.toLowerCase()];
          return updated;
        });
        return { allowed: true };
      }
    }
    return { allowed: true };
  };

  const recordLoginAttempt = (username: string, success: boolean) => {
    if (success) {
      setLoginAttempts(prev => {
        const updated = { ...prev };
        delete updated[username.toLowerCase()];
        return updated;
      });
    } else {
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
    }
  };

  const signIn = async (username: string, pin: string) => {
    try {
      const attemptCheck = checkLoginAttempts(username);
      if (!attemptCheck.allowed) {
        return { 
          error: { 
            message: `Too many failed attempts. Please try again in ${attemptCheck.remainingTime} minutes.` 
          } 
        };
      }

      const pinHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        pin
      );

      const { data: userData, error: queryError } = await supabase
        .from('registrations')
        .select('RegistrationID, Username, Email, "Created_At"')
        .eq('Username', username.toLowerCase())
        .eq('pin_hash', pinHash)
        .single();

      if (queryError || !userData) {
        console.log('Sign in query error:', queryError);
        recordLoginAttempt(username, false);
        return { error: { message: 'Username not found or incorrect PIN' } };
      }

      const email = userData.Email || `${username.toLowerCase()}@runapp.local`;
      const password = pinHash;

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        console.log('Supabase auth sign in failed, attempting sign up:', signInError.message);
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) {
          console.error('Supabase auth sign up error:', signUpError);
        }
      }

      const userObj: UserData = {
        id: userData.RegistrationID,
        username: userData.Username,
        createdAt: userData.Created_At || new Date().toISOString(),
      };

      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(userObj));
      await secureStorage.setItem(`biometric_enabled_${username.toLowerCase()}`, 'true');
      
      recordLoginAttempt(username, true);
      setUser(userObj);
      return { error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { error: { message: 'Sign in failed' } };
    }
  };

  const signUp = async (username: string, pin: string, registrationData?: Partial<RegistrationData>) => {
    try {
      const { data: existingUser } = await supabase
        .from('registrations')
        .select('Username')
        .eq('Username', username.toLowerCase())
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
          let residenceValue = registrationData.residence;

          const email = registrationData.email || `${username.toLowerCase()}@runapp.local`;
          const password = pinHash;

          const { error: authSignUpError } = await supabase.auth.signUp({
            email,
            password,
          });

          if (authSignUpError) {
            console.error('Supabase auth sign up error:', authSignUpError);
            return { error: { message: 'Failed to create authentication account' } };
          }

          const { data: newUserData, error: insertError } = await supabase
            .from('registrations')
            .insert({
              'First Name': registrationData.firstName,
              'Other Names': registrationData.otherNames,
              Username: username.toLowerCase(),
              Email: email,
              Sex: registrationData.sex,
              dob: registrationData.dob ? (() => { const match = registrationData.dob!.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return match ? `${match[3]}-${match[2]}-${match[1]}` : registrationData.dob; })() : null,
              Residence: residenceValue,
              'Weight Current': registrationData.weightCurrent ? parseFloat(registrationData.weightCurrent) : null,
              'Weight Target': registrationData.weightTarget ? parseFloat(registrationData.weightTarget) : null,
              Country: registrationData.country,
              'Running Club': registrationData.runningClub,
              pin_hash: pinHash,
            })
            .select('RegistrationID, Username, "Created_At"')
            .single();

          if (insertError || !newUserData) {
            console.error('registrations insert error:', insertError);
            return { error: { message: insertError?.message || 'Failed to create account' } };
          }

          registrationId = newUserData.RegistrationID;

          try {
            const selectedIds = registrationData.selectedGoalIds || [];
            const goalsArray = registrationData.runningGoals || [];
            const hasOtherGoalName = goalsArray.some(g => g.toLowerCase() === 'other') && registrationData.otherGoal;

            console.log('[AuthContext] selectedGoalIds from form:', JSON.stringify(selectedIds));
            console.log('[AuthContext] runningGoals names:', JSON.stringify(goalsArray));

            const rowsToInsert: { goals_per_user_id: string; registration_id: string; goal_id: number; other: string | null }[] = [];

            if (selectedIds.length > 0) {
              for (const goalId of selectedIds) {

                const isOtherGoal = hasOtherGoalName && await (async () => {
                  const { data: gData } = await supabase
                    .from('goals')
                    .select('Goal')
                    .eq('goal_id', goalId)
                    .single();
                  return gData?.Goal?.toLowerCase() === 'other';
                })();

                rowsToInsert.push({
                  goals_per_user_id: `${registrationId}_g${goalId}`,
                  registration_id: registrationId!,
                  goal_id: goalId,
                  other: isOtherGoal ? (registrationData.otherGoal || null) : null,
                });
              }
            } else if (goalsArray.length > 0) {
              console.log('[AuthContext] No selectedGoalIds, falling back to name-based lookup');
              const standardGoals = goalsArray.filter(g => g.toLowerCase() !== 'other');

              if (standardGoals.length > 0) {
                const { data: goalsData, error: goalsError } = await supabase
                  .from('goals')
                  .select('goal_id, Goal')
                  .in('Goal', standardGoals);

                if (goalsError) {
                  console.error('Error fetching goal_ids:', goalsError);
                } else if (goalsData) {
                  for (const g of goalsData) {
                    rowsToInsert.push({
                      goals_per_user_id: `${registrationId}_g${g.goal_id}`,
                      registration_id: registrationId!,
                      goal_id: Number(g.goal_id),
                      other: null,
                    });
                  }
                }
              }

              if (hasOtherGoalName) {
                const { data: otherGoalData } = await supabase
                  .from('goals')
                  .select('goal_id')
                  .ilike('Goal', 'other')
                  .single();

                const otherGId = otherGoalData ? Number(otherGoalData.goal_id) : 0;
                if (otherGId > 0) {
                  rowsToInsert.push({
                    goals_per_user_id: `${registrationId}_gOther`,
                    registration_id: registrationId!,
                    goal_id: otherGId,
                    other: registrationData.otherGoal || null,
                  });
                }
              }
            }

            if (rowsToInsert.length > 0) {
              console.log('[AuthContext] Inserting goals_per_user rows:', JSON.stringify(rowsToInsert));
              const { data: insertedData, error: goalsPerUserError } = await supabase
                .from('goals_per_user')
                .insert(rowsToInsert)
                .select();

              if (goalsPerUserError) {
                console.error('[AuthContext] Error saving goals_per_user:', JSON.stringify(goalsPerUserError));
              } else {
                console.log('[AuthContext] Goals saved successfully:', insertedData?.length, 'rows inserted');
                console.log('[AuthContext] Inserted data:', JSON.stringify(insertedData));
              }
            } else {
              console.warn('[AuthContext] No goal rows to insert!');
            }
          } catch (goalsError) {
            console.error('Failed to save goals:', goalsError);
          }

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
            username: newUserData.Username,
            createdAt: newUserData.Created_At || new Date().toISOString(),
          };

          await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(newUser));
          setUser(newUser);
          return { error: null };
        } catch (dbError) {
          console.error('Failed to save registration data:', dbError);
          if (registrationId) {
            await supabase.from('registrations').delete().eq('RegistrationID', registrationId);
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
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      setUser(null);
      return { error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      return { error: { message: 'Sign out failed' } };
    }
  };

  const getBiometricStatus = async (username: string): Promise<boolean> => {
    const status = await secureStorage.getItem(`biometric_enabled_${username.toLowerCase()}`);
    return status === 'true';
  };

  const disableBiometric = async (username: string) => {
    await secureStorage.deleteItem(`biometric_enabled_${username.toLowerCase()}`);
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const pinHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        pin
      );
      const { data, error } = await supabase
        .from('registrations')
        .select('RegistrationID')
        .eq('RegistrationID', user.id)
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
  };

  return {
    user,
    isLoading,
    registrationId: user?.id || '',
    privateMode,
    setPrivateMode,
    signIn,
    signUp,
    signOut,
    verifyPin,
    getBiometricStatus,
    disableBiometric,
  };
});
