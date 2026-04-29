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
    const mergedEvents = (data || []).map((event: any) => {
      const organizer = event.organizer ? organizerMap.get(event.organizer) : null;
      return {
        ...event,
        organizer_name: organizer?.organizer_name ?? null,
        organizer_country: organizer?.country ?? null,
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

