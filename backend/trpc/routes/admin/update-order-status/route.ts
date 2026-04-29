import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      orderId: z.string(),
      status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
    });

    const { orderId, status } = input;

    const { error } = await ctx.supabase
      .from("orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("order_id", orderId);

    if (error) throw error;

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "update_order_status",
      metadata: {
        orderId,
        status,
      },
    });

    return { success: true };
  });
