import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      enrollmentId: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    console.log('[approveEnrollment] Approving enrollment:', input.enrollmentId);

    const { data: enrollment, error: fetchError } = await ctx.supabase
      .from("event_enrollments")
      .select("*")
      .eq("EnrollmentID", input.enrollmentId)
      .eq("Status", "pending")
      .maybeSingle();

    if (fetchError) {
      console.error('[approveEnrollment] Error fetching enrollment:', fetchError);
      throw new Error(`Failed to fetch enrollment: ${fetchError.message}`);
    }

    if (!enrollment) {
      console.error('[approveEnrollment] Enrollment not found or already processed');
      throw new Error('Enrollment not found or already processed');
    }

    const { data: participant, error: insertError } = await ctx.supabase
      .from("events_participants")
      .insert({
        eventId: enrollment.EventID,
        RegistrationID: enrollment.RegistrationID,
        Registration_Date: new Date().toISOString(),
        Status: 'registered',
        Days_Completed: 0,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[approveEnrollment] Error creating participant:', insertError);
      throw new Error(`Failed to create participant: ${insertError.message}`);
    }

    const { error: deleteError } = await ctx.supabase
      .from("event_enrollments")
      .delete()
      .eq("EnrollmentID", input.enrollmentId);

    if (deleteError) {
      console.error('[approveEnrollment] Error deleting enrollment:', deleteError);
    }

    console.log('[approveEnrollment] Enrollment approved successfully:', participant);
    return { success: true, participant };
  });
