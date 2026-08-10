import { z } from "zod";
import { publicProcedure } from "../../create-context";
import { resolveRideShareRegistrationId } from "./ride-share-utils";

export default publicProcedure
  .input(z.object({
    registrationId: z.string().min(1),
    offerId: z.string().uuid(),
  }))
  .mutation(async ({ ctx, input }) => {
    const hostRegistrationId = await resolveRideShareRegistrationId(ctx, input.registrationId);

    const { data: offer, error: offerError } = await ctx.supabase
      .from("event_accommodation_offers")
      .select("accommodation_offer_id, host_registration_id")
      .eq("accommodation_offer_id", input.offerId)
      .maybeSingle();

    if (offerError) throw new Error(offerError.message || "Could not load this accommodation.");
    if (!offer || offer.host_registration_id !== hostRegistrationId) {
      throw new Error("Only the accommodation owner can cancel this listing.");
    }

    const { error } = await ctx.supabase
      .from("event_accommodation_offers")
      .update({ status: "cancelled" })
      .eq("accommodation_offer_id", input.offerId);

    if (error) throw new Error(error.message || "Could not cancel this accommodation.");

    await ctx.supabase
      .from("event_accommodation_bookings")
      .update({ status: "cancelled" })
      .eq("accommodation_offer_id", input.offerId)
      .in("status", ["pending", "confirmed"]);

    return { success: true };
  });
