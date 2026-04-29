export type MagazineImageVariant = {
  width: number;
  format: "avif" | "webp" | "jpeg";
  quality: number;
  suffix: string;
};

export type MagazineImagePlan = {
  originalUri: string;
  bucket: "magazine";
  variants: MagazineImageVariant[];
  stripMetadata: boolean;
  recommendedPrimaryFormat: "avif";
  fallbackFormat: "webp";
  note: string;
};

export const MAGAZINE_IMAGE_VARIANTS: MagazineImageVariant[] = [
  { width: 360, format: "webp", quality: 78, suffix: "thumb" },
  { width: 720, format: "webp", quality: 80, suffix: "card" },
  { width: 1080, format: "webp", quality: 82, suffix: "hero" },
  { width: 1440, format: "avif", quality: 62, suffix: "cover" },
];

export function createMagazineImagePlan(originalUri: string): MagazineImagePlan {
  return {
    originalUri,
    bucket: "magazine",
    variants: MAGAZINE_IMAGE_VARIANTS,
    stripMetadata: true,
    recommendedPrimaryFormat: "avif",
    fallbackFormat: "webp",
    note:
      "React Native should upload the source image now. Production image conversion should run in a backend worker or Supabase Edge Function with sharp/squoosh to create AVIF/WebP responsive variants.",
  };
}

export async function uploadMagazineImagePlaceholder(input: {
  originalUri: string;
  purpose: "issue-cover" | "article-hero" | "inline";
}) {
  const plan = createMagazineImagePlan(input.originalUri);

  return {
    plan,
    originalUrl: input.originalUri,
    webpUrl: input.originalUri,
    avifUrl: input.originalUri,
  };
}

export const magazinePublishingCadence = {
  current: "biweekly",
  daysBetweenIssues: 14,
  futureOptions: ["weekly", "biweekly", "monthly"],
};
