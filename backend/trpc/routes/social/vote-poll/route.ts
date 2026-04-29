import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      postId: z.string().min(1),
      optionIndex: z.number().int().min(0).max(3),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const { data: post, error: postError } = await ctx.supabase
      .from("social_posts")
      .select("poll_options")
      .eq("social_post_id", input.postId)
      .single();

    if (postError || !post) {
      throw new Error(postError?.message || "Poll not found");
    }

    const pollOptions = Array.isArray(post.poll_options) ? post.poll_options : [];
    if (input.optionIndex >= pollOptions.length) {
      throw new Error("Invalid poll option");
    }

    const { data: existingVote } = await ctx.supabase
      .from("social_poll_votes")
      .select("vote_id, option_index")
      .eq("social_post_id", input.postId)
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (existingVote?.option_index === input.optionIndex) {
      const { error: deleteError } = await ctx.supabase
        .from("social_poll_votes")
        .delete()
        .eq("vote_id", existingVote.vote_id);

      if (deleteError) {
        throw new Error(deleteError.message || "Failed to remove vote");
      }

      return { success: true, removed: true };
    }

    if (existingVote) {
      const { error: updateError } = await ctx.supabase
        .from("social_poll_votes")
        .update({ option_index: input.optionIndex })
        .eq("vote_id", existingVote.vote_id);

      if (updateError) {
        throw new Error(updateError.message || "Failed to update vote");
      }

      return { success: true, removed: false };
    }

    const { error } = await ctx.supabase
      .from("social_poll_votes")
      .insert({
        social_post_id: input.postId,
        registration_id: input.registrationId,
        option_index: input.optionIndex,
      });

    if (error) {
      throw new Error(error.message || "Failed to vote on poll");
    }

    return { success: true, removed: false };
  });
