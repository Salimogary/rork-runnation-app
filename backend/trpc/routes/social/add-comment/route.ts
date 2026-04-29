import { z } from "zod";
import { ensureActionCooldown, ensureNoRecentDuplicateText } from "../../../abuse";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";
import { createMentionsForText } from "../mention-utils";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      postId: z.string().min(1),
      body: z.string().trim().min(1).max(280),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);
    await ensureActionCooldown(ctx, {
      table: "social_comments",
      filters: [{ column: "registration_id", value: input.registrationId }],
      cooldownSeconds: 8,
      errorMessage: "Please wait a few seconds before commenting again.",
    });
    await ensureNoRecentDuplicateText(ctx, {
      table: "social_comments",
      filters: [
        { column: "registration_id", value: input.registrationId },
        { column: "social_post_id", value: input.postId },
      ],
      textColumn: "body",
      textValue: input.body,
      windowSeconds: 10 * 60,
      errorMessage: "That comment looks like a recent duplicate.",
    });

    const { data, error } = await ctx.supabase
      .from("social_comments")
      .insert({
        social_post_id: input.postId,
        registration_id: input.registrationId,
        body: input.body,
      })
      .select("comment_id, social_post_id, registration_id, body, created_at")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Failed to add comment");
    }

    await createMentionsForText({
      supabase: ctx.supabase,
      socialPostId: input.postId,
      socialCommentId: data.comment_id,
      mentionedByRegistrationId: input.registrationId,
      text: input.body,
    });

    return data;
  });
