import { z } from "zod";
import { publicProcedure } from "../../create-context";
import { resolveRideShareRegistrationId } from "./ride-share-utils";

export default publicProcedure
  .input(z.object({
    registrationId: z.string().min(1),
    bookingId: z.string().uuid(),
  }))
  .mutation(async ({ ctx, input }) => {
    const riderRegistrationId = await resolveRideShareRegistrationId(ctx, input.registrationId);

    const { data: booking, error: bookingError } = await ctx.supabase
      .from("event_ride_bookings")
      .select("ride_booking_id, ride_offer_id, rider_registration_id, status")
      .eq("ride_booking_id", input.bookingId)
      .maybeSingle();

    if (bookingError) throw new Error(bookingError.message || "Could not load this booking.");
    if (!booking || booking.rider_registration_id !== riderRegistrationId) {
      throw new Error("You can only withdraw your own ride request.");
    }

    const { error } = await ctx.supabase
      .from("event_ride_bookings")
      .update({ status: "withdrawn" })
      .eq("ride_booking_id", input.bookingId);

    if (error) throw new Error(error.message || "Could not withdraw this request.");

    await ctx.supabase
      .from("event_ride_offers")
      .update({ status: "active" })
      .eq("ride_offer_id", booking.ride_offer_id)
      .eq("status", "full");

    return { success: true };
  });
