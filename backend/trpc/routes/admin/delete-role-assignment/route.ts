import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(z.object({ assignmentId: z.number().int().positive() }))
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
    });

    const { data: assignment, error: fetchError } = await ctx.supabase
      .from("user_role_assignments")
      .select("assignment_id, user_id, country_code, club_id")
      .eq("assignment_id", input.assignmentId)
      .maybeSingle();

    if (fetchError || !assignment) {
      throw new Error(fetchError?.message || "Role assignment was not found.");
    }

    const { error } = await ctx.supabase
      .from("user_role_assignments")
      .delete()
      .eq("assignment_id", input.assignmentId);

    if (error) {
      throw new Error(error.message || "Could not delete the role assignment.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      targetUserId: assignment.user_id,
      targetCountryCode: assignment.country_code ?? null,
      targetClubId: assignment.club_id ?? null,
      actionType: "role_assignment_deleted",
      metadata: {
        assignmentId: input.assignmentId,
      },
    });

    return { success: true };
  });
