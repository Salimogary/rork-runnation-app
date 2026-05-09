import { publicProcedure } from "../../../create-context";
import { TRPCError } from "@trpc/server";
import { requireAdminPermission } from "../../../rbac";

export default publicProcedure.query(async ({ ctx }) => {
  console.log('[getEvents] Starting query...');
  
  try {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
      allowEventOrganizer: true,
    });

    let eventsQuery = ctx.supabase
      .from("events")
      .select("*")
      .order("starts_at", { ascending: false });

    const shouldRestrictToOrganizerScope =
      actor.isEventOrganizer &&
      !actor.isSuperAdmin &&
      !actor.isCountryAdmin &&
      !actor.isCountryCoordinator &&
      !actor.isClubCoordinator;

    const organizerScopes = actor.roles
      .filter((role) => role.roleName === "event_organizer" && role.organizerId)
      .map((role) => role.organizerId as string);

    if (shouldRestrictToOrganizerScope) {
      if (organizerScopes.length === 0) {
        return [];
      }
      eventsQuery = eventsQuery.in("organizer", organizerScopes);
    }

    const { data, error } = await eventsQuery;

    console.log('[getEvents] Query result:', { dataCount: data?.length, error });

    if (error) {
      console.error('[getEvents] Supabase error:', error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to fetch events: ${error.message}`,
        cause: error,
      });
    }
    
    const organizerIds = [...new Set((data ?? []).map((event: any) => event.organizer).filter(Boolean))];
    const { data: organizers, error: organizersError } = organizerIds.length
      ? await ctx.supabase
          .from("event_organizers")
          .select("organizer_id, organizer_name, country")
          .in("organizer_id", organizerIds)
      : { data: [], error: null };

    if (organizersError) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to fetch event organizers: ${organizersError.message}`,
        cause: organizersError,
      });
    }

    const organizerMap = new Map((organizers ?? []).map((organizer: any) => [organizer.organizer_id, organizer]));
    const eventIds = (data ?? []).map((event: any) => String(event.event_id || "")).filter(Boolean);
    const { data: magazineSubmissions, error: magazineError } = eventIds.length
      ? await ctx.supabase
          .from("magazine_article_submissions")
          .select("submission_id, status, event_id, title, created_at")
          .in("event_id", eventIds)
          .neq("status", "deleted")
          .order("created_at", { ascending: false })
      : { data: [], error: null };

    if (magazineError) {
      console.warn("[getEvents] Could not fetch linked magazine submissions:", magazineError);
    }

    const magazineMap = new Map<string, any>();
    (magazineError ? [] : magazineSubmissions ?? []).forEach((submission: any) => {
      const eventId = String(submission.event_id || "");
      if (eventId && !magazineMap.has(eventId)) {
        magazineMap.set(eventId, submission);
      }
    });

    const mergedEvents = (data || []).map((event: any) => {
      const organizer = event.organizer ? organizerMap.get(event.organizer) : null;
      const magazineSubmission = magazineMap.get(String(event.event_id || "")) ?? null;
      return {
        ...event,
        organizer_name: organizer?.organizer_name ?? null,
        organizer_country: organizer?.country ?? null,
        magazine_submission_id: magazineSubmission?.submission_id ?? null,
        magazine_submission_status: magazineSubmission?.status ?? null,
        magazine_article_title: magazineSubmission?.title ?? null,
      };
    });

    console.log('[getEvents] Returning', mergedEvents.length || 0, 'events');
    return mergedEvents;
  } catch (err: any) {
    console.error('[getEvents] Catch block error:', err);
    
    if (err instanceof TRPCError) {
      throw err;
    }
    
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: err?.message || "Failed to fetch events",
      cause: err,
    });
  }
});

