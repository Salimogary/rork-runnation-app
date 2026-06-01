import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

const PROFILE_PHOTOS_BUCKET = "user-photos";

async function ensureProfilePhotosBucket(ctx: any): Promise<void> {
  const { data: buckets, error: listError } = await ctx.supabase.storage.listBuckets();
  if (listError) {
    throw new Error(listError.message || "Could not check profile photo storage.");
  }

  if (buckets?.some((bucket: { name: string }) => bucket.name === PROFILE_PHOTOS_BUCKET)) {
    return;
  }

  const { error: createError } = await ctx.supabase.storage.createBucket(PROFILE_PHOTOS_BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });

  if (createError) {
    throw new Error(createError.message || "Could not create profile photo storage.");
  }
}

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
    await ensureProfilePhotosBucket(ctx);

    const resolvedMime = input.mimeType || "image/jpeg";
    const ext = resolvedMime.includes("png") ? "png" : resolvedMime.includes("webp") ? "webp" : "jpg";
    const photoFileName = `${input.registrationId}/${Date.now()}.${ext}`;
    const fileBuffer = Buffer.from(input.imageBase64, "base64");

    const { error: uploadError } = await ctx.supabase.storage
      .from(PROFILE_PHOTOS_BUCKET)
      .upload(photoFileName, fileBuffer, {
        contentType: resolvedMime,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message || "Failed to upload profile photo");
    }

    const { data: urlData } = ctx.supabase.storage.from(PROFILE_PHOTOS_BUCKET).getPublicUrl(photoFileName);

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
