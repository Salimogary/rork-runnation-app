import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";
import { ACTIVITY_UPLOADS_BUCKET } from "../../../storage";

export default publicProcedure
  .input(z.object({ pendingActivityId: z.string().min(1) }))
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
      allowSpecialClubCoordinator: true,
    });
    const isTreadmillCoordinator = actor.roles.some((role) => role.roleName === "treadmill_runners_club_coordinator");
    if (
      actor.isSpecialClubCoordinator &&
      !isTreadmillCoordinator &&
      !actor.isSuperAdmin &&
      !actor.isCountryCoordinator &&
      !actor.isClubCoordinator
    ) {
      throw new Error("Only the Treadmill Runners Club coordinator can reject treadmill approvals.");
    }

    const { data: activity, error: fetchError } = await ctx.supabase
      .from("pending_activities")
      .select("photo_path")
      .eq("pending_activity_id", input.pendingActivityId)
      .single();

    if (fetchError) {
      throw new Error(fetchError.message || "Pending activity not found");
    }

    const { error } = await ctx.supabase
      .from("pending_activities")
      .delete()
      .eq("pending_activity_id", input.pendingActivityId);

    if (error) {
      throw new Error(error.message || "Failed to reject activity");
    }

    if (activity?.photo_path) {
      await ctx.supabase.storage.from(ACTIVITY_UPLOADS_BUCKET).remove([activity.photo_path]);
    }

    return { success: true };
  });


