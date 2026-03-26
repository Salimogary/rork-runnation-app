import { publicProcedure } from "../../../create-context";

export default publicProcedure.query(async ({ ctx }) => {
  const { data, error } = await ctx.supabase
    .from("orders_to_deliver")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching delivery orders:", error);
    throw new Error(error.message || "Failed to fetch delivery orders");
  }

  return data || [];
});
