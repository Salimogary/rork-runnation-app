import { publicProcedure } from "../../../create-context";

export default publicProcedure.query(async ({ ctx }) => {
  const { data, error } = await ctx.supabase
    .from("clubs")
    .select("club_id, club_name, country, location, description")
    .order("club_name", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to fetch clubs");
  }

  return data ?? [];
});
