import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      submissionId: z.string(),
      adminNotes: z.string().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    try {
      console.log("[Reject External Submission] Starting rejection...", input);

      const { error } = await ctx.supabase
        .from("external_activity_submissions")
        .update({
          Status: "rejected",
          Reviewed_At: new Date().toISOString(),
          Admin_Notes: input.adminNotes || null,
        })
        .eq("SubmissionID", input.submissionId);

      if (error) {
        console.error("[Reject External Submission] Error:", error);
        throw new Error(error.message || "Failed to reject submission");
      }

      console.log("[Reject External Submission] Success");
      return { success: true };
    } catch (error: any) {
      console.error("[Reject External Submission] Error:", error);
      throw new Error(error.message || "Failed to reject submission");
    }
  });
