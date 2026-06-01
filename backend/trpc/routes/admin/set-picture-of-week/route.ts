import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      pictorialId: z.string().uuid(),
      weekLabel: z.string().trim().max(80).nullable(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryCoordinator: true,
      allowMagazineEditor: true,
      allowClubCoordinator: false,
    });

    const weekLabel = input.weekLabel || new Date().toISOString().slice(0, 10);

    const { error: clearError } = await ctx.supabase
      .from("magazine_pictorial_submissions")
      .update({ is_picture_of_week: false })
      .eq("week_label", weekLabel);

    if (clearError) {
      throw new Error(clearError.message || "Could not clear current picture of the week.");
    }

    const { error } = await ctx.supabase
      .from("magazine_pictorial_submissions")
      .update({
        status: "accepted",
        is_picture_of_week: true,
        week_label: weekLabel,
        selected_by: actor.authUserId,
        selected_at: new Date().toISOString(),
        reviewed_by: actor.authUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("pictorial_id", input.pictorialId);

    if (error) {
      throw new Error(error.message || "Could not set picture of the week.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "magazine_picture_of_week_selected",
      metadata: { pictorialId: input.pictorialId, weekLabel },
    });

    return { success: true };
  });


