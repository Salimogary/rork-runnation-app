import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";
import { ACTIVITY_UPLOADS_BUCKET } from "../../../storage";

export default publicProcedure
  .input(z.object({ pendingActivityId: z.string().min(1) }))
  .mutation(async ({ input, ctx }) => {
    await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
            allowCountryCoordinator: true,
      allowClubCoordinator: true,
    });

    const { data: activity, error: fetchError } = await ctx.supabase
      .from("pending_activities")
      .select("*")
      .eq("pending_activity_id", input.pendingActivityId)
      .single();

    if (fetchError || !activity) {
      throw new Error(fetchError?.message || "Pending activity not found");
    }

    const timeParts = String(activity.time_entered || "0:00:00").split(":");
    const hours = parseInt(timeParts[0] || "0", 10);
    const minutes = parseInt(timeParts[1] || "0", 10);
    const totalMinutes = hours * 60 + minutes;

    let distanceKm = activity.distance_entered;
    if (activity.distance_unit === "mi") {
      distanceKm = activity.distance_entered * 1.60934;
    }

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - totalMinutes * 60 * 1000);
    const calculatedPace = totalMinutes > 0 && distanceKm > 0 ? totalMinutes / distanceKm : 0;

    const { error: insertError } = await ctx.supabase
      .from("activities")
      .insert({
        registration_id: activity.registration_id,
        activity_date: new Date().toISOString().split("T")[0],
        exercise_type: activity.exercise_type,
        distance_km: distanceKm,
        start_time: startTime.toISOString().split("T")[1].split(".")[0],
        end_time: endTime.toISOString().split("T")[1].split(".")[0],
        pace_min_per_km: calculatedPace,
      });

    if (insertError) {
      throw new Error(insertError.message || "Failed to approve activity");
    }

    const { error: deleteError } = await ctx.supabase
      .from("pending_activities")
      .delete()
      .eq("pending_activity_id", input.pendingActivityId);

    if (deleteError) {
      throw new Error(deleteError.message || "Failed to finalize approved activity");
    }

    if (activity.photo_path) {
      await ctx.supabase.storage.from(ACTIVITY_UPLOADS_BUCKET).remove([activity.photo_path]);
    }

    return { success: true };
  });

