import { z } from "zod";
import { publicProcedure } from "../../create-context";
import { requireActiveListingEntitlement } from "../../listing-entitlements";
import { isRideShareEventExpired } from "./ride-share-permissions";
import { resolveRideShareRegistrationId } from "./ride-share-utils";

export default publicProcedure
  .input(z.object({
    registrationId: z.string().min(1),
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
    const entitlement = await requireActiveListingEntitlement(ctx, hostRegistrationId, "accommodation");

    const { data: event, error: eventError } = await ctx.supabase
      .from("events")
      .select("event_id, approval_status, starts_at, ends_at, event_type")
      .eq("event_id", input.eventId)
      .maybeSingle();

    if (eventError) throw new Error(eventError.message || "Could not verify this event.");
    if (!event?.event_id || event.approval_status !== "approved") {
      throw new Error("Choose an approved event before listing accommodation.");
    }
    if (isRideShareEventExpired(event)) {
      throw new Error("This run has already ended, so accommodation can no longer be listed.");
    }

    const { data, error } = await ctx.supabase
      .from("event_accommodation_offers")
      .insert({
        event_id: input.eventId,
        host_registration_id: hostRegistrationId,
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
        listing_entitlement_id: entitlement.entitlement_id,
        status: "active",
      })
      .select("accommodation_offer_id")
      .single();

    if (error) throw new Error(error.message || "Could not list accommodation.");

    return { success: true, offerId: data.accommodation_offer_id };
  });
