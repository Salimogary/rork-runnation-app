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
      .from("event_enrollments")
      .select("*")
      .eq("event_id", input.eventId)
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (existingPendingEnrollment) {
      console.log('[enrollEvent] User already has pending enrollment');
      throw new Error('You already have a pending enrollment for this event');
    }

    const { data: existingParticipant } = await ctx.supabase
      .from("events_participants")
      .select("*")
      .eq("event_id", input.eventId)
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (existingParticipant) {
      console.log('[enrollEvent] User already approved as participant');
      throw new Error('You are already enrolled in this event');
    }

    const { data: userProfile } = await ctx.supabase
      .from("registrations")
      .select('first_name, other_names, email')
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (!userProfile) {
      console.error('[enrollEvent] User profile not found');
      throw new Error('User profile not found');
    }

    const { data, error } = await ctx.supabase
      .from("event_enrollments")
      .insert({
        event_id: input.eventId,
        registration_id: input.registrationId,
        first_name: userProfile.first_name,
        other_names: userProfile.other_names || '',
        email: userProfile.email || '',
        status: 'pending',
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
