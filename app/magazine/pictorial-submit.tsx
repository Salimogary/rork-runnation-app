import React, { useMemo, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Camera, Send } from "lucide-react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { getServerClient } from "@/lib/server-client";

async function readImageAsBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error("Could not read the selected pictorial image.");
    }

    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not prepare the selected pictorial image."));
      reader.readAsDataURL(blob);
    });
    const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    if (!base64) {
      throw new Error("Could not prepare the selected pictorial image.");
    }
    return base64;
  }

  return FileSystem.readAsStringAsync(uri, { encoding: "base64" });
}

export default function PictorialSubmitScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { registrationId } = useAuth();
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [caption, setCaption] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(
    () =>
      registrationId &&
      eventName.trim().length >= 2 &&
      caption.trim().length >= 8 &&
      photoUri,
    [caption, eventName, photoUri, registrationId]
  );

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Required", "Please allow photo access to submit an event pictorial.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images" as any,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.82,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setMimeType(result.assets[0].mimeType || "image/jpeg");
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || !photoUri) {
      Alert.alert("Almost there", "Please complete the details and choose a photo.");
      return;
    }

    setIsSubmitting(true);
    try {
      const imageBase64 = await readImageAsBase64(photoUri);
      await getServerClient().magazine.submitPictorial.mutate({
        registrationId,
        eventName,
        eventDate: eventDate.trim() || null,
        caption,
        imageBase64,
        mimeType,
      });

      Alert.alert(
        "Pictorial Submitted",
        "Thanks. Your event photo has been sent to admins for review and may be selected as Picture of the Week.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (error) {
      Alert.alert("Submission Failed", error instanceof Error ? error.message : "Could not submit pictorial right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Event Pictorial" }} />
      <Text style={[styles.title, { color: colors.text }]}>Submit Event Pictorial</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Share a strong event photo with simple details. Your profile details are added automatically.
      </Text>

      <TouchableOpacity style={[styles.photoPicker, { backgroundColor: colors.cardBackground, borderColor: colors.border }]} onPress={pickPhoto}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoPreview} contentFit="cover" />
        ) : (
          <View style={styles.photoEmpty}>
            <Camera size={30} color={colors.primary} />
            <Text style={[styles.photoText, { color: colors.text }]}>Choose event photo</Text>
            <Text style={[styles.photoHint, { color: colors.textSecondary }]}>Landscape photos work best</Text>
          </View>
        )}
      </TouchableOpacity>

      {[
        ["Event name", eventName, setEventName],
        ["Event date (YYYY-MM-DD)", eventDate, setEventDate],
      ].map(([label, value, setter]) => (
        <View key={label as string} style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>{label as string}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.cardBackground, color: colors.text, borderColor: colors.border }]}
            value={value as string}
            onChangeText={setter as (text: string) => void}
            placeholder={label as string}
            placeholderTextColor={colors.textLight}
            autoCapitalize="sentences"
            keyboardType="default"
          />
        </View>
      ))}

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text }]}>Brief detail / caption</Text>
        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: colors.cardBackground, color: colors.text, borderColor: colors.border }]}
          value={caption}
          onChangeText={setCaption}
          placeholder="What is happening in the picture?"
          placeholderTextColor={colors.textLight}
          multiline
        />
      </View>

      <TouchableOpacity
        style={[styles.submitButton, { backgroundColor: canSubmit ? colors.primary : colors.textLight }]}
        disabled={!canSubmit || isSubmitting}
        onPress={handleSubmit}
      >
        <Send size={18} color="#fff" />
        <Text style={styles.submitText}>{isSubmitting ? "Submitting..." : "Submit Pictorial"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 22, paddingBottom: 42 },
  title: { fontSize: 30, lineHeight: 34, fontWeight: "900", letterSpacing: -0.8, marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  photoPicker: {
    height: 230,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 18,
  },
  photoPreview: { width: "100%", height: "100%" },
  photoEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  photoText: { fontSize: 16, fontWeight: "800" },
  photoHint: { fontSize: 13 },
  field: { gap: 8, marginBottom: 15 },
  label: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 13, fontSize: 15 },
  textArea: { minHeight: 110, lineHeight: 22, textAlignVertical: "top" },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 18,
    paddingVertical: 16,
    marginTop: 8,
  },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
