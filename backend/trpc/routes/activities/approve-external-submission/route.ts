import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      submissionId: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    try {
      console.log("[Approve External Submission] Starting approval...", input);

      const { data: submission, error: fetchError } = await ctx.supabase
        .from("external_activity_submissions")
        .select("*")
        .eq("SubmissionID", input.submissionId)
        .single();

      if (fetchError || !submission) {
        throw new Error("Submission not found");
      }

      const { data: lastActivity } = await ctx.supabase
        .from("activities")
        .select("ActivityID")
        .order("ActivityID", { ascending: false })
        .limit(1)
        .single();

      let newActivityId = "1";
      if (lastActivity?.ActivityID) {
        const lastNum = parseInt(lastActivity.ActivityID);
        if (!isNaN(lastNum)) {
          newActivityId = (lastNum + 1).toString();
        }
      }

      const startTimeParts = submission.Start_Time.split(":");
      const startHours = parseInt(startTimeParts[0]);
      const startMinutes = parseInt(startTimeParts[1]);
      const totalMinutes = startHours * 60 + startMinutes + submission.Duration_Minutes;
      const endHours = Math.floor(totalMinutes / 60) % 24;
      const endMinutes = totalMinutes % 60;
      const endTime = `${endHours.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}:00`;

      const paceKmH = submission.Distance_km / (submission.Duration_Minutes / 60);

      const { error: insertError } = await ctx.supabase
        .from("activities")
        .insert({
          ActivityID: newActivityId,
          RegistrationID: submission.RegistrationID,
          Activity_Date: submission.Activity_Date,
          Exercise_Type: submission.Exercise_Type,
          Distance_km: submission.Distance_km,
          Start_Time: submission.Start_Time,
          End_Time: endTime,
          Pace_km_h: paceKmH,
        });

      if (insertError) {
        console.error("[Approve External Submission] Insert error:", insertError);
        throw new Error(insertError.message || "Failed to create activity");
      }

      const { error: updateError } = await ctx.supabase
        .from("external_activity_submissions")
        .update({
          Status: "approved",
          Reviewed_At: new Date().toISOString(),
        })
        .eq("SubmissionID", input.submissionId);

      if (updateError) {
        console.error("[Approve External Submission] Update error:", updateError);
        throw new Error(updateError.message || "Failed to update submission status");
      }

      console.log("[Approve External Submission] Success");
      return { success: true };
    } catch (error: any) {
      console.error("[Approve External Submission] Error:", error);
      throw new Error(error.message || "Failed to approve submission");
    }
  });
