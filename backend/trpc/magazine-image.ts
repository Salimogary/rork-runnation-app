const MAGAZINE_BUCKET = "magazine";

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function getMagazineImageExtension(mimeType: string): "jpg" | "png" | "webp" {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export function normalizeBase64Payload(value: string): string {
  return value
    .trim()
    .replace(/^data:[^;]+;base64,/i, "")
    .replace(/\s/g, "");
}

export function detectImageMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export function decodeMagazineImageBase64(base64: string, mimeType?: string | null): { buffer: Buffer; mimeType: string } {
  const normalized = normalizeBase64Payload(base64);
  if (!normalized) {
    throw new Error("Magazine image upload was empty.");
  }

  const buffer = Buffer.from(normalized, "base64");
  const detectedMime = detectImageMimeFromBuffer(buffer);
  const providedMime = String(mimeType || "").trim().toLowerCase();

  if (!detectedMime) {
    throw new Error("Magazine image upload could not be decoded as a JPG, PNG, or WEBP file.");
  }

  if (providedMime && IMAGE_MIME_TYPES.has(providedMime) && providedMime !== detectedMime) {
    throw new Error("Magazine image MIME type did not match the uploaded file bytes.");
  }

  return { buffer, mimeType: detectedMime };
}

export async function ensureMagazineBucket(ctx: any): Promise<void> {
  const { data: buckets, error: listError } = await ctx.supabase.storage.listBuckets();
  if (listError) {
    throw new Error(listError.message || "Could not check magazine photo storage.");
  }

  if (buckets?.some((bucket: { name: string }) => bucket.name === MAGAZINE_BUCKET)) {
    return;
  }

  const { error: createError } = await ctx.supabase.storage.createBucket(MAGAZINE_BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: Array.from(IMAGE_MIME_TYPES),
  });

  if (createError) {
    throw new Error(createError.message || "Could not create magazine photo storage.");
  }
}

export async function uploadMagazineImage(
  ctx: any,
  folder: string,
  sourceId: string,
  base64: string,
  mimeType?: string | null
): Promise<string> {
  await ensureMagazineBucket(ctx);

  const image = decodeMagazineImageBase64(base64, mimeType);
  const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, "-").replace(/^\/+|\/+$/g, "");
  const safeSourceId = sourceId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const filePath = `${safeFolder}/${safeSourceId}/${Date.now()}.${getMagazineImageExtension(image.mimeType)}`;

  const { data, error } = await ctx.supabase.storage
    .from(MAGAZINE_BUCKET)
    .upload(filePath, image.buffer, {
      contentType: image.mimeType,
      upsert: true,
    });

  if (error || !data) {
    throw new Error(error?.message || "Could not upload the magazine image.");
  }

  const { data: publicData } = ctx.supabase.storage
    .from(MAGAZINE_BUCKET)
    .getPublicUrl(data.path);

  if (!publicData.publicUrl) {
    throw new Error("Magazine image uploaded, but no public URL was returned.");
  }

  return publicData.publicUrl;
}

export function isMagazineImageUrl(value?: string | null): boolean {
  const url = String(value || "").trim();
  if (!url) return false;
  return /\.(jpe?g|png|webp)(\?|#|$)/i.test(url);
}
