import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      submissionId: z.string().uuid(),
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
      .from("magazine_article_submissions")
      .update({
        status: input.status,
        reviewed_by: actor.authUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("submission_id", input.submissionId);

    if (error) {
      throw new Error(error.message || "Could not update magazine submission.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "magazine_submission_status_updated",
      metadata: { submissionId: input.submissionId, status: input.status },
    });

    return { success: true };
  });

