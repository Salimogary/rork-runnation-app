import { z } from "zod";
import { publicProcedure } from "../../create-context";
import { resolveRideShareRegistrationId } from "./ride-share-utils";

export default publicProcedure
  .input(z.object({
    registrationId: z.string().min(1),
    bookingId: z.string().uuid(),
    decision: z.enum(["confirmed", "rejected"]),
  }))
  .mutation(async ({ ctx, input }) => {
    const driverRegistrationId = await resolveRideShareRegistrationId(ctx, input.registrationId);

    const { data: booking, error: bookingError } = await ctx.supabase
      .from("event_ride_bookings")
      .select("ride_booking_id, ride_offer_id, rider_registration_id, status, event_ride_offers!inner(driver_registration_id, available_seats, status)")
      .eq("ride_booking_id", input.bookingId)
      .maybeSingle();

    if (bookingError) throw new Error(bookingError.message || "Could not load this booking.");
    const offer = Array.isArray((booking as any)?.event_ride_offers)
      ? (booking as any).event_ride_offers[0]
      : (booking as any)?.event_ride_offers;
    if (!booking || offer?.driver_registration_id !== driverRegistrationId) {
      throw new Error("Only the car owner can update ride requests.");
    }
    if (input.decision === "confirmed" && offer?.status !== "active" && offer?.status !== "full") {
      throw new Error("This car must be approved and visible before bookings can be accepted.");
    }

    if (input.decision === "confirmed") {
      const { count, error: countError } = await ctx.supabase
        .from("event_ride_bookings")
        .select("ride_booking_id", { count: "exact", head: true })
        .eq("ride_offer_id", booking.ride_offer_id)
        .eq("status", "confirmed");

      if (countError) throw new Error(countError.message || "Could not check available seats.");
      if ((count ?? 0) >= Number(offer.available_seats || 0) && booking.status !== "confirmed") {
        throw new Error("This car is already full.");
      }
    }

    const { error } = await ctx.supabase
      .from("event_ride_bookings")
      .update({ status: input.decision })
      .eq("ride_booking_id", input.bookingId);

    if (error) throw new Error(error.message || "Could not update this request.");

    const { count: confirmedCount } = await ctx.supabase
      .from("event_ride_bookings")
      .select("ride_booking_id", { count: "exact", head: true })
      .eq("ride_offer_id", booking.ride_offer_id)
      .eq("status", "confirmed");

    if ((confirmedCount ?? 0) >= Number(offer.available_seats || 0)) {
      await ctx.supabase.from("event_ride_offers").update({ status: "full" }).eq("ride_offer_id", booking.ride_offer_id);
    } else {
      await ctx.supabase.from("event_ride_offers").update({ status: "active" }).eq("ride_offer_id", booking.ride_offer_id);
    }

    return { success: true };
  });
