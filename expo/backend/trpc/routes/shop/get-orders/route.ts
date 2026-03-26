import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(z.object({ userId: z.string() }))
  .query(async ({ input, ctx }) => {
    const { data, error } = await ctx.supabase
      .from("orders")
      .select(`
        order_id,
        total_amount,
        status,
        delivery_name,
        delivery_phone,
        delivery_address,
        created_at,
        updated_at
      `)
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return data || [];
  });
