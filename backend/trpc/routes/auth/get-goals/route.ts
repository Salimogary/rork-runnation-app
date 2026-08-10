import { publicProcedure } from "../../../create-context";

export default publicProcedure.query(async ({ ctx }) => {
  const { data, error } = await ctx.supabase
    .from("goals")
    .select("goal_id, goal, description")
    .order("goal_id", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to fetch goals");
  }

  return data ?? [];
});
