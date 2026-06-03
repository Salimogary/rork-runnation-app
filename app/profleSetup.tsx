import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  Modal,
  Share,
  Image,
  Animated,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { Fingerprint, Camera, Check, ChevronRight, Target, Users, UserPlus, UserCheck, PlusCircle, X, MapPin, Globe, ChevronLeft, Phone, Mail, Eye, EyeOff, Apple, Calendar, Ruler, Scale } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Picker } from '@react-native-picker/picker';
import { getServerClient } from '@/lib/server-client';
import { supabase } from '@/lib/supabase';
import { WORLD_COUNTRIES } from '@/constants/countries';
import { clubMatchesTown, filterVisibleClubsForAge, getAgeFromDob, isAtLeastRunNationAge } from '@/utils/specialClubs';
import { useDistanceUnit } from '@/contexts/DistanceUnitContext';
import { useWeightUnit } from '@/contexts/WeightUnitContext';

WebBrowser.maybeCompleteAuthSession();


type ScreenMode = 'login' | 'create' | 'forgot' | 'fullRegistration';
type RegistrationStep = 1 | 2 | 3 | 4 | 5;
type DistancePreference = 'kilometers' | 'miles';
type WeightPreference = 'kg' | 'lbs';

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
  hasDisability: boolean;
  paraUsesEquipment: boolean;
  paraEquipmentType: string;
  paraEquipmentOther: string;
  doesIndoorWorkouts: boolean;
  hasSmartWatch: boolean;
  pin: string;
  confirmPin: string;
  photoUri?: string;
}

interface ContactData {
  phone: string;
  email: string;
}

interface ClubStartRequestData {
  clubName: string;
  country: string;
  description: string;
}

interface OrganizerRequestData {
  organizerName: string;
  country: string;
  description: string;
}

interface GoalItem {
  goal_id: number;
  goal: string;
}

interface ClubItem {
  club_id: string;
  club_name: string;
  country: string | null;
  location: string | null;
  description: string | null;
  is_special_club?: boolean | null;
  special_club_code?: string | null;
  age_min?: number | null;
  age_max?: number | null;
  presence_towns?: string[] | string | null;
}

interface ProfileBundleResponse {
  profile?: {
    email?: string | null;
  } | null;
}

type ClubChoice = 'join' | 'existing' | 'start' | 'organizer' | 'none' | null;
const RUNNATION_APP_LINK = 'https://expo.dev/artifacts/eas/kp69Wjr6TwqrnqbLTFkiK.apk';

const buildClubMembershipTerms = (clubNames: string[]) => {
  const title = clubNames.length === 1 ? `${clubNames[0]} Membership Terms and Club Rules` : 'Club Membership Terms and Club Rules';
  const clubList = clubNames.length > 0 ? clubNames.join(', ') : 'the selected club';

  return {
    title,
    clubList,
    sections: [
      {
        heading: 'Welcome',
        body: `Welcome to ${clubList}. The club exists to encourage running, fitness, sportsmanship, and positive community engagement. By joining, you agree to follow these rules and participate in good faith.`,
      },
      {
        heading: 'Membership',
        body: 'Membership may be free or paid depending on the club. Where fees apply, payment must be kept current to maintain active membership. The club may approve, suspend, or remove members whose conduct conflicts with these rules.',
      },
      {
        heading: 'Club Type',
        body: 'The club may operate physically, virtually, or as a hybrid club. Members are expected to participate in ways that support the club objectives and community spirit.',
      },
      {
        heading: 'Activity Expectations',
        body: 'Members are encouraged to stay active and contribute to club goals. A club may set minimum monthly activity expectations, and members who remain inactive for extended periods may be moved to inactive status or removed.',
      },
      {
        heading: 'Honesty and Fair Play',
        body: 'All activities submitted to the club must be genuine and accurately recorded. False, manipulated, or misleading activity data is not allowed. Fair competition and respect for fellow members are fundamental to the club.',
      },
      {
        heading: 'Conduct',
        body: 'Members must treat one another with respect and courtesy. Harassment, discrimination, bullying, abusive language, or behavior that damages the club reputation may result in disciplinary action, including removal.',
      },
      {
        heading: 'Club Activities',
        body: 'The club may organize runs, challenges, competitions, training sessions, social gatherings, educational events, and other health or fitness activities. Participation is voluntary unless the club states otherwise.',
      },
      {
        heading: 'Leadership',
        body: 'The club is managed by appointed or elected leaders such as a Club Captain, Vice Captain, Secretary, Treasurer, Event Coordinator, or other officials. Decisions made in the best interests of the club should be respected.',
      },
      {
        heading: 'Safety',
        body: 'Members participate in club activities at their own risk and are responsible for ensuring they are physically capable of participation. Members must follow local laws, observe safety precautions, and use appropriate equipment.',
      },
      {
        heading: 'Club-Specific Rules',
        body: 'If the club has its own constitution, membership policy, code of conduct, payment rules, or event rules, those club-specific rules also apply and may replace parts of this default template.',
      },
      {
        heading: 'Changes to Rules',
        body: 'These rules may be updated from time to time to support the growth and effective management of the club. Continued membership after updates means you accept the revised rules.',
      },
      {
        heading: 'Agreement',
        body: 'By selecting "I Agree, Send Request", you confirm that you have read, understood, and agree to abide by these membership terms and club rules.',
      },
    ],
  };
};
const normalizeCountryLabel = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  const country = FALLBACK_COUNTRIES.find(
    (item) => item.iso_alpha2.toUpperCase() === upper || item.name.toLowerCase() === raw.toLowerCase()
  );
  return (country?.name || raw).trim().toLowerCase();
};

const getOAuthRedirectUrl = () => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/auth-callback`;
    }
    return Linking.createURL('auth-callback');
  }

  if (Constants.executionEnvironment === 'storeClient') {
    return Linking.createURL('auth-callback');
  }

  return 'runnation://auth-callback';
};

const FALLBACK_COUNTRIES = WORLD_COUNTRIES;
const PARA_EQUIPMENT_OPTIONS = [
  { value: "wheelchair", label: "Wheelchair" },
  { value: "handcycle", label: "Handcycle" },
  { value: "prosthetic_blades", label: "Prosthetic blades" },
  { value: "other", label: "Other" },
];

const FALLBACK_GOALS: GoalItem[] = [
  { goal_id: 1, goal: 'Improve fitness' },
  { goal_id: 2, goal: 'Lose weight' },
  { goal_id: 3, goal: 'Build endurance' },
  { goal_id: 4, goal: 'Train for an event' },
  { goal_id: 5, goal: 'Stay consistent' },
  { goal_id: 6, goal: 'General Health' },
  { goal_id: 7, goal: 'Other' },
];

function isGeneralHealthGoal(value: string | null | undefined): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'general health' || normalized.includes('general health') || normalized.includes('health');
}

const FALLBACK_CLUBS: ClubItem[] = [
  {
    club_id: '1',
    club_name: 'RunNation Nairobi',
    country: 'Kenya',
    location: 'Nairobi',
    description: 'A community club for city runs, beginner support, and weekend sessions.',
  },
  {
    club_id: '2',
    club_name: 'RunNation Kampala',
    country: 'Uganda',
    location: 'Kampala',
    description: 'Social runs, walking groups, and training accountability for all levels.',
  },
  {
    club_id: '3',
    club_name: 'RunNation Dar',
    country: 'Tanzania',
    location: 'Dar es Salaam',
    description: 'Coastal training routes, community meetups, and event prep support.',
  },
];

const getBiometricStorageKey = (email: string, suffix: 'password' | 'enabled') =>
  `biometric_${suffix}_${email.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_')}`;

function showPostSocialAuthProfilePrompt(router: ReturnType<typeof useRouter>) {
  Alert.alert(
    'Complete Your Profile',
    'Google sign-in is ready. Please complete your RunNation profile soon so activities, clubs, events, and shop features can work properly.',
    [
      {
        text: 'Later',
        onPress: () => router.replace('/(tabs)'),
        style: 'cancel',
      },
      {
        text: 'Complete Profile',
        onPress: () => router.replace('/profile' as any),
      },
    ]
  );
}

export default function RegisterScreen() {
  const router = useRouter();
  const goToApp = async () => {
    await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    router.replace('/(tabs)');
  };
  const { signUp, signIn, refreshRoleSession } = useAuth();
  const { distanceUnit: savedDistanceUnit, setDistanceUnit } = useDistanceUnit();
  const { weightUnit: savedWeightUnit, setWeightUnit } = useWeightUnit();
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
    hasDisability: false,
    paraUsesEquipment: false,
    paraEquipmentType: '',
    paraEquipmentOther: '',
    doesIndoorWorkouts: false,
    hasSmartWatch: false,
    pin: '',
    confirmPin: '',
    photoUri: '',
  });
  const [contactData, setContactData] = useState<ContactData>({
    phone: '',
    email: '',
  });
  const [clubStartRequest, setClubStartRequest] = useState<ClubStartRequestData>({
    clubName: '',
    country: '',
    description: '',
  });
  const [organizerRequest, setOrganizerRequest] = useState<OrganizerRequestData>({
    organizerName: '',
    country: '',
    description: '',
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
  const [selectedNormalClubId, setSelectedNormalClubId] = useState<string | null>(null);
  const [selectedSpecialClubIds, setSelectedSpecialClubIds] = useState<string[]>([]);
  const [clubChoice, setClubChoice] = useState<ClubChoice>(null);
  const [showClubTermsModal, setShowClubTermsModal] = useState(false);
  const [clubTermsAccepted, setClubTermsAccepted] = useState(false);
  const [distancePreference, setDistancePreference] = useState<DistancePreference>(savedDistanceUnit);
  const [weightPreference, setWeightPreference] = useState<WeightPreference>(savedWeightUnit);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegistrationPassword, setShowRegistrationPassword] = useState(false);
  const [showRegistrationConfirmPassword, setShowRegistrationConfirmPassword] = useState(false);

  const stepAnim = useRef(new Animated.Value(0)).current;
  const countryClubs = useMemo(() => {
    const userCountry = normalizeCountryLabel(registrationData.country);
    if (!userCountry) return [];
    return clubs.filter((club) => normalizeCountryLabel(club.country) === userCountry);
  }, [clubs, registrationData.country]);
  const visibleClubs = useMemo(
    () => filterVisibleClubsForAge(clubs, countryClubs, getAgeFromDob(registrationData.dob), {
      hasDisability: registrationData.hasDisability,
      doesIndoorWorkouts: registrationData.doesIndoorWorkouts,
      hasSmartWatch: registrationData.hasSmartWatch,
      hasGeneralHealthGoal: selectedGoalIds.some((goalId) => isGeneralHealthGoal(goals.find((goal) => goal.goal_id === goalId)?.goal)),
      userCountry: registrationData.country,
    }),
    [
      clubs,
      countryClubs,
      registrationData.dob,
      registrationData.hasDisability,
      registrationData.doesIndoorWorkouts,
      registrationData.hasSmartWatch,
      registrationData.country,
      goals,
      selectedGoalIds,
    ]
  );
  const visibleNormalClubs = useMemo(
    () => visibleClubs.filter((club) => !club.is_special_club && !club.special_club_code),
    [visibleClubs]
  );
  const visibleSpecialClubs = useMemo(
    () => visibleClubs.filter((club) => club.is_special_club || club.special_club_code),
    [visibleClubs]
  );
  const recommendedNormalClubs = useMemo(
    () => visibleNormalClubs.filter((club) => clubMatchesTown(club, registrationData.residence)),
    [visibleNormalClubs, registrationData.residence]
  );
  const otherNormalClubs = useMemo(
    () => visibleNormalClubs.filter((club) => !clubMatchesTown(club, registrationData.residence)),
    [visibleNormalClubs, registrationData.residence]
  );
  const selectedMembershipClubs = useMemo(
    () =>
      clubChoice === 'join' || clubChoice === 'existing'
        ? [selectedNormalClubId, ...selectedSpecialClubIds]
            .filter(Boolean)
            .map((clubId) => visibleClubs.find((club) => club.club_id === clubId))
            .filter(Boolean) as ClubItem[]
        : [],
    [clubChoice, selectedNormalClubId, selectedSpecialClubIds, visibleClubs]
  );
  const selectedClubNames = useMemo(
    () => selectedMembershipClubs.map((club) => club.club_name).filter(Boolean),
    [selectedMembershipClubs]
  );
  const clubMembershipTerms = useMemo(() => buildClubMembershipTerms(selectedClubNames), [selectedClubNames]);

  useEffect(() => {
    void checkBiometricAvailability();
    void fetchCountries();
  }, []);

  useEffect(() => {
    if (registrationStep === 3) {
      void fetchGoals();
    } else if (registrationStep === 5) {
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

  useEffect(() => {
    setDistancePreference(savedDistanceUnit);
  }, [savedDistanceUnit]);

  useEffect(() => {
    setWeightPreference(savedWeightUnit);
  }, [savedWeightUnit]);

  useEffect(() => {
    setClubTermsAccepted(false);
  }, [clubChoice, selectedNormalClubId, selectedSpecialClubIds]);

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    const maybeError = error as { message?: string; data?: { message?: string; code?: string } } | null;
    if (maybeError?.data?.message) {
      return maybeError.data.message;
    }
    if (maybeError?.message) {
      return maybeError.message;
    }

    return fallback;
  };

  const getAuthParamsFromUrl = (url: string) => {
    const queryString = url.includes('?') ? url.split('?')[1]?.split('#')[0] ?? '' : '';
    const fragmentString = url.includes('#') ? url.split('#')[1] ?? '' : '';
    const queryParams = new URLSearchParams(queryString);
    const fragmentParams = new URLSearchParams(fragmentString);
    const readParam = (key: string) => queryParams.get(key) ?? fragmentParams.get(key);

    return {
      accessToken: readParam('access_token'),
      refreshToken: readParam('refresh_token'),
      code: readParam('code'),
      error: readParam('error_description') ?? readParam('error'),
    };
  };

  const fetchCountries = async () => {
    try {
      setCountriesLoading(true);
      const data = await getServerClient().auth.getCountries.query();
      setCountries(data as { name: string; iso_alpha2: string }[]);
    } catch {
      console.warn('[Register] Countries API unavailable, using fallback countries.');
      setCountries(FALLBACK_COUNTRIES);
    } finally {
      setCountriesLoading(false);
    }
  };

  const fetchGoals = async () => {
    try {
      setGoalsLoading(true);
      const data = await getServerClient().auth.getGoals.query();
      setGoals(data as GoalItem[]);
    } catch {
      console.warn('[Register] Goals API unavailable, using fallback goals.');
      setGoals(FALLBACK_GOALS);
    } finally {
      setGoalsLoading(false);
    }
  };

  const fetchClubs = async () => {
    try {
      setClubsLoading(true);
      const data = await getServerClient().auth.getClubs.query();
      setClubs(data as ClubItem[]);
    } catch {
      console.warn('[Register] Clubs API unavailable, using fallback clubs.');
      setClubs(FALLBACK_CLUBS);
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

  const shareMissingClubInvite = async () => {
    const link = RUNNATION_APP_LINK || 'RunNation app download link coming soon';
    const message = [
      'Hello Coach/Club Coordinator, I am joining RunNation and could not find our club on the club list.',
      `Please join RunNation and create our club profile so members can connect, register, and appear under the right club.`,
      `App link: ${link}`,
      'If you permit me to create it, I can create the club profile from Settings > Join Service Team after completing registration.',
      'RunNation - Where runners belong',
    ].join('\n\n');

    if (Platform.OS === 'web') {
      if (navigator?.clipboard) {
        await navigator.clipboard.writeText(message);
        alert('Club invitation message copied.');
        return;
      }
      alert(message);
      return;
    }

    await Share.share({ message });
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
      Alert.alert('Error', 'Please enter your email address first');
      return;
    }

    try {
      const biometricEnabled = await SecureStore.getItemAsync(getBiometricStorageKey(username, 'enabled'));

      if (biometricEnabled !== 'true') {
        Alert.alert('Error', 'Biometric login not set up. Please log in with your email and password first.');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Log in with biometrics',
        fallbackLabel: 'Use Password',
      });

      if (result.success) {
        const savedPin = await SecureStore.getItemAsync(getBiometricStorageKey(username, 'password'));
        if (savedPin) {
          setIsLoading(true);
          const { error } = await signIn(username, savedPin);
          if (error) {
            Alert.alert('Login Failed', error.message);
          } else {
            await goToApp();
          }
          setIsLoading(false);
        } else {
          Alert.alert('Error', 'Biometric authentication failed. Please log in with your password.');
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

  const handleLogin = async () => {
    if (!username.trim() || !pin) {
      Alert.alert('Error', 'Please enter your email address and password');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await signIn(username, pin);
      if (error) {
        Alert.alert('Login Failed', error.message);
      } else {
        if (Platform.OS !== 'web' && biometricAvailable) {
          await SecureStore.setItemAsync(getBiometricStorageKey(username, 'password'), pin);
          await SecureStore.setItemAsync(getBiometricStorageKey(username, 'enabled'), 'true');
        }
        await AsyncStorage.setItem('hasSeenOnboarding', 'true');
        router.replace('/(tabs)');
      }
    } catch (error) {
      Alert.alert('Login Failed', getErrorMessage(error, 'Something went wrong. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setIsLoading(true);

    try {
      const redirectTo = getOAuthRedirectUrl();
      console.log('[Register] Google OAuth redirect URL:', redirectTo);

      if (Platform.OS === 'web') {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            queryParams: {
              access_type: 'offline',
              prompt: 'select_account',
            },
          },
        });

        if (error) {
          throw error;
        }

        return;
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        throw error;
      }

      if (!data.url) {
        throw new Error('Google sign-in did not return a login URL.');
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type !== 'success') {
        console.warn('[Register] Google OAuth browser result:', result);
        if (result.type === 'cancel' || result.type === 'dismiss') {
          throw new Error(
            `Google sign-in was closed before it completed. If Google showed an error page, add this exact redirect URL in Supabase Auth: ${redirectTo}`
          );
        }
        throw new Error(`Google sign-in did not complete. Browser result: ${result.type}`);
      }

      const authParams = getAuthParamsFromUrl(result.url);
      console.log('[Register] Google OAuth callback received:', {
        hasAccessToken: Boolean(authParams.accessToken),
        hasRefreshToken: Boolean(authParams.refreshToken),
        hasCode: Boolean(authParams.code),
        hasError: Boolean(authParams.error),
      });

      if (authParams.error) {
        throw new Error(authParams.error);
      }

      if (authParams.code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(authParams.code);
        if (exchangeError) {
          throw exchangeError;
        }
      } else if (authParams.accessToken && authParams.refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: authParams.accessToken,
          refresh_token: authParams.refreshToken,
        });

        if (sessionError) {
          throw sessionError;
        }
      } else {
        throw new Error('Google sign-in returned without a session. Please try again.');
      }

      await getServerClient().auth.ensureOauthRegistration.mutate();
      const refreshedRoleSession = await refreshRoleSession();
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      const authEmail = authUser?.email?.trim().toLowerCase() ?? null;
      const registrationId = refreshedRoleSession.registrationId ?? null;

      if (registrationId && authEmail) {
        const bundle = (await getServerClient().profile.getBundle.query({
          registrationId,
        })) as ProfileBundleResponse;

        const contactEmail =
          typeof bundle?.profile?.email === 'string'
            ? bundle.profile.email.trim().toLowerCase()
            : null;

        if (!contactEmail) {
          await getServerClient().auth.syncSocialContactEmail.mutate({
            registrationId,
            email: authEmail,
          });
          showPostSocialAuthProfilePrompt(router);
          return;
        }

        if (contactEmail !== authEmail) {
          Alert.alert(
            'Use Google Email?',
            `This account currently uses ${contactEmail} as the contact email, but you signed in with ${authEmail}. Do you want to use your Google email for this account?`,
            [
              {
                text: 'Keep Current',
                style: 'cancel',
                onPress: () => showPostSocialAuthProfilePrompt(router),
              },
              {
                text: 'Use Google Email',
                onPress: async () => {
                  try {
                    await getServerClient().auth.syncSocialContactEmail.mutate({
                      registrationId,
                      email: authEmail,
                    });
                  } catch (syncError) {
                    Alert.alert(
                      'Email Sync Error',
                      getErrorMessage(syncError, 'Could not update the contact email right now.')
                    );
                  } finally {
                    showPostSocialAuthProfilePrompt(router);
                  }
                },
              },
            ]
          );
          return;
        }
      }

      showPostSocialAuthProfilePrompt(router);
    } catch (error) {
      console.error('[Register] Google auth error:', error);
      Alert.alert('Google Sign-In Failed', getErrorMessage(error, 'Unable to sign in with Google right now.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleComingSoon = () => {
    Alert.alert(
      'Apple Sign-In Coming Soon',
      'Apple login is being prepared for the iOS release. Please use Google or Email for now.'
    );
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

    if (!isAtLeastRunNationAge(registrationData.dob)) {
      Alert.alert('Minimum Age Required', 'RunNation registration is available for users aged 8 years and above.');
      return;
    }

    if (registrationData.pin.trim().length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    if (registrationData.pin !== registrationData.confirmPin) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (registrationData.hasDisability && registrationData.paraUsesEquipment && !registrationData.paraEquipmentType) {
      Alert.alert('Para Equipment', 'Please choose the equipment you use.');
      return;
    }
    if (
      registrationData.hasDisability &&
      registrationData.paraUsesEquipment &&
      registrationData.paraEquipmentType === 'other' &&
      !registrationData.paraEquipmentOther.trim()
    ) {
      Alert.alert('Para Equipment', 'Please describe the equipment you use.');
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
        const regId = newRegId || null;
        setRegistrationId(regId);

        console.log('[Register] Step 1 complete, moving to contacts. RegistrationID:', regId);
        setRegistrationStep(2);
      }
    } catch (error) {
      Alert.alert('Registration Failed', getErrorMessage(error, 'Something went wrong. Please try again.'));
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

    setIsLoading(true);

    try {
      const phoneNumber = parseInt(contactData.phone.replace(/[^0-9]/g, ''), 10);

      console.log('[Register] Inserting contact:', {
        registration_id: registrationId,
        phone: phoneNumber,
        email: contactData.email.trim(),
      });

      await getServerClient().auth.createAuthUser.mutate({
        registrationId,
        email: contactData.email.trim(),
        pin: registrationData.pin,
      });

      const normalizedEmail = contactData.email.trim().toLowerCase();
      const { error: signInError } = await signIn(normalizedEmail, registrationData.pin);
      if (signInError) {
        throw new Error(signInError.message);
      }

      if (Platform.OS !== 'web' && biometricAvailable) {
        await SecureStore.setItemAsync(getBiometricStorageKey(normalizedEmail, 'password'), registrationData.pin);
        await SecureStore.setItemAsync(getBiometricStorageKey(normalizedEmail, 'enabled'), 'true');
      }

      await getServerClient().auth.saveContacts.mutate({
        registrationId,
        phone: contactData.phone,
        email: contactData.email.trim(),
      });

      console.log('[Register] Contacts saved, moving to goals');
      setRegistrationStep(3);
    } catch (err) {
      console.error('[Register] Contact save error:', err);
      Alert.alert('Contact Save Failed', getErrorMessage(err, 'Something went wrong saving your contact info.'));
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
        return goal?.goal?.toLowerCase() === 'other';
      });

      const rowsToInsert = selectedGoalIds.map(goalId => {
        const goal = goals.find(g => g.goal_id === goalId);
        const isOther = goal?.goal?.toLowerCase() === 'other';
        const goalText = isOther && hasOtherGoal ? (otherGoalText || 'Other') : (goal?.goal || '');
        return {
          registration_id: registrationId,
          goal: goalText,
        };
      });

      console.log('[Register] Inserting user_goals:', JSON.stringify(rowsToInsert));

      await getServerClient().auth.saveGoals.mutate({
        registrationId,
        goals: rowsToInsert.map((row) => row.goal),
      });

      console.log('[Register] Goals saved, moving to metrics');
      setRegistrationStep(4);
    } catch (err) {
      console.error('[Register] Goals save error:', err);
      Alert.alert('Goals Save Failed', getErrorMessage(err, 'Something went wrong saving your goals.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep4Complete = async () => {
    try {
      setDistanceUnit(distancePreference);
      setWeightUnit(weightPreference);
      setRegistrationStep(5);
    } catch (err) {
      console.error('[Register] Metrics preference save error:', err);
      Alert.alert('Preferences Save Failed', getErrorMessage(err, 'Something went wrong saving your measurement preferences.'));
    }
  };

  const handleStep5Complete = async (skipClubTermsCheck = false) => {
    if (!registrationId) {
      console.error('[Register] No registrationId for step 5');
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
      router.replace('/(tabs)');
      return;
    }

    if (clubChoice === 'join' || clubChoice === 'existing') {
      if (!selectedNormalClubId && selectedSpecialClubIds.length === 0) {
        Alert.alert('Select a Club', 'Please choose a normal club, a special club, or one of each.');
        return;
      }
    }

    if (clubChoice === 'join' && !clubTermsAccepted && !skipClubTermsCheck) {
      setShowClubTermsModal(true);
      return;
    }

    setIsLoading(true);

    try {
      let clubValue: string | null = null;
      let newMemberValue: string = 'No';

      if (clubChoice === 'join') {
        clubValue = selectedMembershipClubs.map((club) => club.club_name).join(', ') || null;
        newMemberValue = 'Yes';
      } else if (clubChoice === 'existing') {
        clubValue = selectedMembershipClubs.map((club) => club.club_name).join(', ') || null;
        newMemberValue = 'No';
      } else if (clubChoice === 'start') {
        if (!clubStartRequest.clubName.trim()) {
          Alert.alert('Club Name Required', 'Please enter the club name you want to start.');
          return;
        }
        if (!clubStartRequest.country.trim()) {
          Alert.alert('Country Required', 'Please choose the country for the club request.');
          return;
        }
        clubValue = clubStartRequest.clubName.trim();
        newMemberValue = 'Yes';
      } else if (clubChoice === 'organizer') {
        if (!organizerRequest.organizerName.trim()) {
          Alert.alert('Organizer Name Required', 'Please enter the event organiser name.');
          return;
        }
        if (!organizerRequest.country.trim()) {
          Alert.alert('Country Required', 'Please choose the country for the organiser request.');
          return;
        }
        clubValue = organizerRequest.organizerName.trim();
        newMemberValue = 'No';
      } else {
        clubValue = null;
        newMemberValue = 'No';
      }

      console.log('[Register] Inserting club_membership_request:', { club: clubValue, new_member: newMemberValue });

      if ((clubChoice === 'join' || clubChoice === 'existing') && selectedMembershipClubs.length > 0) {
        await Promise.all(
          selectedMembershipClubs.map((club) =>
            getServerClient().auth.saveClubMembership.mutate({
              registrationId,
              club: club.club_name,
              clubId: club.club_id,
              newMember: newMemberValue as 'Yes' | 'No',
              clubRulesAccepted: clubChoice === 'join' ? clubTermsAccepted || skipClubTermsCheck : undefined,
              requestType: 'membership',
              proposedClubName: null,
              proposedCountry: null,
              proposedDescription: null,
            })
          )
        );
      } else {
        await getServerClient().auth.saveClubMembership.mutate({
          registrationId,
          club: clubValue,
          clubId: null,
          newMember: newMemberValue as 'Yes' | 'No',
          requestType:
            clubChoice === 'start'
              ? 'start_club'
              : clubChoice === 'organizer'
              ? 'event_organizer'
              : 'membership',
          proposedClubName:
            clubChoice === 'start'
              ? clubStartRequest.clubName.trim()
              : clubChoice === 'organizer'
              ? organizerRequest.organizerName.trim()
              : null,
          proposedCountry:
            clubChoice === 'start'
              ? clubStartRequest.country.trim()
              : clubChoice === 'organizer'
              ? organizerRequest.country.trim()
              : null,
          proposedDescription:
            clubChoice === 'start'
              ? clubStartRequest.description.trim()
              : clubChoice === 'organizer'
              ? organizerRequest.description.trim()
              : null,
        });
      }

      console.log('[Register] Club membership request saved');

      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
      router.replace('/(tabs)');
    } catch (err) {
      console.error('[Register] Club save error:', err);
      Alert.alert('Club Save Failed', getErrorMessage(err, 'Something went wrong. Please try again.'));
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
      setRegistrationStep(5);
    } else if (registrationStep === 5) {
      await goToApp();
    }
  };

  const toggleGoal = (goalId: number) => {
    setSelectedGoalIds(prev =>
      prev.includes(goalId)
        ? prev.filter(id => id !== goalId)
        : [...prev, goalId]
    );
  };

  const updateRegistrationField = (field: keyof RegistrationData, value: string | boolean) => {
    setRegistrationData(prev => {
      const next = { ...prev, [field]: value };
      if (field === "hasDisability" && value !== true) {
        next.paraUsesEquipment = false;
        next.paraEquipmentType = "";
        next.paraEquipmentOther = "";
      }
      if (field === "paraUsesEquipment" && value !== true) {
        next.paraEquipmentType = "";
        next.paraEquipmentOther = "";
      }
      if (field === "paraEquipmentType" && value !== "other") {
        next.paraEquipmentOther = "";
      }
      return next;
    });
  };

  const updateContactField = (field: keyof ContactData, value: string) => {
    setContactData(prev => ({ ...prev, [field]: value }));
  };

  const handleForgotPin = async () => {
    const resetEmail = (email || username).trim().toLowerCase();

    if (!resetEmail) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail);
      if (error) {
        throw error;
      }

      Alert.alert(
        'Reset Email Sent',
        `A password reset link has been sent to ${resetEmail}. Please check your inbox.`,
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
    } catch (error) {
      Alert.alert(
        'Reset Failed',
        error instanceof Error ? error.message : 'Unable to send reset email right now.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const showsOtherInput = selectedGoalIds.some(id => {
    const goal = goals.find(g => g.goal_id === id);
    return goal?.goal?.toLowerCase() === 'other';
  });

  const renderStepIndicator = () => (
    <View style={styles.stepIndicatorContainer}>
      {[1, 2, 3, 4, 5].map((step) => {
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
            {step < 5 && (
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
      <Text style={[styles.stepLabel, registrationStep >= 4 && styles.stepLabelActive]}>Units</Text>
      <Text style={[styles.stepLabel, registrationStep >= 5 && styles.stepLabelActive]}>Club</Text>
    </View>
  );

  const renderSocialAuthButtons = () => (
    <View style={styles.socialAuthContainer}>
      <TouchableOpacity
        style={[styles.socialAuthButton, styles.googleButton, isLoading && styles.buttonDisabled]}
        onPress={handleGoogleAuth}
        disabled={isLoading}
        activeOpacity={0.82}
      >
        <View style={styles.googleMark}>
          <Text style={styles.googleMarkText}>G</Text>
        </View>
        <Text style={styles.socialAuthButtonText}>Continue with Google</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.socialAuthButton, styles.appleButtonComingSoon, isLoading && styles.buttonDisabled]}
        onPress={handleAppleComingSoon}
        disabled={isLoading}
        activeOpacity={0.82}
      >
        <Apple size={20} color="rgba(255,255,255,0.72)" />
        <Text style={styles.appleComingSoonText}>Continue with Apple</Text>
        <Text style={styles.comingSoonPill}>Soon</Text>
      </TouchableOpacity>

      <View style={styles.authDivider}>
        <View style={styles.authDividerLine} />
        <Text style={styles.authDividerText}>or use email</Text>
        <View style={styles.authDividerLine} />
      </View>
    </View>
  );

  const renderYesNoOption = (
    label: string,
    detail: string,
    value: boolean,
    onChange: (nextValue: boolean) => void
  ) => (
    <View style={styles.preferenceQuestion}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.preferenceQuestionDetail}>{detail}</Text>
      <View style={styles.preferenceChoiceRow}>
        {[
          { label: 'No', value: false },
          { label: 'Yes', value: true },
        ].map((option) => {
          const isSelected = value === option.value;
          return (
            <TouchableOpacity
              key={`${label}-${option.label}`}
              style={[styles.preferenceChoice, isSelected && styles.preferenceChoiceSelected]}
              onPress={() => onChange(option.value)}
              disabled={isLoading}
              activeOpacity={0.75}
            >
              <Text style={[styles.preferenceChoiceText, isSelected && styles.preferenceChoiceTextSelected]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderStep1 = () => (
    <>
      <Text style={styles.formTitle}>Create Your Account</Text>
      <View style={styles.profileCompletionNote}>
        <Text style={styles.profileCompletionNoteTitle}>Fill every field you can</Text>
        <Text style={styles.profileCompletionNoteText}>
          RunNation uses these details for clubs, reports, goals, events, and eligibility, so missing fields can hide useful features.
        </Text>
      </View>

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
              <Picker.Item key={c.iso_alpha2} label={c.name} value={c.name} />
            ))}
          </Picker>
        </View>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>City/Town/District *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g Mombasa, Eldoret, Masaka"
          placeholderTextColor="#999"
          value={registrationData.residence}
          onChangeText={(text) => updateRegistrationField('residence', text)}
          editable={!isLoading}
        />
      </View>

      <View style={styles.inputContainer}>
        {renderYesNoOption(
          'Do you have any disability?',
          'This controls whether Para Runners appears as a special club option.',
          registrationData.hasDisability,
          (value) => updateRegistrationField('hasDisability', value)
        )}
      </View>

      {registrationData.hasDisability ? (
        <>
          <View style={styles.inputContainer}>
            {renderYesNoOption(
              'Do you use any para sports equipment?',
              'Equipment users stay grouped inside Para club leaderboards; no-equipment para users can also appear in community leaderboards.',
              registrationData.paraUsesEquipment,
              (value) => updateRegistrationField('paraUsesEquipment', value)
            )}
          </View>

          {registrationData.paraUsesEquipment ? (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Para equipment</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={registrationData.paraEquipmentType}
                  onValueChange={(value: string) => updateRegistrationField('paraEquipmentType', value)}
                  style={styles.picker}
                  enabled={!isLoading}
                >
                  <Picker.Item label="Select equipment" value="" />
                  {PARA_EQUIPMENT_OPTIONS.map((option) => (
                    <Picker.Item key={option.value} label={option.label} value={option.value} />
                  ))}
                </Picker>
              </View>
              {registrationData.paraEquipmentType === 'other' ? (
                <TextInput
                  style={[styles.input, { marginTop: 10 }]}
                  placeholder="Enter equipment"
                  placeholderTextColor="#999"
                  value={registrationData.paraEquipmentOther}
                  onChangeText={(text) => updateRegistrationField('paraEquipmentOther', text)}
                  editable={!isLoading}
                />
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}

      <View style={styles.inputContainer}>
        {renderYesNoOption(
          'Do you do indoor workouts?',
          'This controls whether Treadmill Runners appears as a special club option.',
          registrationData.doesIndoorWorkouts,
          (value) => updateRegistrationField('doesIndoorWorkouts', value)
        )}
      </View>

      <View style={styles.inputContainer}>
        {renderYesNoOption(
          'Do you use a smart watch to record your workouts?',
          'If you also choose General Health as a goal, SmartFit Club will appear as a special club option.',
          registrationData.hasSmartWatch,
          (value) => updateRegistrationField('hasSmartWatch', value)
        )}
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
        <Text style={styles.label}>Password *</Text>
        <View style={styles.pinNoteContainer}>
          <Text style={styles.pinNoteText}>
            Choose a secure password with at least 8 characters. This will be used for login and confirming protected actions in the app.
          </Text>
        </View>
        <View style={styles.passwordField}>
          <TextInput
            style={[styles.input, styles.passwordFieldInput]}
            value={registrationData.pin}
            onChangeText={(value) => updateRegistrationField('pin', value)}
            placeholder="Create a password"
            placeholderTextColor="#999"
            secureTextEntry={!showRegistrationPassword}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />
          <TouchableOpacity
            style={styles.passwordToggle}
            onPress={() => setShowRegistrationPassword((prev) => !prev)}
            disabled={isLoading}
          >
            {showRegistrationPassword ? (
              <EyeOff size={20} color="#777" />
            ) : (
              <Eye size={20} color="#777" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Confirm Password *</Text>
        <View style={styles.passwordField}>
          <TextInput
            style={[styles.input, styles.passwordFieldInput]}
            value={registrationData.confirmPin}
            onChangeText={(value) => updateRegistrationField('confirmPin', value)}
            placeholder="Re-enter your password"
            placeholderTextColor="#999"
            secureTextEntry={!showRegistrationConfirmPassword}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />
          <TouchableOpacity
            style={styles.passwordToggle}
            onPress={() => setShowRegistrationConfirmPassword((prev) => !prev)}
            disabled={isLoading}
          >
            {showRegistrationConfirmPassword ? (
              <EyeOff size={20} color="#777" />
            ) : (
              <Eye size={20} color="#777" />
            )}
          </TouchableOpacity>
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
              hasDisability: false,
              paraUsesEquipment: false,
              paraEquipmentType: '',
              paraEquipmentOther: '',
              doesIndoorWorkouts: false,
              hasSmartWatch: false,
              pin: '',
              confirmPin: '',
              photoUri: '',
            });
            setContactData({ phone: '', email: '' });
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
        <Text style={styles.label}>Phone Number *</Text>
        <TextInput
          style={styles.input}
          placeholder="Example: +256 772 345 685"
          placeholderTextColor="#999"
          value={contactData.phone}
          onChangeText={(text) => updateContactField('phone', text)}
          keyboardType="phone-pad"
          editable={!isLoading}
        />
        <Text style={styles.inputHint}>Include the country code and phone number in one field.</Text>
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
                  {goal.goal}
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
              <Text style={styles.buttonText}>{selectedGoalIds.length > 0 ? 'Next: Units' : 'Skip & Continue'}</Text>
              <ChevronRight size={20} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  const handleClubChoiceSelect = (choice: ClubChoice) => {
    setClubChoice(choice);
    setSelectedNormalClubId(null);
    setSelectedSpecialClubIds([]);
    if (choice === 'start') {
      setClubStartRequest((prev) => ({
        clubName: prev.clubName,
        country: prev.country || registrationData.country || '',
        description: prev.description,
      }));
    }
    if (choice === 'organizer') {
      setOrganizerRequest((prev) => ({
        organizerName: prev.organizerName,
        country: prev.country || registrationData.country || '',
        description: prev.description,
      }));
    }
    if (choice === 'join' || choice === 'existing') {
      void fetchClubs();
    }
  };

  const renderMetricOption = (
    selected: boolean,
    title: string,
    detail: string,
    onPress: () => void
  ) => (
    <TouchableOpacity
      style={[styles.metricOptionCard, selected && styles.metricOptionCardSelected]}
      onPress={onPress}
      activeOpacity={0.75}
      disabled={isLoading}
    >
      <View style={[styles.clubRadio, selected && styles.clubRadioSelected]}>
        {selected && <View style={styles.clubRadioDot} />}
      </View>
      <View style={styles.clubChoiceTextWrap}>
        <Text style={[styles.metricOptionTitle, selected && styles.clubDetailNameSelected]}>{title}</Text>
        <Text style={styles.metricOptionDetail}>{detail}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderClubChoiceOptions = () => {
    const options: { key: ClubChoice; label: string; icon: React.ReactNode; desc: string }[] = [
      { key: 'join', label: 'Want to join a club', icon: <UserPlus size={22} color="#fff" />, desc: 'Browse and join an existing club' },
      { key: 'existing', label: 'I already have a club', icon: <UserCheck size={22} color="#fff" />, desc: 'Select your current club' },
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

  const renderClubListSection = (
    title: string,
    subtitle: string,
    list: ClubItem[],
    type: 'normal' | 'special'
  ) => (
    <View style={styles.clubGroupSection}>
      <View style={styles.clubGroupHeader}>
        <Text style={styles.clubGroupTitle}>{title}</Text>
        <Text style={styles.clubGroupSubtitle}>{subtitle}</Text>
      </View>
      {list.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            {type === 'normal'
              ? `No normal clubs available in ${registrationData.country || 'your country'} yet.`
              : 'No eligible special clubs available for your profile yet.'}
          </Text>
        </View>
      ) : null}
      {list.map((club) => {
        const isSelected = type === 'normal' ? selectedNormalClubId === club.club_id : selectedSpecialClubIds.includes(club.club_id);
        return (
          <TouchableOpacity
            key={club.club_id}
            style={[styles.clubDetailCard, isSelected && styles.clubDetailCardSelected]}
            onPress={() => {
              if (type === 'normal') {
                setSelectedNormalClubId(isSelected ? null : club.club_id);
                return;
              }
              setSelectedSpecialClubIds((current) =>
                isSelected ? current.filter((clubId) => clubId !== club.club_id) : [...current, club.club_id]
              );
            }}
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
              {type === 'special' && (
                <View style={styles.specialClubBadge}>
                  <Text style={styles.specialClubBadgeText}>Special</Text>
                </View>
              )}
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
  );

  const renderClubJoinList = () => (
    <View style={styles.clubSubSection}>
      <TouchableOpacity style={styles.clubBackBtn} onPress={() => { setClubChoice(null); setSelectedNormalClubId(null); setSelectedSpecialClubIds([]); }}>
        <ChevronLeft size={18} color="#fff" />
        <Text style={styles.clubBackText}>Back to options</Text>
      </TouchableOpacity>
      <Text style={styles.clubSubTitle}>Choose up to two clubs</Text>
      <Text style={styles.clubSelectionHint}>Pick one normal club, one special club, or just one club from either section.</Text>
      <View style={styles.clubTermsNotice}>
        <Check size={16} color="#fff" />
        <Text style={styles.clubTermsNoticeText}>
          New members must accept the selected club rules before the request is sent to the coordinator.
        </Text>
      </View>
      {clubsLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.loadingText}>Loading clubs...</Text>
        </View>
      ) : (
        <View style={styles.clubsList}>
          {renderClubListSection('Recommended Normal Clubs', 'Clubs active in your city/town/district.', recommendedNormalClubs, 'normal')}
          {renderClubListSection('Other Normal Clubs', 'Other local clubs in your registered country.', otherNormalClubs, 'normal')}
          {renderClubListSection('Special Clubs', 'Age or interest-based RunNation clubs you are eligible for.', visibleSpecialClubs, 'special')}
          <TouchableOpacity style={styles.missingClubCard} onPress={() => void shareMissingClubInvite()} activeOpacity={0.75}>
            <Text style={styles.missingClubTitle}>My club is not on this list</Text>
            <Text style={styles.missingClubText}>
              Share RunNation with your club coordinator, or get permission to create the club profile from Settings &gt; Join Service Team after completing registration.
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderClubExistingList = () => (
    <View style={styles.clubSubSection}>
      <TouchableOpacity style={styles.clubBackBtn} onPress={() => { setClubChoice(null); setSelectedNormalClubId(null); setSelectedSpecialClubIds([]); }}>
        <ChevronLeft size={18} color="#fff" />
        <Text style={styles.clubBackText}>Back to options</Text>
      </TouchableOpacity>
      <Text style={styles.clubSubTitle}>Choose up to two clubs</Text>
      <Text style={styles.clubSelectionHint}>Pick one normal club, one special club, or just one club from either section.</Text>
      {clubsLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.loadingText}>Loading clubs...</Text>
        </View>
      ) : (
        <View style={styles.clubsList}>
          {renderClubListSection('Recommended Normal Clubs', 'Clubs active in your city/town/district.', recommendedNormalClubs, 'normal')}
          {renderClubListSection('Other Normal Clubs', 'Other local clubs in your registered country.', otherNormalClubs, 'normal')}
          {renderClubListSection('Special Clubs', 'Age or interest-based RunNation clubs you are eligible for.', visibleSpecialClubs, 'special')}
          <TouchableOpacity style={styles.missingClubCard} onPress={() => void shareMissingClubInvite()} activeOpacity={0.75}>
            <Text style={styles.missingClubTitle}>My club is not on this list</Text>
            <Text style={styles.missingClubText}>
              Share RunNation with your club coordinator, or get permission to create the club profile from Settings &gt; Join Service Team after completing registration.
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderClubTermsModal = () => (
    <Modal
      visible={showClubTermsModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowClubTermsModal(false)}
    >
      <View style={styles.clubTermsOverlay}>
        <View style={styles.clubTermsModal}>
          <View style={styles.clubTermsHeader}>
            <View style={styles.clubTermsTitleWrap}>
              <Text style={styles.clubTermsEyebrow}>Required before joining</Text>
              <Text style={styles.clubTermsTitle}>{clubMembershipTerms.title}</Text>
            </View>
            <TouchableOpacity
              style={styles.clubTermsCloseButton}
              onPress={() => setShowClubTermsModal(false)}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              <X size={20} color="#1f2937" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.clubTermsScroll} contentContainerStyle={styles.clubTermsContent}>
            <Text style={styles.clubTermsIntro}>
              Read and accept these terms before your request is sent to the club coordinator. Clubs may also use their own constitution, code of conduct, or payment rules.
            </Text>
            {clubMembershipTerms.sections.map((section) => (
              <View key={section.heading} style={styles.clubTermsSection}>
                <Text style={styles.clubTermsSectionTitle}>{section.heading}</Text>
                <Text style={styles.clubTermsSectionText}>{section.body}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.clubTermsActions}>
            <TouchableOpacity
              style={styles.clubTermsCancelButton}
              onPress={() => setShowClubTermsModal(false)}
              disabled={isLoading}
              activeOpacity={0.75}
            >
              <Text style={styles.clubTermsCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.clubTermsAgreeButton, isLoading && styles.buttonDisabled]}
              onPress={() => {
                setClubTermsAccepted(true);
                setShowClubTermsModal(false);
                void handleStep5Complete(true);
              }}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.clubTermsAgreeText}>I Agree, Send Request</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderClubStartNew = () => (
    <View style={styles.clubSubSection}>
      <TouchableOpacity style={styles.clubBackBtn} onPress={() => setClubChoice(null)}>
        <ChevronLeft size={18} color="#fff" />
        <Text style={styles.clubBackText}>Back to options</Text>
      </TouchableOpacity>
      <View style={styles.startClubCard}>
        <PlusCircle size={40} color="#fff" />
        <Text style={styles.startClubTitle}>Start a New Club</Text>
        <Text style={styles.startClubDesc}>
          Send a structured request here instead of downloading a form. Admins can review and approve it in the dashboard.
        </Text>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Proposed Club Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter club name"
            placeholderTextColor="#999"
            value={clubStartRequest.clubName}
            onChangeText={(text) => setClubStartRequest((prev) => ({ ...prev, clubName: text }))}
            editable={!isLoading}
          />
        </View>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Country *</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={clubStartRequest.country}
              onValueChange={(value: string) => setClubStartRequest((prev) => ({ ...prev, country: value }))}
              style={styles.picker}
              enabled={!isLoading && !countriesLoading}
            >
              <Picker.Item label={countriesLoading ? 'Loading countries...' : 'Select country'} value="" />
              {countries.map((c) => (
                <Picker.Item key={`club-start-${c.iso_alpha2}`} label={c.name} value={c.name} />
              ))}
            </Picker>
          </View>
        </View>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Club Description</Text>
          <TextInput
            style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]}
            placeholder="Describe the club purpose, who it serves, and what makes it ready to launch."
            placeholderTextColor="#999"
            multiline
            value={clubStartRequest.description}
            onChangeText={(text) => setClubStartRequest((prev) => ({ ...prev, description: text }))}
            editable={!isLoading}
          />
        </View>
        <Text style={styles.adminEmailNote}>Your request will go straight to admins for review.</Text>
      </View>
    </View>
  );

  const renderEventOrganizerRequest = () => (
    <View style={styles.clubSubSection}>
      <TouchableOpacity style={styles.clubBackBtn} onPress={() => setClubChoice(null)}>
        <ChevronLeft size={18} color="#fff" />
        <Text style={styles.clubBackText}>Back to options</Text>
      </TouchableOpacity>
      <View style={styles.startClubCard}>
        <Calendar size={40} color="#fff" />
        <Text style={styles.startClubTitle}>Event Organiser Request</Text>
        <Text style={styles.startClubDesc}>
          Tell us who the organiser is and where they operate. After submitting, please contact your country admin because organiser accounts must be screened before approval.
        </Text>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Organizer Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter organizer name"
            placeholderTextColor="#999"
            value={organizerRequest.organizerName}
            onChangeText={(text) => setOrganizerRequest((prev) => ({ ...prev, organizerName: text }))}
            editable={!isLoading}
          />
        </View>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Country *</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={organizerRequest.country}
              onValueChange={(value: string) => setOrganizerRequest((prev) => ({ ...prev, country: value }))}
              style={styles.picker}
              enabled={!isLoading && !countriesLoading}
            >
              <Picker.Item label={countriesLoading ? 'Loading countries...' : 'Select country'} value="" />
              {countries.map((c) => (
                <Picker.Item key={`organizer-start-${c.iso_alpha2}`} label={c.name} value={c.name} />
              ))}
            </Picker>
          </View>
        </View>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]}
            placeholder="Describe the organiser, the kind of events they plan to manage, and anything admins should screen."
            placeholderTextColor="#999"
            multiline
            value={organizerRequest.description}
            onChangeText={(text) => setOrganizerRequest((prev) => ({ ...prev, description: text }))}
            editable={!isLoading}
          />
        </View>
        <Text style={styles.adminEmailNote}>This request goes into the admin queue and should be followed up with your country admin for screening.</Text>
      </View>
    </View>
  );

  const renderStep4 = () => (
    <>
      <View style={styles.stepHeader}>
        <Ruler size={32} color="#fff" />
        <Text style={styles.formTitle}>Measurement Preferences</Text>
        <Text style={styles.stepSubtitle}>Choose the units you want RunNation to use for distance and weight.</Text>
      </View>

      <View style={styles.metricSection}>
        <View style={styles.metricSectionHeader}>
          <Ruler size={18} color="#fff" />
          <Text style={styles.metricSectionTitle}>Distance</Text>
        </View>
        {renderMetricOption(
          distancePreference === 'kilometers',
          'Kilometres',
          'Use km for workouts, events, and distance goals.',
          () => setDistancePreference('kilometers')
        )}
        {renderMetricOption(
          distancePreference === 'miles',
          'Miles',
          'Use mi where the app supports distance display preferences.',
          () => setDistancePreference('miles')
        )}
      </View>

      <View style={styles.metricSection}>
        <View style={styles.metricSectionHeader}>
          <Scale size={18} color="#fff" />
          <Text style={styles.metricSectionTitle}>Weight</Text>
        </View>
        {renderMetricOption(
          weightPreference === 'kg',
          'Kilograms',
          'Use kg for weight entries and weight goals.',
          () => setWeightPreference('kg')
        )}
        {renderMetricOption(
          weightPreference === 'lbs',
          'Pounds',
          'Use lbs as your preferred weight unit.',
          () => setWeightPreference('lbs')
        )}
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton, isLoading && styles.buttonDisabled]}
          onPress={handleStep4Complete}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          <View style={styles.buttonInner}>
            <Text style={styles.buttonText}>Next: Club Membership</Text>
            <ChevronRight size={20} color="#fff" />
          </View>
        </TouchableOpacity>

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

  const renderStep5 = () => {
    const showCompleteButton = clubChoice === 'none' ||
      clubChoice === 'start' ||
      clubChoice === 'organizer' ||
      (clubChoice === 'join' && (selectedNormalClubId || selectedSpecialClubIds.length > 0)) ||
      (clubChoice === 'existing' && (selectedNormalClubId || selectedSpecialClubIds.length > 0));

    return (
      <>
        <View style={styles.stepHeader}>
          <Users size={32} color="#fff" />
          <Text style={styles.formTitle}>Club & Organiser</Text>
          <Text style={styles.stepSubtitle}>
            {clubChoice === 'join' || clubChoice === 'existing'
              ? 'List of clubs in your country'
              : 'Choose your club preference.'}
          </Text>
        </View>

        {clubChoice === null && renderClubChoiceOptions()}
        {clubChoice === 'join' && renderClubJoinList()}
        {clubChoice === 'existing' && renderClubExistingList()}
        {clubChoice === 'start' && renderClubStartNew()}
        {clubChoice === 'organizer' && renderEventOrganizerRequest()}
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
              onPress={() => void handleStep5Complete()}
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
              <View style={styles.logoWrap}>
                <Image
                  source={require('../assets/images/adaptive-icon.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.title}>RunNation</Text>
              <Text style={styles.subtitle}>
                {screenMode === 'login' && 'Welcome back!'}
                {screenMode === 'fullRegistration' && registrationStep === 1 && 'Join the community'}
                {screenMode === 'fullRegistration' && registrationStep === 2 && 'Secure your contacts'}
                {screenMode === 'fullRegistration' && registrationStep === 3 && 'Almost there!'}
                {screenMode === 'fullRegistration' && registrationStep === 4 && 'Set your units'}
                {screenMode === 'fullRegistration' && registrationStep === 5 && 'One last step!'}
                {screenMode === 'forgot' && 'Reset your password'}
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
                  {registrationStep === 5 && renderStep5()}
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
                        <Text style={styles.buttonText}>Send Reset Email</Text>
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
                  {screenMode === 'login' && renderSocialAuthButtons()}

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Email Address</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter your email"
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
                      <Text style={styles.label}>Password</Text>
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
                    <View style={styles.passwordField}>
                      <TextInput
                        style={[styles.input, styles.passwordFieldInput]}
                        value={pin}
                        onChangeText={setPin}
                        placeholder="Enter your password"
                        placeholderTextColor="#999"
                        secureTextEntry={!showLoginPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!isLoading}
                      />
                      <TouchableOpacity
                        style={styles.passwordToggle}
                        onPress={() => setShowLoginPassword((prev) => !prev)}
                        disabled={isLoading}
                      >
                        {showLoginPassword ? (
                          <EyeOff size={20} color="#777" />
                        ) : (
                          <Eye size={20} color="#777" />
                        )}
                      </TouchableOpacity>
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
                        <Text style={styles.textButtonText}>Forgot Password?</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.onboardingLinkButton}
                        onPress={() => router.push('/onboarding')}
                        disabled={isLoading}
                      >
                        <Text style={styles.onboardingLinkText}>View onboarding again</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>

            </View>
        </ScrollView>
        {renderClubTermsModal()}
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
  logoWrap: {
    width: 64,
    height: 64,
    overflow: 'hidden',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoImage: {
    width: 132,
    height: 132,
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
  inputHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 6,
    lineHeight: 16,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1a1a1a',
  },
  passwordField: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordFieldInput: {
    paddingRight: 52,
  },
  passwordToggle: {
    position: 'absolute',
    right: 16,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
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
  socialAuthContainer: {
    gap: 10,
    marginBottom: 20,
  },
  socialAuthButton: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(255,255,255,0.9)',
  },
  googleMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F8F8',
  },
  googleMarkText: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: '#4285F4',
  },
  socialAuthButtonText: {
    color: '#1a1a1a',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  appleButtonComingSoon: {
    backgroundColor: 'rgba(28,28,28,0.34)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  appleComingSoonText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  comingSoonPill: {
    position: 'absolute',
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '700' as const,
  },
  authDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  authDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  authDividerText: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 12,
    fontWeight: '600' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
  onboardingLinkButton: {
    paddingTop: 2,
    paddingBottom: 6,
    alignItems: 'center',
  },
  onboardingLinkText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '500' as const,
    textDecorationLine: 'underline',
  },
  formTitle: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: '#FFFFFF',
    marginBottom: 24,
    textAlign: 'center',
  },
  profileCompletionNote: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    padding: 12,
    marginTop: -10,
    marginBottom: 18,
    gap: 4,
  },
  profileCompletionNoteTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800' as const,
  },
  profileCompletionNoteText: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 12,
    lineHeight: 17,
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
    marginBottom: 6,
  },
  clubSelectionHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 17,
    marginBottom: 14,
  },
  clubTermsNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(26,26,26,0.22)',
    padding: 12,
    marginBottom: 14,
  },
  clubTermsNoticeText: {
    flex: 1,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600' as const,
  },
  clubsList: {
    gap: 14,
    marginBottom: 16,
  },
  clubGroupSection: {
    gap: 10,
  },
  clubGroupHeader: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.28)',
    paddingBottom: 8,
  },
  clubGroupTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800' as const,
    textTransform: 'uppercase' as const,
  },
  clubGroupSubtitle: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
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
  specialClubBadge: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  specialClubBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800' as const,
    textTransform: 'uppercase' as const,
  },
  missingClubCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    gap: 5,
  },
  missingClubTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700' as const,
  },
  missingClubText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    lineHeight: 17,
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
  clubTermsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.58)',
    justifyContent: 'flex-end',
  },
  clubTermsModal: {
    maxHeight: '88%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  clubTermsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  clubTermsTitleWrap: {
    flex: 1,
  },
  clubTermsEyebrow: {
    color: '#d4691e',
    fontSize: 11,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  clubTermsTitle: {
    color: '#111827',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900' as const,
  },
  clubTermsCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubTermsScroll: {
    maxHeight: 460,
  },
  clubTermsContent: {
    padding: 20,
    gap: 14,
  },
  clubTermsIntro: {
    color: '#4b5563',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  clubTermsSection: {
    gap: 4,
  },
  clubTermsSectionTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900' as const,
  },
  clubTermsSectionText: {
    color: '#4b5563',
    fontSize: 13,
    lineHeight: 19,
  },
  clubTermsActions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  clubTermsCancelButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubTermsCancelText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '800' as const,
  },
  clubTermsAgreeButton: {
    flex: 1.45,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubTermsAgreeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900' as const,
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
  metricSection: {
    gap: 10,
    marginBottom: 18,
  },
  metricSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metricSectionTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800' as const,
    textTransform: 'uppercase' as const,
  },
  metricOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  metricOptionCardSelected: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: '#fff',
  },
  metricOptionTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700' as const,
  },
  metricOptionDetail: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  preferenceQuestion: {
    gap: 8,
  },
  preferenceQuestionDetail: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    lineHeight: 17,
  },
  preferenceChoiceRow: {
    flexDirection: 'row',
    gap: 10,
  },
  preferenceChoice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  preferenceChoiceSelected: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: '#fff',
  },
  preferenceChoiceText: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  preferenceChoiceTextSelected: {
    color: '#fff',
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
