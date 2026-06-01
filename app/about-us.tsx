import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Apple, Award, Building2, CalendarDays, Globe2, Play, ShieldCheck, Store, TrendingUp, UserRoundCheck, Users } from "lucide-react-native";
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

export default function AboutUsScreen() {
  const { colors: themeColors, isDark } = useTheme();
  const appVersion = getAppVersion();
  const { data: stats, isLoading } = trpc.support.getAboutStats.useQuery(undefined, {
    staleTime: 60_000,
  });

  const statCards = [
    { label: "Runners", value: stats?.runners, icon: Users, color: "#F97316" },
    { label: "Avg daily registrations", value: stats?.averageDailyRegistrations, icon: TrendingUp, color: "#3B82F6" },
    { label: "Countries", value: stats?.countries, icon: Globe2, color: "#06B6D4" },
    { label: "Clubs", value: stats?.clubs, icon: Building2, color: "#10B981" },
    { label: "Event organizers", value: stats?.eventOrganizers, icon: CalendarDays, color: "#EC4899" },
    { label: "Sportswear shops", value: stats?.activeShops, icon: Store, color: "#F59E0B" },
    { label: "Age range", value: stats?.ageRange, icon: Users, color: "#14B8A6" },
    { label: "Male : Female", value: stats?.maleFemaleRatio, icon: UserRoundCheck, color: "#6366F1" },
    { label: "Admins", value: stats?.admins, icon: ShieldCheck, color: "#8B5CF6" },
  ];
  const soonBadge = (
    <View style={styles.soonBadge}>
      <Text style={styles.soonBadgeText}>soon</Text>
    </View>
  );

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
          RunNation is a community-powered running app that brings together everyone with a passion for running-from everyday runners and clubs to event organizers, schools, institutions, and charities using runs to raise awareness or support a cause. Whether you run for fitness, competition, connection, fundraising, or fun, you belong here. Founded by Salimo Gary, a Ugandan software developer, data scientist, and running enthusiast, RunNation was created to be one home for runners, clubs, events, sportswear shops, and communities, and continues to grow through its vibrant network of users-where runners truly belong.
        </Text>
      </View>

      <View style={styles.metaGrid}>
        <View style={[styles.metaCard, { backgroundColor: isDark ? themeColors.cardBackground : "#FFF7ED", borderColor: isDark ? themeColors.border : "#FDBA74" }]}>
          <View style={styles.metaHeaderRow}>
            <View style={[styles.metaIconChip, { backgroundColor: isDark ? "#F9731624" : "#FFEDD5" }]}>
              <CalendarDays size={16} color="#F97316" />
            </View>
            <Text style={[styles.metaLabel, { color: isDark ? "#FDBA74" : "#9A3412" }]}>Milestone dates</Text>
          </View>
          <Text style={[styles.metaValue, { color: themeColors.text }]}>Beta launch - 30/05/2026</Text>
          <View style={styles.platformMilestones}>
            <View style={styles.platformMilestoneRow}>
              <Play size={15} color={themeColors.text} />
              {soonBadge}
            </View>
            <View style={styles.platformMilestoneRow}>
              <Apple size={15} color={themeColors.text} />
              {soonBadge}
            </View>
          </View>
        </View>
        <View style={[styles.metaCard, { backgroundColor: isDark ? themeColors.cardBackground : "#EEF2FF", borderColor: isDark ? themeColors.border : "#A5B4FC" }]}>
          <View style={styles.metaHeaderRow}>
            <View style={[styles.metaIconChip, { backgroundColor: isDark ? "#6366F124" : "#E0E7FF" }]}>
              <ShieldCheck size={16} color="#6366F1" />
            </View>
            <Text style={[styles.metaLabel, { color: isDark ? "#A5B4FC" : "#3730A3" }]}>App version</Text>
          </View>
          <Text style={[styles.metaValue, { color: themeColors.text }]}>{appVersion}</Text>
        </View>
        <View style={[styles.metaCard, { backgroundColor: isDark ? themeColors.cardBackground : "#F0FDF4", borderColor: isDark ? themeColors.border : "#86EFAC" }]}>
          <View style={styles.metaHeaderRow}>
            <View style={[styles.metaIconChip, { backgroundColor: isDark ? "#16A34A24" : "#DCFCE7" }]}>
              <Award size={16} color="#16A34A" />
            </View>
            <Text style={[styles.metaLabel, { color: isDark ? "#86EFAC" : "#166534" }]}>Ratings</Text>
          </View>
          <View style={styles.platformMilestones}>
            <View style={styles.ratingRow}>
              <View style={styles.platformMilestoneRow}>
                <Play size={15} color={themeColors.text} />
                <Text style={[styles.metaSubValue, { color: themeColors.text }]}>Google Play</Text>
              </View>
              {soonBadge}
            </View>
            <View style={styles.ratingRow}>
              <View style={styles.platformMilestoneRow}>
                <Apple size={15} color={themeColors.text} />
                <Text style={[styles.metaSubValue, { color: themeColors.text }]}>Apple App Store</Text>
              </View>
              {soonBadge}
            </View>
            <View style={styles.ratingRow}>
              <View style={styles.platformMilestoneRow}>
                <Award size={15} color={themeColors.text} />
                <Text style={[styles.metaSubValue, { color: themeColors.text }]}>World Athletics</Text>
              </View>
              {soonBadge}
            </View>
          </View>
        </View>
        <View style={[styles.metaCard, { backgroundColor: isDark ? themeColors.cardBackground : "#FDF2F8", borderColor: isDark ? themeColors.border : "#F9A8D4" }]}>
          <View style={styles.metaHeaderRow}>
            <View style={[styles.metaIconChip, { backgroundColor: isDark ? "#EC489924" : "#FCE7F3" }]}>
              <TrendingUp size={16} color="#EC4899" />
            </View>
            <Text style={[styles.metaLabel, { color: isDark ? "#F9A8D4" : "#9D174D" }]}>App trial</Text>
          </View>
          <Text style={[styles.metaValue, { color: themeColors.text }]}>1st Quarter (90 days)</Text>
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
    borderRadius: 12,
    borderWidth: 1,
    padding: 11,
    minHeight: 92,
    justifyContent: "space-between",
  },
  metaHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 2,
  },
  metaIconChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  metaLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: "900" as const,
    textTransform: "uppercase" as const,
  },
  metaValue: {
    fontSize: 15,
    fontWeight: "800" as const,
    marginTop: 6,
    lineHeight: 20,
  },
  metaSubValue: {
    fontSize: 12,
    fontWeight: "800" as const,
    lineHeight: 16,
  },
  platformMilestones: {
    gap: 6,
    marginTop: 7,
  },
  platformMilestoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  soonBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#f59e0b",
    backgroundColor: "#fef3c7",
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  soonBadgeText: {
    color: "#92400e",
    fontSize: 10,
    fontWeight: "900" as const,
    textTransform: "uppercase" as const,
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
