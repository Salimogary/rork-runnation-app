import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      postId: z.string().min(1),
      isLiked: z.boolean(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    if (input.isLiked) {
      const { error } = await ctx.supabase
        .from("post_likes")
        .delete()
        .eq("social_post_id", input.postId)
        .eq("user_id", input.registrationId);

      if (error) {
        throw new Error(error.message || "Failed to unlike post");
      }
    } else {
      const { error } = await ctx.supabase.from("post_likes").insert({
        social_post_id: input.postId,
        user_id: input.registrationId,
      });

      if (error) {
        throw new Error(error.message || "Failed to like post");
      }
    }

    return { success: true };
  });
