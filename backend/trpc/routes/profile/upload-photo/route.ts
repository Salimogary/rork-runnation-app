import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      imageBase64: z.string().min(1),
      mimeType: z.string().nullable(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const resolvedMime = input.mimeType || "image/jpeg";
    const ext = resolvedMime.includes("png") ? "png" : "jpg";
    const photoFileName = `${input.registrationId}_${Date.now()}.${ext}`;
    const fileBuffer = Buffer.from(input.imageBase64, "base64");

    const { error: uploadError } = await ctx.supabase.storage
      .from("user-photos")
      .upload(photoFileName, fileBuffer, {
        contentType: resolvedMime,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message || "Failed to upload profile photo");
    }

    const { data: urlData } = ctx.supabase.storage.from("user-photos").getPublicUrl(photoFileName);

    await ctx.supabase
      .from("user_photos")
      .update({ is_profile_photo: false })
      .eq("registration_id", input.registrationId);

    const { error: insertError } = await ctx.supabase.from("user_photos").insert({
      registration_id: input.registrationId,
      file_path: urlData.publicUrl,
      file_name: photoFileName,
      file_size: fileBuffer.byteLength,
      mime_type: resolvedMime,
      is_profile_photo: true,
    });

    if (insertError) {
      throw new Error(insertError.message || "Failed to save profile photo");
    }

    return { success: true, photoUrl: urlData.publicUrl };
  });
