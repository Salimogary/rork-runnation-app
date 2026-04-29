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

  return (data ?? []).map((event: any) => {
    const organizer = event.organizer ? organizerMap.get(event.organizer) : null;
    return {
      ...event,
      organizer_name: organizer?.organizer_name ?? null,
      organizer_country: organizer?.country ?? null,
    };
  });
});
