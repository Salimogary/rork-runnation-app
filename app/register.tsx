import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Fingerprint, Camera, Check, Loader } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '@/lib/supabase';


type ScreenMode = 'login' | 'create' | 'forgot' | 'fullRegistration';

const MAX_GOALS = 3;

interface DbGoal {
  goal_id: number;
  Goal: string;
}

interface RegistrationData {
  firstName: string;
  otherNames: string;
  username: string;
  email: string;
  sex: string;
  dob: string;
  residence: string;
  selectedGoalIds: number[];
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

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp, signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [screenMode, setScreenMode] = useState<ScreenMode>('login');
  const [registrationData, setRegistrationData] = useState<RegistrationData>({
    firstName: '',
    otherNames: '',
    username: '',
    email: '',
    sex: '',
    dob: '',
    residence: '',
    selectedGoalIds: [],
    otherGoal: '',
    weightCurrent: '',
    weightTarget: '',
    weightMonths: '',
    country: '',
    runningClub: '',
    pin: '',
    confirmPin: '',
    photoUri: '',
  });
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [clubs, setClubs] = useState<string[]>([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [countries, setCountries] = useState<{ name: string; iso_alpha2: string }[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [dbGoals, setDbGoals] = useState<DbGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  
  const pinRef1 = useRef<TextInput>(null);
  const pinRef2 = useRef<TextInput>(null);
  const pinRef3 = useRef<TextInput>(null);
  const pinRef4 = useRef<TextInput>(null);
  const confirmPinRef1 = useRef<TextInput>(null);
  const confirmPinRef2 = useRef<TextInput>(null);
  const confirmPinRef3 = useRef<TextInput>(null);
  const confirmPinRef4 = useRef<TextInput>(null);

  React.useEffect(() => {
    checkBiometricAvailability();
    fetchClubs();
    fetchCountries();
    fetchGoalsFromDb();
  }, []);

  const fetchGoalsFromDb = async () => {
    try {
      setGoalsLoading(true);
      const { data, error } = await supabase
        .from('goals')
        .select('goal_id, Goal')
        .order('goal_id', { ascending: true });

      if (error) {
        console.error('[Register] Error fetching goals:', error);
      } else if (data) {
        console.log('[Register] Fetched goals from DB:', JSON.stringify(data));
        setDbGoals(data as DbGoal[]);
      }
    } catch (err) {
      console.error('[Register] Failed to fetch goals:', err);
    } finally {
      setGoalsLoading(false);
    }
  };

  const fetchCountries = async () => {
    try {
      setCountriesLoading(true);
      const { data, error } = await supabase
        .from('countries')
        .select('name, iso_alpha2')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching countries:', error);
      } else if (data) {
        setCountries(data as { name: string; iso_alpha2: string }[]);
      }
    } catch (err) {
      console.error('Failed to fetch countries:', err);
    } finally {
      setCountriesLoading(false);
    }
  };

  const fetchClubs = async () => {
    try {
      setClubsLoading(true);
      const { data, error } = await supabase
        .from('clubs')
        .select('club_name')
        .order('club_name', { ascending: true });

      if (error) {
        console.error('Error fetching clubs:', error);
      } else if (data) {
        setClubs(data.map((c: { club_name: string }) => c.club_name));
      }
    } catch (err) {
      console.error('Failed to fetch clubs:', err);
    } finally {
      setClubsLoading(false);
    }
  };

  const formatDobInput = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    let formatted = '';
    if (cleaned.length > 0) {
      formatted = cleaned.substring(0, 2);
    }
    if (cleaned.length > 2) {
      formatted += '/' + cleaned.substring(2, 4);
    }
    if (cleaned.length > 4) {
      formatted += '/' + cleaned.substring(4, 8);
    }
    return formatted;
  };

  const isValidDob = (dob: string): boolean => {
    const match = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return false;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    if (year < 1900 || year > new Date().getFullYear()) return false;
    const date = new Date(year, month - 1, day);
    return date.getDate() === day && date.getMonth() === month - 1 && date.getFullYear() === year;
  };

  const checkBiometricAvailability = async () => {
    if (Platform.OS === 'web') {
      setBiometricAvailable(false);
      return;
    }
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricAvailable(compatible && enrolled);
  };

  const handleBiometricAuth = async () => {
    if (!username) {
      Alert.alert('Error', 'Please enter username first');
      return;
    }

    try {
      const biometricEnabled = await SecureStore.getItemAsync(`biometric_enabled_${username.toLowerCase()}`);
      
      if (biometricEnabled !== 'true') {
        Alert.alert('Error', 'Biometric login not set up. Please log in with PIN first.');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Log in with biometrics',
        fallbackLabel: 'Use PIN',
      });

      if (result.success) {
        const savedPin = await SecureStore.getItemAsync(`biometric_pin_${username.toLowerCase()}`);
        if (savedPin) {
          setIsLoading(true);
          const { error } = await signIn(username, savedPin);
          if (error) {
            Alert.alert('Login Failed', error.message);
          } else {
            await AsyncStorage.setItem('hasSeenOnboarding', 'true');
            router.replace('/(tabs)');
          }
          setIsLoading(false);
        } else {
          Alert.alert('Error', 'Biometric authentication failed. Please log in with PIN.');
        }
      }
    } catch (error) {
      console.error('Biometric auth error:', error);
      Alert.alert('Error', 'Biometric authentication is not available.');
    }
  };

  const pickImage = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      updateRegistrationField('photoUri', result.assets[0].uri);
    }
  };

  const handlePinChange = (value: string, index: number, refs: React.RefObject<TextInput | null>[]) => {
    if (value.length > 1) {
      value = value.charAt(value.length - 1);
    }
    
    const newPin = pin.split('');
    newPin[index] = value;
    setPin(newPin.join(''));
    
    if (value && index < 3) {
      refs[index + 1].current?.focus();
    }
  };

  const handleConfirmPinChange = (value: string, index: number, refs: React.RefObject<TextInput | null>[]) => {
    if (value.length > 1) {
      value = value.charAt(value.length - 1);
    }
    
    const newPin = confirmPin.split('');
    newPin[index] = value;
    setConfirmPin(newPin.join(''));
    
    if (value && index < 3) {
      refs[index + 1].current?.focus();
    }
  };

  const handleLogin = async () => {
    if (!username || pin.length !== 4) {
      Alert.alert('Error', 'Please enter username and 4-digit PIN');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await signIn(username, pin);
      if (error) {
        Alert.alert('Login Failed', error.message);
      } else {
        if (Platform.OS !== 'web' && biometricAvailable) {
          await SecureStore.setItemAsync(`biometric_pin_${username.toLowerCase()}`, pin);
          await SecureStore.setItemAsync(`biometric_enabled_${username.toLowerCase()}`, 'true');
        }
        await AsyncStorage.setItem('hasSeenOnboarding', 'true');
        router.replace('/(tabs)');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleGoalById = (goalId: number) => {
    setRegistrationData(prev => {
      const current = prev.selectedGoalIds;
      if (current.includes(goalId)) {
        const updated = current.filter(id => id !== goalId);
        const goalName = dbGoals.find(g => g.goal_id === goalId)?.Goal || '';
        const newData: Partial<RegistrationData> = { selectedGoalIds: updated };
        if (goalName.toLowerCase().includes('weight loss')) {
          newData.weightCurrent = '';
          newData.weightTarget = '';
          newData.weightMonths = '';
        }
        return { ...prev, ...newData };
      } else {
        if (current.length >= MAX_GOALS) {
          Alert.alert('Limit Reached', `You can select up to ${MAX_GOALS} running goals.`);
          return prev;
        }
        return { ...prev, selectedGoalIds: [...current, goalId] };
      }
    });
  };

  const getSelectedGoalNames = (): string[] => {
    return registrationData.selectedGoalIds.map(id => {
      const g = dbGoals.find(goal => goal.goal_id === id);
      return g?.Goal || '';
    });
  };

  const hasWeightLossGoal = getSelectedGoalNames().some(n => n.toLowerCase().includes('weight loss'));
  const hasOtherGoal = getSelectedGoalNames().some(n => n.toLowerCase() === 'other');

  const handleCreateAccount = async () => {
    const requiredFields = [
      'firstName', 'otherNames', 'username', 'email', 'sex', 'dob',
      'residence', 'country', 'runningClub', 'pin', 'confirmPin'
    ];

    const emptyFields = requiredFields.filter(field => !registrationData[field as keyof RegistrationData]);
    if (emptyFields.length > 0) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (registrationData.selectedGoalIds.length === 0) {
      Alert.alert('Error', 'Please select at least one running goal');
      return;
    }

    if (!acceptedTerms) {
      Alert.alert('Terms & Conditions', 'You must accept the Terms and Conditions and Privacy Policy to register.');
      return;
    }

    if (!isValidDob(registrationData.dob)) {
      Alert.alert('Error', 'Please enter a valid date of birth in DD/MM/YYYY format');
      return;
    }

    if (hasWeightLossGoal) {
      if (!registrationData.weightCurrent || !registrationData.weightTarget || !registrationData.weightMonths) {
        Alert.alert('Error', 'Please fill in your weight loss details (current weight, target weight, and timeframe)');
        return;
      }
    }

    if (registrationData.pin.length !== 4 || registrationData.confirmPin.length !== 4) {
      Alert.alert('Error', 'PIN must be 4 digits');
      return;
    }

    if (registrationData.pin !== registrationData.confirmPin) {
      Alert.alert('Error', 'PINs do not match');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await signUp(registrationData.username, registrationData.pin, {
        ...registrationData,
        runningGoals: getSelectedGoalNames(),
      });
      if (error) {
        Alert.alert('Registration Failed', error.message);
      } else {
        if (Platform.OS !== 'web' && biometricAvailable) {
          await SecureStore.setItemAsync(`biometric_pin_${registrationData.username.toLowerCase()}`, registrationData.pin);
          await SecureStore.setItemAsync(`biometric_enabled_${registrationData.username.toLowerCase()}`, 'true');
        }
        await AsyncStorage.setItem('hasSeenOnboarding', 'true');
        router.replace('/(tabs)');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const updateRegistrationField = (field: keyof RegistrationData, value: string) => {
    setRegistrationData(prev => ({ ...prev, [field]: value }));
  };

  const handleForgotPin = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsLoading(false);
    
    Alert.alert(
      'Recovery PIN Sent',
      `A system-generated PIN has been sent to ${email}. Please check your email.`,
      [
        {
          text: 'OK',
          onPress: () => {
            setScreenMode('login');
            setEmail('');
          }
        }
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#C74E1A', '#D4691E', '#CC8800']}
        style={styles.gradient}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.logo}>🏃</Text>
              <Text style={styles.title}>Maun Runner</Text>
              <Text style={styles.subtitle}>
                {screenMode === 'login' && 'Welcome back!'}
                {screenMode === 'create' && 'Join the community'}
                {screenMode === 'forgot' && 'Recover your PIN'}
              </Text>
            </View>

            <View style={styles.form}>
              {screenMode === 'fullRegistration' ? (
                <>
                  <Text style={styles.formTitle}>Registration Form</Text>
                  
                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>First Name *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter first name"
                      placeholderTextColor="#999"
                      value={registrationData.firstName}
                      onChangeText={(text) => updateRegistrationField('firstName', text)}
                      editable={!isLoading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Other Names *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter other names"
                      placeholderTextColor="#999"
                      value={registrationData.otherNames}
                      onChangeText={(text) => updateRegistrationField('otherNames', text)}
                      editable={!isLoading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Username *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Choose a username"
                      placeholderTextColor="#999"
                      value={registrationData.username}
                      onChangeText={(text) => updateRegistrationField('username', text)}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isLoading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Email *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter email address"
                      placeholderTextColor="#999"
                      value={registrationData.email}
                      onChangeText={(text) => updateRegistrationField('email', text)}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      editable={!isLoading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Sex *</Text>
                    <View style={styles.pickerContainer}>
                      <Picker
                        selectedValue={registrationData.sex}
                        onValueChange={(value: string) => updateRegistrationField('sex', value)}
                        style={styles.picker}
                        enabled={!isLoading}
                      >
                        <Picker.Item label="Select sex" value="" />
                        <Picker.Item label="Male" value="M" />
                        <Picker.Item label="Female" value="F" />
                      </Picker>
                    </View>
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Date of Birth *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="DD/MM/YYYY"
                      placeholderTextColor="#999"
                      value={registrationData.dob}
                      onChangeText={(text) => {
                        const formatted = formatDobInput(text);
                        updateRegistrationField('dob', formatted);
                      }}
                      keyboardType="number-pad"
                      maxLength={10}
                      editable={!isLoading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Country *</Text>
                    <View style={styles.pickerContainer}>
                      <Picker
                        selectedValue={registrationData.country}
                        onValueChange={(value: string) => updateRegistrationField('country', value)}
                        style={styles.picker}
                        enabled={!isLoading && !countriesLoading}
                      >
                        <Picker.Item label={countriesLoading ? "Loading countries..." : "Select country"} value="" />
                        {countries.map((c) => (
                          <Picker.Item key={c.iso_alpha2} label={c.name} value={c.iso_alpha2} />
                        ))}
                      </Picker>
                    </View>
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Residence (city/district/state/province) *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter city/district/state/province"
                      placeholderTextColor="#999"
                      value={registrationData.residence}
                      onChangeText={(text) => updateRegistrationField('residence', text)}
                      editable={!isLoading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Running Goals * (select up to 3)</Text>
                    {goalsLoading ? (
                      <View style={styles.goalsLoadingRow}>
                        <Loader size={18} color="#fff" />
                        <Text style={styles.goalsLoadingText}>Loading goals...</Text>
                      </View>
                    ) : (
                      <View style={styles.goalsContainer}>
                        {dbGoals.map((goal) => {
                          const isSelected = registrationData.selectedGoalIds.includes(goal.goal_id);
                          return (
                            <TouchableOpacity
                              key={goal.goal_id}
                              style={[styles.goalChip, isSelected && styles.goalChipSelected]}
                              onPress={() => toggleGoalById(goal.goal_id)}
                              activeOpacity={0.7}
                              disabled={isLoading}
                            >
                              {isSelected && (
                                <Check size={14} color="#fff" style={{ marginRight: 4 }} />
                              )}
                              <Text style={[styles.goalChipText, isSelected && styles.goalChipTextSelected]}>
                                {goal.Goal}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    <Text style={styles.goalCount}>
                      {registrationData.selectedGoalIds.length}/{MAX_GOALS} selected
                    </Text>
                  </View>

                  {hasOtherGoal && (
                    <View style={styles.inputContainer}>
                      <Text style={styles.label}>Describe your goal</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Type your running goal"
                        placeholderTextColor="#999"
                        value={registrationData.otherGoal}
                        onChangeText={(text) => updateRegistrationField('otherGoal', text)}
                        editable={!isLoading}
                      />
                    </View>
                  )}

                  {hasWeightLossGoal && (
                    <View style={styles.weightLossSection}>
                      <Text style={styles.weightLossSectionTitle}>Weight Loss Details</Text>
                      <View style={styles.inputContainer}>
                        <Text style={styles.label}>Current Weight (kg) *</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. 80"
                          placeholderTextColor="#999"
                          value={registrationData.weightCurrent}
                          onChangeText={(text) => updateRegistrationField('weightCurrent', text)}
                          keyboardType="decimal-pad"
                          editable={!isLoading}
                        />
                      </View>
                      <View style={styles.inputContainer}>
                        <Text style={styles.label}>Target Weight (kg) *</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. 65"
                          placeholderTextColor="#999"
                          value={registrationData.weightTarget}
                          onChangeText={(text) => updateRegistrationField('weightTarget', text)}
                          keyboardType="decimal-pad"
                          editable={!isLoading}
                        />
                      </View>
                      <View style={styles.inputContainer}>
                        <Text style={styles.label}>Target Duration (months) *</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. 6"
                          placeholderTextColor="#999"
                          value={registrationData.weightMonths}
                          onChangeText={(text) => updateRegistrationField('weightMonths', text.replace(/[^0-9]/g, ''))}
                          keyboardType="number-pad"
                          editable={!isLoading}
                        />
                      </View>
                    </View>
                  )}

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Running Club *</Text>
                    <View style={styles.pickerContainer}>
                      <Picker
                        selectedValue={registrationData.runningClub}
                        onValueChange={(value: string) => updateRegistrationField('runningClub', value)}
                        style={styles.picker}
                        enabled={!isLoading && !clubsLoading}
                      >
                        <Picker.Item label={clubsLoading ? "Loading clubs..." : "Select running club"} value="" />
                        <Picker.Item label="None - Prefer no club" value="None - Prefer no club" />
                        <Picker.Item label="None - Want to join a club" value="None - Want to join a club" />
                        {clubs.map((club) => (
                          <Picker.Item key={club} label={club} value={club} />
                        ))}
                      </Picker>
                    </View>
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Add Photo (Optional)</Text>
                    <TouchableOpacity
                      style={styles.photoButton}
                      onPress={pickImage}
                      disabled={isLoading}
                      activeOpacity={0.7}
                    >
                      {registrationData.photoUri ? (
                        <Image
                          source={{ uri: registrationData.photoUri }}
                          style={styles.photoPreview}
                        />
                      ) : (
                        <View style={styles.photoPlaceholder}>
                          <Camera size={40} color="#999" />
                          <Text style={styles.photoPlaceholderText}>Tap to add photo</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>4-Digit PIN *</Text>
                    <View style={styles.pinNoteContainer}>
                      <Text style={styles.pinNoteText}>
                        Your PIN is used to protect Shop access and to confirm when signing out. It is not required each time you open the app.
                      </Text>
                    </View>
                    <View style={styles.pinContainer}>
                      <TextInput
                        style={styles.pinInput}
                        value={registrationData.pin[0] || ''}
                        onChangeText={(value) => {
                          const newPin = registrationData.pin.split('');
                          newPin[0] = value.slice(-1);
                          updateRegistrationField('pin', newPin.join(''));
                        }}
                        keyboardType="number-pad"
                        maxLength={1}
                        secureTextEntry
                        editable={!isLoading}
                      />
                      <TextInput
                        style={styles.pinInput}
                        value={registrationData.pin[1] || ''}
                        onChangeText={(value) => {
                          const newPin = registrationData.pin.split('');
                          newPin[1] = value.slice(-1);
                          updateRegistrationField('pin', newPin.join(''));
                        }}
                        keyboardType="number-pad"
                        maxLength={1}
                        secureTextEntry
                        editable={!isLoading}
                      />
                      <TextInput
                        style={styles.pinInput}
                        value={registrationData.pin[2] || ''}
                        onChangeText={(value) => {
                          const newPin = registrationData.pin.split('');
                          newPin[2] = value.slice(-1);
                          updateRegistrationField('pin', newPin.join(''));
                        }}
                        keyboardType="number-pad"
                        maxLength={1}
                        secureTextEntry
                        editable={!isLoading}
                      />
                      <TextInput
                        style={styles.pinInput}
                        value={registrationData.pin[3] || ''}
                        onChangeText={(value) => {
                          const newPin = registrationData.pin.split('');
                          newPin[3] = value.slice(-1);
                          updateRegistrationField('pin', newPin.join(''));
                        }}
                        keyboardType="number-pad"
                        maxLength={1}
                        secureTextEntry
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Confirm PIN *</Text>
                    <View style={styles.pinContainer}>
                      <TextInput
                        style={styles.pinInput}
                        value={registrationData.confirmPin[0] || ''}
                        onChangeText={(value) => {
                          const newPin = registrationData.confirmPin.split('');
                          newPin[0] = value.slice(-1);
                          updateRegistrationField('confirmPin', newPin.join(''));
                        }}
                        keyboardType="number-pad"
                        maxLength={1}
                        secureTextEntry
                        editable={!isLoading}
                      />
                      <TextInput
                        style={styles.pinInput}
                        value={registrationData.confirmPin[1] || ''}
                        onChangeText={(value) => {
                          const newPin = registrationData.confirmPin.split('');
                          newPin[1] = value.slice(-1);
                          updateRegistrationField('confirmPin', newPin.join(''));
                        }}
                        keyboardType="number-pad"
                        maxLength={1}
                        secureTextEntry
                        editable={!isLoading}
                      />
                      <TextInput
                        style={styles.pinInput}
                        value={registrationData.confirmPin[2] || ''}
                        onChangeText={(value) => {
                          const newPin = registrationData.confirmPin.split('');
                          newPin[2] = value.slice(-1);
                          updateRegistrationField('confirmPin', newPin.join(''));
                        }}
                        keyboardType="number-pad"
                        maxLength={1}
                        secureTextEntry
                        editable={!isLoading}
                      />
                      <TextInput
                        style={styles.pinInput}
                        value={registrationData.confirmPin[3] || ''}
                        onChangeText={(value) => {
                          const newPin = registrationData.confirmPin.split('');
                          newPin[3] = value.slice(-1);
                          updateRegistrationField('confirmPin', newPin.join(''));
                        }}
                        keyboardType="number-pad"
                        maxLength={1}
                        secureTextEntry
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  <View style={styles.termsRow}>
                    <TouchableOpacity
                      style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}
                      onPress={() => setAcceptedTerms(!acceptedTerms)}
                      activeOpacity={0.7}
                    >
                      {acceptedTerms && <Check size={14} color="#fff" />}
                    </TouchableOpacity>
                    <Text style={styles.termsText}>
                      I have read and accept the{' '}
                    </Text>
                    <Link href={"/policy" as any} asChild>
                      <TouchableOpacity activeOpacity={0.7}>
                        <Text style={styles.termsLink}>Terms & Conditions and Privacy Policy</Text>
                      </TouchableOpacity>
                    </Link>
                  </View>

                  <View style={styles.buttonContainer}>
                    <TouchableOpacity
                      style={[styles.button, styles.primaryButton, (isLoading || !acceptedTerms) && styles.buttonDisabled]}
                      onPress={handleCreateAccount}
                      disabled={isLoading || !acceptedTerms}
                      activeOpacity={0.8}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.buttonText}>Complete Registration</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.textButton}
                      onPress={() => {
                        setScreenMode('login');
                        setAcceptedTerms(false);
                        setRegistrationData({
                          firstName: '',
                          otherNames: '',
                          username: '',
                          email: '',
                          sex: '',
                          dob: '',
                          residence: '',
                          selectedGoalIds: [],
                          otherGoal: '',
                          weightCurrent: '',
                          weightTarget: '',
                          weightMonths: '',
                          country: '',
                          runningClub: '',
                          pin: '',
                          confirmPin: '',
                          photoUri: '',
                        });
                      }}
                      disabled={isLoading}
                    >
                      <Text style={styles.textButtonText}>Back to Login</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : screenMode === 'forgot' ? (
                <>
                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Email Address</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter your email"
                      placeholderTextColor="#999"
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      editable={!isLoading}
                    />
                  </View>

                  <View style={styles.buttonContainer}>
                    <TouchableOpacity
                      style={[styles.button, styles.primaryButton, isLoading && styles.buttonDisabled]}
                      onPress={handleForgotPin}
                      disabled={isLoading}
                      activeOpacity={0.8}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.buttonText}>Send Recovery PIN</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.textButton}
                      onPress={() => {
                        setScreenMode('login');
                        setEmail('');
                      }}
                      disabled={isLoading}
                    >
                      <Text style={styles.textButtonText}>Back to Login</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Username / Email</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter username or email"
                      placeholderTextColor="#999"
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isLoading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <View style={styles.labelRow}>
                      <Text style={styles.label}>4-Digit PIN</Text>
                      {screenMode === 'login' && biometricAvailable && (
                        <TouchableOpacity
                          onPress={handleBiometricAuth}
                          disabled={isLoading}
                          style={styles.biometricButton}
                        >
                          <Fingerprint size={20} color="#FFFFFF" />
                          <Text style={styles.biometricText}>Use Biometric</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.pinContainer}>
                      <TextInput
                        ref={pinRef1}
                        style={styles.pinInput}
                        value={pin[0] || ''}
                        onChangeText={(value) => handlePinChange(value, 0, [pinRef1, pinRef2, pinRef3, pinRef4])}
                        keyboardType="number-pad"
                        maxLength={1}
                        secureTextEntry
                        editable={!isLoading}
                      />
                      <TextInput
                        ref={pinRef2}
                        style={styles.pinInput}
                        value={pin[1] || ''}
                        onChangeText={(value) => handlePinChange(value, 1, [pinRef1, pinRef2, pinRef3, pinRef4])}
                        keyboardType="number-pad"
                        maxLength={1}
                        secureTextEntry
                        editable={!isLoading}
                      />
                      <TextInput
                        ref={pinRef3}
                        style={styles.pinInput}
                        value={pin[2] || ''}
                        onChangeText={(value) => handlePinChange(value, 2, [pinRef1, pinRef2, pinRef3, pinRef4])}
                        keyboardType="number-pad"
                        maxLength={1}
                        secureTextEntry
                        editable={!isLoading}
                      />
                      <TextInput
                        ref={pinRef4}
                        style={styles.pinInput}
                        value={pin[3] || ''}
                        onChangeText={(value) => handlePinChange(value, 3, [pinRef1, pinRef2, pinRef3, pinRef4])}
                        keyboardType="number-pad"
                        maxLength={1}
                        secureTextEntry
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  {screenMode === 'create' && (
                    <View style={styles.inputContainer}>
                      <Text style={styles.label}>Confirm PIN</Text>
                      <View style={styles.pinContainer}>
                        <TextInput
                          ref={confirmPinRef1}
                          style={styles.pinInput}
                          value={confirmPin[0] || ''}
                          onChangeText={(value) => handleConfirmPinChange(value, 0, [confirmPinRef1, confirmPinRef2, confirmPinRef3, confirmPinRef4])}
                          keyboardType="number-pad"
                          maxLength={1}
                          secureTextEntry
                          editable={!isLoading}
                        />
                        <TextInput
                          ref={confirmPinRef2}
                          style={styles.pinInput}
                          value={confirmPin[1] || ''}
                          onChangeText={(value) => handleConfirmPinChange(value, 1, [confirmPinRef1, confirmPinRef2, confirmPinRef3, confirmPinRef4])}
                          keyboardType="number-pad"
                          maxLength={1}
                          secureTextEntry
                          editable={!isLoading}
                        />
                        <TextInput
                          ref={confirmPinRef3}
                          style={styles.pinInput}
                          value={confirmPin[2] || ''}
                          onChangeText={(value) => handleConfirmPinChange(value, 2, [confirmPinRef1, confirmPinRef2, confirmPinRef3, confirmPinRef4])}
                          keyboardType="number-pad"
                          maxLength={1}
                          secureTextEntry
                          editable={!isLoading}
                        />
                        <TextInput
                          ref={confirmPinRef4}
                          style={styles.pinInput}
                          value={confirmPin[3] || ''}
                          onChangeText={(value) => handleConfirmPinChange(value, 3, [confirmPinRef1, confirmPinRef2, confirmPinRef3, confirmPinRef4])}
                          keyboardType="number-pad"
                          maxLength={1}
                          secureTextEntry
                          editable={!isLoading}
                        />
                      </View>
                    </View>
                  )}

                  {screenMode === 'login' && (
                    <View style={styles.buttonContainer}>
                      <TouchableOpacity
                        style={[styles.button, styles.primaryButton, isLoading && styles.buttonDisabled]}
                        onPress={handleLogin}
                        disabled={isLoading}
                        activeOpacity={0.8}
                      >
                        {isLoading ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text style={styles.buttonText}>Log In</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.button, styles.secondaryButton, isLoading && styles.buttonDisabled]}
                        onPress={() => {
                          console.log('Create Account button pressed - navigating to full registration');
                          setScreenMode('fullRegistration');
                        }}
                        disabled={isLoading}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.secondaryButtonText}>Create Account</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.textButton}
                        onPress={() => setScreenMode('forgot')}
                        disabled={isLoading}
                      >
                        <Text style={styles.textButtonText}>Forgot PIN?</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {screenMode === 'create' && (
                    <View style={styles.buttonContainer}>
                      <TouchableOpacity
                        style={[styles.button, styles.primaryButton, isLoading && styles.buttonDisabled]}
                        onPress={handleCreateAccount}
                        disabled={isLoading}
                        activeOpacity={0.8}
                      >
                        {isLoading ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text style={styles.buttonText}>Create Account</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.textButton}
                        onPress={() => {
                          setScreenMode('login');
                          setPin('');
                          setConfirmPin('');
                        }}
                        disabled={isLoading}
                      >
                        <Text style={styles.textButtonText}>Already have an account? Log in</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
    opacity: 0.9,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1a1a1a',
  },
  pinContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  pinInput: {
    width: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    fontSize: 24,
    color: '#1a1a1a',
    textAlign: 'center',
    fontWeight: 'bold' as const,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
  },
  biometricText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  buttonContainer: {
    marginTop: 8,
    gap: 12,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButton: {
    backgroundColor: '#1a1a1a',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#1a1a1a',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold' as const,
  },
  secondaryButtonText: {
    color: '#1a1a1a',
    fontSize: 18,
    fontWeight: 'bold' as const,
  },
  textButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  textButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600' as const,
    opacity: 0.9,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: '#FFFFFF',
    marginBottom: 24,
    textAlign: 'center',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  picker: {
    backgroundColor: '#FFFFFF',
    color: '#1a1a1a',
  },
  photoButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    aspectRatio: 1,
    width: '100%',
    maxWidth: 200,
    alignSelf: 'center',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    gap: 8,
  },
  photoPlaceholderText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  termsText: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.9,
  },
  termsLink: {
    fontSize: 13,
    color: '#fff',
    fontWeight: 'bold' as const,
    textDecorationLine: 'underline',
  },
  pinNoteContainer: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  pinNoteText: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.9,
    lineHeight: 18,
  },
  goalsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  goalsLoadingText: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
  },
  goalsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  goalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  goalChipSelected: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  goalChipText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500' as const,
  },
  goalChipTextSelected: {
    color: '#fff',
    fontWeight: '600' as const,
  },
  goalCount: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.7,
    marginTop: 8,
  },
  weightLossSection: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  weightLossSectionTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#fff',
    marginBottom: 14,
  },
});
