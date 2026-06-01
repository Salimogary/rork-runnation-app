import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { ExternalLink, ImagePlus, PenLine } from "lucide-react-native";

import { colors as appColors } from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";

type MagazinePage = "News" | "Events" | "Community" | "Columns" | "Gallery";

type MagazineArticle = {
  article_id: string;
  registration_id: string | null;
  page: MagazinePage;
  author: string;
  article_date: string;
  title: string;
  body: string;
  picture_link: string | null;
  external_link: string | null;
  created_at: string;
};

const pages: MagazinePage[] = ["News", "Events", "Community", "Columns", "Gallery"];

function excerpt(text: string, limit = 180) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trim()}...`;
}

function ArticleTitle({ children, large = false }: { children: string; large?: boolean }) {
  return (
    <Text numberOfLines={2} style={large ? styles.leadTitle : styles.articleTitle}>
      {children}
    </Text>
  );
}

function ArticleExcerpt({ children, lines }: { children: string; lines?: number }) {
  return (
    <Text numberOfLines={lines} style={styles.bodyText}>
      {children}
    </Text>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isRenderableMagazineImageUrl(uri?: string | null): boolean {
  const value = String(uri || "").trim();
  return /\.(jpe?g|png|webp)(\?|#|$)/i.test(value);
}

function useRemoteImageAspectRatio(uri?: string | null) {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    const imageUri = isRenderableMagazineImageUrl(uri) ? uri : null;
    let isMounted = true;

    setAspectRatio(null);
    if (!imageUri) return;

    Image.getSize(
      imageUri,
      (width, height) => {
        if (isMounted && width > 0 && height > 0) {
          setAspectRatio(width / height);
        }
      },
      () => {
        if (isMounted) setAspectRatio(null);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [uri]);

  return aspectRatio;
}

function ArticleImage({ uri, large = false }: { uri?: string | null; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const imageUri = isRenderableMagazineImageUrl(uri) ? uri : null;
  const aspectRatio = useRemoteImageAspectRatio(imageUri);

  if (!imageUri || failed) {
    return null;
  }

  return (
    <Image
      source={{ uri: imageUri }}
      style={[styles.articleImage, large && styles.largeImage, large && aspectRatio ? { aspectRatio } : null]}
      resizeMode={large ? "contain" : "cover"}
      onError={() => setFailed(true)}
    />
  );
}

function GalleryImage({ uri }: { uri?: string | null }) {
  const [failed, setFailed] = useState(false);
  const imageUri = isRenderableMagazineImageUrl(uri) ? uri : null;
  const aspectRatio = useRemoteImageAspectRatio(imageUri);

  if (!imageUri || failed) {
    return null;
  }

  return (
    <Image
      source={{ uri: imageUri }}
      style={[styles.galleryImage, aspectRatio ? { aspectRatio } : styles.galleryImageFallback]}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

function ReadLink({ url }: { url?: string | null }) {
  if (!url) return null;

  return (
    <TouchableOpacity style={styles.readLink} onPress={() => Linking.openURL(url)} activeOpacity={0.8}>
      <Text style={styles.readLinkText}>Open link</Text>
      <ExternalLink size={14} color={appColors.primary} />
    </TouchableOpacity>
  );
}

function MetaLine({ article }: { article: MagazineArticle }) {
  return (
    <Text style={styles.metaLine}>
      {article.author} · {formatDate(article.article_date || article.created_at)}
    </Text>
  );
}

function NewsLayout({ articles }: { articles: MagazineArticle[] }) {
  if (!articles.length) return <EmptyPage page="News" />;

  return (
    <View style={styles.section}>
      {articles.map((article) => (
        <View key={article.article_id} style={styles.articleCard}>
          <ArticleImage uri={article.picture_link} large />
          <View style={styles.articleCardText}>
            <MetaLine article={article} />
            <ArticleTitle large>{article.title}</ArticleTitle>
            <ArticleExcerpt>{article.body}</ArticleExcerpt>
            <ReadLink url={article.external_link} />
          </View>
        </View>
      ))}
    </View>
  );
}

function EventsLayout({ articles }: { articles: MagazineArticle[] }) {
  if (!articles.length) return <EmptyPage page="Events" />;

  return (
    <View style={styles.section}>
      {articles.map((article) => (
        <View key={article.article_id} style={styles.articleCard}>
          <ArticleImage uri={article.picture_link} large />
          <View style={styles.articleCardText}>
            <MetaLine article={article} />
            <ArticleTitle large>{article.title}</ArticleTitle>
            <ArticleExcerpt>{article.body}</ArticleExcerpt>
            <ReadLink url={article.external_link} />
          </View>
        </View>
      ))}
    </View>
  );
}

function CommunityLayout({ articles }: { articles: MagazineArticle[] }) {
  if (!articles.length) return <EmptyPage page="Community" />;

  return (
    <View style={styles.section}>
      {articles.map((article) => (
        <View key={article.article_id} style={styles.communityCard}>
          <ArticleImage uri={article.picture_link} large />
          <View style={styles.communityHeader}>
            <View style={styles.communityMeta}>
              <ArticleTitle large>{article.title}</ArticleTitle>
              <MetaLine article={article} />
            </View>
          </View>
          <Text style={styles.quoteText}>{article.body}</Text>
          <ReadLink url={article.external_link} />
        </View>
      ))}
    </View>
  );
}

function ColumnsLayout({ articles }: { articles: MagazineArticle[] }) {
  if (!articles.length) return <EmptyPage page="Columns" />;

  return (
    <View style={styles.section}>
      {articles.map((article) => (
        <View key={article.article_id} style={styles.columnCard}>
          <View style={styles.columnAccent} />
          <ArticleImage uri={article.picture_link} large />
          <View style={styles.columnBody}>
            <Text style={styles.columnLabel}>By {article.author}</Text>
            <ArticleTitle large>{article.title}</ArticleTitle>
            <Text style={styles.metaLine}>{formatDate(article.article_date || article.created_at)}</Text>
            <ArticleExcerpt>{article.body}</ArticleExcerpt>
            <ReadLink url={article.external_link} />
          </View>
        </View>
      ))}
    </View>
  );
}

function GalleryLayout({ articles }: { articles: MagazineArticle[] }) {
  const photoArticles = articles.filter((article) => isRenderableMagazineImageUrl(article.picture_link));

  if (!photoArticles.length) return <EmptyPage page="Gallery" />;

  return (
    <View style={styles.galleryFeed}>
      {photoArticles.map((article) => (
        <View key={article.article_id} style={styles.galleryCard}>
          <GalleryImage uri={article.picture_link} />
          <View style={styles.galleryText}>
            <ArticleTitle>{article.title}</ArticleTitle>
            <Text numberOfLines={1} style={styles.metaLine}>{article.author}</Text>
            <ArticleExcerpt lines={2}>{excerpt(article.body, 80)}</ArticleExcerpt>
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyPage({ page }: { page: MagazinePage }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No {page.toLowerCase()} articles yet</Text>
      <Text style={styles.emptyText}>Approved stories will appear here, newest first.</Text>
    </View>
  );
}

export default function MagazineScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [selectedPage, setSelectedPage] = useState<MagazinePage>("News");

  const articlesQuery = trpc.magazine.getArticles.useQuery({ limit: 80 });

  const articlesByPage = useMemo(() => {
    const grouped = new Map<MagazinePage, MagazineArticle[]>();
    pages.forEach((page) => grouped.set(page, []));

    ((articlesQuery.data ?? []) as MagazineArticle[]).forEach((article) => {
      if (article.page === "Gallery" && !isRenderableMagazineImageUrl(article.picture_link)) {
        return;
      }

      if (pages.includes(article.page)) {
        grouped.get(article.page)?.push(article);
      }
    });

    pages.forEach((page) => {
      grouped.get(page)?.sort((a, b) => {
        const aDate = new Date(a.article_date || a.created_at).getTime();
        const bDate = new Date(b.article_date || b.created_at).getTime();
        return bDate - aDate;
      });
    });

    return grouped;
  }, [articlesQuery.data]);

  const selectedArticles = articlesByPage.get(selectedPage) ?? [];

  const renderSelectedPage = () => {
    if (selectedPage === "News") return <NewsLayout articles={selectedArticles} />;
    if (selectedPage === "Events") return <EventsLayout articles={selectedArticles} />;
    if (selectedPage === "Community") return <CommunityLayout articles={selectedArticles} />;
    if (selectedPage === "Columns") return <ColumnsLayout articles={selectedArticles} />;
    return <GalleryLayout articles={selectedArticles} />;
  };

  const submitAction =
    selectedPage === "Community"
      ? {
          icon: <PenLine size={20} color="#FFFFFF" />,
          label: "Submit community article",
          route: "/magazine/submit" as const,
        }
      : selectedPage === "Gallery"
        ? {
            icon: <ImagePlus size={20} color="#FFFFFF" />,
            label: "Submit gallery photo",
            route: "/magazine/pictorial-submit" as const,
          }
        : null;

  return (
    <View style={[styles.container, isDark && styles.darkContainer]}>
      <Stack.Screen options={{ title: "Magazine" }} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={articlesQuery.isFetching} onRefresh={() => articlesQuery.refetch()} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.brand}>The Running Post</Text>
          {submitAction ? (
            <TouchableOpacity
              accessibilityLabel={submitAction.label}
              activeOpacity={0.85}
              onPress={() => router.push(submitAction.route)}
              style={styles.headerIconButton}
            >
              {submitAction.icon}
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.tabs}>
          {pages.map((page) => {
            const isActive = selectedPage === page;
            return (
              <TouchableOpacity
                key={page}
                style={[styles.tab, isActive && styles.activeTab]}
                onPress={() => setSelectedPage(page)}
                activeOpacity={0.85}
              >
                <Text style={[styles.tabText, isActive && styles.activeTabText]}>{page}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {articlesQuery.isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={appColors.primary} />
            <Text style={styles.emptyText}>Loading magazine...</Text>
          </View>
        ) : articlesQuery.error ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Magazine could not load</Text>
            <Text style={styles.emptyText}>Pull down to try again.</Text>
          </View>
        ) : (
          renderSelectedPage()
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  darkContainer: {
    backgroundColor: "#FFFFFF",
  },
  content: {
    paddingBottom: 28,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 2,
  },
  brand: {
    color: "#111827",
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: 0,
  },
  headerIconButton: {
    alignItems: "center",
    backgroundColor: appColors.primary,
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  tabs: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 6,
  },
  tab: {
    alignItems: "center",
    borderBottomColor: "transparent",
    borderBottomWidth: 3,
    flex: 1,
    paddingBottom: 6,
    paddingHorizontal: 1,
  },
  activeTab: {
    borderBottomColor: appColors.primary,
  },
  tabText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  activeTabText: {
    color: "#111827",
  },
  section: {
    gap: 18,
    paddingHorizontal: 20,
  },
  articleCard: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  articleCardText: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  articleImage: {
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    height: 116,
    width: 116,
  },
  largeImage: {
    borderRadius: 0,
    minHeight: 180,
    width: "100%",
  },
  placeholderImage: {
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    height: 116,
    justifyContent: "center",
    width: 116,
  },
  placeholderText: {
    color: appColors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  leadTitle: {
    color: "#111827",
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 24,
    marginTop: 4,
  },
  articleTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  bodyText: {
    color: "#4B5563",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  metaLine: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "700",
  },
  readLink: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 5,
    marginTop: 8,
  },
  readLinkText: {
    color: appColors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  rowArticle: {
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 138,
    paddingBottom: 14,
  },
  rowBody: {
    flex: 1,
  },
  communityCard: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 12,
  },
  communityHeader: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  communityMeta: {
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
  quoteText: {
    color: "#111827",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    paddingHorizontal: 12,
  },
  columnCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  columnAccent: {
    backgroundColor: appColors.primary,
    height: 6,
    width: "100%",
  },
  columnBody: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  columnLabel: {
    color: appColors.primary,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 2,
  },
  galleryFeed: {
    gap: 16,
    paddingHorizontal: 20,
  },
  galleryCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  galleryImage: {
    backgroundColor: "#E5E7EB",
    width: "100%",
  },
  galleryImageFallback: {
    height: 360,
  },
  galleryImagePlaceholder: {
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    height: 520,
    justifyContent: "center",
    width: "100%",
  },
  galleryText: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emptyState: {
    alignItems: "center",
    marginHorizontal: 20,
    padding: 28,
  },
  loadingState: {
    alignItems: "center",
    gap: 12,
    marginHorizontal: 20,
    padding: 28,
  },
  emptyTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: "center",
  },
});
