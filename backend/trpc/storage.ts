export const ACTIVITY_UPLOADS_BUCKET = "activity-uploads";

export function getExtensionFromMimeType(mimeType?: string | null): string {
  if (!mimeType) return "bin";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("csv")) return "csv";
  if (mimeType.includes("pdf")) return "pdf";
  return mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
}

export async function resolvePrivateActivityUploadUrl(
  supabase: any,
  storedPath?: string | null,
  expiresInSeconds = 60 * 30
): Promise<string | null> {
  if (!storedPath) return null;
  if (storedPath.startsWith("http")) return storedPath;
  if (storedPath.startsWith("emailed-to-") || storedPath.startsWith("email-sent-to-")) return storedPath;

  const { data, error } = await supabase.storage
    .from(ACTIVITY_UPLOADS_BUCKET)
    .createSignedUrl(storedPath, expiresInSeconds);

  if (error) {
    console.warn("[Storage] Could not create signed activity upload URL:", {
      path: storedPath,
      message: error.message,
    });
    return null;
  }

  return data?.signedUrl ?? null;
}
