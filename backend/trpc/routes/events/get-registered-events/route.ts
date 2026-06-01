import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

async function resolveRegistrationId(ctx: any, candidateRegistrationId: string): Promise<string> {
  let resolvedRegistrationId = candidateRegistrationId;
  let authEmail: string | null = null;

  if (ctx.authUserId) {
    const { data: authUserResult, error: authUserError } = await ctx.supabase.auth.admin.getUserById(ctx.authUserId);
    if (authUserError) {
      throw new Error(authUserError.message || "Could not load your account details.");
    }

    authEmail = authUserResult?.user?.email?.trim().toLowerCase() ?? null;

    const { data: authProfileLink, error: authProfileLookupError } = await ctx.supabase
      .from("profiles")
      .select("registration_id")
      .eq("profile_id", ctx.authUserId)
      .maybeSingle();

    if (authProfileLookupError) {
      throw new Error(authProfileLookupError.message || "Could not resolve your linked registration profile.");
    }

    if (authProfileLink?.registration_id) {
      resolvedRegistrationId = authProfileLink.registration_id;
    }
  }

  const { data: registrationExists, error: registrationLookupError } = await ctx.supabase
    .from("registrations")
    .select("registration_id")
    .eq("registration_id", resolvedRegistrationId)
    .maybeSingle();

  if (registrationLookupError) {
    throw new Error(registrationLookupError.message || "Could not verify your registration profile.");
  }

  if (registrationExists) {
    return resolvedRegistrationId;
  }

  const { data: profileLink, error: profileLookupError } = await ctx.supabase
    .from("profiles")
    .select("registration_id")
    .eq("profile_id", candidateRegistrationId)
    .maybeSingle();

  if (profileLookupError) {
    throw new Error(profileLookupError.message || "Could not resolve your linked registration profile.");
  }

  if (profileLink?.registration_id) {
    return profileLink.registration_id;
  }

  if (authEmail) {
    const { data: contactLink, error: contactLookupError } = await ctx.supabase
      .from("contacts")
      .select("registration_id")
      .eq("email", authEmail)
      .maybeSingle();

    if (contactLookupError) {
      throw new Error(contactLookupError.message || "Could not resolve your linked registration contact.");
    }

    if (contactLink?.registration_id) {
      return contactLink.registration_id;
    }

    const { data: registrationByEmail, error: registrationByEmailError } = await ctx.supabase
      .from("registrations")
      .select("registration_id")
      .eq("email", authEmail)
      .maybeSingle();

    if (registrationByEmailError) {
      throw new Error(registrationByEmailError.message || "Could not resolve your registration email profile.");
    }

    if (registrationByEmail?.registration_id) {
      return registrationByEmail.registration_id;
    }
  }

  return candidateRegistrationId;
}

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string(),
    })
  )
  .query(async ({ ctx, input }) => {
    await requireRegistrationOwner(ctx, input.registrationId, { allowAdmin: true });
    const resolvedRegistrationId = await resolveRegistrationId(ctx, input.registrationId);

    const { data, error } = await ctx.supabase
      .from("events_participants")
      .select("event_id, registration_id, registration_date, distance_km, time_seconds")
      .eq("registration_id", resolvedRegistrationId)
      .order("registration_date", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch registered events: ${error.message}`);
    }

    const { data: pendingEnrollments, error: pendingError } = await ctx.supabase
      .from("event_enrollments")
      .select("event_id, registration_id, created_at, status")
      .eq("registration_id", resolvedRegistrationId)
      .in("status", ["pending", "awaiting_payment"]);

    if (pendingError) {
      throw new Error(`Failed to fetch pending event enrollments: ${pendingError.message}`);
    }

    const participantEventIds = new Set((data || []).map((item: any) => item.event_id).filter(Boolean));
    const eventIds = [
      ...new Set([
        ...(data || []).map((item: any) => item.event_id).filter(Boolean),
        ...(pendingEnrollments || [])
          .map((item: any) => item.event_id)
          .filter((eventId: string | null) => eventId && !participantEventIds.has(eventId)),
      ]),
    ];

    const { data: events, error: eventsError } = eventIds.length
      ? await ctx.supabase
          .from("events")
          .select("event_id, event_name, starts_at, ends_at, event_type, recurrence_frequency, recurrence_weekday, recurrence_weekdays, recurrence_monthly_mode, recurrence_month_day, recurrence_week_of_month, poster_link, has_medal, country, country_code, organizer, event_location")
          .in("event_id", eventIds)
      : { data: [], error: null };

    if (eventsError) {
      throw new Error(`Failed to fetch registered event details: ${eventsError.message}`);
    }

    const eventMap = new Map((events || []).map((event: any) => [event.event_id, event]));

    const organizerIds = [
      ...new Set(
        (events || [])
          .map((item: any) => item.organizer)
          .filter(Boolean)
      ),
    ];

    const { data: organizers, error: organizersError } = organizerIds.length
      ? await ctx.supabase
          .from("event_organizers")
          .select("organizer_id, organizer_name")
          .in("organizer_id", organizerIds)
      : { data: [], error: null };

    if (organizersError) {
      throw new Error(`Failed to fetch registered event organizers: ${organizersError.message}`);
    }

    const organizerMap = new Map(
      (organizers || []).map((organizer: any) => [organizer.organizer_id, organizer.organizer_name ?? null])
    );

    const participantRows = (data || [])
      .map((item: any) => {
        const event = eventMap.get(item.event_id);
        if (!event) return null;

        return {
          eventId: event.event_id ?? item.event_id,
          eventName: event.event_name ?? "",
          startsAt: event.starts_at ?? null,
          endsAt: event.ends_at ?? null,
          eventType: event.event_type ?? null,
          recurrenceFrequency: event.recurrence_frequency ?? null,
          recurrenceWeekday: event.recurrence_weekday ?? null,
          recurrenceWeekdays: event.recurrence_weekdays ?? null,
          recurrenceMonthlyMode: event.recurrence_monthly_mode ?? null,
          recurrenceMonthDay: event.recurrence_month_day ?? null,
          recurrenceWeekOfMonth: event.recurrence_week_of_month ?? null,
          posterLink: event.poster_link ?? null,
          hasMedal: event.has_medal ?? false,
          country: event.country ?? null,
          countryCode: event.country_code ?? null,
          organizer: event.organizer ?? null,
          organizerLabel: event.organizer ? organizerMap.get(event.organizer) ?? null : null,
          eventLocation: event.event_location ?? null,
          distanceKm: item.distance_km ?? null,
          timeSeconds: item.time_seconds ?? null,
          registrationDate: item.registration_date ?? null,
          registrationStatus: "registered",
        };
      })
      .filter(Boolean);

    const pendingRows = (pendingEnrollments || [])
      .filter((item: any) => !participantEventIds.has(item.event_id))
      .map((item: any) => {
        const event = eventMap.get(item.event_id);
        if (!event) return null;

        return {
          eventId: event.event_id ?? item.event_id,
          eventName: event.event_name ?? "",
          startsAt: event.starts_at ?? null,
          endsAt: event.ends_at ?? null,
          eventType: event.event_type ?? null,
          recurrenceFrequency: event.recurrence_frequency ?? null,
          recurrenceWeekday: event.recurrence_weekday ?? null,
          recurrenceWeekdays: event.recurrence_weekdays ?? null,
          recurrenceMonthlyMode: event.recurrence_monthly_mode ?? null,
          recurrenceMonthDay: event.recurrence_month_day ?? null,
          recurrenceWeekOfMonth: event.recurrence_week_of_month ?? null,
          posterLink: event.poster_link ?? null,
          hasMedal: event.has_medal ?? false,
          country: event.country ?? null,
          countryCode: event.country_code ?? null,
          organizer: event.organizer ?? null,
          organizerLabel: event.organizer ? organizerMap.get(event.organizer) ?? null : null,
          eventLocation: event.event_location ?? null,
          distanceKm: null,
          timeSeconds: null,
          registrationDate: item.created_at ?? null,
          registrationStatus: "pending",
        };
      })
      .filter(Boolean);

    return [...participantRows, ...pendingRows];
  });
