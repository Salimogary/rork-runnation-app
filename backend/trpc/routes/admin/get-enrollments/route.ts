import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      eventId: z.string().optional(),
    })
  )
  .query(async ({ ctx, input }) => {
    console.log('[getEnrollments] Fetching enrollments for event:', input.eventId);

    let query = ctx.supabase
      .from("event_enrollments")
      .select(`
        event_enrollment_id,
        event_id,
        first_name,
        other_names,
        email,
        enrolled_at
      `)
      .order('enrolled_at', { ascending: false });

    if (input.eventId) {
      query = query.eq('event_id', input.eventId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[getEnrollments] Error fetching enrollments:', error);
      throw new Error(`Failed to fetch enrollments: ${error.message}`);
    }

    console.log('[getEnrollments] Fetched enrollments:', data?.length || 0);
    return data || [];
  });
