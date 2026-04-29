import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

const roleNameSchema = z.enum([
  "country_admin",
  "country_coordinator",
  "club_coordinator",
  "event_organizer",
]);

export default publicProcedure
  .input(
    z.object({
      assignmentId: z.number().int().positive(),
      roleName: roleNameSchema,
      countryCode: z.string().trim().min(2).max(2).optional().nullable(),
      clubId: z.string().uuid().optional().nullable(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
    });

    const roleName = input.roleName;
    const countryCode = input.countryCode?.trim().toUpperCase() || null;
    const clubId = input.clubId ?? null;

    if ((roleName === "country_admin" || roleName === "country_coordinator") && !countryCode) {
      throw new Error("Country code is required for country-scoped roles.");
    }

    if (roleName === "club_coordinator" && !clubId) {
      throw new Error("Please choose a club for the club coordinator role.");
    }

    const { data: roleId, error: roleError } = await ctx.supabase.rpc(
      "resolve_role_id_for_assignment",
      { p_role_name: roleName }
    );

    if (roleError || !roleId) {
      throw new Error(roleError?.message || "Could not resolve the selected role.");
    }

    const { data: existingAssignment, error: existingError } = await ctx.supabase
      .from("user_role_assignments")
      .select("user_id, organizer_id")
      .eq("assignment_id", input.assignmentId)
      .maybeSingle();

    if (existingError || !existingAssignment) {
      throw new Error(existingError?.message || "Role assignment was not found.");
    }

    let organizerId = roleName === "event_organizer" ? existingAssignment.organizer_id ?? null : null;

    if (roleName === "event_organizer" && !organizerId) {
      const { data: resolvedOrganizerId, error: organizerError } = await ctx.supabase.rpc(
        "ensure_event_organizer_for_user",
        { p_user_id: existingAssignment.user_id }
      );

      if (organizerError || !resolvedOrganizerId) {
        throw new Error(organizerError?.message || "Could not create the event organizer profile.");
      }

      organizerId = resolvedOrganizerId;
    }

    const { error } = await ctx.supabase
      .from("user_role_assignments")
      .update({
        role_id: roleId,
        country_code:
          roleName === "club_coordinator" || roleName === "event_organizer" ? null : countryCode,
        club_id: roleName === "club_coordinator" ? clubId : null,
        organizer_id: organizerId,
        assigned_by: actor.authUserId,
        is_active: true,
      })
      .eq("assignment_id", input.assignmentId);

    if (error) {
      throw new Error(error.message || "Could not update the role assignment.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      targetUserId: existingAssignment.user_id,
      targetCountryCode:
        roleName === "club_coordinator" || roleName === "event_organizer" ? null : countryCode,
      targetClubId: roleName === "club_coordinator" ? clubId : null,
      actionType: "role_assignment_updated",
      metadata: {
        assignmentId: input.assignmentId,
        roleName,
        organizerId,
      },
    });

    return { success: true };
  });
