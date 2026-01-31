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

    const { error } = await ctx.supabase
      .from("orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("order_id", orderId);

    if (error) throw error;

    return { success: true };
  });
