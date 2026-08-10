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
    const hostRegistrationId = await resolveRideShareRegistrationId(ctx, input.registrationId);

    const { data: booking, error: bookingError } = await ctx.supabase
      .from("event_accommodation_bookings")
      .select("accommodation_booking_id, accommodation_offer_id, guest_registration_id, occupant_count, status, event_accommodation_offers!inner(host_registration_id, rooms_available, status)")
      .eq("accommodation_booking_id", input.bookingId)
      .maybeSingle();

    if (bookingError) throw new Error(bookingError.message || "Could not load this booking.");
    const offer = Array.isArray((booking as any)?.event_accommodation_offers)
      ? (booking as any).event_accommodation_offers[0]
      : (booking as any)?.event_accommodation_offers;
    if (!booking || offer?.host_registration_id !== hostRegistrationId) {
      throw new Error("Only the accommodation owner can update booking requests.");
    }
    if (input.decision === "confirmed" && offer?.status !== "active" && offer?.status !== "full") {
      throw new Error("This accommodation must be visible before bookings can be accepted.");
    }

    if (input.decision === "confirmed") {
      const { data: confirmedRows, error: countError } = await ctx.supabase
        .from("event_accommodation_bookings")
        .select("occupant_count")
        .eq("accommodation_offer_id", booking.accommodation_offer_id)
        .eq("status", "confirmed");

      if (countError) throw new Error(countError.message || "Could not check available rooms.");
      const confirmedOccupants = (confirmedRows ?? []).reduce((sum: number, row: any) => sum + Number(row.occupant_count || 1), 0);
      const requestedOccupants = Number((booking as any).occupant_count || 1);
      if (confirmedOccupants + requestedOccupants > Number(offer.rooms_available || 0) && booking.status !== "confirmed") {
        throw new Error("This accommodation does not have enough spaces.");
      }
    }

    const { error } = await ctx.supabase
      .from("event_accommodation_bookings")
      .update({ status: input.decision })
      .eq("accommodation_booking_id", input.bookingId);

    if (error) throw new Error(error.message || "Could not update this request.");

    const { data: confirmedRows } = await ctx.supabase
      .from("event_accommodation_bookings")
      .select("occupant_count")
      .eq("accommodation_offer_id", booking.accommodation_offer_id)
      .eq("status", "confirmed");
    const confirmedOccupants = (confirmedRows ?? []).reduce((sum: number, row: any) => sum + Number(row.occupant_count || 1), 0);

    await ctx.supabase
      .from("event_accommodation_offers")
      .update({ status: confirmedOccupants >= Number(offer.rooms_available || 0) ? "full" : "active" })
      .eq("accommodation_offer_id", booking.accommodation_offer_id);

    return { success: true };
  });
