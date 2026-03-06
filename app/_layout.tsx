import React, { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TRPCProvider } from "@/lib/trpc";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

function RootLayoutNav() {
  const segments = useSegments();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const seen = await AsyncStorage.getItem("hasSeenOnboarding");
        setHasSeenOnboarding(seen === "true");
      } catch {
        setHasSeenOnboarding(false);
      } finally {
        setIsReady(true);
      }
    };
    void checkOnboarding();
  }, []);

  useEffect(() => {
    if (!isReady || authLoading || hasSeenOnboarding === null) return;

    const currentSegment = segments[0] as string;
    const inOnboarding = currentSegment === "onboarding";
    const inRegister = currentSegment === "register";
    const inTabs = currentSegment === "(tabs)";
    const inAdminLogin = currentSegment === "admin-login";
    const inAdmin = currentSegment === "admin";

    if (inAdminLogin || inAdmin) return;

    const inAllowedRoute =
      currentSegment === "settings" ||
      currentSegment === "profile" ||
      currentSegment === "cart" ||
      currentSegment === "checkout" ||
      currentSegment === "participants" ||
      currentSegment === "medal-list" ||
      currentSegment === "policy";

    if (user) {
      if (!inTabs && !inAllowedRoute && !inRegister) {
        router.replace("/(tabs)");
      }
    } else {
      if (!hasSeenOnboarding) {
        if (!inOnboarding && !inRegister) {
          router.replace("/onboarding" as never);
        }
      } else {
        if (!inRegister) {
          router.replace("/register" as never);
        }
      }
    }
  }, [user, isReady, authLoading, hasSeenOnboarding, segments, router]);

  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
      <Stack.Screen name="profile" options={{ presentation: "modal", title: "Profile" }} />
      <Stack.Screen name="settings" options={{ presentation: "modal", title: "Settings" }} />
      <Stack.Screen name="admin-login" options={{ presentation: "modal", title: "Admin Login" }} />
      <Stack.Screen name="admin" options={{ title: "Admin" }} />
      <Stack.Screen name="cart" options={{ title: "Cart" }} />
      <Stack.Screen name="checkout" options={{ title: "Checkout" }} />
      <Stack.Screen name="participants" options={{ title: "Participants" }} />
      <Stack.Screen name="medal-list" options={{ title: "Medal List" }} />
      <Stack.Screen name="policy" options={{ presentation: "modal", title: "Policy & Terms" }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      try {
        const { queryParams } = Linking.parse(event.url);
        if (queryParams?.access_token && queryParams?.refresh_token) {
          await supabase.auth.setSession({
            access_token: queryParams.access_token as string,
            refresh_token: queryParams.refresh_token as string,
          });
        }
      } catch (error) {
        console.error("[Layout] Deep link error:", error);
      }
    };

    const subscription = Linking.addEventListener("url", handleDeepLink);

    Linking.getInitialURL()
      .then((url) => {
        if (url) void handleDeepLink({ url });
      })
      .catch(() => {});

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient}>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
