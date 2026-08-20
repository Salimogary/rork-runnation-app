import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      androidApkUrl: z.string().trim().url().max(1000),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
    });

    const { data, error } = await ctx.supabase
      .from("app_settings")
      .upsert(
        {
          key: "android_apk_url",
          value: input.androidApkUrl,
          description: "Current RunNation Android APK share link.",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      )
      .select("key")
      .maybeSingle();

    if (error || !data?.key) {
      throw new Error(error?.message || "Could not save the Share App link.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "app_share_link_updated",
      metadata: {
        key: "android_apk_url",
      },
    });

    return { success: true, androidApkUrl: input.androidApkUrl };
  });
