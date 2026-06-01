import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      milestoneKey: z.string().min(1).max(80),
      milestoneDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      note: z.string().trim().max(500).nullable().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const actor = await requireAdminPermission(ctx, { allowSuperAdmin: true });

    const { error } = await ctx.supabase
      .from("admin_milestones")
      .upsert(
        {
          milestone_key: input.milestoneKey,
          milestone_date: input.milestoneDate,
          note: input.note ?? null,
          updated_by: actor.authUserId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "milestone_key" }
      );

    if (error) {
      throw new Error(error.message || "Could not save milestone.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "milestone_date_saved",
      metadata: {
        milestoneKey: input.milestoneKey,
        milestoneDate: input.milestoneDate,
      },
    });

    return { success: true };
  });

