import { Tabs, useRouter } from "expo-router";
import { Activity, Users, MessageCircle, ShoppingBag, Settings, Calendar } from "lucide-react-native";
import React from "react";
import { TouchableOpacity } from "react-native";
import HeaderProfile from "@/components/HeaderProfile";
import colors from "@/constants/colors";

export default function TabLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mediumGray,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: colors.black,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          paddingTop: 4,
        },
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.primary,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: colors.white,
        headerTitleStyle: {
          fontWeight: "700" as const,
          fontSize: 18,
        },
        headerLeft: () => (
          <TouchableOpacity onPress={() => router.push("/settings" as any)} style={{ marginLeft: 16 }}>
            <Settings size={24} color={colors.white} />
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
