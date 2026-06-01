import { z } from "zod";
import { ensureActionCooldown, ensureNoRecentDuplicateText } from "../../../abuse";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";
import { createMentionsForText } from "../mention-utils";

const SOCIAL_BUCKET = "social_uploads";

const activityDataSchema = z.object({
  activity_date: z.string(),
  exercise_type: z.string(),
  distance_km: z.number(),
  Time: z.string(),
  pace_min_per_km: z.number(),
});

const pollSchema = z.object({
  question: z.string().trim().min(1).max(120),
  options: z.array(z.string().trim().min(1).max(60)).min(2).max(4),
});

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      caption: z.string().nullable(),
      activityData: activityDataSchema.nullable(),
      imageBase64: z.string().nullable(),
      mimeType: z.string().nullable(),
      poll: pollSchema.nullable(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);
    const { data: moderationFlag, error: moderationFlagError } = await ctx.supabase
      .from("user_moderation_flags")
      .select("is_banned, suspended_until")
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (moderationFlagError) {
      throw new Error(moderationFlagError.message || "Could not check chat access.");
    }
    if (
      moderationFlag?.is_banned &&
      (!moderationFlag.suspended_until || new Date(moderationFlag.suspended_until).getTime() > Date.now())
    ) {
      throw new Error("Your chat access is currently restricted after moderation review.");
    }

    await ensureActionCooldown(ctx, {
      table: "social_posts",
      filters: [{ column: "registration_id", value: input.registrationId }],
      cooldownSeconds: 20,
      errorMessage: "Please wait a few seconds before posting again.",
    });
    await ensureNoRecentDuplicateText(ctx, {
      table: "social_posts",
      filters: [{ column: "registration_id", value: input.registrationId }],
      textColumn: "caption",
      textValue: input.caption,
      windowSeconds: 15 * 60,
      errorMessage: "That post looks like a recent duplicate. Please edit it before posting again.",
    });

    if (!input.caption && !input.activityData && !input.imageBase64 && !input.poll) {
      throw new Error("Post must include text, image, activity, or a poll");
    }

    let photoPath: string | null = null;

    if (input.imageBase64) {
      const resolvedMime =
        input.mimeType ||
        "image/jpeg";
      const ext = resolvedMime.includes("png") ? "png" : "jpg";
      const fileName = `${input.registrationId}/${Date.now()}.${ext}`;

      const { data: uploadData, error: uploadError } = await ctx.supabase.storage
        .from(SOCIAL_BUCKET)
        .upload(fileName, Buffer.from(input.imageBase64, "base64"), {
          contentType: resolvedMime,
          upsert: false,
        });

      if (uploadError || !uploadData) {
        throw new Error(uploadError?.message || "Failed to upload image");
      }

      photoPath = uploadData.path;
    }

    const { data, error } = await ctx.supabase
      .from("social_posts")
      .insert({
        registration_id: input.registrationId,
        photo_url: photoPath,
        caption: input.caption || null,
        activity_data: input.activityData || null,
        poll_question: input.poll?.question || null,
        poll_options: input.poll?.options || null,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Failed to create post");
    }

    await createMentionsForText({
      supabase: ctx.supabase,
      socialPostId: data.social_post_id,
      mentionedByRegistrationId: input.registrationId,
      text: input.caption,
    });

    return data;
  });
