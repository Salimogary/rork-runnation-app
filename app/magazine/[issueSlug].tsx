import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { CalendarDays, Star } from "lucide-react-native";
import { MagazineArticleCard, MagazineSectionHeader } from "@/components/magazine/MagazineComponents";
import { getArticlesForIssue, getIssueBySlug } from "@/lib/magazine-data";
import { useTheme } from "@/contexts/ThemeContext";

export default function MagazineIssueScreen() {
  const { issueSlug } = useLocalSearchParams<{ issueSlug: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const issue = getIssueBySlug(issueSlug);
  const articles = issue ? getArticlesForIssue(issue.slug) : [];
  const editorsPick = articles.find((article) => article.isEditorsPick) ?? articles[0];

  if (!issue) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.background }]}>
        <Text style={[styles.missingTitle, { color: colors.text }]}>Issue not found</Text>
        <Text style={[styles.missingText, { color: colors.textSecondary }]}>This RunNation volume may have moved or is not published yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: `Issue ${issue.issueNumber}` }} />
      <View style={styles.coverWrap}>
        <Image source={{ uri: issue.coverImageUrl }} style={styles.coverImage} contentFit="cover" transition={250} />
        <LinearGradient colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.78)"]} style={styles.coverOverlay}>
          <Text style={styles.kicker}>Volume {issue.volumeNumber} / Issue {issue.issueNumber}</Text>
          <Text style={styles.title}>{issue.title}</Text>
          <Text style={styles.subtitle}>{issue.subtitle}</Text>
          <View style={styles.metaRow}>
            <CalendarDays size={14} color="#fff" />
            <Text style={styles.metaText}>
              {new Date(issue.publicationDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </Text>
          </View>
        </LinearGradient>
      </View>

      <View style={[styles.editorNote, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <Text style={[styles.editorNoteLabel, { color: colors.primary }]}>Editor&apos;s Note</Text>
        <Text style={[styles.editorNoteText, { color: colors.text }]}>{issue.editorNote}</Text>
      </View>

      {editorsPick ? (
        <>
          <MagazineSectionHeader title="Editor’s Pick" subtitle="Start here if you only read one story." />
          <View style={styles.pickHeader}>
            <Star size={18} color={colors.primary} />
            <Text style={[styles.pickLabel, { color: colors.primary }]}>Featured by RunNation Editorial</Text>
          </View>
          <MagazineArticleCard article={editorsPick} onPress={() => router.push(`/magazine/article/${editorsPick.slug}` as any)} />
        </>
      ) : null}

      <MagazineSectionHeader title="In This Issue" subtitle={`${articles.length} stories built for quick, calm mobile reading.`} />
      {articles.map((article) => (
        <MagazineArticleCard
          key={article.articleId}
          article={article}
          variant="horizontal"
          onPress={() => router.push(`/magazine/article/${article.slug}` as any)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 36,
  },
  coverWrap: {
    height: 430,
    borderRadius: 32,
    overflow: "hidden",
    marginBottom: 18,
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
  },
  coverOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 24,
  },
  kicker: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  title: {
    color: "#fff",
    fontSize: 36,
    lineHeight: 39,
    fontWeight: "900",
    letterSpacing: -1,
  },
  subtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 16,
  },
  metaText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  editorNote: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    marginBottom: 24,
  },
  editorNoteLabel: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 7,
  },
  editorNoteText: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "500",
  },
  pickHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 10,
  },
  pickLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  missing: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  missingTitle: {
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 8,
  },
  missingText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
