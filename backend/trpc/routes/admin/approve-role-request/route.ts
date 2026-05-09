import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

function getRoleName(row: any): string | null {
  const roleSource = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  return roleSource?.role_name ?? null;
}

const GLOBAL_ROLE_NAMES = new Set([
  "magazine_columnist_fitness_coach",
  "magazine_columnist_sports_journalist",
  "magazine_columnist_motivation_speaker",
  "junior_runners_club_coordinator",
  "golden_age_runners_club_coordinator",
  "treadmill_runners_club_coordinator",
  "para_runners_club_coordinator",
]);

const SPECIAL_CLUB_CODE_BY_ROLE: Record<string, string> = {
  junior_runners_club_coordinator: "junior_runners",
  golden_age_runners_club_coordinator: "golden_age_runners",
  treadmill_runners_club_coordinator: "treadmill_runners",
  para_runners_club_coordinator: "para_runners",
};

export default publicProcedure
  .input(z.object({ inviteId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
    });

    const { data: invite, error: inviteError } = await ctx.supabase
      .from("admin_invites")
      .select("invite_id, email, role_id, country_code, club_id, organizer_id, status, roles(role_name)")
      .eq("invite_id", input.inviteId)
      .maybeSingle();

    if (inviteError || !invite) {
      throw new Error(inviteError?.message || "Role request was not found.");
    }

    if (invite.status !== "pending") {
      throw new Error("This role request has already been reviewed.");
    }

    const { data: resolvedUserId, error: resolveError } = await ctx.supabase.rpc(
      "resolve_profile_id_for_role_assignment",
      { p_email: invite.email }
    );

    if (resolveError || !resolvedUserId) {
      throw new Error(resolveError?.message || "The user must sign in first before you can approve this role.");
    }

    const inviteRoleName = getRoleName(invite);

    const { data: activeRoles, error: activeRolesError } = await ctx.supabase
      .from("user_role_assignments")
      .select("assignment_id, roles(role_name)")
      .eq("user_id", resolvedUserId)
      .eq("is_active", true)
      .eq("is_exclusive_admin_role", true)
      .limit(1);

    const { data: allActiveRoles, error: allActiveRolesError } = await ctx.supabase
      .from("user_role_assignments")
      .select("assignment_id, roles(role_name)")
      .eq("user_id", resolvedUserId)
      .eq("is_active", true);

    if (activeRolesError) {
      throw new Error(activeRolesError.message || "Could not check existing role assignments.");
    }
    if (allActiveRolesError) {
      throw new Error(allActiveRolesError.message || "Could not check existing role assignments.");
    }
    const isSuperAdminUser = (allActiveRoles ?? []).some((assignment: any) => getRoleName(assignment) === "super_admin");
    if (!isSuperAdminUser && (activeRoles ?? []).length > 0) {
      throw new Error("This user already has an active role. Each user can hold only one role at a time.");
    }

    let organizerId = invite.organizer_id ?? null;

    if (inviteRoleName === "event_organizer") {
      const { data: resolvedOrganizerId, error: organizerError } = await ctx.supabase.rpc(
        "ensure_event_organizer_for_user",
        { p_user_id: resolvedUserId }
      );

      if (organizerError || !resolvedOrganizerId) {
        throw new Error(organizerError?.message || "Could not create the event organizer profile.");
      }

      organizerId = resolvedOrganizerId;
    }

    const assignmentCountryCode =
      inviteRoleName === "event_organizer" || (inviteRoleName ? GLOBAL_ROLE_NAMES.has(inviteRoleName) : false)
        ? null
        : invite.country_code;

    const { error: assignmentError } = await ctx.supabase
      .from("user_role_assignments")
      .upsert({
        user_id: resolvedUserId,
        role_id: invite.role_id,
        country_code: assignmentCountryCode,
        club_id: invite.club_id,
        organizer_id: organizerId,
        assigned_by: actor.authUserId,
        is_active: true,
        is_exclusive_admin_role: inviteRoleName !== "user",
      }, {
        onConflict: "user_id,role_id,country_code,club_id,organizer_id",
      });

    if (assignmentError) {
      throw new Error(assignmentError.message || "Could not approve the role request.");
    }

    if (inviteRoleName && SPECIAL_CLUB_CODE_BY_ROLE[inviteRoleName]) {
      const { data: coordinatorId, error: coordinatorError } = await ctx.supabase.rpc(
        "ensure_coordinator_for_profile",
        { p_user_id: resolvedUserId }
      );

      if (coordinatorError || !coordinatorId) {
        throw new Error(coordinatorError?.message || "Role assigned, but the coordinator profile could not be created.");
      }

      const { error: clubUpdateError } = await ctx.supabase
        .from("clubs")
        .update({ coordinator_id: String(coordinatorId) })
        .eq("special_club_code", SPECIAL_CLUB_CODE_BY_ROLE[inviteRoleName]);

      if (clubUpdateError) {
        throw new Error(clubUpdateError.message || "Role assigned, but special club coordinator could not be updated.");
      }
    }

    const { error: inviteUpdateError } = await ctx.supabase
      .from("admin_invites")
      .update({
        status: "accepted",
        accepted_by: actor.authUserId,
      })
      .eq("invite_id", input.inviteId)
      .eq("status", "pending");

    if (inviteUpdateError) {
      throw new Error(inviteUpdateError.message || "Role was assigned, but the request status could not be updated.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      targetUserId: resolvedUserId,
      targetCountryCode: invite.country_code ?? null,
      targetClubId: invite.club_id ?? null,
      actionType: "role_request_approved",
      metadata: {
        inviteId: input.inviteId,
        email: invite.email,
        roleName: inviteRoleName,
        organizerId,
      },
    });

    return { success: true };
  });
