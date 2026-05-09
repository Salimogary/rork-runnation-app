import { z } from "zod";
import { ensureActionCooldown, ensureNoRecentDuplicateText } from "../../../abuse";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

const MAGAZINE_BUCKET = "magazine";

const countWords = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
const isColumnCategory = (value: string) => value.trim().toLowerCase().includes("column");

const getExtensionFromMime = (mimeType?: string | null) => {
  if (!mimeType) return "bin";
  if (mimeType.includes("plain")) return "txt";
  return mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
};

const safeFileName = (fileName?: string | null, mimeType?: string | null) => {
  const fallback = `story-attachment.${getExtensionFromMime(mimeType)}`;
  const name = (fileName || fallback).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 90);
  return name || fallback;
};

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      authorName: z.string().trim().min(2).max(80),
      email: z.string().trim().email(),
      title: z.string().trim().min(6).max(140),
      category: z.string().trim().min(2).max(60),
      pitch: z.string().trim().min(20).max(700),
      body: z
        .string()
        .trim()
        .min(1),
      externalLink: z.string().trim().url().nullable().optional(),
      attachmentBase64: z.string().nullable(),
      attachmentName: z.string().trim().nullable(),
      attachmentType: z.string().trim().nullable(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (!ctx.authUserId) {
      throw new Error("Please sign in before submitting a magazine story.");
    }
    await requireRegistrationOwner(ctx, input.registrationId);
    await ensureActionCooldown(ctx, {
      table: "magazine_article_submissions",
      filters: [{ column: "registration_id", value: input.registrationId }],
      cooldownSeconds: 5 * 60,
      errorMessage: "Please wait a few minutes before submitting another story.",
    });
    await ensureNoRecentDuplicateText(ctx, {
      table: "magazine_article_submissions",
      filters: [{ column: "registration_id", value: input.registrationId }],
      textColumn: "title",
      textValue: input.title,
      windowSeconds: 24 * 60 * 60,
      errorMessage: "You already submitted a story with that title recently.",
    });

    const bodyWords = countWords(input.body);
    const isColumn = isColumnCategory(input.category);
    const isValidWordCount = isColumn
      ? bodyWords >= 250 && bodyWords <= 300
      : bodyWords >= 150 && bodyWords <= 250;

    if (!isValidWordCount) {
      throw new Error(
        isColumn
          ? "Column body must be between 250 and 300 words."
          : "Article body must be between 150 and 250 words."
      );
    }

    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("profile_id")
      .eq("profile_id", ctx.authUserId)
      .maybeSingle();

    let attachmentUrl: string | null = null;
    let attachmentPath: string | null = null;

    if (input.attachmentBase64 && input.attachmentName) {
      if (input.attachmentType && !input.attachmentType.includes("plain")) {
        throw new Error("Please upload a plain text .txt file only.");
      }

      const fileName = safeFileName(input.attachmentName, input.attachmentType);
      attachmentPath = `article-submissions/${input.registrationId}/${Date.now()}-${fileName}`;
      const { error: uploadError } = await ctx.supabase.storage
        .from(MAGAZINE_BUCKET)
        .upload(attachmentPath, Buffer.from(input.attachmentBase64, "base64"), {
          contentType: input.attachmentType || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message || "Could not upload the story attachment.");
      }

      const { data: publicData } = ctx.supabase.storage
        .from(MAGAZINE_BUCKET)
        .getPublicUrl(attachmentPath);
      attachmentUrl = publicData.publicUrl;
    }

    const { data, error } = await ctx.supabase
      .from("magazine_article_submissions")
      .insert({
        registration_id: input.registrationId,
        profile_id: profile?.profile_id ?? ctx.authUserId,
        author_name: input.authorName.trim(),
        email: input.email.trim().toLowerCase(),
        title: input.title.trim(),
        category: input.category.trim(),
        pitch: input.pitch.trim(),
        body: input.body.trim(),
        external_link: input.externalLink?.trim() || null,
        attachment_url: attachmentUrl,
        status: "submitted",
      })
      .select("submission_id, status, created_at")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Could not submit your story right now.");
    }

    return data;
  });
