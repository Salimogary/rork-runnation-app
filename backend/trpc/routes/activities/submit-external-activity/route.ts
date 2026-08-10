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
      exerciseType: z.enum(["Run", "Walk", "Cycle", "Treadmill", "Stairs"]),
      startTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, "Start time must be in HH:MM:SS format"),
      duration: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, "Duration must be in HH:MM:SS format"),
      distanceKm: z.number().positive().nullable().optional(),
      stepsCount: z.number().int().positive().nullable().optional(),
      sourceType: z.enum(["smart_watch", "other_sports_app", "medal_claim"]).nullable().optional(),
      sourceLabel: z.string().trim().max(80).nullable().optional(),
      externalEventName: z.string().trim().max(160).nullable().optional(),
      externalEventLocation: z.string().trim().max(160).nullable().optional(),
      evidenceImageBase64: z.string().nullable().optional(),
      evidenceMimeType: z.string().nullable().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    try {
      await requireRegistrationOwner(ctx, input.registrationId);
      const isStairs = input.exerciseType === "Stairs";
      if (isStairs) {
        if (!input.stepsCount || input.stepsCount <= 0) {
          throw new Error("Please enter the number of stairs climbed.");
        }
      } else if (!input.distanceKm || input.distanceKm <= 0) {
        throw new Error("Please enter a valid distance.");
      }

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
      try {
        await ensureActionCooldown(ctx, {
          table: "external_activity_submissions",
          filters: [{ column: "registration_id", value: input.registrationId }],
          cooldownSeconds: 45,
          errorMessage: "Please wait a moment before submitting another manual activity.",
        });
      } catch (cooldownError: any) {
        const message = String(cooldownError?.message || "");
        if (message.includes("external_activity_submissions.created_at")) {
          console.warn("[Submit External Activity] Cooldown skipped because created_at is missing on external_activity_submissions.");
        } else {
          throw cooldownError;
        }
      }

      if (input.sourceType === "medal_claim") {
        if (!input.externalEventName || !input.externalEventLocation) {
          throw new Error("External medal submissions need an event name and location.");
        }
        if (!input.evidenceImageBase64) {
          throw new Error("Please upload a medal picture for approval.");
        }
      }

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
        distance_km: isStairs ? 0 : input.distanceKm,
        source_type: input.sourceType || null,
        source_label: input.sourceType === "medal_claim" ? input.sourceLabel || "External Medal" : input.sourceLabel || null,
        external_event_name: input.externalEventName || null,
        external_event_location: input.externalEventLocation || null,
        evidence_path: evidencePath,
        evidence_mime_type: evidenceMimeType,
      };
      if (isStairs) {
        insertPayload.steps_count = input.stepsCount;
      }

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
