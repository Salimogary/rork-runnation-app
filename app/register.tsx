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
import { Fingerprint, Camera, Check } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Picker } from '@react-native-picker/picker';
import { COUNTRIES, ACADEMIC_YEARS } from '@/constants/countries';

type ScreenMode = 'login' | 'create' | 'forgot' | 'fullRegistration';

interface RegistrationData {
  firstName: string;
  otherNames: string;
  username: string;
  email: string;
  sex: string;
  age: string;
  residence: string;
  occupation: string;
  mukStudentType?: string;
  mukStudentLocation?: string;
  weightCurrent: string;
  weightTarget: string;
  country: string;
  academicYear: string;
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
    age: '',
    residence: '',
    occupation: '',
    mukStudentType: '',
    mukStudentLocation: '',
    weightCurrent: '',
    weightTarget: '',
    country: '',
    academicYear: '',
    pin: '',
    confirmPin: '',
    photoUri: '',
  });
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
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
  }, []);

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

  const handleCreateAccount = async () => {
    const requiredFields = [
      'firstName', 'otherNames', 'username', 'email', 'sex', 'age',
      'residence', 'occupation', 'weightCurrent', 'weightTarget',
      'country', 'academicYear', 'pin', 'confirmPin'
    ];

    const emptyFields = requiredFields.filter(field => !registrationData[field as keyof RegistrationData]);
    if (emptyFields.length > 0) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (!acceptedTerms) {
      Alert.alert('Terms & Conditions', 'You must accept the Terms and Conditions and Privacy Policy to register.');
      return;
    }

    if (registrationData.occupation === 'MUK Student') {
      if (!registrationData.mukStudentType) {
        Alert.alert('Error', 'Please select student type (Resident/Non-Resident)');
        return;
      }
      if (!registrationData.mukStudentLocation) {
        Alert.alert('Error', 'Please select your hall or hostel');
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
      const { error } = await signUp(registrationData.username, registrationData.pin, registrationData);
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
                        <Picker.Item label="Male" value="Male" />
                        <Picker.Item label="Female" value="Female" />
                      </Picker>
                    </View>
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Age *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter age"
                      placeholderTextColor="#999"
                      value={registrationData.age}
                      onChangeText={(text) => updateRegistrationField('age', text)}
                      keyboardType="number-pad"
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
                        enabled={!isLoading}
                      >
                        <Picker.Item label="Select country" value="" />
                        {COUNTRIES.map((country) => (
                          <Picker.Item key={country} label={country} value={country} />
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
                    <Text style={styles.label}>Occupation *</Text>
                    <View style={styles.pickerContainer}>
                      <Picker
                        selectedValue={registrationData.occupation}
                        onValueChange={(value: string) => {
                          updateRegistrationField('occupation', value);
                          if (value !== 'MUK Student') {
                            updateRegistrationField('mukStudentType', '');
                            updateRegistrationField('mukStudentLocation', '');
                          }
                        }}
                        style={styles.picker}
                        enabled={!isLoading}
                      >
                        <Picker.Item label="Select occupation" value="" />
                        <Picker.Item label="MUK Student" value="MUK Student" />
                        <Picker.Item label="MUK Staff" value="MUK Staff" />
                        <Picker.Item label="Other" value="Other" />
                      </Picker>
                    </View>
                  </View>

                  {registrationData.occupation === 'MUK Student' && (
                    <>
                      <View style={styles.inputContainer}>
                        <Text style={styles.label}>Student Type *</Text>
                        <View style={styles.pickerContainer}>
                          <Picker
                            selectedValue={registrationData.mukStudentType}
                            onValueChange={(value: string) => {
                              updateRegistrationField('mukStudentType', value);
                              updateRegistrationField('mukStudentLocation', '');
                            }}
                            style={styles.picker}
                            enabled={!isLoading}
                          >
                            <Picker.Item label="Select type" value="" />
                            <Picker.Item label="Resident" value="Resident" />
                            <Picker.Item label="Non-Resident" value="Non-Resident" />
                          </Picker>
                        </View>
                      </View>

                      {registrationData.mukStudentType === 'Resident' && (
                        <View style={styles.inputContainer}>
                          <Text style={styles.label}>Hall *</Text>
                          <View style={styles.pickerContainer}>
                            <Picker
                              selectedValue={registrationData.mukStudentLocation}
                              onValueChange={(value: string) => updateRegistrationField('mukStudentLocation', value)}
                              style={styles.picker}
                              enabled={!isLoading}
                            >
                              <Picker.Item label="Select hall" value="" />
                              <Picker.Item label="Lumumba" value="Lumumba" />
                              <Picker.Item label="Livingstone" value="Livingstone" />
                              <Picker.Item label="Mitchell" value="Mitchell" />
                              <Picker.Item label="Nkurumah" value="Nkurumah" />
                              <Picker.Item label="Nsibirwa" value="Nsibirwa" />
                              <Picker.Item label="University Hall" value="University Hall" />
                              <Picker.Item label="Africa" value="Africa" />
                              <Picker.Item label="Complex" value="Complex" />
                              <Picker.Item label="Mary Stuart" value="Mary Stuart" />
                              <Picker.Item label="Galloway" value="Galloway" />
                              <Picker.Item label="Kabanyolo" value="Kabanyolo" />
                            </Picker>
                          </View>
                        </View>
                      )}

                      {registrationData.mukStudentType === 'Non-Resident' && (
                        <View style={styles.inputContainer}>
                          <Text style={styles.label}>Hostel *</Text>
                          <View style={styles.pickerContainer}>
                            <Picker
                              selectedValue={registrationData.mukStudentLocation}
                              onValueChange={(value: string) => updateRegistrationField('mukStudentLocation', value)}
                              style={styles.picker}
                              enabled={!isLoading}
                            >
                              <Picker.Item label="Select hostel" value="" />
                              <Picker.Item label="Braetd Hostel" value="Braetd Hostel" />
                              <Picker.Item label="JJ Hostel" value="JJ Hostel" />
                              <Picker.Item label="Lady Juliana" value="Lady Juliana" />
                              <Picker.Item label="Makerere Garden Courts" value="Makerere Garden Courts" />
                              <Picker.Item label="Nakiyingi" value="Nakiyingi" />
                              <Picker.Item label="New Nana" value="New Nana" />
                              <Picker.Item label="Olympia Hostel" value="Olympia Hostel" />
                              <Picker.Item label="Akwata Empola" value="Akwata Empola" />
                              <Picker.Item label="Apex" value="Apex" />
                              <Picker.Item label="Aryan" value="Aryan" />
                              <Picker.Item label="Dream World Hostel" value="Dream World Hostel" />
                              <Picker.Item label="Edith Hetty" value="Edith Hetty" />
                              <Picker.Item label="Kann Hostel" value="Kann Hostel" />
                              <Picker.Item label="Kare Hostel" value="Kare Hostel" />
                              <Picker.Item label="Makerere International Students' Hostel" value="Makerere International Students' Hostel" />
                              <Picker.Item label="Muhika" value="Muhika" />
                              <Picker.Item label="Nalika" value="Nalika" />
                              <Picker.Item label="Pearl View" value="Pearl View" />
                              <Picker.Item label="St. Monica" value="St. Monica" />
                              <Picker.Item label="Sunway" value="Sunway" />
                              <Picker.Item label="Zoa Hostel" value="Zoa Hostel" />
                              <Picker.Item label="Baskon Hostel" value="Baskon Hostel" />
                              <Picker.Item label="Bbira" value="Bbira" />
                              <Picker.Item label="Castle Ville" value="Castle Ville" />
                              <Picker.Item label="Cheds" value="Cheds" />
                              <Picker.Item label="Douglas Villa" value="Douglas Villa" />
                              <Picker.Item label="Herican" value="Herican" />
                              <Picker.Item label="Messiah" value="Messiah" />
                              <Picker.Item label="Prince" value="Prince" />
                              <Picker.Item label="Waveney Courts" value="Waveney Courts" />
                              <Picker.Item label="Other" value="Other" />
                            </Picker>
                          </View>
                        </View>
                      )}
                    </>
                  )}

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Current Weight (kg) *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter current weight"
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
                      placeholder="Enter target weight"
                      placeholderTextColor="#999"
                      value={registrationData.weightTarget}
                      onChangeText={(text) => updateRegistrationField('weightTarget', text)}
                      keyboardType="decimal-pad"
                      editable={!isLoading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Academic Year *</Text>
                    <View style={styles.pickerContainer}>
                      <Picker
                        selectedValue={registrationData.academicYear}
                        onValueChange={(value: string) => updateRegistrationField('academicYear', value)}
                        style={styles.picker}
                        enabled={!isLoading}
                      >
                        <Picker.Item label="Select academic year" value="" />
                        {ACADEMIC_YEARS.map((year) => (
                          <Picker.Item key={year} label={year} value={year} />
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
                          age: '',
                          residence: '',
                          occupation: '',
                          mukStudentType: '',
                          mukStudentLocation: '',
                          weightCurrent: '',
                          weightTarget: '',
                          country: '',
                          academicYear: '',
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
});
