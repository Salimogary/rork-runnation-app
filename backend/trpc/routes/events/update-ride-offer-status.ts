import { z } from "zod";
import { publicProcedure } from "../../create-context";
import { logAdminAction } from "../../rbac";
import { resolveRideShareRegistrationId } from "./ride-share-utils";
import { getRideShareModerator } from "./ride-share-permissions";

export default publicProcedure
  .input(z.object({
    registrationId: z.string().min(1),
    offerId: z.string().uuid(),
    action: z.enum(["approve", "hide", "unhide", "delete"]),
    reason: z.string().trim().max(300).optional().nullable(),
  }))
  .mutation(async ({ ctx, input }) => {
    const viewerRegistrationId = await resolveRideShareRegistrationId(ctx, input.registrationId);

    const { data: offer, error: offerError } = await ctx.supabase
      .from("event_ride_offers")
      .select("ride_offer_id, event_id, driver_registration_id, available_seats, status")
      .eq("ride_offer_id", input.offerId)
      .maybeSingle();

    if (offerError) throw new Error(offerError.message || "Could not load this car.");
    if (!offer) throw new Error("This car listing was not found.");

    const { data: event, error: eventError } = await ctx.supabase
      .from("events")
      .select("event_id, organizer, country_code, country")
      .eq("event_id", offer.event_id)
      .maybeSingle();

    if (eventError) throw new Error(eventError.message || "Could not verify this event.");

    const { actor, canModerate } = await getRideShareModerator(ctx, event);
    const isDriver = offer.driver_registration_id === viewerRegistrationId;
    if (!isDriver && !canModerate) {
      throw new Error("You do not have permission to update this car listing.");
    }

    const reason = input.reason?.trim() || null;
    if (!isDriver && (input.action === "hide" || input.action === "delete") && !reason) {
      throw new Error("Please provide a reason for moderating this car listing.");
    }
    if (input.action === "approve" && !canModerate) {
      throw new Error("Only an event organizer or admin can approve van and bus listings.");
    }

    let nextStatus: string;
    if (input.action === "approve") {
      const { count, error: countError } = await ctx.supabase
        .from("event_ride_bookings")
        .select("ride_booking_id", { count: "exact", head: true })
        .eq("ride_offer_id", input.offerId)
        .eq("status", "confirmed");

      if (countError) throw new Error(countError.message || "Could not check confirmed bookings.");
      nextStatus = (count ?? 0) >= Number(offer.available_seats || 0) ? "full" : "active";
    } else if (input.action === "hide") {
      nextStatus = "hidden";
    } else if (input.action === "unhide") {
      const { count, error: countError } = await ctx.supabase
        .from("event_ride_bookings")
        .select("ride_booking_id", { count: "exact", head: true })
        .eq("ride_offer_id", input.offerId)
        .eq("status", "confirmed");

      if (countError) throw new Error(countError.message || "Could not check confirmed bookings.");
      nextStatus = (count ?? 0) >= Number(offer.available_seats || 0) ? "full" : "active";
    } else {
      nextStatus = "deleted";
    }

    const { error } = await ctx.supabase
      .from("event_ride_offers")
      .update({
        status: nextStatus,
        moderation_reason: reason,
        moderated_by: !isDriver ? actor.authUserId : null,
        moderated_at: !isDriver ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("ride_offer_id", input.offerId);

    if (error) throw new Error(error.message || "Could not update this car listing.");

    if (input.action === "delete") {
      await ctx.supabase
        .from("event_ride_bookings")
        .update({ status: "cancelled" })
        .eq("ride_offer_id", input.offerId)
        .in("status", ["pending", "confirmed"]);
    }

    if (!isDriver) {
      await logAdminAction(ctx, {
        actorUserId: actor.authUserId,
        actionType: `ride_share_${input.action}`,
        targetUserId: offer.driver_registration_id,
        metadata: {
          offerId: input.offerId,
          eventId: offer.event_id,
          reason,
          nextStatus,
        },
      });
    }

    return { success: true, status: nextStatus };
  });
