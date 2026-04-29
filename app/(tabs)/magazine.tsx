import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { BookOpen, Camera, Edit3, Star } from "lucide-react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { trpc } from "@/lib/trpc";
import {
  MagazineArticleCard,
  MagazineIssueCard,
  MagazineSectionHeader,
} from "@/components/magazine/MagazineComponents";
import { getArticlesForIssue, getLatestIssue, magazineIssues } from "@/lib/magazine-data";
import { useTheme } from "@/contexts/ThemeContext";

type MagazineTab =
  | "runner-spotlight"
  | "club-feature"
  | "community-story"
  | "fitness-coach"
  | "events"
  | "gear-pick"
  | "gallery";

const ISSUE_TABS: { key: MagazineTab; label: string; subtitle: string }[] = [
  { key: "runner-spotlight", label: "Runner Spotlight", subtitle: "2 articles" },
  { key: "club-feature", label: "Club Feature", subtitle: "2 articles" },
  { key: "community-story", label: "Community Story", subtitle: "2 user picks" },
  { key: "fitness-coach", label: "Fitness Coach", subtitle: "1 column" },
  { key: "events", label: "Events", subtitle: "Preview + review" },
  { key: "gear-pick", label: "Gear Pick", subtitle: "1 pick" },
  { key: "gallery", label: "Gallery", subtitle: "Approved photos" },
];

export default function MagazineScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<MagazineTab>("runner-spotlight");
  const [refreshing, setRefreshing] = useState(false);
  const latestIssue = getLatestIssue();
  const { data: pictorials = [], refetch: refetchPictorials } = trpc.magazine.getPictorials.useQuery(undefined, {
    retry: 1,
  });
  const thisVolume = getArticlesForIssue(latestIssue.slug);
  const pictureOfWeek = pictorials.find((item: any) => item.is_picture_of_week) ?? pictorials[0];

  const activeArticles = useMemo(() => {
    if (activeTab === "events") {
      return thisVolume
        .filter((article) => article.categorySlug === "event-preview" || article.categorySlug === "event-review")
        .sort((a, b) => b.publishDate.localeCompare(a.publishDate))
        .slice(0, 2);
    }

    if (activeTab === "gallery") return [];

    const limitByTab: Record<Exclude<MagazineTab, "events" | "gallery">, number> = {
      "runner-spotlight": 2,
      "club-feature": 2,
      "community-story": 2,
      "fitness-coach": 1,
      "gear-pick": 1,
    };

    return thisVolume
      .filter((article) => article.categorySlug === activeTab)
      .sort((a, b) => b.publishDate.localeCompare(a.publishDate))
      .slice(0, limitByTab[activeTab]);
  }, [activeTab, thisVolume]);

  const handleRefresh = () => {
    setRefreshing(true);
    void refetchPictorials().finally(() => setRefreshing(false));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: "Magazine",
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push("/magazine/submit" as any)} style={styles.headerSubmitButton}>
              <Edit3 size={18} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.pageIntro}>
          <View style={[styles.magazineIcon, { backgroundColor: colors.cardBackground }]}>
            <BookOpen size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>Biweekly Editorial</Text>
            <Text style={[styles.pageTitle, { color: colors.text }]}>RunNation Magazine</Text>
            <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
              A cover-led issue with runner stories, clubs, coach notes, events, gear, and community pictorials.
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.coverPage} activeOpacity={0.9} onPress={() => router.push(`/magazine/${latestIssue.slug}` as any)}>
          <Image source={{ uri: pictureOfWeek?.photo_url || latestIssue.coverImageUrl }} style={styles.coverImage} contentFit="cover" transition={250} />
          <LinearGradient colors={["rgba(0,0,0,0.08)", "rgba(0,0,0,0.82)"]} style={styles.coverOverlay}>
            <Image source={require("../../assets/images/adaptive-icon.png")} style={styles.coverLogo} contentFit="contain" />
            <View style={styles.coverTopRow}>
              <Text style={styles.coverKicker}>RunNation Magazine</Text>
              <Text style={styles.coverIssue}>
                Vol. {latestIssue.volumeNumber} / Issue {latestIssue.issueNumber}
              </Text>
            </View>
            <View>
              <Text style={styles.coverDate}>
                {new Date(latestIssue.publicationDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              </Text>
              <Text style={styles.coverTitle}>{latestIssue.title}</Text>
              <Text style={styles.coverSubtitle}>{latestIssue.subtitle}</Text>
              {pictureOfWeek ? (
                <Text style={styles.coverCredit}>
                  Cover: Picture of the Week / {[pictureOfWeek.club, pictureOfWeek.country].filter(Boolean).join(" / ")}
                </Text>
              ) : null}
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {ISSUE_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.issueTab,
                  {
                    backgroundColor: isActive ? colors.primary : colors.cardBackground,
                    borderColor: isActive ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.78}
              >
                <Text style={[styles.issueTabLabel, { color: isActive ? "#fff" : colors.text }]}>{tab.label}</Text>
                <Text style={[styles.issueTabSubtitle, { color: isActive ? "rgba(255,255,255,0.78)" : colors.textSecondary }]}>{tab.subtitle}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {activeTab === "gallery" ? (
          <>
            <MagazineSectionHeader title="Event Pictorial Gallery" subtitle="All approved community-submitted pictures." />
            {pictorials.length === 0 ? (
              <View style={[styles.pictorialEmpty, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                <Camera size={26} color={colors.primary} />
                <Text style={[styles.pictorialTitle, { color: colors.text }]}>No approved pictures yet</Text>
                <Text style={[styles.pictorialCaption, { color: colors.textSecondary }]}>Approved event pictorials will appear here.</Text>
              </View>
            ) : (
              <View style={styles.galleryGrid}>
                {pictorials.map((item: any) => (
                  <View key={item.pictorial_id} style={[styles.galleryCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    <Image source={{ uri: item.photo_url }} style={styles.galleryImage} contentFit="cover" transition={200} />
                    <View style={styles.galleryBody}>
                      {item.is_picture_of_week ? (
                        <View style={styles.pictureOfWeekRow}>
                          <Star size={12} color={colors.primary} fill={colors.primary} />
                          <Text style={[styles.pictureOfWeekText, { color: colors.primary }]}>Picture of the Week</Text>
                        </View>
                      ) : null}
                      <Text style={[styles.galleryTitle, { color: colors.text }]} numberOfLines={1}>{item.event_name}</Text>
                      <Text style={[styles.pictorialMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                        {[item.club, item.country, item.event_date].filter(Boolean).join(" / ")}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            <MagazineSectionHeader
              title={ISSUE_TABS.find((tab) => tab.key === activeTab)?.label ?? "This Issue"}
              subtitle={ISSUE_TABS.find((tab) => tab.key === activeTab)?.subtitle}
            />
            {activeArticles.map((article) => (
              <MagazineArticleCard
                key={article.articleId}
                article={article}
                onPress={() => router.push(`/magazine/article/${article.slug}` as any)}
              />
            ))}
          </>
        )}

        <TouchableOpacity
          style={[styles.submitPictorialButton, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/magazine/pictorial-submit" as any)}
          activeOpacity={0.82}
        >
          <Camera size={18} color="#fff" />
          <Text style={styles.submitPictorialText}>Submit Event Pictorial</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <MagazineSectionHeader title="Previous Issues" subtitle="Issue-based publishing is ready for a biweekly rhythm." />
          {magazineIssues.slice(1).map((issue) => (
            <MagazineIssueCard key={issue.issueId} issue={issue} onPress={() => router.push(`/magazine/${issue.slug}` as any)} />
          ))}
          <TouchableOpacity
            style={[styles.submitStoryCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
            onPress={() => router.push("/magazine/submit" as any)}
            activeOpacity={0.82}
          >
            <Text style={[styles.submitStoryTitle, { color: colors.text }]}>Have a RunNation story?</Text>
            <Text style={[styles.submitStoryText, { color: colors.textSecondary }]}>
              Submit a runner spotlight, club story, wellness piece, or event idea for admin review.
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 36,
  },
  headerSubmitButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  pageIntro: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
    marginBottom: 18,
  },
  magazineIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "900",
  },
  pageTitle: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 2,
  },
  pageSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  coverPage: {
    height: 470,
    borderRadius: 32,
    overflow: "hidden",
    marginBottom: 18,
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
  },
  coverOverlay: {
    flex: 1,
    justifyContent: "space-between",
    padding: 22,
  },
  coverLogo: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 62,
    height: 62,
    opacity: 0.34,
  },
  coverTopRow: {
    gap: 8,
  },
  coverKicker: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  coverIssue: {
    alignSelf: "flex-start",
    color: "#fff",
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
  },
  coverDate: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
  },
  coverTitle: {
    color: "#fff",
    fontSize: 38,
    lineHeight: 40,
    fontWeight: "900",
    letterSpacing: -1,
  },
  coverSubtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  coverCredit: {
    alignSelf: "flex-start",
    color: "rgba(255,255,255,0.9)",
    backgroundColor: "rgba(0,0,0,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 14,
    overflow: "hidden",
  },
  tabRow: {
    gap: 10,
    paddingBottom: 24,
  },
  issueTab: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minWidth: 142,
  },
  issueTabLabel: {
    fontSize: 13,
    fontWeight: "900",
  },
  issueTabSubtitle: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  footer: {
    marginTop: 14,
  },
  submitStoryCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginTop: 16,
  },
  submitStoryTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 6,
  },
  submitStoryText: {
    fontSize: 14,
    lineHeight: 20,
  },
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  galleryCard: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 20,
    overflow: "hidden",
  },
  galleryImage: {
    width: "100%",
    height: 132,
  },
  galleryBody: {
    padding: 10,
    gap: 4,
  },
  pictureOfWeekRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pictureOfWeekText: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  pictorialTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  pictorialMeta: {
    fontSize: 12,
    fontWeight: "700",
  },
  galleryTitle: {
    fontSize: 13,
    fontWeight: "900",
  },
  pictorialCaption: {
    fontSize: 14,
    lineHeight: 20,
  },
  pictorialEmpty: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 8,
    marginBottom: 12,
  },
  submitPictorialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 24,
  },
  submitPictorialText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
});
