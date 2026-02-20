import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { trpc, trpcClient } from "@/lib/trpc";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const segments = useSegments();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkOnboarding = async () => {
      const seen = await AsyncStorage.getItem('hasSeenOnboarding');
      setHasSeenOnboarding(seen === 'true');
      setIsReady(true);
    };
    checkOnboarding();
  }, []);

  useEffect(() => {
    if (!isReady || authLoading || hasSeenOnboarding === null) return;

    const inOnboarding = segments[0] === 'onboarding';
    const inRegister = segments[0] === 'register';
    const inTabs = segments[0] === '(tabs)';
    const inAdminLogin = segments[0] === 'admin-login';
    const inAdmin = segments[0] === 'admin';

    if (inAdminLogin || inAdmin) return;

    const inAllowedRoute = segments[0] === 'settings' || segments[0] === 'profile' || segments[0] === 'cart' || segments[0] === 'checkout' || segments[0] === 'participants' || segments[0] === 'medal-list';

    if (user) {
      if (!inTabs && !inAllowedRoute) {
        router.replace('/(tabs)');
      }
    } else {
      if (!hasSeenOnboarding) {
        if (!inOnboarding && !inRegister) {
          router.replace('/onboarding');
        }
      } else {
        if (!inRegister) {
          router.replace('/register');
        }
      }
    }
  }, [user, isReady, authLoading, hasSeenOnboarding, segments, router]);

  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ presentation: "modal", title: "Profile" }} />
      <Stack.Screen name="settings" options={{ presentation: "modal", title: "Settings" }} />
      <Stack.Screen name="admin-login" options={{ presentation: "modal", title: "Admin Login" }} />
      <Stack.Screen name="admin" options={{ title: "Admin" }} />
      <Stack.Screen name="cart" options={{ title: "Cart" }} />
      <Stack.Screen name="checkout" options={{ title: "Checkout" }} />
      <Stack.Screen name="participants" options={{ title: "Participants" }} />
      <Stack.Screen name="medal-list" options={{ title: "Medal List" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const { queryParams } = Linking.parse(event.url);
      if (queryParams?.access_token && queryParams?.refresh_token) {
        await supabase.auth.setSession({
          access_token: queryParams.access_token as string,
          refresh_token: queryParams.refresh_token as string,
        });
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <View style={styles.container}>
            <RootLayoutNav />
          </View>
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
