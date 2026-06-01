import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { ensureEventOrganizerForUser } from "../../../event-organizer-profile";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

function getRoleName(row: any): string | null {
  const roleSource = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  return roleSource?.role_name ?? null;
}

function isGlobalAdminRole(roleName: string | null | undefined): boolean {
  const normalized = roleName?.trim().toLowerCase();
  return normalized === "super_admin" || normalized === "global_admin";
}

const GLOBAL_ROLE_NAMES = new Set([
  "magazine_editor",
  "chat_room_administrator",
  "magazine_columnist_fitness_coach",
  "magazine_columnist_sports_journalist",
  "magazine_columnist_motivation_speaker",
  "junior_runners_club_coordinator",
  "golden_age_runners_club_coordinator",
  "treadmill_runners_club_coordinator",
  "para_runners_club_coordinator",
  "smartfit_club_coordinator",
]);

const SERVICE_ROLE_LIMITS: Record<string, number> = {
  event_organizer: 50,
  club_coordinator: 50,
  shop_manager: 1,
  country_coordinator: 1,
  junior_runners_club_coordinator: 1,
  golden_age_runners_club_coordinator: 1,
  treadmill_runners_club_coordinator: 1,
  para_runners_club_coordinator: 1,
  smartfit_club_coordinator: 1,
  magazine_editor: 1,
  chat_room_administrator: 1,
  magazine_columnist_fitness_coach: 1,
  magazine_columnist_sports_journalist: 1,
  magazine_columnist_motivation_speaker: 1,
};

const DISABLED_SERVICE_ROLES = new Set(["shop_manager"]);

const SPECIAL_CLUB_CODE_BY_ROLE: Record<string, string> = {
  junior_runners_club_coordinator: "junior_runners",
  golden_age_runners_club_coordinator: "golden_age_runners",
  treadmill_runners_club_coordinator: "treadmill_runners",
  para_runners_club_coordinator: "para_runners",
  smartfit_club_coordinator: "smartfit_club",
};

async function countActiveServiceRoles(ctx: any, roleId: number, roleName: string, countryCode: string | null) {
  const { data: assignments, error: assignmentsError } = await ctx.supabase
    .from("user_role_assignments")
    .select("assignment_id, country_code, club_id, organizer_id, roles(role_name)")
    .eq("is_active", true)
    .eq("role_id", roleId);

  if (assignmentsError) {
    throw new Error(assignmentsError.message || "Could not check existing role assignments.");
  }

  if (GLOBAL_ROLE_NAMES.has(roleName)) {
    return (assignments ?? []).filter((assignment: any) => getRoleName(assignment) === roleName).length;
  }

  if (!countryCode) {
    return 0;
  }

  const [clubsResult, organizersResult] = await Promise.all([
    ctx.supabase
      .from("clubs")
      .select("club_id")
      .eq("country", countryCode),
    ctx.supabase
      .from("event_organizers")
      .select("organizer_id")
      .eq("country", countryCode)
      .eq("is_active", true),
  ]);

  if (clubsResult.error) {
    throw new Error(clubsResult.error.message || "Could not check country clubs.");
  }
  if (organizersResult.error) {
    throw new Error(organizersResult.error.message || "Could not check country organizers.");
  }

  const clubIdsInCountry = new Set((clubsResult.data ?? []).map((club: any) => club.club_id).filter(Boolean));
  const organizerIdsInCountry = new Set((organizersResult.data ?? []).map((organizer: any) => organizer.organizer_id).filter(Boolean));

  return (assignments ?? []).filter((assignment: any) => {
    if (getRoleName(assignment) !== roleName) return false;
    if (assignment.country_code === countryCode) return true;
    if (roleName === "club_coordinator" && assignment.club_id && clubIdsInCountry.has(assignment.club_id)) return true;
    if (roleName === "event_organizer" && assignment.organizer_id && organizerIdsInCountry.has(assignment.organizer_id)) return true;
    return false;
  }).length;
}

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
    if (inviteRoleName && DISABLED_SERVICE_ROLES.has(inviteRoleName)) {
      throw new Error("Shop Manager is coming soon. The online store is not ready yet.");
    }

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
    const isSuperAdminUser = (allActiveRoles ?? []).some((assignment: any) => isGlobalAdminRole(getRoleName(assignment)));
    if (!isSuperAdminUser && (activeRoles ?? []).length > 0) {
      throw new Error("This user already has an active role. Each user can hold only one role at a time.");
    }

    let organizerId = invite.organizer_id ?? null;

    if (inviteRoleName === "event_organizer") {
      organizerId = await ensureEventOrganizerForUser(ctx, String(resolvedUserId));
    }

    let serviceRoleCountryCode = invite.country_code ?? null;
    if (!serviceRoleCountryCode && inviteRoleName === "event_organizer" && organizerId) {
      const { data: organizer, error: organizerCountryError } = await ctx.supabase
        .from("event_organizers")
        .select("country")
        .eq("organizer_id", organizerId)
        .maybeSingle();

      if (organizerCountryError) {
        throw new Error(organizerCountryError.message || "Could not check event organizer country.");
      }

      serviceRoleCountryCode = organizer?.country ?? null;
    }
    if (!serviceRoleCountryCode && inviteRoleName === "club_coordinator" && invite.club_id) {
      const { data: club, error: clubCountryError } = await ctx.supabase
        .from("clubs")
        .select("country")
        .eq("club_id", invite.club_id)
        .maybeSingle();

      if (clubCountryError) {
        throw new Error(clubCountryError.message || "Could not check club country.");
      }

      serviceRoleCountryCode = club?.country ?? null;
    }

    const assignmentCountryCode =
      inviteRoleName === "event_organizer" || (inviteRoleName ? GLOBAL_ROLE_NAMES.has(inviteRoleName) : false)
        ? null
        : invite.country_code;

    if (inviteRoleName && SERVICE_ROLE_LIMITS[inviteRoleName] !== undefined) {
      const activeCount = await countActiveServiceRoles(
        ctx,
        Number(invite.role_id),
        inviteRoleName,
        serviceRoleCountryCode
      );
      if (activeCount >= SERVICE_ROLE_LIMITS[inviteRoleName]) {
        throw new Error(
          GLOBAL_ROLE_NAMES.has(inviteRoleName)
            ? "This role is already filled globally."
            : "This role is already filled in this country."
        );
      }
    }

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

    if (inviteRoleName === "event_organizer" && organizerId) {
      const { error: organizerActivateError } = await ctx.supabase
        .from("event_organizers")
        .update({ is_active: true })
        .eq("organizer_id", organizerId);

      if (organizerActivateError) {
        throw new Error(organizerActivateError.message || "Role assigned, but the event organizer profile could not be activated.");
      }
    }

    if (inviteRoleName === "club_coordinator" && invite.club_id) {
      const { data: coordinatorId, error: coordinatorError } = await ctx.supabase.rpc(
        "ensure_coordinator_for_profile",
        { p_user_id: resolvedUserId }
      );

      if (coordinatorError || !coordinatorId) {
        throw new Error(coordinatorError?.message || "Role assigned, but the coordinator profile could not be created.");
      }

      const { error: clubActivateError } = await ctx.supabase
        .from("clubs")
        .update({
          coordinator_id: String(coordinatorId),
          is_active: true,
        })
        .eq("club_id", invite.club_id);

      if (clubActivateError) {
        throw new Error(clubActivateError.message || "Role assigned, but the club profile could not be activated.");
      }
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

