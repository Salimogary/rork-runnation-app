import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { getActorRoleSession, logAdminAction, requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      commentId: z.string().min(1),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);
    const actor = await getActorRoleSession(ctx);

    const { data: comment, error: fetchError } = await ctx.supabase
      .from("social_comments")
      .select("registration_id, social_post_id, body")
      .eq("comment_id", input.commentId)
      .single();

    if (fetchError || !comment) {
      throw new Error(fetchError?.message || "Comment not found");
    }

    if (comment.registration_id !== input.registrationId) {
      if (!actor.isSuperAdmin && !actor.isChatRoomAdministrator) {
        throw new Error("You can only delete your own comment.");
      }
    }

    const { error } = await ctx.supabase
      .from("social_comments")
      .delete()
      .eq("comment_id", input.commentId);

    if (error) {
      throw new Error(error.message || "Failed to delete comment");
    }

    if (actor.isSuperAdmin || actor.isChatRoomAdministrator) {
      await logAdminAction(ctx, {
        actorUserId: actor.authUserId,
        actionType: "social_comment_deleted",
        metadata: {
          contentType: "comment",
          contentId: input.commentId,
          postId: comment.social_post_id,
          ownerRegistrationId: comment.registration_id,
          deletedByRegistrationId: input.registrationId,
          deletedByRole: actor.isSuperAdmin ? "Global Admin" : "Chat Room Administrator",
          contentPreview: String(comment.body || "").slice(0, 240),
        },
      });
    }

    return { success: true };
  });
