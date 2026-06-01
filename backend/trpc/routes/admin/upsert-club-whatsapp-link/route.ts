import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      clubId: z.string().uuid(),
      link: z.string().trim().url().max(500),
    })
  )
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

    const { data, error } = await ctx.supabase
      .from("club_whatsap_link")
      .upsert(
        {
          club_id: input.clubId,
          club_name: club.club_name,
          link: input.link.trim(),
        },
        { onConflict: "club_id" }
      )
      .select("link_id")
      .maybeSingle();

    if (error || !data?.link_id) {
      throw new Error(error?.message || "Could not save the WhatsApp link.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "club_whatsapp_link_saved",
      targetClubId: input.clubId,
      metadata: {
        linkId: data.link_id,
        clubName: club.club_name,
      },
    });

    return { success: true, linkId: data.link_id };
  });

