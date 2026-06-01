import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

function getSingleRelation(row: any, key: string): any | null {
  const value = row?.[key];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function countByActionType(rows: any[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const actionType = String(row.action_type || "unknown");
    counts[actionType] = (counts[actionType] || 0) + 1;
    return counts;
  }, {});
}

async function saveResignedAdminLog(ctx: any, input: { assignment: any; deletedBy: string | null }) {
  const role = getSingleRelation(input.assignment, "roles");
  const club = getSingleRelation(input.assignment, "clubs");

  const [{ data: activeRoles }, { data: auditRows }] = await Promise.all([
    ctx.supabase
      .from("user_role_assignments")
      .select("assignment_id, country_code, club_id, is_active, created_at, roles(role_name), clubs(club_name)")
      .eq("user_id", input.assignment.user_id)
      .eq("is_active", true),
    ctx.supabase
      .from("admin_action_logs")
      .select("log_id, action_type, target_country_code, target_club_id, metadata, created_at")
      .or(`actor_user_id.eq.${input.assignment.user_id},target_user_id.eq.${input.assignment.user_id}`)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const rows = auditRows || [];
  const recentActivity = rows.slice(0, 20).map((row: any) => ({
    logId: row.log_id,
    actionType: row.action_type,
    countryCode: row.target_country_code ?? null,
    clubId: row.target_club_id ?? null,
    createdAt: row.created_at,
  }));
  const actionCounts = countByActionType(rows);
  const activeRolesSnapshot = (activeRoles || []).map((assignment: any) => {
    const snapshotRole = getSingleRelation(assignment, "roles");
    const snapshotClub = getSingleRelation(assignment, "clubs");
    return {
      assignmentId: assignment.assignment_id,
      roleName: snapshotRole?.role_name ?? null,
      countryCode: assignment.country_code ?? null,
      clubId: assignment.club_id ?? null,
      clubName: snapshotClub?.club_name ?? null,
      isActive: assignment.is_active,
      assignedAt: assignment.created_at,
    };
  });

  const firstActivityAt = rows.length > 0 ? rows[rows.length - 1]?.created_at ?? null : null;
  const lastActivityAt = rows[0]?.created_at ?? null;

  const { error } = await ctx.supabase
    .from("resigned_admin_log")
    .insert({
      resigned_user_id: input.assignment.user_id,
      deleted_assignment_id: input.assignment.assignment_id,
      deleted_role_name: role?.role_name ?? null,
      deleted_country_code: input.assignment.country_code ?? null,
      deleted_club_id: input.assignment.club_id ?? null,
      deleted_club_name: club?.club_name ?? null,
      assigned_at: input.assignment.created_at ?? null,
      deleted_by: input.deletedBy,
      deletion_source: "admin_role_assignment_delete",
      activity_summary: {
        totalAuditEntriesSampled: rows.length,
        firstActivityAt,
        lastActivityAt,
        distinctActionTypes: Object.keys(actionCounts).length,
      },
      action_counts: actionCounts,
      recent_activity: recentActivity,
      active_roles_snapshot: activeRolesSnapshot,
    });

  if (error) {
    throw new Error(error.message || "Could not save the resigned admin audit log.");
  }
}

export default publicProcedure
  .input(z.object({ assignmentId: z.number().int().positive() }))
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
    });

    const { data: assignment, error: fetchError } = await ctx.supabase
      .from("user_role_assignments")
      .select("assignment_id, user_id, country_code, club_id, created_at, roles(role_name), clubs(club_name)")
      .eq("assignment_id", input.assignmentId)
      .maybeSingle();

    if (fetchError || !assignment) {
      throw new Error(fetchError?.message || "Role assignment was not found.");
    }

    await saveResignedAdminLog(ctx, {
      assignment,
      deletedBy: actor.authUserId,
    });

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

