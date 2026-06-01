import { TRPCError } from "@trpc/server";
import { publicProcedure } from "../../../create-context";

export default publicProcedure.query(async ({ ctx }) => {
  const { data, error } = await ctx.supabase
    .from("events")
    .select("*")
    .eq("approval_status", "approved")
    .order("starts_at", { ascending: false });

  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to fetch events: ${error.message}`,
      cause: error,
    });
  }

  const organizerIds = [...new Set((data ?? []).map((event: any) => event.organizer).filter(Boolean))];
  const { data: organizers, error: organizersError } = organizerIds.length
    ? await ctx.supabase
        .from("event_organizers")
        .select("organizer_id, organizer_name, country")
        .in("organizer_id", organizerIds)
    : { data: [], error: null };

  if (organizersError) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to fetch event organizers: ${organizersError.message}`,
      cause: organizersError,
    });
  }

  const organizerMap = new Map((organizers ?? []).map((organizer: any) => [organizer.organizer_id, organizer]));
  const eventIds = (data ?? []).map((event: any) => String(event.event_id || "")).filter(Boolean);
  const { data: participantRows, error: participantsError } = eventIds.length
    ? await ctx.supabase
        .from("events_participants")
        .select("event_id")
        .in("event_id", eventIds)
    : { data: [], error: null };

  if (participantsError) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to fetch event participant counts: ${participantsError.message}`,
      cause: participantsError,
    });
  }

  const participantCountByEventId = new Map<string, number>();
  (participantRows ?? []).forEach((row: any) => {
    const eventId = String(row.event_id || "");
    if (!eventId) return;
    participantCountByEventId.set(eventId, (participantCountByEventId.get(eventId) ?? 0) + 1);
  });

  return (data ?? []).map((event: any) => {
    const organizer = event.organizer ? organizerMap.get(event.organizer) : null;
    const participantLimit =
      typeof event.participant_limit === "number" && Number.isFinite(event.participant_limit)
        ? event.participant_limit
        : null;
    const participantCount = participantCountByEventId.get(String(event.event_id || "")) ?? 0;
    return {
      ...event,
      organizer_name: organizer?.organizer_name ?? null,
      organizer_country: organizer?.country ?? null,
      participant_count: participantCount,
      participantLimit,
      participantCount,
      isFull: participantLimit !== null && participantCount >= participantLimit,
    };
  });
});
