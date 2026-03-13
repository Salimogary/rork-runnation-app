import { Tabs, useRouter } from "expo-router";
import { Activity, Users, MessageCircle, ShoppingBag, Settings, Calendar, Target, Lock } from "lucide-react-native";
import React from "react";
import { TouchableOpacity, View, Alert } from "react-native";
import HeaderProfile from "@/components/HeaderProfile";
import { useTheme } from "@/contexts/ThemeContext";
import { useSubscription } from "@/contexts/SubscriptionContext";

const LOCKED_TABS = ["index", "goals", "chat", "shop", "events"];

export default function TabLayout() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isSubscribed } = useSubscription();

  const lockedColor = '#C0C0C0';

  const getTabColor = (tabName: string, color: string) => {
    if (!isSubscribed && LOCKED_TABS.includes(tabName)) {
      return lockedColor;
    }
    return color;
  };

  const handleLockedTabPress = (e: any) => {
    if (!isSubscribed) {
      e.preventDefault();
      Alert.alert(
        'Subscription Expired',
        'Renew your subscription to access this feature.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Renew Now', onPress: () => router.push('/subscription' as any) },
        ]
      );
    }
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.iconMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
        },
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.headerBackground,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: colors.headerText,
        headerTitleAlign: "left" as const,
        headerTitleStyle: {
          fontWeight: "700" as const,
          fontSize: 20,
          marginLeft: 8,
        },
        headerLeft: () => (
          <TouchableOpacity onPress={() => router.push("/settings" as any)} style={{ marginLeft: 16 }}>
            <Settings size={24} color={colors.headerText} />
          </TouchableOpacity>
        ),
        headerRight: () => <HeaderProfile />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Exercise",
          tabBarIcon: ({ color }) => (
            <View>
              <Activity color={getTabColor("index", color)} size={24} />
              {!isSubscribed && <Lock size={10} color={lockedColor} style={{ position: 'absolute', top: -4, right: -6 }} />}
            </View>
          ),
          tabBarLabelStyle: !isSubscribed ? { color: lockedColor } : undefined,
        }}
        listeners={{
          tabPress: (e) => {
            if (!isSubscribed) handleLockedTabPress(e);
          },
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: "Goals",
          tabBarIcon: ({ color }) => (
            <View>
              <Target color={getTabColor("goals", color)} size={24} />
              {!isSubscribed && <Lock size={10} color={lockedColor} style={{ position: 'absolute', top: -4, right: -6 }} />}
            </View>
          ),
          tabBarLabelStyle: !isSubscribed ? { color: lockedColor } : undefined,
        }}
        listeners={{
          tabPress: (e) => {
            if (!isSubscribed) handleLockedTabPress(e);
          },
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarIcon: ({ color }) => <Users color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color }) => (
            <View>
              <MessageCircle color={getTabColor("chat", color)} size={24} />
              {!isSubscribed && <Lock size={10} color={lockedColor} style={{ position: 'absolute', top: -4, right: -6 }} />}
            </View>
          ),
          tabBarLabelStyle: !isSubscribed ? { color: lockedColor } : undefined,
        }}
        listeners={{
          tabPress: (e) => {
            if (!isSubscribed) handleLockedTabPress(e);
          },
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: "Shop",
          tabBarIcon: ({ color }) => (
            <View>
              <ShoppingBag color={getTabColor("shop", color)} size={24} />
              {!isSubscribed && <Lock size={10} color={lockedColor} style={{ position: 'absolute', top: -4, right: -6 }} />}
            </View>
          ),
          tabBarLabelStyle: !isSubscribed ? { color: lockedColor } : undefined,
        }}
        listeners={{
          tabPress: (e) => {
            if (!isSubscribed) handleLockedTabPress(e);
          },
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ color }) => (
            <View>
              <Calendar color={getTabColor("events", color)} size={24} />
              {!isSubscribed && <Lock size={10} color={lockedColor} style={{ position: 'absolute', top: -4, right: -6 }} />}
            </View>
          ),
          tabBarLabelStyle: !isSubscribed ? { color: lockedColor } : undefined,
        }}
        listeners={{
          tabPress: (e) => {
            if (!isSubscribed) handleLockedTabPress(e);
          },
        }}
      />
    </Tabs>
  );
}
