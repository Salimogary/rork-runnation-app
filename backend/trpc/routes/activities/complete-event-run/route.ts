import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      eventId: z.string(),
      registrationId: z.string(),
      distanceKm: z.number().min(0),
      timeSeconds: z.number().int().min(0),
    })
  )
  .mutation(async ({ ctx, input }) => {
    await requireRegistrationOwner(ctx, input.registrationId, { allowAdmin: true });

    const { data: participant, error: fetchError } = await ctx.supabase
      .from("events_participants")
      .select("event_participant_id")
      .eq("event_id", input.eventId)
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Failed to verify event participation: ${fetchError.message}`);
    }

    if (!participant) {
      throw new Error("You are not registered for this event.");
    }

    const { data, error } = await ctx.supabase
      .from("events_participants")
      .update({
        distance_km: Number(input.distanceKm.toFixed(2)),
        time_seconds: input.timeSeconds,
      })
      .eq("event_id", input.eventId)
      .eq("registration_id", input.registrationId)
      .select("event_participant_id, event_id, registration_id, distance_km, time_seconds")
      .single();

    if (error) {
      throw new Error(`Failed to save event result: ${error.message}`);
    }

    return {
      success: true,
      participant: data,
    };
  });
