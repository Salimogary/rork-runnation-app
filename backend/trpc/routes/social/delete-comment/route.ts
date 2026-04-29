import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      commentId: z.string().min(1),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const { data: comment, error: fetchError } = await ctx.supabase
      .from("social_comments")
      .select("registration_id")
      .eq("comment_id", input.commentId)
      .single();

    if (fetchError || !comment) {
      throw new Error(fetchError?.message || "Comment not found");
    }

    if (comment.registration_id !== input.registrationId) {
      throw new Error("You can only delete your own comment");
    }

    const { error } = await ctx.supabase
      .from("social_comments")
      .delete()
      .eq("comment_id", input.commentId);

    if (error) {
      throw new Error(error.message || "Failed to delete comment");
    }

    return { success: true };
  });
