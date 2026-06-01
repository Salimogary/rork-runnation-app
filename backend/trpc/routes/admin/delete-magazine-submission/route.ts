import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(z.object({ submissionId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowMagazineEditor: true,
      allowCountryAdmin: false,
      allowClubCoordinator: false,
    });

    const { error } = await ctx.supabase
      .from("magazine_article_submissions")
      .update({
        status: "deleted",
        reviewed_by: actor.authUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("submission_id", input.submissionId);

    if (error) {
      throw new Error(error.message || "Could not delete magazine submission.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "magazine_submission_deleted",
      metadata: { submissionId: input.submissionId },
    });

    return { success: true };
  });


