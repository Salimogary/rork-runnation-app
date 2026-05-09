import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(z.object({ inviteId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
    });

    const { data: invite, error: inviteError } = await ctx.supabase
      .from("admin_invites")
      .select("invite_id, email, country_code, club_id, status")
      .eq("invite_id", input.inviteId)
      .maybeSingle();

    if (inviteError || !invite) {
      throw new Error(inviteError?.message || "Role request was not found.");
    }

    if (invite.status !== "pending") {
      throw new Error("This role request has already been reviewed.");
    }

    const { error } = await ctx.supabase
      .from("admin_invites")
      .update({
        status: "revoked",
        accepted_by: actor.authUserId,
      })
      .eq("invite_id", input.inviteId)
      .eq("status", "pending");

    if (error) {
      throw new Error(error.message || "Could not reject the role request.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      targetCountryCode: invite.country_code ?? null,
      targetClubId: invite.club_id ?? null,
      actionType: "role_request_rejected",
      metadata: {
        inviteId: input.inviteId,
        email: invite.email,
      },
    });

    return { success: true };
  });
