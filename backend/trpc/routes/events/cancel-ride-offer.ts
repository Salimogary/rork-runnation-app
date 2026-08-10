import { z } from "zod";
import { publicProcedure } from "../../create-context";
import { resolveRideShareRegistrationId } from "./ride-share-utils";

export default publicProcedure
  .input(z.object({
    registrationId: z.string().min(1),
    offerId: z.string().uuid(),
  }))
  .mutation(async ({ ctx, input }) => {
    const driverRegistrationId = await resolveRideShareRegistrationId(ctx, input.registrationId);

    const { data: offer, error: offerError } = await ctx.supabase
      .from("event_ride_offers")
      .select("ride_offer_id, driver_registration_id")
      .eq("ride_offer_id", input.offerId)
      .maybeSingle();

    if (offerError) throw new Error(offerError.message || "Could not load this car.");
    if (!offer || offer.driver_registration_id !== driverRegistrationId) {
      throw new Error("Only the car owner can cancel this car listing.");
    }

    const { error } = await ctx.supabase
      .from("event_ride_offers")
      .update({ status: "cancelled" })
      .eq("ride_offer_id", input.offerId);

    if (error) throw new Error(error.message || "Could not cancel this car listing.");

    await ctx.supabase
      .from("event_ride_bookings")
      .update({ status: "cancelled" })
      .eq("ride_offer_id", input.offerId)
      .in("status", ["pending", "confirmed"]);

    return { success: true };
  });
