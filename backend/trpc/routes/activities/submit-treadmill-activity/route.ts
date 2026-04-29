import { z } from "zod";
import { ensureActionCooldown } from "../../../abuse";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";
import { ACTIVITY_UPLOADS_BUCKET, getExtensionFromMimeType } from "../../../storage";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      distanceKm: z.number().positive(),
      timeMinutes: z.number().positive(),
      imageBase64: z.string().min(1),
      mimeType: z.string().min(1),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);
    await ensureActionCooldown(ctx, {
      table: "pending_activities",
      filters: [{ column: "registration_id", value: input.registrationId }],
      cooldownSeconds: 60,
      errorMessage: "Please wait a minute before submitting another treadmill proof.",
    });

    const ext = getExtensionFromMimeType(input.mimeType);
    const filePath = `treadmill/${input.registrationId}/${Date.now()}.${ext}`;

    const { data: uploadData, error: uploadError } = await ctx.supabase.storage
      .from(ACTIVITY_UPLOADS_BUCKET)
      .upload(filePath, Buffer.from(input.imageBase64, "base64"), {
        contentType: input.mimeType,
        upsert: false,
      });

    if (uploadError || !uploadData) {
      throw new Error(uploadError?.message || "Failed to upload treadmill proof.");
    }

    const hours = Math.floor(input.timeMinutes / 60);
    const minutes = Math.floor(input.timeMinutes % 60);
    const timeInterval = `${hours}:${minutes.toString().padStart(2, "0")}:00`;

    const { data, error } = await ctx.supabase
      .from("pending_activities")
      .insert({
        registration_id: input.registrationId,
        exercise_type: "Treadmill",
        distance_entered: input.distanceKm,
        distance_unit: "km",
        time_entered: timeInterval,
        photo_path: uploadData.path,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      await ctx.supabase.storage.from(ACTIVITY_UPLOADS_BUCKET).remove([uploadData.path]);
      throw new Error(error.message || "Failed to submit treadmill activity.");
    }

    return { success: true, submission: data };
  });
