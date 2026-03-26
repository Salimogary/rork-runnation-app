import { publicProcedure } from "../../../create-context";
import { z } from "zod";

const addEventInput = z.object({
  eventName: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  medalMinDailyDistance: z.number().optional(),
  medalMinCumulativeDistance: z.number().optional(),
  medalDateStart: z.string().optional(),
  medalDateEnd: z.string().optional(),
});

export default publicProcedure.input(addEventInput).mutation(async ({ input, ctx }) => {
  const { data: existingEvents, error: fetchError } = await ctx.supabase
    .from("events")
    .select('event_id')
    .order('event_id', { ascending: false })
    .limit(1);

  if (fetchError) {
    console.error("Error fetching last event:", fetchError);
    throw new Error(fetchError.message || "Failed to fetch last event");
  }

  let nextEventId = "E1";
  if (existingEvents && existingEvents.length > 0) {
    const lastId = existingEvents[0].event_id;
    const numericPart = parseInt(lastId.substring(1), 10);
    nextEventId = `E${numericPart + 1}`;
  }

  const { data, error } = await ctx.supabase
    .from("events")
    .insert({
      "event_id": nextEventId,
      "event_name": input.eventName,
      "starts_at": input.startsAt,
      "ends_at": input.endsAt,
      "medal_min_daily_distance": input.medalMinDailyDistance || null,
      "medal_min_cumulative_distance": input.medalMinCumulativeDistance || null,
      "medal_date_start": input.medalDateStart || null,
      "medal_date_end": input.medalDateEnd || null,
    })
    .select();

  if (error) {
    console.error("Error adding event:", error);
    throw new Error(error.message || "Failed to add event");
  }

  return data?.[0];
});
