import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(z.object({ pictorialId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: false,
      allowClubCoordinator: false,
    });

    const { error } = await ctx.supabase
      .from("magazine_pictorial_submissions")
      .update({
        status: "deleted",
        is_picture_of_week: false,
        reviewed_by: actor.authUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("pictorial_id", input.pictorialId);

    if (error) {
      throw new Error(error.message || "Could not delete event pictorial.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "magazine_pictorial_deleted",
      metadata: { pictorialId: input.pictorialId },
    });

    return { success: true };
  });

