import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

const LINK_TYPE_LABELS: Record<"service_team" | "admins", string> = {
  service_team: "Service team",
  admins: "Admins",
};

export default publicProcedure
  .input(
    z.object({
      linkType: z.enum(["service_team", "admins"]),
      link: z.string().trim().url().max(500),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
    });

    const { data, error } = await ctx.supabase
      .from("admin_whatsapp_links")
      .upsert(
        {
          link_type: input.linkType,
          link: input.link.trim(),
          updated_by: actor.authUserId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "link_type" }
      )
      .select("link_type")
      .maybeSingle();

    if (error || !data?.link_type) {
      throw new Error(error?.message || "Could not save the WhatsApp link.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "admin_whatsapp_link_saved",
      metadata: {
        linkType: input.linkType,
        label: LINK_TYPE_LABELS[input.linkType],
      },
    });

    return { success: true, linkType: data.link_type };
  });

