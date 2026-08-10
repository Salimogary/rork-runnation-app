import { z } from "zod";
import { publicProcedure } from "../../create-context";
import { resolveRideShareRegistrationId } from "./ride-share-utils";
import { isRideShareEventExpired } from "./ride-share-permissions";

export default publicProcedure
  .input(z.object({
    registrationId: z.string().min(1),
    offerId: z.string().uuid(),
  }))
  .mutation(async ({ ctx, input }) => {
    const riderRegistrationId = await resolveRideShareRegistrationId(ctx, input.registrationId);

    const { data: offer, error: offerError } = await ctx.supabase
      .from("event_ride_offers")
      .select("ride_offer_id, event_id, driver_registration_id, available_seats, status")
      .eq("ride_offer_id", input.offerId)
      .maybeSingle();

    if (offerError) throw new Error(offerError.message || "Could not load this ride.");
    if (!offer || offer.status !== "active") throw new Error("This car is no longer taking requests.");
    if (offer.driver_registration_id === riderRegistrationId) throw new Error("You cannot book your own car.");

    const { data: event, error: eventError } = await ctx.supabase
      .from("events")
      .select("event_id, starts_at, ends_at, event_type")
      .eq("event_id", offer.event_id)
      .maybeSingle();

    if (eventError) throw new Error(eventError.message || "Could not verify this run.");
    if (isRideShareEventExpired(event)) {
      await ctx.supabase.from("event_ride_offers").update({ status: "archived" }).eq("ride_offer_id", input.offerId);
      throw new Error("This run has already ended, so this car is no longer available.");
    }

    const { data: existing, error: existingError } = await ctx.supabase
      .from("event_ride_bookings")
      .select("ride_booking_id, status")
      .eq("ride_offer_id", input.offerId)
      .eq("rider_registration_id", riderRegistrationId)
      .in("status", ["pending", "confirmed"])
      .maybeSingle();

    if (existingError) throw new Error(existingError.message || "Could not check your booking.");
    if (existing) throw new Error("You already have a request for this car.");

    const { count, error: countError } = await ctx.supabase
      .from("event_ride_bookings")
      .select("ride_booking_id", { count: "exact", head: true })
      .eq("ride_offer_id", input.offerId)
      .eq("status", "confirmed");

    if (countError) throw new Error(countError.message || "Could not check available seats.");
    if ((count ?? 0) >= Number(offer.available_seats || 0)) {
      await ctx.supabase.from("event_ride_offers").update({ status: "full" }).eq("ride_offer_id", input.offerId);
      throw new Error("This car is already full.");
    }

    const { data, error } = await ctx.supabase
      .from("event_ride_bookings")
      .insert({
        ride_offer_id: input.offerId,
        rider_registration_id: riderRegistrationId,
      })
      .select("ride_booking_id")
      .single();

    if (error) throw new Error(error.message || "Could not request this ride.");

    return { success: true, bookingId: data.ride_booking_id };
  });
