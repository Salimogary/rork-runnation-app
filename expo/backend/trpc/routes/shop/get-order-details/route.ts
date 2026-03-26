import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(z.object({ orderId: z.string() }))
  .query(async ({ input, ctx }) => {
    const { data: order, error: orderError } = await ctx.supabase
      .from("orders")
      .select(`
        order_id,
        user_id,
        total_amount,
        status,
        delivery_name,
        delivery_phone,
        delivery_address,
        created_at,
        updated_at
      `)
      .eq("order_id", input.orderId)
      .single();

    if (orderError) throw orderError;

    const { data: items, error: itemsError } = await ctx.supabase
      .from("order_items")
      .select("*")
      .eq("order_id", input.orderId);

    if (itemsError) throw itemsError;

    return { ...order, items: items || [] };
  });
