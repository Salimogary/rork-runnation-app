import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      eventId: z.string().optional(),
    })
  )
  .query(async ({ ctx, input }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
      allowSpecialClubCoordinator: true,
      allowEventOrganizer: true,
    });

    console.log('[getEnrollments] Fetching enrollments for event:', input.eventId);

    let query = ctx.supabase
      .from("event_enrollments")
      .select(`
        event_enrollment_id,
        event_id,
        registration_id,
        first_name,
        other_names,
        email,
        enrolled_at,
        status
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

    const enrollments = data || [];
    const organizerScopes = actor.roles
      .filter((role) => role.roleName === "event_organizer" && role.organizerId)
      .map((role) => role.organizerId as string);
    const isOrganizerOnly =
      actor.isEventOrganizer &&
      !actor.isSuperAdmin &&
      !actor.isCountryAdmin &&
      !actor.isCountryCoordinator &&
      !actor.isClubCoordinator &&
      !actor.isSpecialClubCoordinator;

    if (!isOrganizerOnly || enrollments.length === 0) {
      console.log('[getEnrollments] Fetched enrollments:', enrollments.length);
      return enrollments;
    }

    if (organizerScopes.length === 0) {
      return [];
    }

    const eventIds = [...new Set(enrollments.map((enrollment: any) => enrollment.event_id).filter(Boolean))];
    const { data: events, error: eventsError } = await ctx.supabase
      .from("events")
      .select("event_id, organizer")
      .in("event_id", eventIds);

    if (eventsError) {
      throw new Error(eventsError.message || "Could not verify enrollment ownership.");
    }

    const visibleEventIds = new Set(
      (events || [])
        .filter((event: any) => event.organizer && organizerScopes.includes(event.organizer))
        .map((event: any) => event.event_id)
    );

    const filteredEnrollments = enrollments.filter((enrollment: any) => visibleEventIds.has(enrollment.event_id));
    console.log('[getEnrollments] Fetched organizer-scoped enrollments:', filteredEnrollments.length);
    return filteredEnrollments;
  });



