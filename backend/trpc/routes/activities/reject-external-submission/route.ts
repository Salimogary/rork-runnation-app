import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      submissionId: z.string(),
      adminNotes: z.string().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    try {
      await requireAdminPermission(ctx, {
        allowSuperAdmin: true,
              allowCountryCoordinator: true,
        allowClubCoordinator: true,
      });

      const { error } = await ctx.supabase
        .from("external_activity_submissions")
        .delete()
        .eq("submission_id", input.submissionId);

      if (error) {
        console.error("[Reject External Submission] Error:", error);
        throw new Error(error.message || "Failed to reject submission");
      }

      return { success: true };
    } catch (error: any) {
      console.error("[Reject External Submission] Error:", error);
      throw new Error(error.message || "Failed to reject submission");
    }
  });

