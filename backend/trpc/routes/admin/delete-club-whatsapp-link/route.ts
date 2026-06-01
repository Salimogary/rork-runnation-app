import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(z.object({ clubId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => {
    const { data: club, error: clubError } = await ctx.supabase
      .from("clubs")
      .select("club_id, club_name, country")
      .eq("club_id", input.clubId)
      .maybeSingle();

    if (clubError || !club) {
      throw new Error(clubError?.message || "Club was not found.");
    }

    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
      allowSpecialClubCoordinator: true,
      countryCode: club.country ?? null,
      clubId: input.clubId,
    });

    const { error } = await ctx.supabase
      .from("club_whatsap_link")
      .delete()
      .eq("club_id", input.clubId);

    if (error) {
      throw new Error(error.message || "Could not delete the WhatsApp link.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "club_whatsapp_link_deleted",
      targetClubId: input.clubId,
      metadata: {
        clubName: club.club_name,
      },
    });

    return { success: true };
  });

