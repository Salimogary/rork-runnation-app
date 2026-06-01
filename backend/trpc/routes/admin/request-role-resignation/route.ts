import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { getActorRoleSession, logAdminAction } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      reason: z.string().trim().min(10, "Please give a short reason.").max(1000),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await getActorRoleSession(ctx);

    if (!actor.authUserId || !actor.hasAdminAccess) {
      throw new Error("You must be signed in as an admin to resign.");
    }

    if (actor.isSuperAdmin) {
      throw new Error("Global Admins cannot resign through this self-service flow.");
    }

    const eligibleAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

    const { data: assignments, error: assignmentsError } = await ctx.supabase
      .from("user_role_assignments")
      .select("assignment_id")
      .eq("user_id", actor.authUserId)
      .eq("is_active", true);

    if (assignmentsError) {
      throw new Error(assignmentsError.message || "Could not load your admin roles.");
    }

    const assignmentIds = (assignments || []).map((assignment: any) => assignment.assignment_id);

    if (assignmentIds.length === 0) {
      throw new Error("No active admin role was found for this account.");
    }

    const { data: existing, error: existingError } = await ctx.supabase
      .from("admin_role_resignation_requests")
      .select("request_id")
      .eq("user_id", actor.authUserId)
      .eq("status", "pending")
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message || "Could not check existing resignation requests.");
    }

    if (existing) {
      throw new Error("You already have a pending resignation request.");
    }

    const { error } = await ctx.supabase
      .from("admin_role_resignation_requests")
      .insert({
        user_id: actor.authUserId,
        assignment_ids: assignmentIds,
        reason: input.reason,
        status: "pending",
        eligible_at: eligibleAt,
      });

    if (error) {
      throw new Error(error.message || "Could not submit your resignation request.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "admin_role_resignation_requested",
      metadata: {
        assignmentIds,
        eligibleAt,
      },
    });

    return {
      success: true,
      eligibleAt,
      message: "Your resignation request is pending and will be eligible for automatic actioning after 12 hours unless a Global Admin handles it first.",
    };
  });

