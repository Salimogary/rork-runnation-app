import React from "react";
import { Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { MessageCircle, Send, ThumbsUp } from "lucide-react-native";
import { BookmarkPlaceholderButton, MagazineArticleCard } from "@/components/magazine/MagazineComponents";
import { getArticleBySlug, getCategory, getRelatedArticles } from "@/lib/magazine-data";
import type { MagazineBodyBlock } from "@/lib/magazine-types";
import { useTheme } from "@/contexts/ThemeContext";

function ArticleBlock({ block }: { block: MagazineBodyBlock }) {
  const { colors } = useTheme();

  if (block.type === "heading") {
    return <Text style={[styles.bodyHeading, { color: colors.text }]}>{block.text}</Text>;
  }
  if (block.type === "quote") {
    return (
      <View style={[styles.quoteBlock, { borderLeftColor: colors.primary, backgroundColor: colors.cardBackground }]}>
        <Text style={[styles.quoteText, { color: colors.text }]}>{block.text}</Text>
        {block.attribution ? <Text style={[styles.quoteAttribution, { color: colors.textSecondary }]}>- {block.attribution}</Text> : null}
      </View>
    );
  }
  if (block.type === "bullets") {
    return (
      <View style={styles.bulletList}>
        {block.items.map((item) => (
          <View key={item} style={styles.bulletRow}>
            <View style={[styles.bulletDot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.bodyParagraph, styles.bulletText, { color: colors.text }]}>{item}</Text>
          </View>
        ))}
      </View>
    );
  }
  if (block.type === "image") {
    return (
      <View style={styles.inlineImageWrap}>
        <Image source={{ uri: block.url }} style={styles.inlineImage} contentFit="cover" transition={250} />
        {block.caption ? <Text style={[styles.caption, { color: colors.textSecondary }]}>{block.caption}</Text> : null}
      </View>
    );
  }
  if (block.type === "separator") {
    return <View style={[styles.separator, { backgroundColor: colors.divider }]} />;
  }
  return <Text style={[styles.bodyParagraph, { color: colors.text }]}>{block.text}</Text>;
}

export default function MagazineArticleScreen() {
  const { articleSlug } = useLocalSearchParams<{ articleSlug: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const article = getArticleBySlug(articleSlug);

  if (!article) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.background }]}>
        <Text style={[styles.missingTitle, { color: colors.text }]}>Article not found</Text>
        <Text style={[styles.missingText, { color: colors.textSecondary }]}>This story may have moved or is not published yet.</Text>
      </View>
    );
  }

  const category = getCategory(article.categorySlug);
  const related = getRelatedArticles(article);

  const handleShare = async () => {
    try {
      await Share.share({
        title: article.title,
        message: `${article.title}\n\n${article.summary}`,
      });
    } catch {
      Alert.alert("Share unavailable", "This article could not be shared right now.");
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Stack.Screen options={{ title: "Magazine" }} />
      <Image source={{ uri: article.heroImageUrl }} style={styles.heroImage} contentFit="cover" transition={250} />
      <View style={styles.header}>
        <Text style={[styles.category, { color: category.color }]}>{category.name}</Text>
        <Text style={[styles.title, { color: colors.text }]}>{article.title}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{article.subtitle}</Text>
        <View style={styles.metaWrap}>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>{article.authorName} / {article.authorRole}</Text>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {new Date(article.publishDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} / {article.readingTimeMinutes} min read
          </Text>
        </View>
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.shareButton, { backgroundColor: colors.primary }]} onPress={handleShare} activeOpacity={0.78}>
            <Send size={17} color="#fff" />
            <Text style={styles.shareButtonText}>Share</Text>
          </TouchableOpacity>
          <BookmarkPlaceholderButton />
        </View>
      </View>

      {article.featuredQuote ? (
        <View style={[styles.pullQuote, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.pullQuoteText, { color: colors.text }]}>{article.featuredQuote}</Text>
        </View>
      ) : null}

      <View style={styles.body}>
        {article.body.map((block, index) => (
          <ArticleBlock key={`${block.type}-${index}`} block={block} />
        ))}
      </View>

      <View style={[styles.futureRow, { borderColor: colors.border }]}>
        <View style={styles.futureItem}>
          <ThumbsUp size={18} color={colors.primary} />
          <Text style={[styles.futureText, { color: colors.textSecondary }]}>Reactions soon</Text>
        </View>
        <View style={styles.futureItem}>
          <MessageCircle size={18} color={colors.primary} />
          <Text style={[styles.futureText, { color: colors.textSecondary }]}>Comments soon</Text>
        </View>
      </View>

      <Text style={[styles.relatedTitle, { color: colors.text }]}>Related Stories</Text>
      {related.map((item) => (
        <MagazineArticleCard
          key={item.articleId}
          article={item}
          variant="horizontal"
          onPress={() => router.push(`/magazine/article/${item.slug}` as any)}
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
    paddingBottom: 36,
  },
  heroImage: {
    width: "100%",
    height: 330,
  },
  header: {
    padding: 22,
    paddingBottom: 10,
  },
  category: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 12,
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: -1.1,
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 25,
    marginTop: 12,
  },
  metaWrap: {
    marginTop: 16,
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  shareButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  pullQuote: {
    borderWidth: 1,
    borderRadius: 24,
    marginHorizontal: 22,
    marginVertical: 14,
    padding: 20,
  },
  pullQuoteText: {
    fontSize: 21,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 8,
  },
  bodyParagraph: {
    fontSize: 17,
    lineHeight: 28,
    marginBottom: 18,
  },
  bodyHeading: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
    marginTop: 10,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  quoteBlock: {
    borderLeftWidth: 4,
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
  },
  quoteText: {
    fontSize: 18,
    lineHeight: 27,
    fontWeight: "700",
  },
  quoteAttribution: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "700",
  },
  bulletList: {
    gap: 10,
    marginBottom: 18,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 11,
    alignItems: "flex-start",
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 10,
  },
  bulletText: {
    flex: 1,
    marginBottom: 0,
  },
  inlineImageWrap: {
    marginBottom: 20,
  },
  inlineImage: {
    height: 240,
    borderRadius: 24,
  },
  caption: {
    fontSize: 12,
    marginTop: 7,
    textAlign: "center",
  },
  separator: {
    height: 1,
    marginVertical: 18,
  },
  futureRow: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginHorizontal: 22,
    marginVertical: 24,
    paddingVertical: 14,
    flexDirection: "row",
    gap: 14,
  },
  futureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
  },
  futureText: {
    fontSize: 13,
    fontWeight: "700",
  },
  relatedTitle: {
    fontSize: 22,
    fontWeight: "900",
    marginHorizontal: 22,
    marginBottom: 14,
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
    lineHeight: 20,
    textAlign: "center",
  },
});
