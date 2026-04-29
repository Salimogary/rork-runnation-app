import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

function getRoleName(row: any): string | null {
  const roleSource = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  return roleSource?.role_name ?? null;
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

    const { error: assignmentError } = await ctx.supabase
      .from("user_role_assignments")
      .upsert({
        user_id: resolvedUserId,
        role_id: invite.role_id,
        country_code: invite.country_code,
        club_id: invite.club_id,
        organizer_id: organizerId,
        assigned_by: actor.authUserId,
        is_active: true,
      }, {
        onConflict: "user_id,role_id,country_code,club_id,organizer_id",
      });

    if (assignmentError) {
      throw new Error(assignmentError.message || "Could not approve the role request.");
    }

    const { error: inviteUpdateError } = await ctx.supabase
      .from("admin_invites")
      .update({
        status: "accepted",
        accepted_by: actor.authUserId,
      })
      .eq("invite_id", input.inviteId);

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
