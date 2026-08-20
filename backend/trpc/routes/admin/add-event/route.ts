import { publicProcedure } from "../../../create-context";
import { z } from "zod";
import { logAdminAction, requireAdminPermission } from "../../../rbac";
import { uploadMagazineImage } from "../../../magazine-image";
import { sendNewEventAlertPush } from "../../../push-notifications";

const EVENT_POSTER_BUCKET = "event_poster";
const EVENT_POSTER_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

function detectPosterMimeType(base64: string): string | null {
  const normalized = base64.trim();
  if (normalized.startsWith("/9j/")) return "image/jpeg";
  if (normalized.startsWith("iVBORw0KGgo")) return "image/png";
  if (normalized.startsWith("UklGR")) return "image/webp";
  if (normalized.startsWith("AAAAIGZ0eXBhdmlm") || normalized.startsWith("AAAAHGZ0eXBhdmlm")) {
    return "image/avif";
  }
  return null;
}

function decodePosterBase64(base64: string): Buffer {
  const normalized = base64.includes(",") ? base64.split(",").pop() || "" : base64;
  return Buffer.from(normalized, "base64");
}

type StorageCapableSupabase = {
  storage: {
    from: (bucket: string) => {
      list: (
        path?: string,
        options?: { limit?: number; sortBy?: { column: string; order: "asc" | "desc" } }
      ) => Promise<{ data: Array<{ name: string | null }> | null; error: unknown }>;
      remove: (paths: string[]) => Promise<unknown>;
    };
  };
};

async function clearExistingPosterFiles(supabase: StorageCapableSupabase, eventId: string) {
  const { data: existingFiles, error: listError } = await supabase.storage
    .from(EVENT_POSTER_BUCKET)
    .list(eventId, {
      limit: 100,
      sortBy: { column: "name", order: "asc" },
    });

  if (listError || !existingFiles?.length) {
    return;
  }

  const paths = existingFiles
    .filter((file) => file.name)
    .map((file) => `${eventId}/${file.name}`);

  if (paths.length > 0) {
    await supabase.storage.from(EVENT_POSTER_BUCKET).remove(paths);
  }
}

async function uploadMagazinePhoto(ctx: any, eventId: string, base64: string, mimeType?: string | null) {
  return uploadMagazineImage(ctx, "article-submissions/events", eventId, base64, mimeType);
}

function normalizeCountryCode(country?: string | null) {
  const value = String(country || "").trim().toLowerCase();
  if (!value) return "";
  if (["ug", "uga", "uganda"].includes(value)) return "UG";
  if (["ke", "ken", "kenya"].includes(value)) return "KE";
  if (["tz", "tza", "tanzania"].includes(value)) return "TZ";
  if (["rw", "rwa", "rwanda"].includes(value)) return "RW";
  return value.slice(0, 2).toUpperCase();
}

async function resolveCountryRecord(supabase: any, country?: string | null) {
  const raw = String(country || "").trim();
  if (!raw) {
    return { country: null, countryCode: null, currencyCode: null };
  }

  const withCurrencyCode = await supabase
    .from("countries")
    .select("iso_alpha2, name, currency_code");

  let data = withCurrencyCode.data;
  let error = withCurrencyCode.error;

  if (error) {
    const withLegacyCurrency = await supabase
      .from("countries")
      .select("iso_alpha2, name, currency");

    if (withLegacyCurrency.error) {
      throw new Error(withLegacyCurrency.error.message || error.message || "Failed to resolve event country");
    }

    data = (withLegacyCurrency.data || []).map((countryRow: any) => ({
      iso_alpha2: countryRow.iso_alpha2,
      name: countryRow.name,
      currency_code: countryRow.currency ?? null,
    }));
    error = null;
  }

  const normalized = raw.toLowerCase();
  const match = (data || []).find((countryRow: any) => {
    return (
      String(countryRow.iso_alpha2 || "").trim().toLowerCase() === normalized ||
      String(countryRow.name || "").trim().toLowerCase() === normalized
    );
  });

  return {
    country: match?.name ?? raw,
    countryCode: match?.iso_alpha2 ?? (normalizeCountryCode(raw) || null),
    currencyCode: match?.currency_code ?? null,
  };
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeDateOnly(value: string): string {
  const raw = value.trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const displayMatch = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  const match = isoMatch
    ? [isoMatch[1], isoMatch[2], isoMatch[3]]
    : displayMatch
    ? [displayMatch[3], displayMatch[2], displayMatch[1]]
    : null;

  if (!match) return raw.slice(0, 10);
  const [yearText, monthText, dayText] = match;
  return `${yearText}-${monthText}-${dayText}`;
}

function isValidDateOnly(dateOnly: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return false;
  const [year, month, day] = dateOnly.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function normalizeAvailableDistances(values?: number[] | null): number[] {
  const distances = (values ?? [])
    .map((value) => Number(Number(value).toFixed(2)))
    .filter((value) => Number.isFinite(value) && value > 0);
  return Array.from(new Set(distances)).sort((a, b) => a - b);
}

async function allocateNextEventId(ctx: any): Promise<string> {
  const { data, error } = await ctx.supabase
    .from("events")
    .select("event_id");

  if (error) {
    console.error("Error fetching event ids:", error);
    throw new Error(error.message || "Failed to allocate event id");
  }

  const maxNumericId = (data ?? []).reduce((max: number, event: any) => {
    const match = String(event.event_id || "").trim().match(/^E(\d+)$/i);
    if (!match) return max;
    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);

  return `E${maxNumericId + 1}`;
}

const addEventInput = z.object({
  eventName: z.string().trim().min(1, "Event name is required."),
  startsAt: z.string().trim().min(1, "Start date is required."),
  endsAt: z.string().trim().min(1, "End date is required."),
  registrationClosesAt: z.string().trim().min(1, "Registration close date is required."),
  eventType: z.enum(["same_day", "recurring", "multiday"]),
  recurrenceFrequency: z.enum(["weekly", "monthly"]).optional().nullable(),
  recurrenceWeekday: z.number().int().min(0).max(6).optional().nullable(),
  recurrenceWeekdays: z.array(z.number().int().min(0).max(6)).optional().nullable(),
  recurrenceMonthlyMode: z.enum(["day_of_month", "weekend"]).optional().nullable(),
  recurrenceMonthDay: z.number().int().min(1).max(31).optional().nullable(),
  recurrenceWeekOfMonth: z.number().int().min(1).max(5).optional().nullable(),
  country: z.string().optional(),
  club: z.string().optional(),
  organizerId: z.string().uuid().optional().nullable(),
  externalOrganizerName: z.string().optional().nullable(),
  eventLocation: z.string().optional().nullable(),
  eventLocationPin: z.string().max(500).optional().nullable(),
  isVirtual: z.boolean().optional(),
  entry: z.enum(["free", "club_approved", "paid"]).optional(),
  entryFee: z.number().nonnegative().optional(),
  hasMedal: z.boolean().optional(),
  availableDistancesKm: z.array(z.number().positive()).optional(),
  paymentDetails: z.string().optional(),
  registrationLink: z.string().optional().nullable(),
  organizerPaymentLink: z.string().optional().nullable(),
  runnationPaymentLinkEnabled: z.boolean().optional(),
  participantLimit: z.number().int().positive().nullable().optional(),
  medalMinDailyDistance: z.number().optional(),
  medalMinCumulativeDistance: z.number().optional(),
  medalDateStart: z.string().optional(),
  medalDateEnd: z.string().optional(),
  clearPoster: z.boolean().optional(),
  posterLink: z.string().nullable().optional(),
  posterBase64: z.string().nullable().optional(),
  posterMimeType: z.string().nullable().optional(),
  magazineArticleTitle: z.string().trim().min(6).max(140),
  magazineArticleBody: z.string().trim().min(1).max(6000),
  magazineWriterName: z.string().trim().min(2).max(80),
  magazinePhotoLink: z.string().trim().url().optional(),
  magazinePhotoBase64: z.string().nullable().optional(),
  magazinePhotoMimeType: z.string().nullable().optional(),
});

export default publicProcedure.input(addEventInput).mutation(async ({ input, ctx }) => {
  const actor = await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryAdmin: true,
    allowCountryCoordinator: true,
    allowClubCoordinator: true,
    allowSpecialClubCoordinator: true,
    allowEventOrganizer: true,
  });

  const nextEventId = await allocateNextEventId(ctx);

  let posterLink: string | null = null;
  if (input.posterLink) {
    posterLink = input.posterLink;
  } else if (input.posterBase64) {
    const mimeType = detectPosterMimeType(input.posterBase64) || input.posterMimeType || "image/jpeg";
    if (!EVENT_POSTER_ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error("Unsupported event poster type");
    }
    await clearExistingPosterFiles(ctx.supabase, nextEventId);
    const filePath = `${nextEventId}/poster.jpg`;
    const posterBytes = decodePosterBase64(input.posterBase64);

    if (!posterBytes.length) {
      throw new Error("Event poster upload was empty");
    }

    const { data: uploadData, error: uploadError } = await ctx.supabase.storage
      .from(EVENT_POSTER_BUCKET)
      .upload(filePath, posterBytes, {
        contentType: mimeType,
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError || !uploadData) {
      throw new Error(uploadError?.message || "Failed to upload event poster");
    }

    const { data: publicData } = ctx.supabase.storage
      .from(EVENT_POSTER_BUCKET)
      .getPublicUrl(uploadData.path);

    posterLink = publicData.publicUrl ? `${publicData.publicUrl}?v=${Date.now()}` : null;
  }

  const normalizedCountry = input.country?.trim() || null;
  const organizerScopes = actor.roles
    .filter((role) => role.roleName === "event_organizer" && role.organizerId)
    .map((role) => role.organizerId as string);
  const hasOrganizerOnlyAccess =
    actor.isEventOrganizer &&
    !actor.isSuperAdmin &&
    !actor.isCountryAdmin &&
      !actor.isCountryCoordinator &&
    !actor.isClubCoordinator &&
    !actor.isSpecialClubCoordinator;
  const normalizedOrganizerId = hasOrganizerOnlyAccess
    ? organizerScopes[0] ?? null
    : input.organizerId ?? null;
  const normalizedExternalOrganizerName = hasOrganizerOnlyAccess ? null : input.externalOrganizerName?.trim() || null;
  const normalizedClub = normalizedOrganizerId || normalizedExternalOrganizerName ? null : input.club?.trim() || null;
  const normalizedEventLocation = input.isVirtual === true ? "Virtual" : input.eventLocation?.trim() || null;
  const normalizedEventLocationPin = input.eventLocationPin?.trim() || null;
  const normalizedEntry = input.entry ?? "free";
  const normalizedEventType = input.eventType;
  const normalizedRegistrationClosesAt = normalizeDateOnly(input.registrationClosesAt);
  const normalizedStartsAt = normalizeDateOnly(input.startsAt);
  const normalizedEndsAt =
    normalizedEventType === "same_day" || normalizedEventType === "recurring"
      ? normalizedStartsAt
      : normalizeDateOnly(input.endsAt);
  const normalizedRecurrenceFrequency = normalizedEventType === "recurring" ? input.recurrenceFrequency ?? "weekly" : null;
  const normalizedRecurrenceWeekdays =
    normalizedEventType === "recurring" && normalizedRecurrenceFrequency === "weekly"
      ? [...new Set((input.recurrenceWeekdays?.length ? input.recurrenceWeekdays : input.recurrenceWeekday !== null && input.recurrenceWeekday !== undefined ? [input.recurrenceWeekday] : []).map(Number))]
      : null;
  const normalizedRecurrenceWeekday = normalizedRecurrenceWeekdays?.[0] ?? null;
  const normalizedRecurrenceMonthlyMode =
    normalizedEventType === "recurring" && normalizedRecurrenceFrequency === "monthly"
      ? input.recurrenceMonthlyMode ?? "day_of_month"
      : null;
  const normalizedRecurrenceMonthDay =
    normalizedEventType === "recurring" &&
    normalizedRecurrenceFrequency === "monthly" &&
    normalizedRecurrenceMonthlyMode === "day_of_month"
      ? input.recurrenceMonthDay ?? null
      : null;
  const normalizedRecurrenceWeekOfMonth =
    normalizedEventType === "recurring" &&
    normalizedRecurrenceFrequency === "monthly" &&
    normalizedRecurrenceMonthlyMode === "weekend"
      ? input.recurrenceWeekOfMonth ?? null
      : null;
  const normalizedPaymentDetails = input.paymentDetails?.trim() || null;
  const normalizedRegistrationLink = input.registrationLink?.trim() || null;
  const normalizedOrganizerPaymentLink = input.organizerPaymentLink?.trim() || null;
  const normalizedEntryFee =
    normalizedEntry === "paid" && typeof input.entryFee === "number" ? Number(input.entryFee.toFixed(2)) : null;
  const normalizedParticipantLimit =
    typeof input.participantLimit === "number" ? input.participantLimit : null;
  const normalizedHasMedal = input.hasMedal === true;
  const normalizedAvailableDistances = normalizedHasMedal
    ? normalizeAvailableDistances(input.availableDistancesKm)
    : [];
  const normalizedMinDailyDistance =
    normalizedHasMedal && typeof input.medalMinDailyDistance === "number" ? Number(input.medalMinDailyDistance.toFixed(2)) : null;
  const normalizedMinCumulativeDistance =
    normalizedHasMedal && normalizedEventType === "multiday" && typeof input.medalMinCumulativeDistance === "number"
      ? Number(input.medalMinCumulativeDistance.toFixed(2))
      : null;
  const articleWordCount = countWords(input.magazineArticleBody);
  const approvalStatus = "pending";
  const approvedAt = null;
  const approvedBy = null;

  if (!isValidDateOnly(normalizedStartsAt) || !isValidDateOnly(normalizedEndsAt) || !isValidDateOnly(normalizedRegistrationClosesAt)) {
    throw new Error("Please provide valid event dates.");
  }

  if (normalizedEndsAt < normalizedStartsAt) {
    throw new Error("The event end date cannot be before the start date.");
  }

  if (normalizedRegistrationClosesAt > normalizedEndsAt) {
    throw new Error("Registration close date cannot be after the event end date.");
  }

  if (normalizedEntry === "paid" && (normalizedEntryFee === null || Number.isNaN(normalizedEntryFee))) {
    throw new Error("Please provide an entry fee for paid events.");
  }

  if (normalizedHasMedal && normalizedAvailableDistances.length === 0) {
    throw new Error("Please choose at least one medal distance category.");
  }

  if (
    normalizedRegistrationLink &&
    !/^https?:\/\/\S+\.\S+/i.test(normalizedRegistrationLink)
  ) {
    throw new Error("Please enter a valid registration link beginning with http:// or https://.");
  }

  if (
    normalizedOrganizerPaymentLink &&
    !/^https?:\/\/\S+\.\S+/i.test(normalizedOrganizerPaymentLink)
  ) {
    throw new Error("Please enter a valid payment link beginning with http:// or https://.");
  }

  if (normalizedMinDailyDistance !== null && (!Number.isFinite(normalizedMinDailyDistance) || normalizedMinDailyDistance <= 0)) {
    throw new Error("Minimum daily distance must be greater than 0 km.");
  }

  if (normalizedMinCumulativeDistance !== null && (!Number.isFinite(normalizedMinCumulativeDistance) || normalizedMinCumulativeDistance <= 0)) {
    throw new Error("Minimum cumulative distance must be greater than 0 km.");
  }

  if (normalizedEventType === "multiday" && (normalizedMinDailyDistance !== null || normalizedMinCumulativeDistance !== null) && (normalizedMinDailyDistance === null || normalizedMinCumulativeDistance === null)) {
    throw new Error("Multiday minimum distance rules require both daily and cumulative distances.");
  }

  if (normalizedEventType === "recurring" && normalizedRecurrenceFrequency === "weekly" && !normalizedRecurrenceWeekdays?.length) {
    throw new Error("Please choose at least one recurring run day.");
  }

  if (normalizedEventType === "recurring" && normalizedRecurrenceFrequency === "monthly" && normalizedRecurrenceMonthlyMode === "day_of_month" && normalizedRecurrenceMonthDay === null) {
    throw new Error("Please choose the monthly day.");
  }

  if (normalizedEventType === "recurring" && normalizedRecurrenceFrequency === "monthly" && normalizedRecurrenceMonthlyMode === "weekend" && normalizedRecurrenceWeekOfMonth === null) {
    throw new Error("Please choose the monthly weekend.");
  }

  if (articleWordCount < 200 || articleWordCount > 300) {
    throw new Error("Magazine article body must be between 200 and 300 words.");
  }

  const ownerCount = [normalizedOrganizerId, normalizedClub, normalizedExternalOrganizerName].filter(Boolean).length;
  if (ownerCount > 1) {
    throw new Error("Please choose either self or another event organizer, not both.");
  }

  if (ownerCount === 0) {
    throw new Error("Please choose self or enter the external event organizer name.");
  }

  if (input.isVirtual !== true && !normalizedEventLocation) {
    throw new Error("Please enter the event start/finish location.");
  }

  if (hasOrganizerOnlyAccess && !normalizedOrganizerId) {
    throw new Error("Your organizer profile is not ready yet.");
  }

  let resolvedCountry = normalizedCountry;
  let resolvedCountryCode: string | null = null;
  let resolvedCurrencyCode: string | null = null;
  let organizerName: string | null = null;
  let organizerRegistrationId: string | null = null;

  if (normalizedOrganizerId) {
    const { data: organizerRow, error: organizerError } = await ctx.supabase
      .from("event_organizers")
      .select("organizer_id, organizer_name, country, registration_id")
      .eq("organizer_id", normalizedOrganizerId)
      .maybeSingle();

    if (organizerError || !organizerRow) {
      throw new Error(organizerError?.message || "Could not load the selected event organizer.");
    }

    if (hasOrganizerOnlyAccess && !organizerScopes.includes(normalizedOrganizerId)) {
      throw new Error("You can only create events for your assigned organizer profile.");
    }

    organizerName = organizerRow.organizer_name ?? null;
    organizerRegistrationId = organizerRow.registration_id ?? null;
    if (!resolvedCountry && organizerRow.country) {
      resolvedCountry = String(organizerRow.country).trim() || null;
    }
  }

  if (!posterLink) {
    throw new Error("Please add an event photo for the event listing.");
  }

  let magazinePhotoLink = input.magazinePhotoLink || null;
  if (input.magazinePhotoBase64) {
    magazinePhotoLink = await uploadMagazinePhoto(ctx, nextEventId, input.magazinePhotoBase64, input.magazinePhotoMimeType);
  }

  if (!magazinePhotoLink) {
    throw new Error("Please add a magazine photo for the event story.");
  }

  const resolvedCountryRecord = await resolveCountryRecord(ctx.supabase, resolvedCountry);
  resolvedCountry = resolvedCountryRecord.country;
  resolvedCountryCode = resolvedCountryRecord.countryCode;
  resolvedCurrencyCode = resolvedCountryRecord.currencyCode;

  if (!resolvedCountry || !resolvedCountryCode) {
    throw new Error("Please choose the event country.");
  }

  const { data, error } = await ctx.supabase
    .from("events")
    .insert({
      "event_id": nextEventId,
      "event_name": input.eventName,
      "starts_at": normalizedStartsAt,
      "ends_at": normalizedEndsAt,
      "registration_closes_at": normalizedRegistrationClosesAt,
      "event_type": normalizedEventType,
      "recurrence_frequency": normalizedRecurrenceFrequency,
      "recurrence_weekday": normalizedRecurrenceWeekday,
      "recurrence_weekdays": normalizedRecurrenceWeekdays,
      "recurrence_monthly_mode": normalizedRecurrenceMonthlyMode,
      "recurrence_month_day": normalizedRecurrenceMonthDay,
      "recurrence_week_of_month": normalizedRecurrenceWeekOfMonth,
      "country": resolvedCountry,
      "country_code": resolvedCountryCode,
      "currency_code": normalizedEntry === "paid" ? resolvedCurrencyCode : null,
      "organizer": normalizedOrganizerId,
      "external_organizer_name": normalizedExternalOrganizerName,
      "club": normalizedClub,
      "event_location": normalizedEventLocation,
      "event_location_pin": normalizedEventLocationPin,
      "is_virtual": input.isVirtual === true,
      "entry": normalizedEntry,
      "entry_fee": normalizedEntry === "paid" ? normalizedEntryFee : null,
      "has_medal": normalizedHasMedal,
      "available_distances_km": normalizedAvailableDistances,
      "payment_details": normalizedEntry === "paid" ? normalizedPaymentDetails : null,
      "registration_link": normalizedRegistrationLink,
      "organizer_payment_link": normalizedOrganizerPaymentLink,
      "runnation_payment_link_enabled": normalizedEntry === "paid" && input.runnationPaymentLinkEnabled === true,
      "participant_limit": normalizedParticipantLimit,
      "approval_status": approvalStatus,
      "approved_at": approvedAt,
      "approved_by": approvedBy,
      "poster_link": posterLink,
      "medal_min_daily_distance": normalizedMinDailyDistance,
      "medal_min_cumulative_distance": normalizedMinCumulativeDistance,
      "medal_date_start": input.medalDateStart || null,
      "medal_date_end": input.medalDateEnd || null,
    })
    .select();

  if (error) {
    console.error("Error adding event:", error);
    throw new Error(error.message || "Failed to add event");
  }

  const insertedEvent = data?.[0];
  if (insertedEvent?.event_id && resolvedCountryCode) {
    void sendNewEventAlertPush(ctx, {
      eventId: insertedEvent.event_id,
      eventName: input.eventName.trim(),
      date: normalizedStartsAt,
      location: normalizedEventLocation || "Virtual",
      countryCode: resolvedCountryCode,
      countryName: resolvedCountry,
    });
  }

  try {
    const eventId = insertedEvent?.event_id ?? nextEventId;
    const { data: actorUser } = actor.authUserId
      ? await ctx.supabase.auth.admin.getUserById(actor.authUserId)
      : { data: null };
    const authorName = input.magazineWriterName.trim();
    const email = actorUser?.user?.email || "magazine@runnation.app";

    const { error: magazineInsertError } = await ctx.supabase.from("magazine_article_submissions").insert({
      registration_id: organizerRegistrationId || actor.authUserId,
      profile_id: actor.authUserId,
      author_name: authorName,
      article_writer_name: authorName,
      email,
      event_id: eventId,
      title: input.magazineArticleTitle.trim(),
      category: "Event Preview",
      pitch: `Event preview for ${input.eventName}.`,
      body: input.magazineArticleBody.trim(),
      attachment_url: magazinePhotoLink,
      magazine_photo_url: magazinePhotoLink,
      status: "submitted",
    });

    if (magazineInsertError) {
      throw magazineInsertError;
    }
  } catch (magazineError) {
    console.warn("[Event Magazine] Could not create magazine article submission:", magazineError);
    throw new Error(
      magazineError instanceof Error
        ? magazineError.message
        : "Could not create the linked magazine article submission."
    );
  }

  await logAdminAction(ctx, {
    actorUserId: actor.authUserId,
    actionType: "add_event",
    metadata: {
      eventId: data?.[0]?.event_id ?? null,
      eventName: input.eventName,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      eventType: normalizedEventType,
      recurrenceFrequency: normalizedRecurrenceFrequency,
      recurrenceWeekday: normalizedRecurrenceWeekday,
      recurrenceWeekdays: normalizedRecurrenceWeekdays,
      recurrenceMonthlyMode: normalizedRecurrenceMonthlyMode,
      recurrenceMonthDay: normalizedRecurrenceMonthDay,
      recurrenceWeekOfMonth: normalizedRecurrenceWeekOfMonth,
      country: resolvedCountry,
      countryCode: resolvedCountryCode,
      currencyCode: normalizedEntry === "paid" ? resolvedCurrencyCode : null,
      club: normalizedClub,
      organizerId: normalizedOrganizerId,
      organizerName: organizerName || normalizedExternalOrganizerName,
      externalOrganizerName: normalizedExternalOrganizerName,
      registrationLink: normalizedRegistrationLink,
      registrationClosesAt: normalizedRegistrationClosesAt,
      isVirtual: input.isVirtual === true,
      eventLocation: normalizedEventLocation,
      eventLocationPin: normalizedEventLocationPin,
      entry: normalizedEntry,
      entryFee: normalizedEntry === "paid" ? normalizedEntryFee : null,
      hasMedal: normalizedHasMedal,
      availableDistancesKm: normalizedAvailableDistances,
      paymentDetails: normalizedEntry === "paid" ? normalizedPaymentDetails : null,
      organizerPaymentLink: normalizedOrganizerPaymentLink,
      runnationPaymentLinkEnabled: normalizedEntry === "paid" && input.runnationPaymentLinkEnabled === true,
      participantLimit: normalizedParticipantLimit,
      approvalStatus,
      posterLink,
      magazineArticleTitle: input.magazineArticleTitle.trim(),
      magazineWriterName: input.magazineWriterName.trim(),
      magazinePhotoLink,
    },
  });

  return data?.[0];
});



