import { z } from "zod";
import { ensureActionCooldown, ensureNoRecentDuplicateText } from "../../../abuse";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

const MAGAZINE_BUCKET = "magazine";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      submitterName: z.string().trim().min(2).max(80),
      email: z.string().trim().email(),
      club: z.string().trim().max(100).nullable(),
      country: z.string().trim().min(2).max(80),
      eventName: z.string().trim().min(2).max(120),
      eventDate: z.string().trim().nullable(),
      caption: z.string().trim().min(8).max(500),
      imageBase64: z.string().min(1),
      mimeType: z.string().trim().min(1),
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (!ctx.authUserId) {
      throw new Error("Please sign in before submitting an event pictorial.");
    }
    await requireRegistrationOwner(ctx, input.registrationId);
    await ensureActionCooldown(ctx, {
      table: "magazine_pictorial_submissions",
      filters: [{ column: "registration_id", value: input.registrationId }],
      cooldownSeconds: 3 * 60,
      errorMessage: "Please wait a few minutes before submitting another pictorial.",
    });
    await ensureNoRecentDuplicateText(ctx, {
      table: "magazine_pictorial_submissions",
      filters: [{ column: "registration_id", value: input.registrationId }],
      textColumn: "caption",
      textValue: input.caption,
      windowSeconds: 24 * 60 * 60,
      errorMessage: "That pictorial caption looks like a recent duplicate submission.",
    });

    const ext = input.mimeType.includes("png") ? "png" : input.mimeType.includes("webp") ? "webp" : "jpg";
    const fileName = `pictorials/${input.registrationId}/${Date.now()}.${ext}`;

    const { data: uploadData, error: uploadError } = await ctx.supabase.storage
      .from(MAGAZINE_BUCKET)
      .upload(fileName, Buffer.from(input.imageBase64, "base64"), {
        contentType: input.mimeType,
        upsert: false,
      });

    if (uploadError || !uploadData) {
      throw new Error(uploadError?.message || "Could not upload pictorial image.");
    }

    const { data: publicUrlData } = ctx.supabase.storage
      .from(MAGAZINE_BUCKET)
      .getPublicUrl(uploadData.path);

    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("profile_id")
      .eq("profile_id", ctx.authUserId)
      .maybeSingle();

    const { data, error } = await ctx.supabase
      .from("magazine_pictorial_submissions")
      .insert({
        registration_id: input.registrationId,
        profile_id: profile?.profile_id ?? ctx.authUserId,
        submitter_name: input.submitterName.trim(),
        email: input.email.trim().toLowerCase(),
        club: input.club?.trim() || null,
        country: input.country.trim(),
        event_name: input.eventName.trim(),
        event_date: input.eventDate || null,
        caption: input.caption.trim(),
        photo_url: publicUrlData.publicUrl,
        photo_webp_url: publicUrlData.publicUrl,
        photo_avif_url: publicUrlData.publicUrl,
        photo_path: uploadData.path,
        status: "submitted",
      })
      .select("pictorial_id, status, created_at")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Could not submit event pictorial.");
    }

    return data;
  });
