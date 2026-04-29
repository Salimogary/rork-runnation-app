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

    const { data, error } = await ctx.supabase
      .from("orders_to_deliver")
      .update({ status })
      .eq("order_id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error updating delivery order status:", error);
      throw new Error(error.message || "Failed to update order status");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "update_delivery_order_status",
      metadata: {
        orderId,
        status,
      },
    });

    return data;
  });
