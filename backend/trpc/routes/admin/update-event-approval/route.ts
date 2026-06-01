import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      eventId: z.string(),
      status: z.enum(["approved", "rejected"]),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const { data: event, error: eventError } = await ctx.supabase
      .from("events")
      .select("event_id, event_name, organizer, country_code, approval_status")
      .eq("event_id", input.eventId)
      .maybeSingle();

    if (eventError) {
      throw new Error(eventError.message || "Could not load the event for approval.");
    }

    if (!event) {
      throw new Error("Event not found.");
    }

    if (!event.organizer) {
      throw new Error("Only organizer-owned events require higher approval.");
    }

    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
      allowCountryCoordinator: true,
      countryCode: event.country_code ?? null,
    });

    if (input.status === "approved") {
      const { data: magazineSubmission, error: magazineError } = await ctx.supabase
        .from("magazine_article_submissions")
        .select("submission_id, status, title")
        .eq("event_id", input.eventId)
        .neq("status", "deleted")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (magazineError) {
        throw new Error(magazineError.message || "Could not check the linked magazine article approval.");
      }

      if (!magazineSubmission) {
        throw new Error("Please review the event magazine article in the Magazine tile before approving this event.");
      }

      if (magazineSubmission.status !== "accepted") {
        throw new Error("Approve the linked magazine article in the Magazine tile before approving this event.");
      }
    }

    const approvedAt = input.status === "approved" ? new Date().toISOString() : null;
    const approvedBy = input.status === "approved" ? actor.authUserId : null;

    const { data: updatedEvent, error: updateError } = await ctx.supabase
      .from("events")
      .update({
        approval_status: input.status,
        approved_at: approvedAt,
        approved_by: approvedBy,
      })
      .eq("event_id", input.eventId)
      .select()
      .maybeSingle();

    if (updateError) {
      throw new Error(updateError.message || "Could not update the event approval status.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: `event_${input.status}`,
      metadata: {
        eventId: input.eventId,
        eventName: event.event_name,
        organizerId: event.organizer,
        previousStatus: event.approval_status ?? null,
        nextStatus: input.status,
      },
    });

    return {
      success: true,
      status: input.status,
      event: updatedEvent,
    };
  });

