import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(z.object({ registrationId: z.string().min(1) }))
  .query(async ({ input, ctx }) => {
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await ctx.supabase
      .from("activities")
      .select("activity_date, exercise_type, distance_km, start_time, end_time, pace_min_per_km")
      .eq("registration_id", input.registrationId)
      .eq("activity_date", today)
      .order("end_time", { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return null;
    }

    const activity = data[0];
    const startTime = new Date(`1970-01-01T${activity.start_time}`);
    const endTime = new Date(`1970-01-01T${activity.end_time}`);
    const durationMs = endTime.getTime() - startTime.getTime();
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);

    return {
      activity_date: activity.activity_date,
      exercise_type: activity.exercise_type,
      distance_km: activity.distance_km,
      Time: `${minutes}:${seconds.toString().padStart(2, "0")}`,
      pace_min_per_km: activity.pace_min_per_km,
    };
  });
