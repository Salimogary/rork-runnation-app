import { z } from "zod";
import { publicProcedure } from "../../create-context";
import { isRideShareEventExpired } from "./ride-share-permissions";
import { resolveRideShareRegistrationId } from "./ride-share-utils";

export default publicProcedure
  .input(z.object({
    registrationId: z.string().min(1),
    offerId: z.string().uuid(),
    occupants: z.array(z.object({
      name: z.string().trim().min(2).max(80),
      sex: z.enum(["Male", "Female"]),
    })).min(1).max(20),
  }))
  .mutation(async ({ ctx, input }) => {
    const guestRegistrationId = await resolveRideShareRegistrationId(ctx, input.registrationId);

    const { data: offer, error: offerError } = await ctx.supabase
      .from("event_accommodation_offers")
      .select("accommodation_offer_id, event_id, host_registration_id, rooms_available, status")
      .eq("accommodation_offer_id", input.offerId)
      .maybeSingle();

    if (offerError) throw new Error(offerError.message || "Could not load this accommodation.");
    if (!offer || offer.status !== "active") throw new Error("This accommodation is no longer taking bookings.");
    if (offer.host_registration_id === guestRegistrationId) throw new Error("You cannot book your own accommodation.");

    const { data: event, error: eventError } = await ctx.supabase
      .from("events")
      .select("event_id, starts_at, ends_at, event_type")
      .eq("event_id", offer.event_id)
      .maybeSingle();

    if (eventError) throw new Error(eventError.message || "Could not verify this run.");
    if (isRideShareEventExpired(event)) {
      await ctx.supabase.from("event_accommodation_offers").update({ status: "archived" }).eq("accommodation_offer_id", input.offerId);
      throw new Error("This run has already ended, so this accommodation is no longer available.");
    }

    const { data: existing, error: existingError } = await ctx.supabase
      .from("event_accommodation_bookings")
      .select("accommodation_booking_id, status")
      .eq("accommodation_offer_id", input.offerId)
      .eq("guest_registration_id", guestRegistrationId)
      .in("status", ["pending", "confirmed"])
      .maybeSingle();

    if (existingError) throw new Error(existingError.message || "Could not check your booking.");
    if (existing) throw new Error("You already have a request for this accommodation.");

    const { data: confirmedRows, error: countError } = await ctx.supabase
      .from("event_accommodation_bookings")
      .select("occupant_count")
      .eq("accommodation_offer_id", input.offerId)
      .eq("status", "confirmed");

    if (countError) throw new Error(countError.message || "Could not check available rooms.");
    const confirmedOccupants = (confirmedRows ?? []).reduce((sum: number, booking: any) => sum + Number(booking.occupant_count || 1), 0);
    if (confirmedOccupants + input.occupants.length > Number(offer.rooms_available || 0)) {
      await ctx.supabase.from("event_accommodation_offers").update({ status: "full" }).eq("accommodation_offer_id", input.offerId);
      throw new Error("This accommodation does not have enough spaces for all occupants.");
    }

    const { data, error } = await ctx.supabase
      .from("event_accommodation_bookings")
      .insert({
        accommodation_offer_id: input.offerId,
        guest_registration_id: guestRegistrationId,
        occupant_count: input.occupants.length,
        occupants: input.occupants,
      })
      .select("accommodation_booking_id")
      .single();

    if (error) throw new Error(error.message || "Could not request this accommodation.");

    return { success: true, bookingId: data.accommodation_booking_id };
  });
