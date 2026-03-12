import { Tabs, useRouter } from "expo-router";
import { Activity, Users, MessageCircle, ShoppingBag, Settings, Calendar, Target } from "lucide-react-native";
import React from "react";
import { TouchableOpacity } from "react-native";
import HeaderProfile from "@/components/HeaderProfile";
import { useTheme } from "@/contexts/ThemeContext";

export default function TabLayout() {
  const router = useRouter();
  const { colors } = useTheme();

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
          tabBarIcon: ({ color }) => <Activity color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: "Goals",
          tabBarIcon: ({ color }) => <Target color={color} size={24} />,
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
          tabBarIcon: ({ color }) => <MessageCircle color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: "Shop",
          tabBarIcon: ({ color }) => <ShoppingBag color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ color }) => <Calendar color={color} size={24} />,
        }}
      />
    </Tabs>
  );
}
