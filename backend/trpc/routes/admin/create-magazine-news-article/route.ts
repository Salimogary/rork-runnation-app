import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";
import { uploadMagazineImage } from "../../../magazine-image";

export default publicProcedure
  .input(
    z.object({
      page: z.enum(["News", "Events", "Community", "Columns", "Gallery"]).default("News"),
      title: z.string().trim().min(6).max(140),
      authorName: z.string().trim().min(2).max(80),
      body: z.string().trim().min(80).max(12000),
      externalLink: z.string().trim().url().nullable().optional(),
      photoBase64: z.string().nullable().optional(),
      photoMimeType: z.string().trim().nullable().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowMagazineEditor: true,
      allowMagazineColumnist: true,
    });
    const publishesImmediately = actor.isSuperAdmin;
    const page = actor.isSuperAdmin ? input.page : actor.isMagazineColumnist ? "Columns" : "News";

    const articleDate = new Date().toISOString().slice(0, 10);
    const { data: submission, error: submissionError } = await ctx.supabase
      .from("magazine_article_submissions")
      .insert({
        registration_id: actor.authUserId,
        profile_id: actor.authUserId,
        author_name: input.authorName.trim(),
        article_writer_name: input.authorName.trim(),
        email: "global-admin@runnation.app",
        title: input.title.trim(),
        category: page,
        pitch: input.body.trim().slice(0, 700),
        body: input.body.trim(),
        external_link: input.externalLink?.trim() || null,
        status: publishesImmediately ? "accepted" : "submitted",
        reviewed_by: publishesImmediately ? actor.authUserId : null,
        reviewed_at: publishesImmediately ? new Date().toISOString() : null,
      })
      .select("submission_id")
      .single();

    if (submissionError || !submission) {
      throw new Error(submissionError?.message || "Could not create the news article.");
    }

    const photoUrl = input.photoBase64
      ? await uploadMagazineImage(ctx, "admin-news", submission.submission_id, input.photoBase64, input.photoMimeType)
      : null;

    if (photoUrl) {
      const { error: photoUpdateError } = await ctx.supabase
        .from("magazine_article_submissions")
        .update({
          magazine_photo_url: photoUrl,
          attachment_url: photoUrl,
        })
        .eq("submission_id", submission.submission_id);

      if (photoUpdateError) {
        throw new Error(photoUpdateError.message || "Article photo was uploaded but could not be attached.");
      }
    }

    if (publishesImmediately) {
      const { error: liveError } = await ctx.supabase
        .from("live_magazine")
        .insert({
          registration_id: actor.authUserId,
          page,
          author: input.authorName.trim(),
          article_date: articleDate,
          title: input.title.trim(),
          body: input.body.trim(),
          picture_link: photoUrl,
          external_link: input.externalLink?.trim() || null,
          source_table: "magazine_article_submissions",
          source_id: submission.submission_id,
          updated_at: new Date().toISOString(),
        });

      if (liveError) {
        throw new Error(liveError.message || "News article was created but could not be published.");
      }
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "magazine_news_created",
      metadata: {
        submissionId: submission.submission_id,
        title: input.title.trim(),
        status: publishesImmediately ? "accepted" : "submitted",
      },
    });

    return {
      success: true,
      submissionId: submission.submission_id,
      status: publishesImmediately ? "accepted" : "submitted",
    };
  });

