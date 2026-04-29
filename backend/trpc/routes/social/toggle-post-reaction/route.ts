import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().uuid(),
      postId: z.string().uuid(),
      emoji: z.string().min(1).max(8),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const { data: existing, error: fetchError } = await ctx.supabase
      .from("social_post_reactions")
      .select("reaction_id, emoji")
      .eq("social_post_id", input.postId)
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (fetchError) {
      throw new Error(fetchError.message || "Failed to fetch existing reaction");
    }

    if (existing?.emoji === input.emoji) {
      const { error } = await ctx.supabase
        .from("social_post_reactions")
        .delete()
        .eq("reaction_id", existing.reaction_id);

      if (error) throw new Error(error.message || "Failed to remove reaction");
      return { success: true, removed: true };
    }

    if (existing) {
      const { error } = await ctx.supabase
        .from("social_post_reactions")
        .update({ emoji: input.emoji })
        .eq("reaction_id", existing.reaction_id);

      if (error) throw new Error(error.message || "Failed to update reaction");
      return { success: true, removed: false };
    }

    const { error } = await ctx.supabase.from("social_post_reactions").insert({
      social_post_id: input.postId,
      registration_id: input.registrationId,
      emoji: input.emoji,
    });

    if (error) throw new Error(error.message || "Failed to add reaction");

    return { success: true, removed: false };
  });
