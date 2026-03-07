import React, { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SubscriptionProvider, useSubscription } from "@/contexts/SubscriptionContext";
import { TRPCProvider } from "@/lib/trpc";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import { Platform, View, Text } from "react-native";

function useOnboardingCheck() {
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem("hasSeenOnboarding")
      .then((seen) => {
        if (mounted) {
          setHasSeenOnboarding(seen === "true");
          setIsReady(true);
        }
      })
      .catch(() => {
        if (mounted) {
          setHasSeenOnboarding(false);
          setIsReady(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { hasSeenOnboarding, isReady };
}

function useDeepLinkHandler() {
  useEffect(() => {
    if (Platform.OS === "web") return;

    const handleDeepLink = async (event: { url: string }) => {
      try {
        const { queryParams } = Linking.parse(event.url);
        if (queryParams?.access_token && queryParams?.refresh_token) {
          const { supabase } = await import("@/lib/supabase");
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
      .then((url: string | null) => {
        if (url) void handleDeepLink({ url });
      })
      .catch(() => {});

    return () => {
      subscription.remove();
    };
  }, []);
}

function NavigationGuard() {
  const segments = useSegments();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { hasSeenOnboarding, isReady } = useOnboardingCheck();
  const { trialExpired, isSubscribed, isLoading: subLoading } = useSubscription();

  useEffect(() => {
    if (!isReady || authLoading || hasSeenOnboarding === null) return;

    const currentSegment = segments[0] as string;
    const inOnboarding = currentSegment === "onboarding";
    const inRegister = currentSegment === "register";
    const inTabs = currentSegment === "(tabs)";
    const inAdminLogin = currentSegment === "admin-login";
    const inAdmin = currentSegment === "admin";
    const inSubscription = currentSegment === "subscription";

    if (inAdminLogin || inAdmin) return;

    const inAllowedRoute =
      currentSegment === "settings" ||
      currentSegment === "profile" ||
      currentSegment === "cart" ||
      currentSegment === "checkout" ||
      currentSegment === "participants" ||
      currentSegment === "medal-list" ||
      currentSegment === "policy" ||
      currentSegment === "subscription";

    if (user) {
      if (!subLoading && trialExpired && !isSubscribed && !inSubscription && !inAllowedRoute) {
        router.replace("/subscription" as never);
        return;
      }
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
  }, [user, isReady, authLoading, hasSeenOnboarding, segments, router, trialExpired, isSubscribed, subLoading]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <NavigationGuard />
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
        <Stack.Screen name="subscription" options={{ presentation: "modal", title: "Subscription" }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

function ErrorFallback() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
      <Text style={{ fontSize: 16, textAlign: "center" }}>Something went wrong. Please restart the app.</Text>
    </View>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary] Caught error:", error.message);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {
      console.log("[Layout] SplashScreen hide failed");
    });
  }, []);

  useDeepLinkHandler();

  return (
    <ErrorBoundary>
      <TRPCProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <RootLayoutNav />
          </SubscriptionProvider>
        </AuthProvider>
      </TRPCProvider>
    </ErrorBoundary>
  );
}
