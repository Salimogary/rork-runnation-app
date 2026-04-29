import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      pictorialId: z.string().uuid(),
      status: z.enum(["submitted", "reviewing", "accepted", "rejected"]),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
            allowCountryCoordinator: true,
      allowClubCoordinator: true,
    });

    const { error } = await ctx.supabase
      .from("magazine_pictorial_submissions")
      .update({
        status: input.status,
        reviewed_by: actor.authUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("pictorial_id", input.pictorialId);

    if (error) {
      throw new Error(error.message || "Could not update event pictorial.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "magazine_pictorial_status_updated",
      metadata: { pictorialId: input.pictorialId, status: input.status },
    });

    return { success: true };
  });

