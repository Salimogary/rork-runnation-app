import React, { useState, useRef, useEffect } from 'react';
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
  Animated,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Fingerprint, Camera, Check, ChevronRight, Target, Users, UserPlus, UserCheck, PlusCircle, X, MapPin, Globe, FileText, Download, ChevronLeft, Phone, Mail } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '@/lib/supabase';


type ScreenMode = 'login' | 'create' | 'forgot' | 'fullRegistration';
type RegistrationStep = 1 | 2 | 3 | 4;

interface RegistrationData {
  firstName: string;
  otherNames: string;
  username: string;
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

interface ContactData {
  countryCode: string;
  phone: string;
  email: string;
}

interface GoalItem {
  goal_id: number;
  Goal: string;
}

interface ClubItem {
  club_id: number;
  club_name: string;
  country: string | null;
  location: string | null;
  description: string | null;
}

type ClubChoice = 'join' | 'existing' | 'start' | 'none' | null;

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp, signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [screenMode, setScreenMode] = useState<ScreenMode>('login');
  const [registrationStep, setRegistrationStep] = useState<RegistrationStep>(1);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [registrationData, setRegistrationData] = useState<RegistrationData>({
    firstName: '',
    otherNames: '',
    username: '',
    sex: '',
    dob: '',
    residence: '',
    weightCurrent: '',
    weightTarget: '',
    weightMonths: '',
    country: '',
    pin: '',
    confirmPin: '',
    photoUri: '',
  });
  const [contactData, setContactData] = useState<ContactData>({
    countryCode: '',
    phone: '',
    email: '',
  });
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [countries, setCountries] = useState<{ name: string; iso_alpha2: string }[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);

  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [selectedGoalIds, setSelectedGoalIds] = useState<number[]>([]);
  const [otherGoalText, setOtherGoalText] = useState('');

  const [clubs, setClubs] = useState<ClubItem[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState<number | null>(null);
  const [clubChoice, setClubChoice] = useState<ClubChoice>(null);

  const stepAnim = useRef(new Animated.Value(0)).current;

  const pinRef1 = useRef<TextInput>(null);
  const pinRef2 = useRef<TextInput>(null);
  const pinRef3 = useRef<TextInput>(null);
  const pinRef4 = useRef<TextInput>(null);

  useEffect(() => {
    void checkBiometricAvailability();
    void fetchCountries();
  }, []);

  useEffect(() => {
    if (registrationStep === 3) {
      void fetchGoals();
    } else if (registrationStep === 4) {
      void fetchClubs();
    }
  }, [registrationStep]);

  useEffect(() => {
    Animated.spring(stepAnim, {
      toValue: registrationStep - 1,
      useNativeDriver: true,
      tension: 50,
      friction: 10,
    }).start();
  }, [registrationStep, stepAnim]);

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

  const fetchGoals = async () => {
    try {
      setGoalsLoading(true);
      const { data, error } = await supabase
        .from('goals')
        .select('goal_id, Goal')
        .order('goal_id', { ascending: true });

      if (error) {
        console.error('Error fetching goals:', error);
      } else if (data) {
        setGoals(data as GoalItem[]);
      }
    } catch (err) {
      console.error('Failed to fetch goals:', err);
    } finally {
      setGoalsLoading(false);
    }
  };

  const fetchClubs = async () => {
    try {
      setClubsLoading(true);
      const { data, error } = await supabase
        .from('clubs')
        .select('club_id, club_name, country, location, description')
        .order('club_name', { ascending: true });

      if (error) {
        console.error('Error fetching clubs:', error);
      } else if (data) {
        setClubs(data as ClubItem[]);
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

  const handleStep1Complete = async () => {
    const requiredFields = [
      'firstName', 'otherNames', 'username', 'sex', 'dob',
      'residence', 'country', 'pin', 'confirmPin'
    ];

    const emptyFields = requiredFields.filter(field => !registrationData[field as keyof RegistrationData]);
    if (emptyFields.length > 0) {
      Alert.alert('Error', 'Please fill in all required fields');
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
      const { error, registrationId: newRegId } = await signUp(registrationData.username, registrationData.pin, {
        ...registrationData,
      }) as { error: { message: string } | null; registrationId?: string };

      if (error) {
        Alert.alert('Registration Failed', error.message);
      } else {
        if (Platform.OS !== 'web' && biometricAvailable) {
          await SecureStore.setItemAsync(`biometric_pin_${registrationData.username.toLowerCase()}`, registrationData.pin);
          await SecureStore.setItemAsync(`biometric_enabled_${registrationData.username.toLowerCase()}`, 'true');
        }

        const regId = newRegId || null;
        if (!regId) {
          const { data: regData } = await supabase
            .from('registrations')
            .select('RegistrationID')
            .eq('Username', registrationData.username.toLowerCase())
            .single();
          setRegistrationId(regData?.RegistrationID || null);
        } else {
          setRegistrationId(regId);
        }

        console.log('[Register] Step 1 complete, moving to contacts. RegistrationID:', regId);
        setRegistrationStep(2);
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep2Complete = async () => {
    if (!registrationId) {
      console.error('[Register] No registrationId for step 2 (contacts)');
      Alert.alert('Error', 'Registration ID not found. Please try again.');
      return;
    }

    if (!contactData.email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactData.email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (!contactData.phone.trim()) {
      Alert.alert('Error', 'Please enter your phone number');
      return;
    }

    if (!contactData.countryCode.trim()) {
      Alert.alert('Error', 'Please select your country/state code');
      return;
    }

    setIsLoading(true);

    try {
      const phoneNumber = parseInt(contactData.phone.replace(/[^0-9]/g, ''), 10);

      console.log('[Register] Inserting contact:', {
        registration_id: registrationId,
        country_code: contactData.countryCode,
        phone: phoneNumber,
        email: contactData.email.trim(),
      });

      const { error: contactError } = await supabase
        .from('contacts')
        .insert({
          registration_id: registrationId,
          country_code: contactData.countryCode,
          phone: phoneNumber,
          email: contactData.email.trim(),
        });

      if (contactError) {
        console.error('[Register] Error saving contacts:', JSON.stringify(contactError));
        Alert.alert('Error', 'Failed to save contact information. Please try again.');
      } else {
        console.log('[Register] Contacts saved, moving to goals');
        setRegistrationStep(3);
      }
    } catch (err) {
      console.error('[Register] Contact save error:', err);
      Alert.alert('Error', 'Something went wrong saving your contact info.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep3Complete = async () => {
    if (!registrationId) {
      console.error('[Register] No registrationId for step 3');
      Alert.alert('Error', 'Registration ID not found. Please try again.');
      return;
    }

    setIsLoading(true);

    try {
      const hasOtherGoal = selectedGoalIds.some(id => {
        const goal = goals.find(g => g.goal_id === id);
        return goal?.Goal?.toLowerCase() === 'other';
      });

      const rowsToInsert = selectedGoalIds.map(goalId => {
        const goal = goals.find(g => g.goal_id === goalId);
        const isOther = goal?.Goal?.toLowerCase() === 'other';
        const goalText = isOther && hasOtherGoal ? (otherGoalText || 'Other') : (goal?.Goal || '');
        return {
          registration_id: registrationId,
          goal: goalText,
        };
      });

      console.log('[Register] Inserting user_goals:', JSON.stringify(rowsToInsert));

      const { error: goalsError } = await supabase
        .from('user_goals')
        .insert(rowsToInsert);

      if (goalsError) {
        console.error('[Register] Error saving goals:', JSON.stringify(goalsError));
        Alert.alert('Error', 'Failed to save goals. Please try again.');
      } else {
        console.log('[Register] Goals saved, moving to clubs');
        setRegistrationStep(4);
      }
    } catch (err) {
      console.error('[Register] Goals save error:', err);
      Alert.alert('Error', 'Something went wrong saving your goals.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep4Complete = async () => {
    if (!registrationId) {
      console.error('[Register] No registrationId for step 4');
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
      router.replace('/(tabs)');
      return;
    }

    if (clubChoice === 'join' || clubChoice === 'existing') {
      if (!selectedClubId) {
        Alert.alert('Select a Club', 'Please choose a club from the list.');
        return;
      }
    }

    setIsLoading(true);

    try {
      let clubValue: string | null = null;
      let newMemberValue: string = 'No';

      if (clubChoice === 'join') {
        const selectedClub = clubs.find(c => c.club_id === selectedClubId);
        clubValue = selectedClub?.club_name || null;
        newMemberValue = 'Yes';
      } else if (clubChoice === 'existing') {
        const selectedClub = clubs.find(c => c.club_id === selectedClubId);
        clubValue = selectedClub?.club_name || null;
        newMemberValue = 'No';
      } else if (clubChoice === 'start') {
        clubValue = 'new request';
        newMemberValue = 'Yes';
      } else {
        clubValue = null;
        newMemberValue = 'No';
      }

      console.log('[Register] Inserting club_membership_request:', { club: clubValue, new_member: newMemberValue });

      const { error: clubError } = await supabase
        .from('club_membership_request')
        .insert({
          registration_id: registrationId,
          club: clubValue,
          new_member: newMemberValue,
        });

      if (clubError) {
        console.error('[Register] Error saving club membership:', JSON.stringify(clubError));
        Alert.alert('Error', 'Failed to save club membership request. Please try again.');
        setIsLoading(false);
        return;
      }
      console.log('[Register] Club membership request saved');

      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
      router.replace('/(tabs)');
    } catch (err) {
      console.error('[Register] Club save error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipGoals = async () => {
    console.log('[Register] Skipping goals step');
    setRegistrationStep(4);
  };

  const handleSkipStep = async () => {
    if (registrationStep === 2) {
      setRegistrationStep(3);
    } else if (registrationStep === 3) {
      setRegistrationStep(4);
    } else if (registrationStep === 4) {
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
      router.replace('/(tabs)');
    }
  };

  const toggleGoal = (goalId: number) => {
    setSelectedGoalIds(prev =>
      prev.includes(goalId)
        ? prev.filter(id => id !== goalId)
        : [...prev, goalId]
    );
  };

  const updateRegistrationField = (field: keyof RegistrationData, value: string) => {
    setRegistrationData(prev => ({ ...prev, [field]: value }));
  };

  const updateContactField = (field: keyof ContactData, value: string) => {
    setContactData(prev => ({ ...prev, [field]: value }));
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

  const showsOtherInput = selectedGoalIds.some(id => {
    const goal = goals.find(g => g.goal_id === id);
    return goal?.Goal?.toLowerCase() === 'other';
  });

  const COUNTRY_CODES = [
    { label: '+1 (US/CA)', value: '+1' },
    { label: '+44 (UK)', value: '+44' },
    { label: '+91 (India)', value: '+91' },
    { label: '+61 (Australia)', value: '+61' },
    { label: '+86 (China)', value: '+86' },
    { label: '+81 (Japan)', value: '+81' },
    { label: '+49 (Germany)', value: '+49' },
    { label: '+33 (France)', value: '+33' },
    { label: '+55 (Brazil)', value: '+55' },
    { label: '+27 (South Africa)', value: '+27' },
    { label: '+254 (Kenya)', value: '+254' },
    { label: '+234 (Nigeria)', value: '+234' },
    { label: '+256 (Uganda)', value: '+256' },
    { label: '+255 (Tanzania)', value: '+255' },
    { label: '+251 (Ethiopia)', value: '+251' },
    { label: '+233 (Ghana)', value: '+233' },
    { label: '+237 (Cameroon)', value: '+237' },
    { label: '+250 (Rwanda)', value: '+250' },
    { label: '+263 (Zimbabwe)', value: '+263' },
    { label: '+260 (Zambia)', value: '+260' },
    { label: '+265 (Malawi)', value: '+265' },
    { label: '+258 (Mozambique)', value: '+258' },
    { label: '+267 (Botswana)', value: '+267' },
    { label: '+264 (Namibia)', value: '+264' },
    { label: '+230 (Mauritius)', value: '+230' },
    { label: '+248 (Seychelles)', value: '+248' },
    { label: '+966 (Saudi Arabia)', value: '+966' },
    { label: '+971 (UAE)', value: '+971' },
    { label: '+974 (Qatar)', value: '+974' },
    { label: '+65 (Singapore)', value: '+65' },
    { label: '+60 (Malaysia)', value: '+60' },
    { label: '+63 (Philippines)', value: '+63' },
    { label: '+62 (Indonesia)', value: '+62' },
    { label: '+66 (Thailand)', value: '+66' },
    { label: '+82 (South Korea)', value: '+82' },
    { label: '+64 (New Zealand)', value: '+64' },
    { label: '+353 (Ireland)', value: '+353' },
    { label: '+34 (Spain)', value: '+34' },
    { label: '+39 (Italy)', value: '+39' },
    { label: '+31 (Netherlands)', value: '+31' },
    { label: '+46 (Sweden)', value: '+46' },
    { label: '+47 (Norway)', value: '+47' },
    { label: '+48 (Poland)', value: '+48' },
    { label: '+7 (Russia)', value: '+7' },
    { label: '+52 (Mexico)', value: '+52' },
    { label: '+54 (Argentina)', value: '+54' },
    { label: '+56 (Chile)', value: '+56' },
    { label: '+57 (Colombia)', value: '+57' },
    { label: '+20 (Egypt)', value: '+20' },
    { label: '+212 (Morocco)', value: '+212' },
  ];

  const renderStepIndicator = () => (
    <View style={styles.stepIndicatorContainer}>
      {[1, 2, 3, 4].map((step) => {
        const isActive = registrationStep >= step;
        const isCurrent = registrationStep === step;
        return (
          <React.Fragment key={step}>
            <View style={[styles.stepDot, isActive && styles.stepDotActive, isCurrent && styles.stepDotCurrent]}>
              {isActive && registrationStep > step ? (
                <Check size={14} color="#fff" />
              ) : (
                <Text style={[styles.stepDotText, isActive && styles.stepDotTextActive]}>{step}</Text>
              )}
            </View>
            {step < 4 && (
              <View style={[styles.stepLine, registrationStep > step && styles.stepLineActive]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );

  const renderStepLabels = () => (
    <View style={styles.stepLabelsRow}>
      <Text style={[styles.stepLabel, registrationStep >= 1 && styles.stepLabelActive]}>Registration</Text>
      <Text style={[styles.stepLabel, registrationStep >= 2 && styles.stepLabelActive]}>Contacts</Text>
      <Text style={[styles.stepLabel, registrationStep >= 3 && styles.stepLabelActive]}>Your Goals</Text>
      <Text style={[styles.stepLabel, registrationStep >= 4 && styles.stepLabelActive]}>Club</Text>
    </View>
  );

  const renderStep1 = () => (
    <>
      <Text style={styles.formTitle}>Create Your Account</Text>

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
        <Text style={styles.label}>City/Town/District *</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter city/town/district"
          placeholderTextColor="#999"
          value={registrationData.residence}
          onChangeText={(text) => updateRegistrationField('residence', text)}
          editable={!isLoading}
        />
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
          {[0, 1, 2, 3].map((i) => (
            <TextInput
              key={`pin-${i}`}
              style={styles.pinInput}
              value={registrationData.pin[i] || ''}
              onChangeText={(value) => {
                const newPin = registrationData.pin.split('');
                newPin[i] = value.slice(-1);
                updateRegistrationField('pin', newPin.join(''));
              }}
              keyboardType="number-pad"
              maxLength={1}
              secureTextEntry
              editable={!isLoading}
            />
          ))}
        </View>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Confirm PIN *</Text>
        <View style={styles.pinContainer}>
          {[0, 1, 2, 3].map((i) => (
            <TextInput
              key={`cpin-${i}`}
              style={styles.pinInput}
              value={registrationData.confirmPin[i] || ''}
              onChangeText={(value) => {
                const newPin = registrationData.confirmPin.split('');
                newPin[i] = value.slice(-1);
                updateRegistrationField('confirmPin', newPin.join(''));
              }}
              keyboardType="number-pad"
              maxLength={1}
              secureTextEntry
              editable={!isLoading}
            />
          ))}
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
          onPress={handleStep1Complete}
          disabled={isLoading || !acceptedTerms}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.buttonInner}>
              <Text style={styles.buttonText}>Next: Contact Details</Text>
              <ChevronRight size={20} color="#fff" />
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.textButton}
          onPress={() => {
            setScreenMode('login');
            setAcceptedTerms(false);
            setRegistrationStep(1);
            setRegistrationData({
              firstName: '',
              otherNames: '',
              username: '',
              sex: '',
              dob: '',
              residence: '',
              weightCurrent: '',
              weightTarget: '',
              weightMonths: '',
              country: '',
              pin: '',
              confirmPin: '',
              photoUri: '',
            });
            setContactData({ countryCode: '', phone: '', email: '' });
          }}
          disabled={isLoading}
        >
          <Text style={styles.textButtonText}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderStep2 = () => (
    <>
      <View style={styles.stepHeader}>
        <Phone size={32} color="#fff" />
        <Text style={styles.formTitle}>Contact Details</Text>
        <Text style={styles.stepSubtitle}>Your contact information is stored securely and separately from your profile.</Text>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Country / State Code *</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={contactData.countryCode}
            onValueChange={(value: string) => updateContactField('countryCode', value)}
            style={styles.picker}
            enabled={!isLoading}
          >
            <Picker.Item label="Select country code" value="" />
            {COUNTRY_CODES.map((cc) => (
              <Picker.Item key={cc.value} label={cc.label} value={cc.value} />
            ))}
          </Picker>
        </View>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Phone Number *</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter phone number"
          placeholderTextColor="#999"
          value={contactData.phone}
          onChangeText={(text) => updateContactField('phone', text.replace(/[^0-9]/g, ''))}
          keyboardType="phone-pad"
          editable={!isLoading}
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Email Address *</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter email address"
          placeholderTextColor="#999"
          value={contactData.email}
          onChangeText={(text) => updateContactField('email', text)}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!isLoading}
        />
      </View>

      <View style={styles.contactSecurityNote}>
        <Mail size={16} color="rgba(255,255,255,0.7)" />
        <Text style={styles.contactSecurityText}>
          Your phone and email will be verified later. This information is kept separately for your security.
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton, isLoading && styles.buttonDisabled]}
          onPress={handleStep2Complete}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.buttonInner}>
              <Text style={styles.buttonText}>Next: Set Your Goals</Text>
              <ChevronRight size={20} color="#fff" />
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.textButton}
          onPress={() => void handleSkipStep()}
          disabled={isLoading}
        >
          <Text style={styles.textButtonText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderStep3 = () => (
    <>
      <View style={styles.stepHeader}>
        <Target size={32} color="#fff" />
        <Text style={styles.formTitle}>Set Your Goals</Text>
        <Text style={styles.stepSubtitle}>What do you want to achieve? Select any that apply, or skip this step.</Text>
      </View>

      {goalsLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.loadingText}>Loading goals...</Text>
        </View>
      ) : (
        <View style={styles.goalsGrid}>
          {goals.map((goal) => {
            const isSelected = selectedGoalIds.includes(goal.goal_id);
            return (
              <TouchableOpacity
                key={goal.goal_id}
                style={[styles.goalCard, isSelected && styles.goalCardSelected]}
                onPress={() => toggleGoal(goal.goal_id)}
                activeOpacity={0.7}
                disabled={isLoading}
              >
                <View style={[styles.goalCheckbox, isSelected && styles.goalCheckboxSelected]}>
                  {isSelected && <Check size={14} color="#fff" />}
                </View>
                <Text style={[styles.goalCardText, isSelected && styles.goalCardTextSelected]}>
                  {goal.Goal}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {showsOtherInput && (
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Please specify your other goal</Text>
          <TextInput
            style={styles.input}
            placeholder="Describe your goal..."
            placeholderTextColor="#999"
            value={otherGoalText}
            onChangeText={setOtherGoalText}
            editable={!isLoading}
          />
        </View>
      )}

      {selectedGoalIds.length > 0 && (
        <Text style={styles.selectedCount}>
          {selectedGoalIds.length} goal{selectedGoalIds.length !== 1 ? 's' : ''} selected
        </Text>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton, isLoading && styles.buttonDisabled]}
          onPress={selectedGoalIds.length > 0 ? handleStep3Complete : handleSkipGoals}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.buttonInner}>
              <Text style={styles.buttonText}>{selectedGoalIds.length > 0 ? 'Next: Club Membership' : 'Skip & Continue'}</Text>
              <ChevronRight size={20} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  const handleClubChoiceSelect = (choice: ClubChoice) => {
    setClubChoice(choice);
    setSelectedClubId(null);
    if (choice === 'join' || choice === 'existing') {
      void fetchClubs();
    }
  };

  const renderClubChoiceOptions = () => {
    const options: { key: ClubChoice; label: string; icon: React.ReactNode; desc: string }[] = [
      { key: 'join', label: 'Want to join a club', icon: <UserPlus size={22} color="#fff" />, desc: 'Browse and join an existing club' },
      { key: 'existing', label: 'I already have a club', icon: <UserCheck size={22} color="#fff" />, desc: 'Select your current club' },
      { key: 'start', label: 'Want to start a club', icon: <PlusCircle size={22} color="#fff" />, desc: 'Download the application form' },
      { key: 'none', label: 'No thanks', icon: <X size={22} color="#fff" />, desc: 'Continue without a club' },
    ];

    return (
      <View style={styles.clubChoiceList}>
        {options.map((opt) => {
          const isSelected = clubChoice === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.clubChoiceCard, isSelected && styles.clubChoiceCardSelected]}
              onPress={() => handleClubChoiceSelect(opt.key)}
              activeOpacity={0.7}
              disabled={isLoading}
            >
              <View style={[styles.clubChoiceIcon, isSelected && styles.clubChoiceIconSelected]}>
                {opt.icon}
              </View>
              <View style={styles.clubChoiceTextWrap}>
                <Text style={[styles.clubChoiceLabel, isSelected && styles.clubChoiceLabelSelected]}>{opt.label}</Text>
                <Text style={styles.clubChoiceDesc}>{opt.desc}</Text>
              </View>
              <View style={[styles.clubRadio, isSelected && styles.clubRadioSelected]}>
                {isSelected && <View style={styles.clubRadioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderClubJoinList = () => (
    <View style={styles.clubSubSection}>
      <TouchableOpacity style={styles.clubBackBtn} onPress={() => { setClubChoice(null); setSelectedClubId(null); }}>
        <ChevronLeft size={18} color="#fff" />
        <Text style={styles.clubBackText}>Back to options</Text>
      </TouchableOpacity>
      <Text style={styles.clubSubTitle}>Choose a club to join</Text>
      {clubsLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.loadingText}>Loading clubs...</Text>
        </View>
      ) : clubs.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No clubs available at the moment.</Text>
        </View>
      ) : (
        <View style={styles.clubsList}>
          {clubs.map((club) => {
            const isSelected = selectedClubId === club.club_id;
            return (
              <TouchableOpacity
                key={club.club_id}
                style={[styles.clubDetailCard, isSelected && styles.clubDetailCardSelected]}
                onPress={() => setSelectedClubId(isSelected ? null : club.club_id)}
                activeOpacity={0.7}
                disabled={isLoading}
              >
                <View style={styles.clubDetailHeader}>
                  <View style={[styles.clubRadio, isSelected && styles.clubRadioSelected]}>
                    {isSelected && <View style={styles.clubRadioDot} />}
                  </View>
                  <Text style={[styles.clubDetailName, isSelected && styles.clubDetailNameSelected]}>
                    {club.club_name}
                  </Text>
                </View>
                {(club.country || club.location) && (
                  <View style={styles.clubDetailMeta}>
                    {club.country && (
                      <View style={styles.clubMetaRow}>
                        <Globe size={13} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.clubMetaText}>{club.country}</Text>
                      </View>
                    )}
                    {club.location && (
                      <View style={styles.clubMetaRow}>
                        <MapPin size={13} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.clubMetaText}>{club.location}</Text>
                      </View>
                    )}
                  </View>
                )}
                {club.description && (
                  <Text style={styles.clubDetailDesc}>{club.description}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderClubExistingList = () => (
    <View style={styles.clubSubSection}>
      <TouchableOpacity style={styles.clubBackBtn} onPress={() => { setClubChoice(null); setSelectedClubId(null); }}>
        <ChevronLeft size={18} color="#fff" />
        <Text style={styles.clubBackText}>Back to options</Text>
      </TouchableOpacity>
      <Text style={styles.clubSubTitle}>Select your current club</Text>
      {clubsLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.loadingText}>Loading clubs...</Text>
        </View>
      ) : clubs.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No clubs available at the moment.</Text>
        </View>
      ) : (
        <View style={styles.clubsList}>
          {clubs.map((club) => {
            const isSelected = selectedClubId === club.club_id;
            return (
              <TouchableOpacity
                key={club.club_id}
                style={[styles.clubCard, isSelected && styles.clubCardSelected]}
                onPress={() => setSelectedClubId(isSelected ? null : club.club_id)}
                activeOpacity={0.7}
                disabled={isLoading}
              >
                <View style={[styles.clubRadio, isSelected && styles.clubRadioSelected]}>
                  {isSelected && <View style={styles.clubRadioDot} />}
                </View>
                <Text style={[styles.clubCardText, isSelected && styles.clubCardTextSelected]}>
                  {club.club_name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderClubStartNew = () => (
    <View style={styles.clubSubSection}>
      <TouchableOpacity style={styles.clubBackBtn} onPress={() => setClubChoice(null)}>
        <ChevronLeft size={18} color="#fff" />
        <Text style={styles.clubBackText}>Back to options</Text>
      </TouchableOpacity>
      <View style={styles.startClubCard}>
        <FileText size={40} color="#fff" />
        <Text style={styles.startClubTitle}>Start a New Club</Text>
        <Text style={styles.startClubDesc}>
          Download the New Club Application Form below. Fill it out and send it to the admin email address included in the form.
        </Text>
        <TouchableOpacity
          style={styles.downloadButton}
          onPress={() => {
            Alert.alert(
              'Download Form',
              'The New Club Application Form will be available for download. Please send the completed form to admin@maunrunner.com',
              [{ text: 'OK' }]
            );
          }}
          activeOpacity={0.7}
        >
          <Download size={20} color="#1a1a1a" />
          <Text style={styles.downloadButtonText}>Download Application Form</Text>
        </TouchableOpacity>
        <Text style={styles.adminEmailNote}>Send completed form to: admin@maunrunner.com</Text>
      </View>
    </View>
  );

  const renderStep4 = () => {
    const showCompleteButton = clubChoice === 'none' ||
      clubChoice === 'start' ||
      (clubChoice === 'join' && selectedClubId) ||
      (clubChoice === 'existing' && selectedClubId);

    return (
      <>
        <View style={styles.stepHeader}>
          <Users size={32} color="#fff" />
          <Text style={styles.formTitle}>Club Membership</Text>
          <Text style={styles.stepSubtitle}>Connect with fellow runners through a club.</Text>
        </View>

        {clubChoice === null && renderClubChoiceOptions()}
        {clubChoice === 'join' && renderClubJoinList()}
        {clubChoice === 'existing' && renderClubExistingList()}
        {clubChoice === 'start' && renderClubStartNew()}
        {clubChoice === 'none' && (
          <View style={styles.clubSubSection}>
            <TouchableOpacity style={styles.clubBackBtn} onPress={() => setClubChoice(null)}>
              <ChevronLeft size={18} color="#fff" />
              <Text style={styles.clubBackText}>Back to options</Text>
            </TouchableOpacity>
            <View style={styles.noClubCard}>
              <Text style={styles.noClubText}>No problem! You can always join a club later from your profile settings.</Text>
            </View>
          </View>
        )}

        <View style={styles.buttonContainer}>
          {showCompleteButton && (
            <TouchableOpacity
              style={[styles.button, styles.primaryButton, isLoading && styles.buttonDisabled]}
              onPress={handleStep4Complete}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Complete Registration</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.textButton}
            onPress={handleSkipStep}
            disabled={isLoading}
          >
            <Text style={styles.textButtonText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </>
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
              <Text style={styles.title}>RunNation</Text>
              <Text style={styles.subtitle}>
                {screenMode === 'login' && 'Welcome back!'}
                {screenMode === 'fullRegistration' && registrationStep === 1 && 'Join the community'}
                {screenMode === 'fullRegistration' && registrationStep === 2 && 'Secure your contacts'}
                {screenMode === 'fullRegistration' && registrationStep === 3 && 'Almost there!'}
                {screenMode === 'fullRegistration' && registrationStep === 4 && 'One last step!'}
                {screenMode === 'forgot' && 'Recover your PIN'}
              </Text>
            </View>

            <View style={styles.form}>
              {screenMode === 'fullRegistration' ? (
                <>
                  {renderStepIndicator()}
                  {renderStepLabels()}
                  {registrationStep === 1 && renderStep1()}
                  {registrationStep === 2 && renderStep2()}
                  {registrationStep === 3 && renderStep3()}
                  {registrationStep === 4 && renderStep4()}
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
                          setScreenMode('fullRegistration');
                          setRegistrationStep(1);
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
    marginBottom: 32,
  },
  logo: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold' as const,
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
  stepIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  stepDotActive: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderColor: '#fff',
  },
  stepDotCurrent: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  stepDotText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: 'rgba(255,255,255,0.6)',
  },
  stepDotTextActive: {
    color: '#fff',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 6,
  },
  stepLineActive: {
    backgroundColor: '#fff',
  },
  stepLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 0,
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    flex: 1,
  },
  stepLabelActive: {
    color: '#fff',
  },
  stepHeader: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.85,
    textAlign: 'center',
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
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
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  contactSecurityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  contactSecurityText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 18,
    flex: 1,
  },
  goalsGrid: {
    gap: 10,
    marginBottom: 16,
  },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    gap: 12,
  },
  goalCardSelected: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderColor: '#fff',
  },
  goalCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalCheckboxSelected: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  goalCardText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '500' as const,
    flex: 1,
  },
  goalCardTextSelected: {
    fontWeight: '700' as const,
  },
  selectedCount: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.8,
    textAlign: 'center',
    marginBottom: 8,
  },
  clubChoiceList: {
    gap: 10,
    marginBottom: 16,
  },
  clubChoiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: 12,
  },
  clubChoiceCardSelected: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: '#fff',
  },
  clubChoiceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubChoiceIconSelected: {
    backgroundColor: 'rgba(26,26,26,0.6)',
  },
  clubChoiceTextWrap: {
    flex: 1,
  },
  clubChoiceLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#fff',
  },
  clubChoiceLabelSelected: {
    fontWeight: '700' as const,
  },
  clubChoiceDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  clubSubSection: {
    marginBottom: 12,
  },
  clubBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 14,
    paddingVertical: 4,
  },
  clubBackText: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.85,
    fontWeight: '500' as const,
  },
  clubSubTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#fff',
    marginBottom: 12,
  },
  clubsList: {
    gap: 10,
    marginBottom: 16,
  },
  clubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    gap: 12,
  },
  clubCardSelected: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderColor: '#fff',
  },
  clubDetailCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  clubDetailCardSelected: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: '#fff',
  },
  clubDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clubDetailName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#fff',
    flex: 1,
  },
  clubDetailNameSelected: {
    fontWeight: '700' as const,
  },
  clubDetailMeta: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 8,
    marginLeft: 36,
  },
  clubMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clubMetaText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  clubDetailDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 6,
    marginLeft: 36,
    lineHeight: 18,
  },
  clubRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubRadioSelected: {
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  clubRadioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
  },
  clubCardText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '500' as const,
    flex: 1,
  },
  clubCardTextSelected: {
    fontWeight: '700' as const,
  },
  startClubCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: 10,
  },
  startClubTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#fff',
    marginTop: 4,
  },
  startClubDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 19,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 8,
    marginTop: 6,
  },
  downloadButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#1a1a1a',
  },
  adminEmailNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
  },
  noClubCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  noClubText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  loadingText: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 15,
    color: '#fff',
    opacity: 0.7,
    textAlign: 'center',
  },
});
