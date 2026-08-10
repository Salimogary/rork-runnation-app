import { z } from "zod";
import { publicProcedure } from "../../create-context";
import { isRideShareEventExpired } from "./ride-share-permissions";
import { getRideSharePeople, publicPerson, resolveRideShareRegistrationId } from "./ride-share-utils";

export default publicProcedure
  .input(z.object({
    registrationId: z.string().min(1),
    eventId: z.string().trim().optional().nullable(),
  }))
  .query(async ({ ctx, input }) => {
    const viewerRegistrationId = await resolveRideShareRegistrationId(ctx, input.registrationId);

    let offersQuery = ctx.supabase
      .from("event_accommodation_offers")
      .select("accommodation_offer_id, event_id, host_registration_id, accommodation_name, location_name, accommodation_type, lodging_types, rooms_available, location_pin, price_per_room, room_description, not_permitted, features, host_contact, preferred_contact_method, preferred_guest_sex, requires_commitment_fee, commitment_fee, status, created_at, updated_at")
      .in("status", ["active", "full", "hidden"])
      .order("created_at", { ascending: false });

    if (input.eventId) {
      offersQuery = offersQuery.eq("event_id", input.eventId);
    }

    const { data: offers, error: offersError } = await offersQuery;
    if (offersError) throw new Error(offersError.message || "Could not load accommodation.");

    const offerIds = (offers ?? []).map((offer: any) => offer.accommodation_offer_id).filter(Boolean);
    const eventIds = Array.from(new Set((offers ?? []).map((offer: any) => offer.event_id).filter(Boolean)));

    const [{ data: bookings, error: bookingsError }, { data: events, error: eventsError }] = await Promise.all([
      offerIds.length
        ? ctx.supabase
            .from("event_accommodation_bookings")
            .select("accommodation_booking_id, accommodation_offer_id, guest_registration_id, occupant_count, occupants, status, created_at, updated_at")
            .in("accommodation_offer_id", offerIds)
            .in("status", ["pending", "confirmed"])
        : Promise.resolve({ data: [], error: null } as any),
      eventIds.length
        ? ctx.supabase
            .from("events")
            .select("event_id, event_name, event_location, starts_at, ends_at, event_type")
            .in("event_id", eventIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (bookingsError) throw new Error(bookingsError.message || "Could not load accommodation bookings.");
    if (eventsError) throw new Error(eventsError.message || "Could not load accommodation event details.");

    const eventMap = new Map((events ?? []).map((event: any) => [event.event_id, event]));
    const bookingRows = bookings ?? [];
    const personIds = [
      ...(offers ?? []).map((offer: any) => offer.host_registration_id),
      ...bookingRows.map((booking: any) => booking.guest_registration_id),
    ].filter(Boolean);
    const people = await getRideSharePeople(ctx, personIds);

    const bookingsByOffer = new Map<string, any[]>();
    for (const booking of bookingRows) {
      const rows = bookingsByOffer.get(booking.accommodation_offer_id) ?? [];
      rows.push(booking);
      bookingsByOffer.set(booking.accommodation_offer_id, rows);
    }

    const result = (offers ?? [])
      .map((offer: any) => {
        const offerBookings = bookingsByOffer.get(offer.accommodation_offer_id) ?? [];
        const confirmedCount = offerBookings
          .filter((booking) => booking.status === "confirmed")
          .reduce((sum, booking) => sum + Number(booking.occupant_count || 1), 0);
        const roomsRemaining = Math.max(0, Number(offer.rooms_available || 0) - confirmedCount);
        const isHost = offer.host_registration_id === viewerRegistrationId;
        const userBooking = offerBookings.find((booking) => booking.guest_registration_id === viewerRegistrationId) ?? null;

        if (!isHost && !userBooking && roomsRemaining <= 0) return null;

        const eventInfo = eventMap.get(offer.event_id) as any;
        if (eventInfo && isRideShareEventExpired(eventInfo)) {
          void ctx.supabase.from("event_accommodation_offers").update({ status: "archived" }).eq("accommodation_offer_id", offer.accommodation_offer_id);
          return null;
        }
        if (!isHost && !userBooking && offer.status !== "active" && offer.status !== "full") return null;

        const host = people.get(offer.host_registration_id);
        const showHostContact = isHost || Boolean(userBooking);

        return {
          offerId: offer.accommodation_offer_id,
          eventId: offer.event_id,
          eventName: eventInfo?.event_name ?? "RunNation event",
          eventLocation: eventInfo?.event_location ?? null,
          eventStartsAt: eventInfo?.starts_at ?? null,
          accommodationName: offer.accommodation_name ?? null,
          locationName: offer.location_name ?? null,
          accommodationType: offer.accommodation_type,
          lodgingTypes: Array.isArray(offer.lodging_types) ? offer.lodging_types : [],
          roomsAvailable: Number(offer.rooms_available || 0),
          confirmedRooms: confirmedCount,
          roomsRemaining,
          locationPin: offer.location_pin ?? null,
          pricePerRoom: Number(offer.price_per_room || 0),
          roomDescription: offer.room_description,
          notPermitted: offer.not_permitted ?? null,
          features: Array.isArray(offer.features) ? offer.features : [],
          contact: offer.host_contact ?? null,
          preferredContactMethod: offer.preferred_contact_method ?? "any",
          preferredGuestSex: offer.preferred_guest_sex ?? null,
          requiresCommitmentFee: offer.requires_commitment_fee === true,
          commitmentFee: Number(offer.commitment_fee || 0),
          status: offer.status,
          isHost,
          host: publicPerson(host, showHostContact),
          userBooking: userBooking ? {
            bookingId: userBooking.accommodation_booking_id,
            status: userBooking.status,
            occupantCount: Number(userBooking.occupant_count || 1),
            occupants: Array.isArray(userBooking.occupants) ? userBooking.occupants : [],
            createdAt: userBooking.created_at,
          } : null,
          bookings: isHost ? offerBookings.map((booking) => ({
            bookingId: booking.accommodation_booking_id,
            status: booking.status,
            occupantCount: Number(booking.occupant_count || 1),
            occupants: Array.isArray(booking.occupants) ? booking.occupants : [],
            createdAt: booking.created_at,
            guest: publicPerson(people.get(booking.guest_registration_id), true),
          })) : [],
        };
      })
      .filter(Boolean);

    return { offers: result };
  });
