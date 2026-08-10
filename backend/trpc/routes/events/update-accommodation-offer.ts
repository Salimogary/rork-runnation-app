import { z } from "zod";
import { publicProcedure } from "../../create-context";
import { isRideShareEventExpired } from "./ride-share-permissions";
import { resolveRideShareRegistrationId } from "./ride-share-utils";

export default publicProcedure
  .input(z.object({
    registrationId: z.string().min(1),
    offerId: z.string().uuid(),
    eventId: z.string().min(1),
    accommodationName: z.string().trim().min(2).max(120),
    locationName: z.string().trim().min(2).max(160),
    accommodationType: z.enum(["single", "shared", "mixed"]),
    lodgingTypes: z.array(z.enum(["private_home", "airbnb", "guest_house", "motel", "hotel", "campsite", "other"])).default([]),
    roomsAvailable: z.number().int().min(1).max(100),
    locationPin: z.string().trim().max(500).optional().nullable(),
    pricePerRoom: z.number().int().min(0).max(10000000),
    roomDescription: z.string().trim().min(5).max(800),
    notPermitted: z.string().trim().max(500).optional().nullable(),
    features: z.array(z.enum(["breakfast", "security_guard", "access_24_7", "restaurant", "parking", "cctv", "reception_24_7"])).default([]),
    contact: z.string().trim().min(5).max(80),
    preferredContactMethod: z.enum(["calls_only", "whatsapp_only", "any"]).default("any"),
    preferredGuestSex: z.enum(["Male", "Female", "Any"]).nullable().optional(),
    requiresCommitmentFee: z.boolean().default(false),
    commitmentFee: z.number().int().min(0).max(10000000).default(0),
  }).superRefine((input, ctx) => {
    if (input.requiresCommitmentFee && input.commitmentFee <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commitmentFee"],
        message: "Commitment fee must be greater than 0 when required.",
      });
    }
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
      throw new Error("You can only edit your own accommodation listing.");
    }

    const { data: event, error: eventError } = await ctx.supabase
      .from("events")
      .select("event_id, approval_status, starts_at, ends_at, event_type")
      .eq("event_id", input.eventId)
      .maybeSingle();

    if (eventError) throw new Error(eventError.message || "Could not verify this event.");
    if (!event?.event_id || event.approval_status !== "approved") {
      throw new Error("Choose an approved event before updating accommodation.");
    }
    if (isRideShareEventExpired(event)) {
      throw new Error("This run has already ended, so this accommodation listing can no longer be updated.");
    }

    const { data: confirmedRows, error: countError } = await ctx.supabase
      .from("event_accommodation_bookings")
      .select("occupant_count")
      .eq("accommodation_offer_id", input.offerId)
      .eq("status", "confirmed");

    if (countError) throw new Error(countError.message || "Could not check confirmed bookings.");
    const confirmedOccupants = (confirmedRows ?? []).reduce((sum: number, booking: any) => sum + Number(booking.occupant_count || 1), 0);
    if (confirmedOccupants > input.roomsAvailable) {
      throw new Error(`Available spaces cannot be less than confirmed occupants (${confirmedOccupants}).`);
    }

    const { error } = await ctx.supabase
      .from("event_accommodation_offers")
      .update({
        event_id: input.eventId,
        accommodation_name: input.accommodationName,
        location_name: input.locationName,
        accommodation_type: input.accommodationType,
        lodging_types: input.lodgingTypes,
        rooms_available: input.roomsAvailable,
        location_pin: input.locationPin?.trim() || null,
        price_per_room: input.pricePerRoom,
        room_description: input.roomDescription,
        not_permitted: input.notPermitted?.trim() || null,
        features: input.features,
        host_contact: input.contact,
        preferred_contact_method: input.preferredContactMethod,
        preferred_guest_sex: input.preferredGuestSex && input.preferredGuestSex !== "Any" ? input.preferredGuestSex : null,
        requires_commitment_fee: input.requiresCommitmentFee,
        commitment_fee: input.requiresCommitmentFee ? input.commitmentFee : 0,
        status: confirmedOccupants >= input.roomsAvailable ? "full" : "active",
        updated_at: new Date().toISOString(),
      })
      .eq("accommodation_offer_id", input.offerId);

    if (error) throw new Error(error.message || "Could not update accommodation.");

    return { success: true };
  });
