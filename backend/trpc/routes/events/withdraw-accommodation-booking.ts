import { z } from "zod";
import { publicProcedure } from "../../create-context";
import { resolveRideShareRegistrationId } from "./ride-share-utils";

export default publicProcedure
  .input(z.object({
    registrationId: z.string().min(1),
    bookingId: z.string().uuid(),
  }))
  .mutation(async ({ ctx, input }) => {
    const guestRegistrationId = await resolveRideShareRegistrationId(ctx, input.registrationId);

    const { data: booking, error: bookingError } = await ctx.supabase
      .from("event_accommodation_bookings")
      .select("accommodation_booking_id, accommodation_offer_id, guest_registration_id")
      .eq("accommodation_booking_id", input.bookingId)
      .maybeSingle();

    if (bookingError) throw new Error(bookingError.message || "Could not load this booking.");
    if (!booking || booking.guest_registration_id !== guestRegistrationId) {
      throw new Error("You can only withdraw your own accommodation request.");
    }

    const { error } = await ctx.supabase
      .from("event_accommodation_bookings")
      .update({ status: "withdrawn" })
      .eq("accommodation_booking_id", input.bookingId);

    if (error) throw new Error(error.message || "Could not withdraw this request.");

    await ctx.supabase
      .from("event_accommodation_offers")
      .update({ status: "active" })
      .eq("accommodation_offer_id", booking.accommodation_offer_id)
      .eq("status", "full");

    return { success: true };
  });
