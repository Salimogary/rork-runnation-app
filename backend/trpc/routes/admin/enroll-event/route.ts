import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      eventId: z.string(),
      registrationId: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    console.log('[enrollEvent] Starting enrollment:', input);

    const { data: existingPendingEnrollment } = await ctx.supabase
      .from("Event Enrollments")
      .select("*")
      .eq("EventID", input.eventId)
      .eq("RegistrationID", input.registrationId)
      .maybeSingle();

    if (existingPendingEnrollment) {
      console.log('[enrollEvent] User already has pending enrollment');
      throw new Error('You already have a pending enrollment for this event');
    }

    const { data: existingParticipant } = await ctx.supabase
      .from("Event Participants")
      .select("*")
      .eq("eventId", input.eventId)
      .eq("RegistrationID", input.registrationId)
      .maybeSingle();

    if (existingParticipant) {
      console.log('[enrollEvent] User already approved as participant');
      throw new Error('You are already enrolled in this event');
    }

    const { data: userProfile } = await ctx.supabase
      .from("Registration Sample")
      .select('"First Name", "Other Names", Email')
      .eq("RegistrationID", input.registrationId)
      .maybeSingle();

    if (!userProfile) {
      console.error('[enrollEvent] User profile not found');
      throw new Error('User profile not found');
    }

    const { data, error } = await ctx.supabase
      .from("Event Enrollments")
      .insert({
        EventID: input.eventId,
        RegistrationID: input.registrationId,
        First_Name: userProfile["First Name"],
        Other_Names: userProfile["Other Names"] || '',
        Email: userProfile.Email || '',
        Status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('[enrollEvent] Error enrolling:', error);
      throw new Error(`Failed to enroll: ${error.message}`);
    }

    console.log('[enrollEvent] Enrollment submitted for approval:', data);
    return { success: true, enrollment: data };
  });
