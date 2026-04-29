import { z } from "zod";
import { ensureActionCooldown } from "../../../abuse";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string(),
      activityDate: z.string(),
      exerciseType: z.enum(["Run", "Walk", "Treadmill"]),
      startTime: z.string(),
      duration: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, "Duration must be in HH:MM:SS format"),
      distanceKm: z.number().positive(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    try {
      await requireRegistrationOwner(ctx, input.registrationId);
      await ensureActionCooldown(ctx, {
        table: "external_activity_submissions",
        filters: [{ column: "registration_id", value: input.registrationId }],
        cooldownSeconds: 45,
        errorMessage: "Please wait a moment before submitting another manual activity.",
      });

      const { data, error } = await ctx.supabase
        .from("external_activity_submissions")
        .insert({
          registration_id: input.registrationId,
          activity_date: input.activityDate,
          exercise_type: input.exerciseType,
          start_time: input.startTime,
          duration: input.duration,
          distance_km: input.distanceKm,
        })
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
