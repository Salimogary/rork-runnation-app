import { z } from "zod";
import { ensureActionCooldown } from "../../../abuse";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";
import { ACTIVITY_UPLOADS_BUCKET, getExtensionFromMimeType } from "../../../storage";

const EVIDENCE_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function decodeBase64Payload(value: string) {
  const normalized = value.includes(",") ? value.split(",").pop() || "" : value;
  return Buffer.from(normalized, "base64");
}

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string(),
      activityDate: z.string(),
      exerciseType: z.enum(["Run", "Walk", "Cycle", "Treadmill"]),
      startTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, "Start time must be in HH:MM:SS format"),
      duration: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, "Duration must be in HH:MM:SS format"),
      distanceKm: z.number().positive(),
      sourceType: z.enum(["smart_watch", "other_sports_app"]).nullable().optional(),
      sourceLabel: z.string().trim().max(80).nullable().optional(),
      evidenceImageBase64: z.string().nullable().optional(),
      evidenceMimeType: z.string().nullable().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    try {
      await requireRegistrationOwner(ctx, input.registrationId);
      if (["Cycle", "Run", "Walk"].includes(input.exerciseType)) {
        const { data: registration, error: registrationError } = await ctx.supabase
          .from("registrations")
          .select("para_uses_equipment, para_equipment_type")
          .eq("registration_id", input.registrationId)
          .maybeSingle();

        if (registrationError) {
          throw new Error(registrationError.message || "Could not verify workout eligibility.");
        }
        const cycleOnly =
          registration?.para_uses_equipment === true &&
          ["wheelchair", "handcycle"].includes(String(registration?.para_equipment_type || ""));
        if (input.exerciseType === "Cycle" && !cycleOnly) {
          throw new Error("Cycle is available for Para Runners who use a wheelchair or handcycle.");
        }
        if ((input.exerciseType === "Run" || input.exerciseType === "Walk") && cycleOnly) {
          throw new Error("Your Para equipment profile qualifies for Cycle workouts only.");
        }
      }
      await ensureActionCooldown(ctx, {
        table: "external_activity_submissions",
        filters: [{ column: "registration_id", value: input.registrationId }],
        cooldownSeconds: 45,
        errorMessage: "Please wait a moment before submitting another manual activity.",
      });

      let evidencePath: string | null = null;
      let evidenceMimeType: string | null = null;
      if (input.evidenceImageBase64) {
        const mimeType = input.evidenceMimeType || "image/jpeg";
        if (!EVIDENCE_IMAGE_MIME_TYPES.has(mimeType)) {
          throw new Error("Evidence screenshot must be a JPG, PNG, WebP, or AVIF image.");
        }

        const fileExt = getExtensionFromMimeType(mimeType);
        const sourceFolder = input.sourceType || "external";
        const filePath = `external/${sourceFolder}/${input.registrationId}/${Date.now()}.${fileExt}`;
        const imageBytes = decodeBase64Payload(input.evidenceImageBase64);

        const { data: uploadData, error: uploadError } = await ctx.supabase.storage
          .from(ACTIVITY_UPLOADS_BUCKET)
          .upload(filePath, imageBytes, {
            contentType: mimeType,
            upsert: false,
          });

        if (uploadError) {
          console.error("[Submit External Activity] Evidence upload error:", uploadError);
          throw new Error(uploadError.message || "Failed to upload evidence screenshot.");
        }

        evidencePath = uploadData?.path || filePath;
        evidenceMimeType = mimeType;
      }

      const insertPayload: Record<string, any> = {
        registration_id: input.registrationId,
        activity_date: input.activityDate,
        exercise_type: input.exerciseType,
        start_time: input.startTime,
        duration: input.duration,
        distance_km: input.distanceKm,
        source_type: input.sourceType || null,
        source_label: input.sourceLabel || null,
        evidence_path: evidencePath,
        evidence_mime_type: evidenceMimeType,
      };

      const { data, error } = await ctx.supabase
        .from("external_activity_submissions")
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error("[Submit External Activity] Error:", error);
        throw new Error(error.message || "Failed to submit activity");
      }

      return { success: true, submission: data };
    } catch (error: any) {
      console.error("[Submit External Activity] Error:", error);
      throw new Error(error.message || "Failed to submit activity");
    }
  });
