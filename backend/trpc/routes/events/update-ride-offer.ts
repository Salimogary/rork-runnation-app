import { z } from "zod";
import { publicProcedure } from "../../create-context";
import { requireActiveListingEntitlement } from "../../listing-entitlements";
import { resolveRideShareRegistrationId } from "./ride-share-utils";
import { isRideShareEventExpired } from "./ride-share-permissions";

const vehicleSeatLimits = {
  passenger_car_light: 7,
  van: 14,
  bus: 49,
} as const;

export default publicProcedure
  .input(z.object({
    registrationId: z.string().min(1),
    offerId: z.string().uuid(),
    eventId: z.string().min(1),
    availableSeats: z.number().int().min(1).max(49),
    vehicleType: z.enum(["passenger_car_light", "van", "bus"]).default("passenger_car_light"),
    departureTown: z.string().trim().min(2).max(120),
    departureAt: z.string().trim().min(8).max(40),
    departureMeetingPoint: z.string().trim().min(2).max(160),
    contact: z.string().trim().min(5).max(80),
    preferredContactMethod: z.enum(["calls_only", "whatsapp_only", "any"]).default("any"),
    driverSex: z.enum(["Male", "Female"]),
    bootSpace: z.enum(["none", "some"]).default("some"),
    requiresCommitmentFee: z.boolean().default(false),
    commitmentFee: z.number().min(0).max(10000000).default(0),
    farePerSeat: z.number().min(0).max(10000000),
    carType: z.string().trim().min(2).max(80),
    numberPlate: z.string().trim().min(2).max(32),
    preferredSex: z.enum(["Male", "Female", "Any"]).nullable().optional(),
  }).superRefine((input, ctx) => {
    const maxSeats = vehicleSeatLimits[input.vehicleType];
    if (input.availableSeats > maxSeats) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["availableSeats"],
        message: `Available seats cannot exceed ${maxSeats} for this car type.`,
      });
    }
    if (input.requiresCommitmentFee && input.commitmentFee <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commitmentFee"],
        message: "Commitment fee must be greater than 0 when required.",
      });
    }
  }))
  .mutation(async ({ ctx, input }) => {
    const driverRegistrationId = await resolveRideShareRegistrationId(ctx, input.registrationId);
    const entitlement = await requireActiveListingEntitlement(ctx, driverRegistrationId, "ride_share");

    const { data: offer, error: offerError } = await ctx.supabase
      .from("event_ride_offers")
      .select("ride_offer_id, driver_registration_id")
      .eq("ride_offer_id", input.offerId)
      .maybeSingle();

    if (offerError) throw new Error(offerError.message || "Could not load this car.");
    if (!offer || offer.driver_registration_id !== driverRegistrationId) {
      throw new Error("You can only edit your own car.");
    }

    const { data: event, error: eventError } = await ctx.supabase
      .from("events")
      .select("event_id, approval_status, starts_at, ends_at, event_type")
      .eq("event_id", input.eventId)
      .maybeSingle();

    if (eventError) throw new Error(eventError.message || "Could not verify this event.");
    if (!event?.event_id || event.approval_status !== "approved") {
      throw new Error("Choose an approved event before updating your car.");
    }
    if (isRideShareEventExpired(event)) {
      throw new Error("This run has already ended, so this car listing can no longer be updated.");
    }

    const departureDate = new Date(input.departureAt);
    if (Number.isNaN(departureDate.getTime())) {
      throw new Error("Enter a valid departure date and time.");
    }

    const { count, error: countError } = await ctx.supabase
      .from("event_ride_bookings")
      .select("ride_booking_id", { count: "exact", head: true })
      .eq("ride_offer_id", input.offerId)
      .eq("status", "confirmed");

    if (countError) throw new Error(countError.message || "Could not check confirmed bookings.");
    if ((count ?? 0) > input.availableSeats) {
      throw new Error(`Available seats cannot be less than confirmed bookings (${count ?? 0}).`);
    }

    const status = input.vehicleType === "passenger_car_light"
      ? (count ?? 0) >= input.availableSeats ? "full" : "active"
      : "pending_approval";
    const { error } = await ctx.supabase
      .from("event_ride_offers")
      .update({
        event_id: input.eventId,
        available_seats: input.availableSeats,
        vehicle_type: input.vehicleType,
        departure_town: input.departureTown,
        departure_at: departureDate.toISOString(),
        departure_meeting_point: input.departureMeetingPoint,
        driver_contact: input.contact,
        preferred_contact_method: input.preferredContactMethod,
        driver_sex: input.driverSex,
        boot_space: input.bootSpace,
        requires_commitment_fee: input.requiresCommitmentFee,
        commitment_fee: input.requiresCommitmentFee ? input.commitmentFee : 0,
        fare_per_seat: input.farePerSeat,
        car_type: input.carType,
        number_plate: input.numberPlate.trim().toUpperCase(),
        preferred_sex: input.preferredSex && input.preferredSex !== "Any" ? input.preferredSex : null,
        listing_entitlement_id: entitlement.entitlement_id,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("ride_offer_id", input.offerId);

    if (error) throw new Error(error.message || "Could not update your car.");

    return { success: true };
  });
