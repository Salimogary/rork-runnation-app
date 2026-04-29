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
      email: z.string().min(3),
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
    const email = input.email.trim().toLowerCase();
    const countryCode = input.countryCode?.trim().toUpperCase() || null;
    const clubId = input.clubId ?? null;

    if ((roleName === "country_admin" || roleName === "country_coordinator") && !countryCode) {
      throw new Error("Country code is required for country-scoped roles.");
    }

    if (roleName === "club_coordinator" && !clubId) {
      throw new Error("Please choose a club for the club coordinator role.");
    }

    const { data: roleRow, error: roleError } = await ctx.supabase
      .from("roles")
      .select("role_id")
      .eq("role_name", roleName)
      .maybeSingle();

    if (roleError || !roleRow) {
      throw new Error(roleError?.message || "Could not resolve the selected role.");
    }

    const { data, error } = await ctx.supabase
      .from("admin_invites")
      .insert({
        email,
        role_id: roleRow.role_id,
        country_code:
          roleName === "club_coordinator" || roleName === "event_organizer" ? null : countryCode,
        club_id: roleName === "club_coordinator" ? clubId : null,
        organizer_id: null,
        invited_by: actor.authUserId,
        status: "pending",
      })
      .select("invite_id")
      .maybeSingle();

    if (error || !data) {
      throw new Error(error?.message || "Could not create the role request.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "role_request_created",
      targetCountryCode:
        roleName === "club_coordinator" || roleName === "event_organizer" ? null : countryCode,
      targetClubId: roleName === "club_coordinator" ? clubId : null,
      metadata: {
        inviteId: data.invite_id,
        email,
        roleName,
      },
    });

    return { success: true, inviteId: data.invite_id };
  });
