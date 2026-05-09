import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Building2, CalendarDays, Globe2, MapPin, ShieldCheck, Store, UserRoundCheck, Users } from "lucide-react-native";
import { useTheme } from "@/contexts/ThemeContext";
import colors from "@/constants/colors";
import { trpc } from "@/lib/trpc";

const formatCount = (value: number | string | null | undefined, isLoading: boolean) => {
  if (isLoading) return "Loading...";
  if (value === null || value === undefined) return "--";
  if (typeof value === "string") return value;
  return value.toLocaleString();
};

const getAppVersion = () => {
  return Constants.expoConfig?.version || "1.0.0";
};

const getLaunchDate = () => {
  const extra = Constants.expoConfig?.extra as { appStoreLaunchDate?: string } | undefined;
  return extra?.appStoreLaunchDate || "Coming soon";
};

export default function AboutUsScreen() {
  const { colors: themeColors, isDark } = useTheme();
  const appVersion = getAppVersion();
  const launchDate = getLaunchDate();
  const { data: stats, isLoading } = trpc.support.getAboutStats.useQuery(undefined, {
    staleTime: 60_000,
  });

  const statCards = [
    { label: "Runners", value: stats?.runners, icon: Users, color: "#F97316" },
    { label: "Clubs", value: stats?.clubs, icon: Building2, color: "#10B981" },
    { label: "Towns", value: stats?.towns, icon: MapPin, color: "#3B82F6" },
    { label: "Countries", value: stats?.countries, icon: Globe2, color: "#06B6D4" },
    { label: "Age range", value: stats?.ageRange, icon: Users, color: "#14B8A6" },
    { label: "Male : Female", value: stats?.maleFemaleRatio, icon: UserRoundCheck, color: "#6366F1" },
    { label: "Admins", value: stats?.admins, icon: ShieldCheck, color: "#8B5CF6" },
    { label: "Event organizers", value: stats?.eventOrganizers, icon: CalendarDays, color: "#EC4899" },
    { label: "Active shops", value: stats?.activeShops, icon: Store, color: "#F59E0B" },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: themeColors.background }]} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "About Us" }} />

      <LinearGradient colors={colors.gradient.orange} style={styles.hero}>
        <View style={styles.brandRow}>
          <Image source={require("../assets/images/icon.png")} style={styles.logo} resizeMode="cover" />
          <View style={styles.brandTextWrap}>
            <Text style={styles.brandTitle}>RunNation</Text>
            <Text style={styles.slogan}>Where runners belong</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={[styles.card, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
        <Text style={[styles.paragraph, { color: themeColors.text }]}>
          RunNation is a community-powered running app that brings together everyone with a passion for running-from everyday runners and clubs to event organizers, schools, institutions, and charities using runs to raise awareness or support a cause. Whether you run for fitness, competition, connection, fundraising, or fun, you belong here. Founded by Salimo Gary, a Ugandan software developer, data scientist, and running enthusiast, RunNation was created to be one home for runners, clubs, events, shops, and communities, and continues to grow through its vibrant network of users-where runners truly belong.
        </Text>
      </View>

      <View style={styles.metaGrid}>
        <View style={[styles.metaCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
          <Text style={[styles.metaLabel, { color: themeColors.textSecondary }]}>Date founded</Text>
          <Text style={[styles.metaValue, { color: themeColors.text }]}>{launchDate}</Text>
        </View>
        <View style={[styles.metaCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
          <Text style={[styles.metaLabel, { color: themeColors.textSecondary }]}>App version</Text>
          <Text style={[styles.metaValue, { color: themeColors.text }]}>{appVersion}</Text>
        </View>
        <View style={[styles.metaCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
          <Text style={[styles.metaLabel, { color: themeColors.textSecondary }]}>Platforms</Text>
          <Text style={[styles.metaValue, { color: themeColors.text }]}>Android; iOS coming soon</Text>
        </View>
        <View style={[styles.metaCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
          <Text style={[styles.metaLabel, { color: themeColors.textSecondary }]}>Free trial</Text>
          <Text style={[styles.metaValue, { color: themeColors.text }]}>90 days free</Text>
        </View>
      </View>

      <View style={styles.statsHeader}>
        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Live Community</Text>
        {isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>

      <View style={styles.statsGrid}>
        {statCards.map((item) => {
          const Icon = item.icon;
          return (
            <View key={item.label} style={[styles.statCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
              <View style={[styles.statIcon, { backgroundColor: isDark ? `${item.color}22` : `${item.color}14` }]}>
                <Icon size={20} color={item.color} />
              </View>
              <Text style={[styles.statValue, { color: themeColors.text }]}>{formatCount(item.value, isLoading)}</Text>
              <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>{item.label}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
    gap: 16,
  },
  hero: {
    borderRadius: 20,
    padding: 20,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  logo: {
    width: 58,
    height: 58,
    borderRadius: 14,
  },
  brandTextWrap: {
    flex: 1,
  },
  brandTitle: {
    color: colors.white,
    fontSize: 28,
    fontWeight: "900" as const,
  },
  slogan: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    fontWeight: "700" as const,
    marginTop: 2,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  metaCard: {
    width: "48%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 13,
    minHeight: 98,
    justifyContent: "space-between",
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
  },
  metaValue: {
    fontSize: 16,
    fontWeight: "800" as const,
    marginTop: 8,
    lineHeight: 21,
  },
  statsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900" as const,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  statCard: {
    width: "31%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "900" as const,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    marginTop: 3,
  },
});
