import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      enrollmentId: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    console.log('[rejectEnrollment] Rejecting enrollment:', input.enrollmentId);

    const { error } = await ctx.supabase
      .from("event_enrollments")
      .delete()
      .eq("event_enrollment_id", input.enrollmentId)
      .eq("status", "pending");

    if (error) {
      console.error('[rejectEnrollment] Error rejecting enrollment:', error);
      throw new Error(`Failed to reject enrollment: ${error.message}`);
    }

    console.log('[rejectEnrollment] Enrollment rejected successfully');
    return { success: true };
  });
