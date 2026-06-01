import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(z.object({ eventId: z.string().min(1) }))
  .mutation(async ({ input, ctx }) => {
    const { data: event, error: eventError } = await ctx.supabase
      .from("events")
      .select("event_id, event_name, organizer, country_code, approval_status")
      .eq("event_id", input.eventId)
      .maybeSingle();

    if (eventError) {
      throw new Error(eventError.message || "Could not load event.");
    }

    if (!event) {
      throw new Error("Event not found.");
    }

    if (event.approval_status !== "rejected") {
      throw new Error("Only rejected events can be deleted from the dashboard.");
    }

    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
      allowSpecialClubCoordinator: true,
      allowEventOrganizer: true,
      countryCode: event.country_code ?? null,
    });

    const organizerScopes = actor.roles
      .filter((role) => role.roleName === "event_organizer" && role.organizerId)
      .map((role) => role.organizerId as string);
    const hasOrganizerOnlyAccess =
      actor.isEventOrganizer &&
      !actor.isSuperAdmin &&
      !actor.isCountryAdmin &&
      !actor.isCountryCoordinator &&
      !actor.isClubCoordinator &&
      !actor.isSpecialClubCoordinator;

    if (hasOrganizerOnlyAccess && (!event.organizer || !organizerScopes.includes(event.organizer))) {
      throw new Error("You can only delete rejected events from your own organizer profile.");
    }

    const { count: participantCount, error: participantError } = await ctx.supabase
      .from("events_participants")
      .select("event_participant_id", { count: "exact", head: true })
      .eq("event_id", input.eventId);

    if (participantError) {
      throw new Error(participantError.message || "Could not check event participants.");
    }

    if ((participantCount ?? 0) > 0) {
      throw new Error("This event has participants and cannot be deleted.");
    }

    await ctx.supabase
      .from("magazine_article_submissions")
      .update({
        status: "deleted",
        reviewed_by: actor.authUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("event_id", input.eventId);

    const { error: deleteError } = await ctx.supabase
      .from("events")
      .delete()
      .eq("event_id", input.eventId);

    if (deleteError) {
      throw new Error(deleteError.message || "Could not delete event.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "delete_rejected_event",
      metadata: {
        eventId: event.event_id,
        eventName: event.event_name,
        organizerId: event.organizer,
      },
    });

    return { success: true, eventId: input.eventId };
  });


