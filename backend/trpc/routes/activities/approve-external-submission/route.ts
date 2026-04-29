import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      submissionId: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    try {
      await requireAdminPermission(ctx, {
        allowSuperAdmin: true,
              allowCountryCoordinator: true,
        allowClubCoordinator: true,
      });

      const { data: submission, error: fetchError } = await ctx.supabase
        .from("external_activity_submissions")
        .select("*")
        .eq("submission_id", input.submissionId)
        .single();

      if (fetchError || !submission) {
        throw new Error("Submission not found");
      }

      const durationParts = (submission.duration || "00:00:00").split(":");
      const durationHours = parseInt(durationParts[0] || "0");
      const durationMins = parseInt(durationParts[1] || "0");
      const durationSecs = parseInt(durationParts[2] || "0");
      const totalDurationMinutes = durationHours * 60 + durationMins + durationSecs / 60;

      const startTimeParts = submission.start_time.split(":");
      const startHours = parseInt(startTimeParts[0]);
      const startMinutes = parseInt(startTimeParts[1]);
      const totalMinutes = startHours * 60 + startMinutes + Math.round(totalDurationMinutes);
      const endHours = Math.floor(totalMinutes / 60) % 24;
      const endMinutes = totalMinutes % 60;
      const endTime = `${endHours.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}:00`;

      const paceKmH = totalDurationMinutes > 0 ? submission.distance_km / (totalDurationMinutes / 60) : 0;

      const { error: insertError } = await ctx.supabase
        .from("activities")
        .insert({
          registration_id: submission.registration_id,
          activity_date: submission.activity_date,
          exercise_type: submission.exercise_type,
          distance_km: submission.distance_km,
          start_time: submission.start_time,
          end_time: endTime,
          pace_km_h: paceKmH,
        });

      if (insertError) {
        console.error("[Approve External Submission] Insert error:", insertError);
        throw new Error(insertError.message || "Failed to create activity");
      }

      const { error: deleteError } = await ctx.supabase
        .from("external_activity_submissions")
        .delete()
        .eq("submission_id", input.submissionId);

      if (deleteError) {
        console.error("[Approve External Submission] Delete error:", deleteError);
      }

      return { success: true };
    } catch (error: any) {
      console.error("[Approve External Submission] Error:", error);
      throw new Error(error.message || "Failed to approve submission");
    }
  });

