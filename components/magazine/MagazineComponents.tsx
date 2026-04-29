import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Bookmark, ChevronRight, Clock, Search } from "lucide-react-native";
import type { MagazineArticle, MagazineCategory, MagazineIssue } from "@/lib/magazine-types";
import { getCategory } from "@/lib/magazine-data";
import { useTheme } from "@/contexts/ThemeContext";

export function MagazineSectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {action ? <Text style={[styles.sectionAction, { color: colors.primary }]}>{action}</Text> : null}
    </View>
  );
}

export function MagazineCategoryChip({
  category,
  isActive,
  onPress,
}: {
  category: MagazineCategory | { name: string; slug: "all"; color: string };
  isActive: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.categoryChip,
        {
          backgroundColor: isActive ? category.color : colors.cardBackground,
          borderColor: isActive ? category.color : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.categoryChipText, { color: isActive ? "#fff" : colors.text }]}>{category.name}</Text>
    </TouchableOpacity>
  );
}

export function MagazineHeroCard({
  issue,
  article,
  backgroundImageUrl,
  backgroundCredit,
  onPress,
}: {
  issue: MagazineIssue;
  article?: MagazineArticle;
  backgroundImageUrl?: string | null;
  backgroundCredit?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.heroCard} activeOpacity={0.9} onPress={onPress}>
      <Image source={{ uri: backgroundImageUrl || issue.coverImageUrl }} style={styles.heroImage} contentFit="cover" transition={250} />
      <LinearGradient colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.78)"]} style={styles.heroOverlay}>
        <Image
          source={require("../../assets/images/adaptive-icon.png")}
          style={styles.heroLogoWatermark}
          contentFit="contain"
        />
        <Text style={styles.kicker}>RunNation Magazine</Text>
        {backgroundCredit ? <Text style={styles.coverCredit}>{backgroundCredit}</Text> : null}
        <Text style={styles.heroTitle}>{issue.title}</Text>
        <Text style={styles.heroSubtitle}>{issue.subtitle}</Text>
        <View style={styles.heroMetaRow}>
          <Text style={styles.heroMeta}>Vol. {issue.volumeNumber} / Issue {issue.issueNumber}</Text>
          {article ? <Text style={styles.heroMeta}>{article.readingTimeMinutes} min read</Text> : null}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export function MagazineArticleCard({
  article,
  variant = "default",
  onPress,
}: {
  article: MagazineArticle;
  variant?: "default" | "compact" | "horizontal";
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const category = getCategory(article.categorySlug);
  const isHorizontal = variant === "horizontal";

  return (
    <TouchableOpacity
      style={[
        styles.articleCard,
        isHorizontal && styles.articleCardHorizontal,
        { backgroundColor: colors.cardBackground, borderColor: colors.border },
      ]}
      activeOpacity={0.82}
      onPress={onPress}
    >
      <Image
        source={{ uri: article.heroImageUrl }}
        style={isHorizontal ? styles.articleImageHorizontal : styles.articleImage}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.articleBody}>
        <View style={styles.articleMetaRow}>
          <Text style={[styles.categoryLabel, { color: category.color }]}>{category.name}</Text>
          <View style={styles.readTime}>
            <Clock size={12} color={colors.textSecondary} />
            <Text style={[styles.readTimeText, { color: colors.textSecondary }]}>{article.readingTimeMinutes} min</Text>
          </View>
        </View>
        <Text style={[styles.articleTitle, { color: colors.text }]} numberOfLines={variant === "compact" ? 2 : 3}>
          {article.title}
        </Text>
        <Text style={[styles.articleSummary, { color: colors.textSecondary }]} numberOfLines={variant === "compact" ? 2 : 3}>
          {article.summary}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export function MagazineIssueCard({ issue, onPress }: { issue: MagazineIssue; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={[styles.issueCard, { backgroundColor: colors.cardBackground }]} onPress={onPress} activeOpacity={0.84}>
      <Image source={{ uri: issue.coverImageUrl }} style={styles.issueCover} contentFit="cover" transition={200} />
      <View style={styles.issueContent}>
        <Text style={[styles.issueMeta, { color: colors.primary }]}>Volume {issue.volumeNumber} / Issue {issue.issueNumber}</Text>
        <Text style={[styles.issueTitle, { color: colors.text }]}>{issue.title}</Text>
        <Text style={[styles.issueSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>{issue.subtitle}</Text>
      </View>
      <ChevronRight size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

export function MagazineSkeletonCard() {
  const { colors } = useTheme();
  return (
    <View style={[styles.skeletonCard, { backgroundColor: colors.cardBackground }]}>
      <View style={[styles.skeletonImage, { backgroundColor: colors.skeleton }]} />
      <View style={{ gap: 8, padding: 14 }}>
        <View style={[styles.skeletonLineShort, { backgroundColor: colors.skeleton }]} />
        <View style={[styles.skeletonLine, { backgroundColor: colors.skeleton }]} />
        <View style={[styles.skeletonLine, { backgroundColor: colors.skeleton, width: "70%" }]} />
      </View>
    </View>
  );
}

export function EmptyMagazineState({ title, subtitle }: { title: string; subtitle: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.cardBackground }]}>
        <Search size={26} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
    </View>
  );
}

export function BookmarkPlaceholderButton() {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.bookmarkButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
      activeOpacity={0.72}
    >
      <Bookmark size={18} color={colors.primary} />
      <Text style={[styles.bookmarkText, { color: colors.text }]}>Save</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },
  sectionAction: {
    fontSize: 13,
    fontWeight: "700",
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "700",
  },
  heroCard: {
    height: 390,
    borderRadius: 30,
    overflow: "hidden",
    marginBottom: 28,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 24,
  },
  heroLogoWatermark: {
    position: "absolute",
    top: 18,
    right: 18,
    width: 58,
    height: 58,
    opacity: 0.28,
  },
  kicker: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    fontWeight: "800",
    marginBottom: 10,
  },
  coverCredit: {
    alignSelf: "flex-start",
    color: "rgba(255,255,255,0.9)",
    backgroundColor: "rgba(0,0,0,0.24)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 10,
    overflow: "hidden",
  },
  heroTitle: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 37,
    letterSpacing: -1,
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  heroMetaRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    flexWrap: "wrap",
  },
  heroMeta: {
    color: "#fff",
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
  },
  articleCard: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 14,
  },
  articleCardHorizontal: {
    flexDirection: "row",
  },
  articleImage: {
    width: "100%",
    height: 190,
  },
  articleImageHorizontal: {
    width: 112,
    minHeight: 142,
  },
  articleBody: {
    padding: 15,
    gap: 7,
    flex: 1,
  },
  articleMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  readTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  readTimeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  articleTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  articleSummary: {
    fontSize: 13,
    lineHeight: 19,
  },
  issueCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    padding: 12,
    gap: 12,
    marginBottom: 12,
  },
  issueCover: {
    width: 78,
    height: 92,
    borderRadius: 16,
  },
  issueContent: {
    flex: 1,
    gap: 4,
  },
  issueMeta: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  issueTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  issueSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  skeletonCard: {
    borderRadius: 22,
    overflow: "hidden",
    marginBottom: 14,
  },
  skeletonImage: {
    height: 170,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
  },
  skeletonLineShort: {
    width: "35%",
    height: 12,
    borderRadius: 6,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 22,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  bookmarkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  bookmarkText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
