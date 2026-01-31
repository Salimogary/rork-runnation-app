import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Camera, Edit2, Save, X } from "lucide-react-native";

interface UserProfile {
  RegistrationID: string;
  "First Name": string;
  "Other Names"?: string;
  Username: string;
  Email?: string;
  Sex?: string;
  Age?: number;
  Residence?: string;
  Occupation?: string;
  "Weight Current"?: number;
  "Weight Target"?: number;
  Country?: string;
  "Academic Year"?: string;
  FriendID?: string;
}

export default function ProfileScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<UserProfile>>({});

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["profile", user?.id, user],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      
      console.log("Fetching profile for user:", user.id);
      const { data, error } = await supabase
        .from("Registration Sample")
        .select("*")
        .eq("RegistrationID", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching profile:", JSON.stringify(error, null, 2));
        throw new Error(`Profile fetch failed: ${error.message || JSON.stringify(error)}`);
      }

      if (!data) {
        throw new Error("No profile found for this user");
      }

      console.log("Profile fetched:", data);
      return data;
    },
    enabled: !!user,
  });

  const { data: profilePhoto } = useQuery<string | null>({
    queryKey: ["profilePhoto", user?.id, user],
    queryFn: async () => {
      if (!user) return null;
      
      const { data } = await supabase
        .from("user_photos")
        .select("file_path")
        .eq("registration_id", user.id)
        .eq("is_profile_photo", true)
        .maybeSingle();

      return data?.file_path || null;
    },
    enabled: !!user,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: Partial<UserProfile>) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("Registration Sample")
        .update(updates)
        .eq("RegistrationID", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setIsEditing(false);
      if (Platform.OS !== 'web') {
        Alert.alert("Success", "Profile updated successfully!");
      }
    },
    onError: (error) => {
      console.error("Update error:", error);
      if (Platform.OS !== 'web') {
        Alert.alert("Error", "Failed to update profile");
      }
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (photoUri: string) => {
      if (!user) throw new Error("Not authenticated");

      console.log("Starting photo upload for user:", user.id);
      
      const photoFileName = `${user.id}_${Date.now()}.jpg`;
      
      const response = await fetch(photoUri);
      const blob = await response.blob();
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      });

      console.log("Uploading to storage...");
      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(photoFileName, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw uploadError;
      }

      console.log("Getting public URL...");
      const { data: urlData } = supabase.storage
        .from('user-photos')
        .getPublicUrl(photoFileName);

      const publicUrl = urlData.publicUrl;
      console.log("Public URL:", publicUrl);

      console.log("Updating existing photos...");
      await supabase
        .from("user_photos")
        .update({ is_profile_photo: false })
        .eq("registration_id", user.id);

      console.log("Inserting new photo record...");
      const { error: insertError } = await supabase
        .from("user_photos")
        .insert({
          registration_id: user.id,
          file_path: publicUrl,
          file_name: photoFileName,
          file_size: arrayBuffer.byteLength,
          mime_type: 'image/jpeg',
          is_profile_photo: true,
        });

      if (insertError) {
        console.error('Photo insert error:', JSON.stringify(insertError, null, 2));
        throw insertError;
      }

      console.log("Photo upload completed successfully");
    },
    onSuccess: () => {
      console.log("Invalidating photo queries...");
      queryClient.invalidateQueries({ queryKey: ["profilePhoto"] });
      queryClient.invalidateQueries({ queryKey: ["headerProfilePhoto"] });
      if (Platform.OS !== 'web') {
        Alert.alert("Success", "Profile photo updated!");
      }
    },
    onError: (error) => {
      console.error("Photo upload mutation error:", error);
      if (Platform.OS !== 'web') {
        Alert.alert("Error", "Failed to upload photo. Please try again.");
      }
    },
  });

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      if (Platform.OS !== 'web') {
        Alert.alert("Permission Required", "Permission to access camera roll is required!");
      }
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images" as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      uploadPhotoMutation.mutate(result.assets[0].uri);
    }
  };

  const handleEdit = () => {
    if (profile) {
      setFormData({
        "First Name": profile["First Name"],
        "Other Names": profile["Other Names"],
        Username: profile.Username,
        Email: profile.Email,
        Sex: profile.Sex,
        Age: profile.Age,
        Residence: profile.Residence,
        Occupation: profile.Occupation,
        "Weight Current": profile["Weight Current"],
        "Weight Target": profile["Weight Target"],
        Country: profile.Country,
        "Academic Year": profile["Academic Year"],
      });
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    updateProfileMutation.mutate(formData);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({});
  };

  if (isLoading || !profile) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <View style={styles.photoContainer}>
          {profilePhoto ? (
            <Image
              source={{ uri: profilePhoto }}
              style={styles.profilePhoto}
              contentFit="cover"
            />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>
                {profile["First Name"]?.[0]?.toUpperCase() || "?"}
              </Text>
            </View>
          )}
          <TouchableOpacity style={styles.cameraButton} onPress={pickImage}>
            <Camera size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {!isEditing && (
          <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
            <Edit2 size={20} color="#10b981" />
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.infoContainer}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>First Name</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={formData["First Name"] || ""}
              onChangeText={(text) => setFormData({ ...formData, "First Name": text })}
              placeholder="Enter your first name"
            />
          ) : (
            <Text style={styles.fieldValue}>{profile["First Name"]}</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Other Names</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={formData["Other Names"] || ""}
              onChangeText={(text) => setFormData({ ...formData, "Other Names": text })}
              placeholder="Enter your other names"
            />
          ) : (
            <Text style={styles.fieldValue}>{profile["Other Names"] || "Not set"}</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Username</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={formData.Username || ""}
              onChangeText={(text) => setFormData({ ...formData, Username: text })}
              placeholder="Enter your username"
            />
          ) : (
            <Text style={styles.fieldValue}>@{profile.Username}</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Email</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={formData.Email || ""}
              onChangeText={(text) => setFormData({ ...formData, Email: text })}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          ) : (
            <Text style={styles.fieldValue}>{profile.Email || "Not set"}</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Sex</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={formData.Sex || ""}
              onChangeText={(text) => setFormData({ ...formData, Sex: text })}
              placeholder="Enter your sex"
            />
          ) : (
            <Text style={styles.fieldValue}>{profile.Sex || "Not set"}</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Age</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={formData.Age?.toString() || ""}
              onChangeText={(text) => setFormData({ ...formData, Age: parseInt(text) || undefined })}
              placeholder="Enter your age"
              keyboardType="numeric"
            />
          ) : (
            <Text style={styles.fieldValue}>{profile.Age || "Not set"}</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Residence</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={formData.Residence || ""}
              onChangeText={(text) => setFormData({ ...formData, Residence: text })}
              placeholder="Enter your residence"
            />
          ) : (
            <Text style={styles.fieldValue}>{profile.Residence || "Not set"}</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Occupation</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={formData.Occupation || ""}
              onChangeText={(text) => setFormData({ ...formData, Occupation: text })}
              placeholder="Enter your occupation"
            />
          ) : (
            <Text style={styles.fieldValue}>{profile.Occupation || "Not set"}</Text>
          )}
        </View>

        <View style={styles.weightSection}>
          <Text style={styles.sectionTitle}>Weight Goals</Text>
          
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Weight Current (kg)</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={formData["Weight Current"]?.toString() || ""}
                onChangeText={(text) => setFormData({ ...formData, "Weight Current": parseFloat(text) || undefined })}
                placeholder="Enter current weight"
                keyboardType="decimal-pad"
              />
            ) : (
              <Text style={styles.fieldValue}>{profile["Weight Current"] || "Not set"}</Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Weight Target (kg)</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={formData["Weight Target"]?.toString() || ""}
                onChangeText={(text) => setFormData({ ...formData, "Weight Target": parseFloat(text) || undefined })}
                placeholder="Enter target weight"
                keyboardType="decimal-pad"
              />
            ) : (
              <Text style={styles.fieldValue}>{profile["Weight Target"] || "Not set"}</Text>
            )}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Country</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={formData.Country || ""}
              onChangeText={(text) => setFormData({ ...formData, Country: text })}
              placeholder="Enter your country"
            />
          ) : (
            <Text style={styles.fieldValue}>{profile.Country || "Not set"}</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Academic Year</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={formData["Academic Year"] || ""}
              onChangeText={(text) => setFormData({ ...formData, "Academic Year": text })}
              placeholder="Enter your academic year"
            />
          ) : (
            <Text style={styles.fieldValue}>{profile["Academic Year"] || "Not set"}</Text>
          )}
        </View>

        {isEditing && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
            >
              <X size={20} color="#ef4444" />
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              disabled={updateProfileMutation.isPending}
            >
              <Save size={20} color="#fff" />
              <Text style={styles.saveButtonText}>
                {updateProfileMutation.isPending ? "Saving..." : "Save"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  header: {
    backgroundColor: "#10b981",
    paddingTop: 40,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 16,
  },
  photoContainer: {
    position: "relative",
  },
  profilePhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: "#fff",
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#fff",
  },
  photoPlaceholderText: {
    fontSize: 48,
    fontWeight: "700" as const,
    color: "#10b981",
  },
  cameraButton: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#10b981",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#10b981",
  },
  infoContainer: {
    padding: 20,
    gap: 16,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#666",
    textTransform: "uppercase",
  },
  fieldValue: {
    fontSize: 17,
    color: "#000",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
  },
  input: {
    fontSize: 17,
    color: "#000",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#10b981",
  },
  weightSection: {
    marginTop: 8,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#000",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ef4444",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#ef4444",
  },
  saveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#fff",
  },
});
