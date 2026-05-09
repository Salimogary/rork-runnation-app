import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";
import { getExtensionFromMimeType } from "../../../storage";

const REPORT_SCREENSHOT_BUCKET = "chat_report_screenshots";

const reportReasonSchema = z.enum([
  "abuse",
  "hate",
  "disrespect",
  "divisive",
  "sectarian",
  "pornographic",
  "spam",
  "other",
]);

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      postId: z.string().uuid().nullable().optional(),
      commentId: z.string().uuid().nullable().optional(),
      reasonCategory: reportReasonSchema.default("abuse"),
      description: z.string().trim().min(10).max(1000),
      screenshotBase64: z.string().min(1).nullable().optional(),
      screenshotMimeType: z.string().trim().min(3).nullable().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    let reportedRegistrationId: string | null = null;
    let postId = input.postId ?? null;
    const commentId = input.commentId ?? null;

    if (commentId) {
      const { data: comment, error: commentError } = await ctx.supabase
        .from("social_comments")
        .select("comment_id, social_post_id, registration_id")
        .eq("comment_id", commentId)
        .maybeSingle();

      if (commentError || !comment) {
        throw new Error(commentError?.message || "Reported comment was not found.");
      }
      reportedRegistrationId = comment.registration_id;
      postId = postId ?? comment.social_post_id;
    }

    if (postId && !reportedRegistrationId) {
      const { data: post, error: postError } = await ctx.supabase
        .from("social_posts")
        .select("social_post_id, registration_id")
        .eq("social_post_id", postId)
        .maybeSingle();

      if (postError || !post) {
        throw new Error(postError?.message || "Reported post was not found.");
      }
      reportedRegistrationId = post.registration_id;
    }

    let screenshotPath: string | null = null;
    if (input.screenshotBase64) {
      const mimeType = input.screenshotMimeType || "image/jpeg";
      const extension = getExtensionFromMimeType(mimeType);
      screenshotPath = `${input.registrationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
      const { error: uploadError } = await ctx.supabase.storage
        .from(REPORT_SCREENSHOT_BUCKET)
        .upload(screenshotPath, Buffer.from(input.screenshotBase64, "base64"), {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message || "Could not upload report screenshot.");
      }
    }

    const { data: report, error: reportError } = await ctx.supabase
      .from("chat_moderation_reports")
      .insert({
        reporter_registration_id: input.registrationId,
        reported_registration_id: reportedRegistrationId,
        social_post_id: postId,
        comment_id: commentId,
        reason_category: input.reasonCategory,
        description: input.description,
        screenshot_path: screenshotPath,
        status: "pending",
      })
      .select("report_id")
      .maybeSingle();

    if (reportError || !report) {
      throw new Error(reportError?.message || "Could not submit report.");
    }

    if (reportedRegistrationId) {
      await ctx.supabase.from("user_moderation_flags").upsert(
        {
          registration_id: reportedRegistrationId,
          last_reported_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "registration_id" }
      );
    }

    return { success: true, reportId: report.report_id };
  });
