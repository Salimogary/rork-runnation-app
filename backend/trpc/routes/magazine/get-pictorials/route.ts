import { publicProcedure } from "../../../create-context";

export default publicProcedure.query(async ({ ctx }) => {
  const { data, error } = await ctx.supabase
    .from("magazine_pictorial_submissions")
    .select("*")
    .eq("status", "accepted")
    .order("is_picture_of_week", { ascending: false })
    .order("selected_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.warn("[Magazine] Falling back because pictorials table is not ready:", error.message);
    return [];
  }

  return data ?? [];
});
