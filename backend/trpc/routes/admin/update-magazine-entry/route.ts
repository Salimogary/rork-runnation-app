import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";
import { uploadMagazineImage } from "../../../magazine-image";
import { canAccessMagazineRow, getScopedMagazineAccess } from "../magazine-scope";

const inputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("article"),
    submissionId: z.string().uuid(),
    title: z.string().trim().min(2).max(140),
    authorName: z.string().trim().min(2).max(80),
    category: z.string().trim().min(2).max(60),
    pitch: z.string().trim().max(700).nullable().optional(),
    body: z.string().trim().min(1).max(12000),
    externalLink: z.string().trim().url().nullable().optional(),
    photoBase64: z.string().nullable().optional(),
    photoMimeType: z.string().trim().nullable().optional(),
  }),
  z.object({
    type: z.literal("pictorial"),
    pictorialId: z.string().uuid(),
    eventName: z.string().trim().min(2).max(160),
    caption: z.string().trim().min(1).max(1000),
    eventDate: z.string().trim().nullable().optional(),
    photoBase64: z.string().nullable().optional(),
    photoMimeType: z.string().trim().nullable().optional(),
  }),
]);

function normalizeMagazinePage(category?: string | null): "News" | "Events" | "Community" | "Columns" | "Gallery" {
  const value = String(category || "").trim().toLowerCase();
  if (value.includes("event")) return "Events";
  if (value.includes("news")) return "News";
  if (value.includes("column") || value.includes("coach") || value.includes("journalist") || value.includes("motivation")) return "Columns";
  if (value.includes("gallery") || value.includes("pictorial")) return "Gallery";
  return "Community";
}

async function updateLiveMagazineEntry(ctx: any, sourceTable: string, sourceId: string, payload: Record<string, unknown>) {
  const { data: existing, error: lookupError } = await ctx.supabase
    .from("live_magazine")
    .select("article_id")
    .eq("source_table", sourceTable)
    .eq("source_id", sourceId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message || "Could not check live magazine entry.");
  }

  if (!existing?.article_id) return;

  const { error: updateError } = await ctx.supabase
    .from("live_magazine")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("article_id", existing.article_id);

  if (updateError) {
    throw new Error(updateError.message || "Could not update the published magazine entry.");
  }
}

export default publicProcedure.input(inputSchema).mutation(async ({ ctx, input }) => {
  const actor = await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryAdmin: true,
    allowCountryCoordinator: true,
    allowClubCoordinator: true,
    allowSpecialClubCoordinator: true,
    allowMagazineEditor: true,
  });

  const scope = await getScopedMagazineAccess(ctx, actor);

  if (input.type === "article") {
    const { data: existing, error: existingError } = await ctx.supabase
      .from("magazine_article_submissions")
      .select("*")
      .eq("submission_id", input.submissionId)
      .maybeSingle();

    if (existingError || !existing) {
      throw new Error(existingError?.message || "Magazine article was not found.");
    }
    if (!canAccessMagazineRow(existing, scope)) {
      throw new Error("You can only edit magazine submissions linked to your own scope.");
    }

    const photoUrl = input.photoBase64
      ? await uploadMagazineImage(ctx, "article-edits", input.submissionId, input.photoBase64, input.photoMimeType)
      : null;

    const updatePayload = {
      title: input.title,
      author_name: input.authorName,
      article_writer_name: input.authorName,
      category: input.category,
      pitch: input.pitch || input.body.slice(0, 700),
      body: input.body,
      external_link: input.externalLink || null,
      reviewed_by: actor.authUserId,
      reviewed_at: new Date().toISOString(),
      ...(photoUrl ? { magazine_photo_url: photoUrl, attachment_url: photoUrl } : {}),
    };

    const { data: updated, error: updateError } = await ctx.supabase
      .from("magazine_article_submissions")
      .update(updatePayload)
      .eq("submission_id", input.submissionId)
      .select("*")
      .maybeSingle();

    if (updateError || !updated) {
      throw new Error(updateError?.message || "Could not update magazine article.");
    }

    await updateLiveMagazineEntry(ctx, "magazine_article_submissions", input.submissionId, {
      page: normalizeMagazinePage(updated.category),
      author: updated.article_writer_name || updated.author_name || input.authorName,
      title: updated.title,
      body: updated.body,
      external_link: updated.external_link ?? null,
      ...(photoUrl ? { picture_link: photoUrl } : {}),
    });

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "magazine_article_edited",
      metadata: { submissionId: input.submissionId },
    });

    return { success: true };
  }

  const { data: existing, error: existingError } = await ctx.supabase
    .from("magazine_pictorial_submissions")
    .select("*")
    .eq("pictorial_id", input.pictorialId)
    .maybeSingle();

  if (existingError || !existing) {
    throw new Error(existingError?.message || "Magazine pictorial was not found.");
  }
  if (!canAccessMagazineRow(existing, scope)) {
    throw new Error("You can only edit pictorial submissions linked to your own scope.");
  }

  const photoUrl = input.photoBase64
    ? await uploadMagazineImage(ctx, "pictorial-edits", input.pictorialId, input.photoBase64, input.photoMimeType)
    : null;

  const { data: updated, error: updateError } = await ctx.supabase
    .from("magazine_pictorial_submissions")
    .update({
      event_name: input.eventName,
      caption: input.caption,
      event_date: input.eventDate || null,
      reviewed_by: actor.authUserId,
      reviewed_at: new Date().toISOString(),
      ...(photoUrl ? { photo_url: photoUrl } : {}),
    })
    .eq("pictorial_id", input.pictorialId)
    .select("*")
    .maybeSingle();

  if (updateError || !updated) {
    throw new Error(updateError?.message || "Could not update magazine pictorial.");
  }

  await updateLiveMagazineEntry(ctx, "magazine_pictorial_submissions", input.pictorialId, {
    article_date: updated.event_date || new Date(updated.created_at || Date.now()).toISOString().slice(0, 10),
    title: updated.event_name || "RunNation Gallery",
    body: updated.caption,
    ...(photoUrl ? { picture_link: photoUrl } : {}),
  });

  await logAdminAction(ctx, {
    actorUserId: actor.authUserId,
    actionType: "magazine_pictorial_edited",
    metadata: { pictorialId: input.pictorialId },
  });

  return { success: true };
});

