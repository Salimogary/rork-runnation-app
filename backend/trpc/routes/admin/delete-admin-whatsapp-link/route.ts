import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(z.object({ linkType: z.enum(["service_team", "admins"]) }))
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
    });

    const { error } = await ctx.supabase
      .from("admin_whatsapp_links")
      .delete()
      .eq("link_type", input.linkType);

    if (error) {
      throw new Error(error.message || "Could not delete the WhatsApp link.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "admin_whatsapp_link_deleted",
      metadata: {
        linkType: input.linkType,
      },
    });

    return { success: true };
  });

