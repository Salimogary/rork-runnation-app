import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

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

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      postId: z.string().min(1),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const { data: postData, error: postFetchError } = await ctx.supabase
      .from("social_posts")
      .select("photo_url, registration_id")
      .eq("social_post_id", input.postId)
      .single();

    if (postFetchError || !postData) {
      throw new Error(postFetchError?.message || "Post not found");
    }

    if (postData.registration_id !== input.registrationId) {
      throw new Error("You can only delete your own posts");
    }

    const storagePath = extractStoragePath(postData.photo_url);
    if (storagePath) {
      const { error: storageDeleteError } = await ctx.supabase.storage
        .from(SOCIAL_BUCKET)
        .remove([storagePath]);

      if (storageDeleteError) {
        console.warn("Storage cleanup warning:", storageDeleteError.message);
      }
    }

    const { error } = await ctx.supabase
      .from("social_posts")
      .delete()
      .eq("social_post_id", input.postId);

    if (error) {
      throw new Error(error.message || "Failed to delete post");
    }

    return { success: true };
  });
