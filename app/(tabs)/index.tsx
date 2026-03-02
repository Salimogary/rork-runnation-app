import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Platform, Modal, TextInput, Alert, Image, AppState, AppStateStatus } from "react-native";
import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Square, Footprints, Dumbbell, Upload, X, Timer, Gauge } from "lucide-react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import MapView, { Polyline } from "react-native-maps";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import colors from "@/constants/colors";

type RunState = "idle" | "running" | "paused" | "finished";
type ExerciseType = "Walk" | "Run" | "Treadmill" | null;

interface Coordinates {
  latitude: number;
  longitude: number;
}

export default function ExerciseScreen() {
  const { user } = useAuth();
  const [runState, setRunState] = useState<RunState>("idle");
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [pace, setPace] = useState(0);
  const [coords, setCoords] = useState<Coordinates[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [exerciseType, setExerciseType] = useState<ExerciseType>(null);
  const [showTreadmillModal, setShowTreadmillModal] = useState(false);
  const [treadmillDistance, setTreadmillDistance] = useState("");
  const [treadmillTime, setTreadmillTime] = useState("");
  const [treadmillImage, setTreadmillImage] = useState<string | null>(null);
  
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedBeforePause = useRef<number>(0);
  const runningStartTimestamp = useRef<number | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const updateDuration = useCallback(() => {
    if (runningStartTimestamp.current !== null) {
      const now = Date.now();
      const currentSegment = Math.floor((now - runningStartTimestamp.current) / 1000);
      setDuration(elapsedBeforePause.current + currentSegment);
    }
  }, []);

  useEffect(() => {
    requestLocationPermission();

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[Timer] App came to foreground, recalculating duration');
        updateDuration();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
    };
  }, [updateDuration]);

  const requestLocationPermission = async () => {
    if (Platform.OS === 'web') {
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === "granted") {
      const location = await Location.getCurrentPositionAsync({});
      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    }
  };

  const startTracking = async (type: ExerciseType) => {
    if (!type) return;

    if (type === "Treadmill") {
      setShowTreadmillModal(true);
      return;
    }

    if (Platform.OS === 'web') {
      return;
    }

    setExerciseType(type);
    setRunState("running");
    setStartTime(new Date());
    setCoords([]);
    setDistance(0);
    setDuration(0);
    elapsedBeforePause.current = 0;
    runningStartTimestamp.current = Date.now();

    timerInterval.current = setInterval(() => {
      if (runningStartTimestamp.current !== null) {
        const now = Date.now();
        const currentSegment = Math.floor((now - runningStartTimestamp.current) / 1000);
        setDuration(elapsedBeforePause.current + currentSegment);
      }
    }, 1000) as any;

    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 10,
      },
      (location) => {
        const newCoord = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
        setCurrentLocation(newCoord);
        setCoords((prev) => {
          const updated = [...prev, newCoord];
          if (prev.length > 0) {
            const lastCoord = prev[prev.length - 1];
            const dist = calculateDistance(lastCoord, newCoord);
            setDistance((prevDist) => prevDist + dist);
          }
          return updated;
        });
      }
    );
  };

  const pauseTracking = () => {
    if (runningStartTimestamp.current !== null) {
      const now = Date.now();
      elapsedBeforePause.current += Math.floor((now - runningStartTimestamp.current) / 1000);
      runningStartTimestamp.current = null;
    }
    setRunState("paused");
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    if (locationSubscription.current) {
      locationSubscription.current.remove();
    }
  };

  const resumeTracking = async () => {
    if (Platform.OS === 'web') {
      return;
    }

    setRunState("running");
    runningStartTimestamp.current = Date.now();

    timerInterval.current = setInterval(() => {
      if (runningStartTimestamp.current !== null) {
        const now = Date.now();
        const currentSegment = Math.floor((now - runningStartTimestamp.current) / 1000);
        setDuration(elapsedBeforePause.current + currentSegment);
      }
    }, 1000) as any;

    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 10,
      },
      (location) => {
        const newCoord = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
        setCurrentLocation(newCoord);
        setCoords((prev) => {
          const updated = [...prev, newCoord];
          if (prev.length > 0) {
            const lastCoord = prev[prev.length - 1];
            const dist = calculateDistance(lastCoord, newCoord);
            setDistance((prevDist) => prevDist + dist);
          }
          return updated;
        });
      }
    );
  };

  const stopTracking = async () => {
    if (runningStartTimestamp.current !== null) {
      const now = Date.now();
      elapsedBeforePause.current += Math.floor((now - runningStartTimestamp.current) / 1000);
      runningStartTimestamp.current = null;
    }
    setDuration(elapsedBeforePause.current);
    setRunState("finished");
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    if (locationSubscription.current) {
      locationSubscription.current.remove();
    }

    if (user && startTime) {
      const endTime = new Date();
      const calculatedPace = duration > 0 ? (distance / (duration / 3600)) : 0;

      const { data: lastActivity } = await supabase
        .from("Activity Sample")
        .select("ActivityID")
        .order("ActivityID", { ascending: false })
        .limit(1)
        .single();

      let nextActivityId = "1";
      if (lastActivity?.ActivityID) {
        const lastId = parseInt(lastActivity.ActivityID);
        if (!isNaN(lastId)) {
          nextActivityId = (lastId + 1).toString();
        }
      }

      console.log("Saving activity with ID:", nextActivityId);

      const { error } = await supabase.from("Activity Sample").insert({
        ActivityID: nextActivityId,
        RegistrationID: user.id,
        Activity_Date: startTime.toISOString().split('T')[0],
        Exercise_Type: exerciseType || "Run",
        Distance_km: distance,
        Start_Time: startTime.toISOString().split('T')[1].split('.')[0],
        End_Time: endTime.toISOString().split('T')[1].split('.')[0],
        Pace_km_h: calculatedPace,
      });

      if (error) {
        console.error("Error saving activity:", error);
        Alert.alert("Error", "Failed to save activity");
      } else {
        console.log("Activity saved successfully with ID:", nextActivityId);
        Alert.alert("Success", "Activity saved successfully!");
      }
    }
  };

  const resetTracking = () => {
    setRunState("idle");
    setDistance(0);
    setDuration(0);
    setPace(0);
    setCoords([]);
    setStartTime(null);
    setExerciseType(null);
    elapsedBeforePause.current = 0;
    runningStartTimestamp.current = null;
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setTreadmillImage(result.assets[0].uri);
    }
  };

  const submitTreadmill = async () => {
    if (!treadmillDistance || !treadmillTime || !treadmillImage) {
      Alert.alert("Error", "Please fill all fields and upload an image");
      return;
    }

    const distanceKm = parseFloat(treadmillDistance);
    const timeMinutes = parseFloat(treadmillTime);

    if (isNaN(distanceKm) || isNaN(timeMinutes) || distanceKm <= 0 || timeMinutes <= 0) {
      Alert.alert("Error", "Please enter valid distance and time");
      return;
    }

    const timeInterval = `${Math.floor(timeMinutes / 60)}:${Math.floor(timeMinutes % 60)}:00`;

    if (!user) {
      Alert.alert("Error", "You must be logged in to submit activities");
      return;
    }

    const { error } = await supabase.from("Pending Activities").insert({
      RegistrationID: user.id,
      Exercise_Type: "Treadmill",
      Distance_Entered: distanceKm,
      Distance_Unit: "km",
      Time_Entered: timeInterval,
      Photo_Path: treadmillImage,
      Status: "pending",
    });

    if (error) {
      console.error("Error submitting treadmill activity:", error);
      Alert.alert("Error", "Failed to submit activity");
      return;
    }

    Alert.alert("Success", "Treadmill activity submitted for approval");
    setShowTreadmillModal(false);
    setTreadmillDistance("");
    setTreadmillTime("");
    setTreadmillImage(null);
  };

  const calculateDistance = (coord1: Coordinates, coord2: Coordinates): number => {
    const R = 6371;
    const dLat = toRad(coord2.latitude - coord1.latitude);
    const dLon = toRad(coord2.longitude - coord1.longitude);
    const lat1 = toRad(coord1.latitude);
    const lat2 = toRad(coord2.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const toRad = (value: number): number => {
    return (value * Math.PI) / 180;
  };

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (duration > 0 && distance > 0) {
      const calculatedPace = distance / (duration / 3600);
      setPace(calculatedPace);
    }
  }, [distance, duration]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {Platform.OS !== 'web' && currentLocation && (
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              region={{
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              showsUserLocation
              followsUserLocation
            >
              {coords.length > 1 && (
                <Polyline
                  coordinates={coords}
                  strokeColor={colors.primary}
                  strokeWidth={5}
                />
              )}
            </MapView>
          </View>
        )}

        <View style={styles.statsContainer}>
          <LinearGradient
            colors={colors.gradient.orange}
            style={styles.statCard}
          >
            <Text style={styles.statLabel}>Distance</Text>
            <Text style={styles.statValue}>{distance.toFixed(2)}</Text>
            <Text style={styles.statUnit}>km</Text>
          </LinearGradient>
          
          <LinearGradient
            colors={colors.gradient.teal}
            style={styles.statCard}
          >
            <Timer size={20} color={colors.white} style={styles.statIcon} />
            <Text style={styles.statLabel}>Time</Text>
            <Text style={styles.statValue}>{formatTime(duration)}</Text>
          </LinearGradient>
          
          <LinearGradient
            colors={colors.gradient.blue}
            style={styles.statCard}
          >
            <Gauge size={20} color={colors.white} style={styles.statIcon} />
            <Text style={styles.statLabel}>Pace</Text>
            <Text style={styles.statValue}>{pace.toFixed(1)}</Text>
            <Text style={styles.statUnit}>km/h</Text>
          </LinearGradient>
        </View>

        <View style={styles.controlsContainer}>
          {runState === "idle" && (
            <View style={styles.typeSelectionContainer}>
              <Text style={styles.typeSelectionTitle}>Choose Your Activity</Text>
              <TouchableOpacity
                style={styles.typeButton}
                onPress={() => startTracking("Walk")}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={['#8B5CF6', '#A78BFA']}
                  style={styles.typeButtonGradient}
                >
                  <View style={styles.typeButtonContent}>
                    <Footprints size={32} color={colors.white} />
                    <View style={styles.typeButtonTextContainer}>
                      <Text style={styles.typeButtonText}>Walk</Text>
                      <Text style={styles.typeButtonSubtext}>Outdoor walking</Text>
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.typeButton}
                onPress={() => startTracking("Run")}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={colors.gradient.orange}
                  style={styles.typeButtonGradient}
                >
                  <View style={styles.typeButtonContent}>
                    <Play size={32} color={colors.white} />
                    <View style={styles.typeButtonTextContainer}>
                      <Text style={styles.typeButtonText}>Run</Text>
                      <Text style={styles.typeButtonSubtext}>Outdoor running</Text>
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.typeButton}
                onPress={() => startTracking("Treadmill")}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={colors.gradient.teal}
                  style={styles.typeButtonGradient}
                >
                  <View style={styles.typeButtonContent}>
                    <Dumbbell size={32} color={colors.white} />
                    <View style={styles.typeButtonTextContainer}>
                      <Text style={styles.typeButtonText}>Treadmill</Text>
                      <Text style={styles.typeButtonSubtext}>Indoor training</Text>
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {runState === "running" && (
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.actionButton} onPress={pauseTracking} activeOpacity={0.8}>
                <LinearGradient colors={['#F59E0B', '#FBBF24']} style={styles.actionButtonGradient}>
                  <Pause size={28} color={colors.white} />
                  <Text style={styles.actionButtonText}>Pause</Text>
                </LinearGradient>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.actionButton} onPress={stopTracking} activeOpacity={0.8}>
                <LinearGradient colors={['#EF4444', '#F87171']} style={styles.actionButtonGradient}>
                  <Square size={28} color={colors.white} />
                  <Text style={styles.actionButtonText}>Finish</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {runState === "paused" && (
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.actionButton} onPress={resumeTracking} activeOpacity={0.8}>
                <LinearGradient colors={colors.gradient.teal} style={styles.actionButtonGradient}>
                  <Play size={28} color={colors.white} />
                  <Text style={styles.actionButtonText}>Resume</Text>
                </LinearGradient>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.actionButton} onPress={stopTracking} activeOpacity={0.8}>
                <LinearGradient colors={['#EF4444', '#F87171']} style={styles.actionButtonGradient}>
                  <Square size={28} color={colors.white} />
                  <Text style={styles.actionButtonText}>Finish</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {runState === "finished" && (
            <View style={styles.finishedContainer}>
              <LinearGradient colors={colors.gradient.sunset} style={styles.finishedCard}>
                <Text style={styles.finishedEmoji}>🎉</Text>
                <Text style={styles.finishedTitle}>{exerciseType} Complete!</Text>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Distance</Text>
                    <Text style={styles.summaryValue}>{distance.toFixed(2)} km</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Time</Text>
                    <Text style={styles.summaryValue}>{formatTime(duration)}</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Pace</Text>
                    <Text style={styles.summaryValue}>{pace.toFixed(1)} km/h</Text>
                  </View>
                </View>
              </LinearGradient>
              
              <TouchableOpacity style={styles.resetButton} onPress={resetTracking} activeOpacity={0.8}>
                <LinearGradient colors={colors.gradient.orange} style={styles.resetButtonGradient}>
                  <Text style={styles.resetButtonText}>Start New Activity</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showTreadmillModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTreadmillModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient colors={colors.gradient.teal} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Treadmill Activity</Text>
              <TouchableOpacity onPress={() => setShowTreadmillModal(false)}>
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Distance (km)</Text>
                <TextInput
                  style={styles.input}
                  value={treadmillDistance}
                  onChangeText={setTreadmillDistance}
                  keyboardType="decimal-pad"
                  placeholder="e.g., 5.2"
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Time (minutes)</Text>
                <TextInput
                  style={styles.input}
                  value={treadmillTime}
                  onChangeText={setTreadmillTime}
                  keyboardType="decimal-pad"
                  placeholder="e.g., 30"
                  placeholderTextColor={colors.textLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Treadmill Screen Photo</Text>
                <TouchableOpacity style={styles.imageUploadButton} onPress={pickImage}>
                  {treadmillImage ? (
                    <Image source={{ uri: treadmillImage }} style={styles.uploadedImage} />
                  ) : (
                    <View style={styles.uploadPlaceholder}>
                      <Upload size={40} color={colors.primary} />
                      <Text style={styles.uploadButtonText}>Tap to Upload Photo</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.infoText}>
                📸 Your submission will be reviewed by an admin
              </Text>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.submitButton} onPress={submitTreadmill} activeOpacity={0.8}>
                <LinearGradient colors={colors.gradient.teal} style={styles.submitButtonGradient}>
                  <Text style={styles.submitButtonText}>Submit for Approval</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  mapContainer: {
    height: 300,
    backgroundColor: colors.extraLightGray,
  },
  map: {
    flex: 1,
  },
  statsContainer: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 110,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  statIcon: {
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.white,
    marginBottom: 6,
    opacity: 0.9,
    fontWeight: "600" as const,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800" as const,
    color: colors.white,
  },
  statUnit: {
    fontSize: 12,
    color: colors.white,
    marginTop: 2,
    opacity: 0.9,
  },
  controlsContainer: {
    padding: 20,
    flex: 1,
    justifyContent: "center",
  },
  typeSelectionContainer: {
    gap: 16,
  },
  typeSelectionTitle: {
    fontSize: 24,
    fontWeight: "800" as const,
    color: colors.text,
    textAlign: "center" as const,
    marginBottom: 8,
  },
  typeButton: {
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  typeButtonGradient: {
    padding: 24,
  },
  typeButtonContent: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 20,
  },
  typeButtonTextContainer: {
    flex: 1,
  },
  typeButtonText: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: colors.white,
    marginBottom: 4,
  },
  typeButtonSubtext: {
    fontSize: 14,
    color: colors.white,
    opacity: 0.9,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 16,
  },
  actionButton: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  actionButtonGradient: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700" as const,
  },
  finishedContainer: {
    gap: 20,
  },
  finishedCard: {
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  finishedEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  finishedTitle: {
    fontSize: 32,
    fontWeight: "800" as const,
    color: colors.white,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: "row",
    width: "100%",
    alignItems: "center",
    justifyContent: "space-around",
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.white,
    opacity: 0.3,
  },
  summaryLabel: {
    fontSize: 13,
    color: colors.white,
    marginBottom: 6,
    opacity: 0.9,
    fontWeight: "600" as const,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: colors.white,
  },
  resetButton: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  resetButtonGradient: {
    padding: 20,
    alignItems: "center",
  },
  resetButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700" as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end" as const,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: "90%",
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    padding: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "800" as const,
    color: colors.white,
  },
  modalBody: {
    padding: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: colors.text,
    marginBottom: 10,
  },
  input: {
    backgroundColor: colors.extraLightGray,
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    color: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
  },
  imageUploadButton: {
    backgroundColor: colors.extraLightGray,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: colors.primary,
    borderStyle: "dashed" as const,
    minHeight: 200,
  },
  uploadPlaceholder: {
    padding: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 12,
  },
  uploadedImage: {
    width: "100%",
    height: 200,
  },
  uploadButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "700" as const,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center" as const,
    marginTop: 8,
    lineHeight: 20,
  },
  modalFooter: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  submitButton: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  submitButtonGradient: {
    padding: 18,
    alignItems: "center",
  },
  submitButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700" as const,
  },
});
