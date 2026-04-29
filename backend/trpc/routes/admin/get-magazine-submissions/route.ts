import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

export default publicProcedure.query(async ({ ctx }) => {
  await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
          allowCountryCoordinator: true,
    allowClubCoordinator: true,
  });

  const { data, error } = await ctx.supabase
    .from("magazine_article_submissions")
    .select("*")
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Could not load magazine submissions.");
  }

  return data ?? [];
});

