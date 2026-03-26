import { publicProcedure } from "../../../create-context";

export default publicProcedure.query(async ({ ctx }) => {
  const { data, error } = await ctx.supabase
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
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
});
