import { z } from "zod";
import { publicProcedure } from "../../create-context";
import { getRideSharePeople, publicPerson, resolveRideShareRegistrationId } from "./ride-share-utils";
import { getRideShareModerator, isRideShareEventExpired } from "./ride-share-permissions";

export default publicProcedure
  .input(z.object({
    registrationId: z.string().min(1),
    eventId: z.string().trim().optional().nullable(),
  }))
  .query(async ({ ctx, input }) => {
    const viewerRegistrationId = await resolveRideShareRegistrationId(ctx, input.registrationId);

    let offersQuery = ctx.supabase
      .from("event_ride_offers")
      .select("ride_offer_id, event_id, driver_registration_id, available_seats, vehicle_type, departure_town, departure_at, departure_meeting_point, driver_contact, preferred_contact_method, driver_sex, boot_space, requires_commitment_fee, commitment_fee, fare_per_seat, car_type, number_plate, preferred_sex, status, moderation_reason, created_at, updated_at")
      .in("status", ["active", "full", "pending_approval", "hidden"])
      .order("departure_at", { ascending: true });

    if (input.eventId) {
      offersQuery = offersQuery.eq("event_id", input.eventId);
    }

    const { data: offers, error: offersError } = await offersQuery;
    if (offersError) throw new Error(offersError.message || "Could not load ride-share cars.");

    const offerIds = (offers ?? []).map((offer: any) => offer.ride_offer_id).filter(Boolean);
    const eventIds = Array.from(new Set((offers ?? []).map((offer: any) => offer.event_id).filter(Boolean)));

    const [{ data: bookings, error: bookingsError }, { data: events, error: eventsError }] = await Promise.all([
      offerIds.length
        ? ctx.supabase
            .from("event_ride_bookings")
            .select("ride_booking_id, ride_offer_id, rider_registration_id, status, created_at, updated_at")
            .in("ride_offer_id", offerIds)
            .in("status", ["pending", "confirmed"])
        : Promise.resolve({ data: [], error: null } as any),
      eventIds.length
        ? ctx.supabase
            .from("events")
            .select("event_id, event_name, event_location, starts_at, ends_at, event_type, organizer, country_code, country")
            .in("event_id", eventIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (bookingsError) throw new Error(bookingsError.message || "Could not load ride-share bookings.");
    if (eventsError) throw new Error(eventsError.message || "Could not load ride-share event details.");

    const eventMap = new Map((events ?? []).map((event: any) => [event.event_id, event]));
    const moderatorByEventId = new Map<string, boolean>();
    for (const event of events ?? []) {
      const { canModerate } = await getRideShareModerator(ctx, event);
      moderatorByEventId.set(String(event.event_id || ""), canModerate);
    }
    const bookingRows = bookings ?? [];
    const personIds = [
      ...(offers ?? []).map((offer: any) => offer.driver_registration_id),
      ...bookingRows.map((booking: any) => booking.rider_registration_id),
    ].filter(Boolean);
    const people = await getRideSharePeople(ctx, personIds);

    const bookingsByOffer = new Map<string, any[]>();
    for (const booking of bookingRows) {
      const rows = bookingsByOffer.get(booking.ride_offer_id) ?? [];
      rows.push(booking);
      bookingsByOffer.set(booking.ride_offer_id, rows);
    }

    const result = (offers ?? [])
      .map((offer: any) => {
        const offerBookings = bookingsByOffer.get(offer.ride_offer_id) ?? [];
        const confirmedCount = offerBookings.filter((booking) => booking.status === "confirmed").length;
        const seatsRemaining = Math.max(0, Number(offer.available_seats || 0) - confirmedCount);
        const isDriver = offer.driver_registration_id === viewerRegistrationId;
        const userBooking = offerBookings.find((booking) => booking.rider_registration_id === viewerRegistrationId) ?? null;

        if (!isDriver && !userBooking && seatsRemaining <= 0) {
          return null;
        }

        const driver = people.get(offer.driver_registration_id);
        const eventInfo = eventMap.get(offer.event_id) as any;
        if (eventInfo && isRideShareEventExpired(eventInfo)) {
          void ctx.supabase.from("event_ride_offers").update({ status: "archived" }).eq("ride_offer_id", offer.ride_offer_id);
          return null;
        }

        const canModerate = moderatorByEventId.get(String(offer.event_id || "")) === true;
        const isVisibleToRiders = offer.status === "active" || offer.status === "full";
        if (!isDriver && !userBooking && !canModerate && !isVisibleToRiders) {
          return null;
        }

        const showDriverContact = isDriver || userBooking?.status === "confirmed";

        return {
          offerId: offer.ride_offer_id,
          eventId: offer.event_id,
          eventName: eventInfo?.event_name ?? "RunNation event",
          eventLocation: eventInfo?.event_location ?? null,
          eventStartsAt: eventInfo?.starts_at ?? null,
          availableSeats: Number(offer.available_seats || 0),
          vehicleType: offer.vehicle_type ?? "passenger_car_light",
          confirmedSeats: confirmedCount,
          seatsRemaining,
          departureTown: offer.departure_town,
          departureAt: offer.departure_at,
          departureMeetingPoint: offer.departure_meeting_point ?? null,
          contact: offer.driver_contact ?? null,
          preferredContactMethod: offer.preferred_contact_method ?? "any",
          driverSex: offer.driver_sex ?? null,
          bootSpace: offer.boot_space ?? null,
          requiresCommitmentFee: offer.requires_commitment_fee === true,
          commitmentFee: Number(offer.commitment_fee || 0),
          farePerSeat: Number(offer.fare_per_seat || 0),
          carType: offer.car_type,
          numberPlate: isDriver ? offer.number_plate ?? null : null,
          preferredSex: offer.preferred_sex ?? null,
          status: offer.status,
          moderationReason: offer.moderation_reason ?? null,
          isDriver,
          canModerate,
          driver: publicPerson(driver, showDriverContact),
          userBooking: userBooking ? {
            bookingId: userBooking.ride_booking_id,
            status: userBooking.status,
            createdAt: userBooking.created_at,
          } : null,
          bookings: isDriver ? offerBookings.map((booking) => ({
            bookingId: booking.ride_booking_id,
            status: booking.status,
            createdAt: booking.created_at,
            rider: publicPerson(people.get(booking.rider_registration_id), true),
          })) : [],
        };
      })
      .filter(Boolean);

    return { offers: result };
  });
