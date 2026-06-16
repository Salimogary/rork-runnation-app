import React, { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CountryNamesProvider } from "@/contexts/CountryNamesContext";
import { SubscriptionProvider, useSubscription } from "@/contexts/SubscriptionContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { DistanceUnitProvider } from "@/contexts/DistanceUnitContext";
import { WeightUnitProvider } from "@/contexts/WeightUnitContext";
import { TRPCProvider } from "../lib/trpc";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import { LogBox, Platform, View, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initializeCrashReporter, recordCrash } from "@/utils/crashReporter";

LogBox.ignoreLogs([
  "AuthApiError: Invalid Refresh Token",
  "Invalid Refresh Token: Refresh Token Not Found",
]);

function getAuthParamsFromUrl(url: string) {
  const queryString = url.includes("?") ? url.split("?")[1]?.split("#")[0] ?? "" : "";
  const fragmentString = url.includes("#") ? url.split("#")[1] ?? "" : "";
  const queryParams = new URLSearchParams(queryString);
  const fragmentParams = new URLSearchParams(fragmentString);

  const readParam = (key: string) => queryParams.get(key) ?? fragmentParams.get(key);

  return {
    accessToken: readParam("access_token"),
    refreshToken: readParam("refresh_token"),
    code: readParam("code"),
    error: readParam("error_description") ?? readParam("error"),
  };
}

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
        const authParams = getAuthParamsFromUrl(event.url);
        console.log("[Layout] Deep link received:", {
          hasAccessToken: Boolean(authParams.accessToken),
          hasRefreshToken: Boolean(authParams.refreshToken),
          hasCode: Boolean(authParams.code),
          hasError: Boolean(authParams.error),
        });

        if (authParams.error) {
          console.error("[Layout] Deep link auth error:", authParams.error);
          return;
        }

        if (!authParams.code && (!authParams.accessToken || !authParams.refreshToken)) {
          return;
        }

        const { supabase } = await import("@/lib/supabase");

        if (authParams.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(authParams.code);
          if (error) {
            console.error("[Layout] Deep link code exchange error:", error.message);
          }
          return;
        }

        if (authParams.accessToken && authParams.refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: authParams.accessToken,
            refresh_token: authParams.refreshToken,
          });
          if (error) {
            console.error("[Layout] Deep link session error:", error.message);
          }
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
  const { user, isLoading: authLoading, isRoleSessionLoading } = useAuth();
  const { hasSeenOnboarding, isReady } = useOnboardingCheck();
  const { trialExpired, isSubscribed, isLoading: subLoading } = useSubscription();

  useEffect(() => {
    if (!isReady || authLoading || hasSeenOnboarding === null) return;

    const currentSegment = segments[0] as string;
    const inOnboarding = currentSegment === "onboarding";
    const inRegister = currentSegment === "register" || currentSegment === "profleSetup";
    const inTabs = currentSegment === "(tabs)";
    const inAdminLogin = currentSegment === "admin-login";
    const inAdmin = currentSegment === "admin";
    const inSubscription = currentSegment === "subscription";
    const inAuthCallback = currentSegment === "auth-callback";
    const inPolicy = currentSegment === "policy";

    if (inAdminLogin || inAdmin || inAuthCallback) return;

    const inAllowedRoute =
      currentSegment === "settings" ||
      currentSegment === "profile" ||
      currentSegment === "cart" ||
      currentSegment === "checkout" ||
      currentSegment === "magazine" ||
      currentSegment === "participants" ||
      currentSegment === "medal-list" ||
      currentSegment === "activity-complete" ||
      currentSegment === "policy" ||
      currentSegment === "about-us" ||
      currentSegment === "subscription";

    if (user) {
      if (!isRoleSessionLoading && !subLoading && trialExpired && !isSubscribed && !inSubscription && !inAllowedRoute) {
        router.replace("/subscription" as never);
        return;
      }
      if (!inTabs && !inAllowedRoute && !inRegister) {
        router.replace("/(tabs)");
      }
    } else {
      if (!hasSeenOnboarding) {
        if (!inOnboarding && !inRegister && !inPolicy) {
          router.replace("/onboarding" as never);
        }
      } else {
        if (!inRegister && !inOnboarding && !inPolicy) {
          router.replace("/register" as never);
        }
      }
    }
  }, [user, isReady, authLoading, hasSeenOnboarding, segments, router, trialExpired, isSubscribed, subLoading, isRoleSessionLoading]);

  return null;
}

function RootLayoutNav() {
  const { colors } = useTheme();

  return (
    <>
      <NavigationGuard />
      <Stack screenOptions={{
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: colors.headerBackground },
        headerTintColor: colors.headerText,
        contentStyle: { backgroundColor: colors.background },
      }}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="profleSetup" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
        <Stack.Screen name="profile" options={{ presentation: "modal", title: "Profile" }} />
        <Stack.Screen name="settings" options={{ presentation: "modal", title: "Settings" }} />
        <Stack.Screen name="admin-login" options={{ presentation: "modal", title: "Admin Login" }} />
        <Stack.Screen name="admin" options={{ title: "Admin" }} />
        <Stack.Screen name="cart" options={{ title: "Cart" }} />
        <Stack.Screen name="checkout" options={{ title: "Checkout" }} />
        <Stack.Screen name="magazine/[issueSlug]" options={{ title: "Magazine" }} />
        <Stack.Screen name="magazine/article/[articleSlug]" options={{ title: "Article" }} />
        <Stack.Screen name="magazine/submit" options={{ presentation: "modal", title: "Submit Story" }} />
        <Stack.Screen name="magazine/pictorial-submit" options={{ presentation: "modal", title: "Submit Pictorial" }} />
        <Stack.Screen name="participants" options={{ title: "Participants" }} />
        <Stack.Screen name="medal-list" options={{ title: "Medal List" }} />
        <Stack.Screen name="activity-complete" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="policy" options={{ presentation: "modal", title: "Policy & Terms" }} />
        <Stack.Screen name="about-us" options={{ presentation: "modal", title: "About Us" }} />
        <Stack.Screen name="subscription" options={{ presentation: "modal", title: "Subscription" }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

function ErrorFallback({ message }: { message?: string }) {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
      <Text style={{ fontSize: 16, textAlign: "center" }}>Something went wrong. Please restart the app.</Text>
      {message ? (
        <Text style={{ marginTop: 12, fontSize: 12, textAlign: "center", color: "#666" }}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message?: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: undefined };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error.message);
    void recordCrash(error, {
      fatal: true,
      source: "react_error_boundary",
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback message={this.state.message} />;
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

  useEffect(() => initializeCrashReporter(), []);

  useDeepLinkHandler();

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <TRPCProvider>
          <CountryNamesProvider>
            <ThemeProvider>
              <AuthProvider>
                <SubscriptionProvider>
                  <DistanceUnitProvider>
                    <WeightUnitProvider>
                    <NotificationProvider>
                        <RootLayoutNav />
                    </NotificationProvider>
                    </WeightUnitProvider>
                  </DistanceUnitProvider>
                </SubscriptionProvider>
              </AuthProvider>
            </ThemeProvider>
          </CountryNamesProvider>
        </TRPCProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
