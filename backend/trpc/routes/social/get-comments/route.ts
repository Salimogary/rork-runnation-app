import { z } from "zod";
import { publicProcedure } from "../../../create-context";

const isMissingCommentReactionRelationError = (message?: string) => {
  if (!message) return false;
  return message.toLowerCase().includes("social_comment_reactions");
};

export default publicProcedure
  .input(
    z.object({
      postId: z.string().min(1),
      registrationId: z.string().uuid(),
    })
  )
  .query(async ({ input, ctx }) => {
    let comments: any[] | null = null;
    let error: any = null;

    const primary = await ctx.supabase
      .from("social_comments")
      .select("comment_id, social_post_id, registration_id, body, created_at, social_comment_reactions!left (registration_id, emoji)")
      .eq("social_post_id", input.postId)
      .order("created_at", { ascending: true });

    comments = primary.data as any[] | null;
    error = primary.error;

    if (error && isMissingCommentReactionRelationError(error.message)) {
      const fallback = await ctx.supabase
        .from("social_comments")
        .select("comment_id, social_post_id, registration_id, body, created_at")
        .eq("social_post_id", input.postId)
        .order("created_at", { ascending: true });

      comments = fallback.data as any[] | null;
      error = fallback.error;
    }

    if (error) {
      throw new Error(error.message || "Failed to fetch comments");
    }

    const registrationIds = [...new Set((comments || []).map((comment: any) => comment.registration_id))];

    const { data: users, error: userError } = await ctx.supabase
      .from("registrations")
      .select("registration_id, first_name, username")
      .in("registration_id", registrationIds.length > 0 ? registrationIds : ["00000000-0000-0000-0000-000000000000"]);

    if (userError) {
      throw new Error(userError.message || "Failed to fetch comment authors");
    }

    const userMap = new Map(
      (users || []).map((user: any) => [
        user.registration_id,
        {
          first_name: user.first_name,
          username: user.username,
        },
      ])
    );

    return (comments || []).map((comment: any) => ({
      comment_id: comment.comment_id,
      social_post_id: comment.social_post_id,
      registration_id: comment.registration_id,
      body: comment.body,
      created_at: comment.created_at,
      reactions: Array.from(
        new Map(
          (comment.social_comment_reactions || []).map((reaction: any) => [
            reaction.emoji,
            {
              emoji: reaction.emoji,
              count: (comment.social_comment_reactions || []).filter((entry: any) => entry.emoji === reaction.emoji).length,
            },
          ])
        ).values()
      ),
      user: userMap.get(comment.registration_id) || null,
      user_reaction:
        (comment.social_comment_reactions || []).find(
          (reaction: any) => reaction.registration_id === input.registrationId
        )?.emoji ?? null,
    }));
  });
