export type MagazineCategorySlug =
  | "runner-spotlight"
  | "club-feature"
  | "training"
  | "fitness-coach"
  | "recovery"
  | "nutrition"
  | "event-preview"
  | "event-review"
  | "community-story"
  | "gear-pick";

export type MagazineBodyBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string; attribution?: string }
  | { type: "bullets"; items: string[] }
  | { type: "image"; url: string; caption?: string }
  | { type: "separator" };

export type MagazineCategory = {
  categoryId: string;
  name: string;
  slug: MagazineCategorySlug;
  color: string;
};

export type MagazineIssue = {
  issueId: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  editorNote: string;
  coverImageUrl: string;
  coverImageWebpUrl?: string;
  coverImageAvifUrl?: string;
  volumeNumber: number;
  issueNumber: number;
  publicationDate: string;
  cadence: "biweekly" | "monthly" | "weekly";
  status: "draft" | "published";
};

export type MagazineArticle = {
  articleId: string;
  issueId: string;
  issueSlug: string;
  categorySlug: MagazineCategorySlug;
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  authorName: string;
  authorRole: string;
  heroImageUrl: string;
  heroImageWebpUrl?: string;
  heroImageAvifUrl?: string;
  readingTimeMinutes: number;
  featuredQuote?: string;
  isFeatured: boolean;
  isEditorsPick?: boolean;
  isPublished: boolean;
  publishDate: string;
  popularityScore: number;
  body: MagazineBodyBlock[];
};

export type MagazineArticleSubmissionInput = {
  registrationId: string;
  authorName: string;
  email: string;
  title: string;
  category: string;
  pitch: string;
  body: string;
};
