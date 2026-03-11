import { useState } from "react";
import { StyleSheet, View, Text, TextInput, TouchableOpacity, Alert, Platform, KeyboardAvoidingView, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Shield, Lock, User } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import * as Crypto from "expo-crypto";

export default function AdminLoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      const message = "Please enter both username and password";
      if (Platform.OS !== 'web') {
        Alert.alert("Required Fields", message);
      } else {
        alert(message);
      }
      return;
    }

    setIsLoading(true);

    try {
      const passwordHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        password
      );

      const { data: adminUser, error } = await supabase
        .from('admin_users')
        .select('admin_id, username, display_name, is_active')
        .eq('username', username.toLowerCase().trim())
        .eq('password_hash', passwordHash)
        .single();

      if (error || !adminUser) {
        console.log('[AdminLogin] Login failed:', error?.message);
        const message = "Invalid username or password";
        if (Platform.OS !== 'web') {
          Alert.alert("Login Failed", message);
        } else {
          alert(message);
        }
        setIsLoading(false);
        return;
      }

      if (!adminUser.is_active) {
        const message = "This admin account has been deactivated";
        if (Platform.OS !== 'web') {
          Alert.alert("Access Denied", message);
        } else {
          alert(message);
        }
        setIsLoading(false);
        return;
      }

      await AsyncStorage.setItem("admin_logged_in", "true");
      await AsyncStorage.setItem("admin_login_time", new Date().toISOString());
      await AsyncStorage.setItem("admin_display_name", adminUser.display_name || adminUser.username);

      const displayName = adminUser.display_name || adminUser.username;
      if (Platform.OS !== 'web') {
        Alert.alert("Success", `Welcome, ${displayName}!`, [
          { text: "OK", onPress: () => router.replace("/admin" as any) }
        ]);
      } else {
        alert(`Welcome, ${displayName}!`);
        router.replace("/admin" as any);
      }
    } catch (err) {
      console.error('[AdminLogin] Error:', err);
      const message = "Login failed. Please try again.";
      if (Platform.OS !== 'web') {
        Alert.alert("Error", message);
      } else {
        alert(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Shield size={64} color="#10b981" strokeWidth={2} />
          </View>
          <Text style={styles.title}>Admin Portal</Text>
          <Text style={styles.subtitle}>Secure access to management features</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <View style={styles.inputContainer}>
              <User size={20} color="#6b7280" />
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Enter admin username"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <Lock size={20} color="#6b7280" />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter admin password"
                placeholderTextColor="#9ca3af"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
                onSubmitEditing={handleLogin}
              />
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]} 
            onPress={handleLogin}
            disabled={isLoading}
          >
            <Text style={styles.loginButtonText}>
              {isLoading ? "Logging in..." : "Login"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Back to App</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#10b98115",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "800" as const,
    color: "#111827",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
  },
  form: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#374151",
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#111827",
    outlineStyle: "none" as any,
  },
  loginButton: {
    backgroundColor: "#10b981",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  loginButtonDisabled: {
    backgroundColor: "#9ca3af",
    shadowOpacity: 0,
  },
  loginButtonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#fff",
  },
  infoBox: {
    backgroundColor: "#dbeafe",
    borderWidth: 1,
    borderColor: "#93c5fd",
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    gap: 6,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#1e40af",
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: "#1e3a8a",
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  backButton: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#6b7280",
  },
});
