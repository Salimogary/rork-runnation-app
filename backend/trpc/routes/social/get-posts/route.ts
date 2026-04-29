import { z } from "zod";
import { publicProcedure } from "../../../create-context";

const SOCIAL_BUCKET = "social_uploads";

const extractStoragePath = (value?: string | null): string | null => {
  if (!value) return null;
  if (!value.startsWith("http")) return value;

  const markers = [
    `/object/public/${SOCIAL_BUCKET}/`,
    `/object/sign/${SOCIAL_BUCKET}/`,
    `/object/authenticated/${SOCIAL_BUCKET}/`,
  ];

  for (const marker of markers) {
    const index = value.indexOf(marker);
    if (index >= 0) {
      const pathWithQuery = value.slice(index + marker.length);
      return pathWithQuery.split("?")[0];
    }
  }

  return null;
};

const isNotFoundStorageError = (message?: string) => {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("object not found") || lower.includes("not found");
};

const isMissingSocialRelationError = (message?: string) => {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("social_post_reactions") ||
    lower.includes("social_poll_votes") ||
    lower.includes("social_comments")
  );
};

async function resolveSocialPhotoUrl(
  supabase: any,
  storagePath: string
): Promise<string> {
  try {
    const { data: signedData, error: signedError } = await supabase.storage
      .from(SOCIAL_BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    if (!signedError && signedData?.signedUrl) {
      return signedData.signedUrl;
    }

    if (signedError && !isNotFoundStorageError(signedError.message)) {
      console.warn("Signed URL fallback:", signedError.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Signed URL fallback:", message);
  }

  const { data: publicData } = supabase.storage
    .from(SOCIAL_BUCKET)
    .getPublicUrl(storagePath);

  return publicData.publicUrl || storagePath;
}

export default publicProcedure
  .input(z.object({ registrationId: z.string().min(1) }))
  .query(async ({ input, ctx }) => {
    let data: any[] | null = null;
    let error: any = null;

    const primary = await ctx.supabase
      .from("social_posts")
      .select(`
        social_post_id,
        registration_id,
        photo_url,
        caption,
        activity_data,
        poll_question,
        poll_options,
        created_at,
        post_likes!left (user_id),
        social_comments!left (comment_id),
        social_poll_votes!left (user_id:registration_id, option_index),
        social_post_reactions!left (registration_id, emoji)
      `)
      .order("created_at", { ascending: false });

    data = primary.data as any[] | null;
    error = primary.error;

    if (error && isMissingSocialRelationError(error.message)) {
      const fallback = await ctx.supabase
        .from("social_posts")
        .select(`
          social_post_id,
          registration_id,
          photo_url,
          caption,
          activity_data,
          poll_question,
          poll_options,
          created_at,
          post_likes!left (user_id)
        `)
        .order("created_at", { ascending: false });

      data = fallback.data as any[] | null;
      error = fallback.error;
    }

    if (error) {
      throw new Error(error.message || "Failed to fetch posts");
    }

    const userIds = [...new Set((data || []).map((p: any) => p.registration_id))];

    const { data: userData, error: userError } = await ctx.supabase
      .from("registrations")
      .select("registration_id, first_name, username, country")
      .in("registration_id", userIds);

    if (userError) {
      throw new Error(userError.message || "Failed to fetch post users");
    }

    const { data: membershipData } = await ctx.supabase
      .from("club_membership_request")
      .select("registration_id, club")
      .in("registration_id", userIds);

    const membershipMap = new Map(
      (membershipData || []).map((membership: any) => [
        membership.registration_id,
        membership.club,
      ])
    );

    const userMap = new Map(
      (userData || []).map((u: any) => [
        u.registration_id,
        {
          first_name: u.first_name,
          username: u.username,
          country: u.country,
          club_name: membershipMap.get(u.registration_id) || null,
        },
      ])
    );

    const postsWithLikes = (data || []).map((post: any) => {
      const likes = post.post_likes || [];
      return {
        social_post_id: post.social_post_id,
        registration_id: post.registration_id,
        photo_url: post.photo_url,
        caption: post.caption,
        activity_data: post.activity_data,
        created_at: post.created_at,
        likes_count: likes.length,
        comments_count: (post.social_comments || []).length,
        user_liked: likes.some((like: any) => like.user_id === input.registrationId),
        reactions: Array.from(
          new Map(
            (post.social_post_reactions || []).map((reaction: any) => [
              reaction.emoji,
              {
                emoji: reaction.emoji,
                count: (post.social_post_reactions || []).filter((entry: any) => entry.emoji === reaction.emoji).length,
              },
            ])
          ).values()
        ),
        user_reaction:
          (post.social_post_reactions || []).find(
            (reaction: any) => reaction.registration_id === input.registrationId
          )?.emoji ?? null,
        poll: post.poll_question && Array.isArray(post.poll_options)
          ? {
              question: post.poll_question,
              options: post.poll_options.map((option: string, index: number) => {
                const votes = (post.social_poll_votes || []).filter(
                  (vote: any) => vote.option_index === index
                );

                return {
                  label: option,
                  votes: votes.length,
                };
              }),
              total_votes: (post.social_poll_votes || []).length,
              user_vote:
                (post.social_poll_votes || []).find(
                  (vote: any) => vote.user_id === input.registrationId
                )?.option_index ?? null,
            }
          : null,
        user: userMap.get(post.registration_id) || null,
      };
    });

    return await Promise.all(
      postsWithLikes.map(async (post: any) => {
        if (!post.photo_url) return post;

        const storagePath = extractStoragePath(post.photo_url);
        if (!storagePath) return post;

        return {
          ...post,
          photo_url: await resolveSocialPhotoUrl(ctx.supabase, storagePath),
        };
      })
    );
  });
