import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      orderId: z.string(),
      status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]),
    })
  )
  .mutation(async ({ input, ctx }) => {
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

    return data;
  });
