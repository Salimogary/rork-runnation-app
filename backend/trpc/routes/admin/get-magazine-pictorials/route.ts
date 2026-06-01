import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";
import { canAccessMagazineRow, getScopedMagazineAccess } from "../magazine-scope";

export default publicProcedure.query(async ({ ctx }) => {
  const actor = await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryCoordinator: true,
    allowClubCoordinator: true,
    allowSpecialClubCoordinator: true,
    allowMagazineEditor: true,
  });

  const { data, error } = await ctx.supabase
    .from("magazine_pictorial_submissions")
    .select("*")
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Could not load event pictorial submissions.");
  }

  const scope = await getScopedMagazineAccess(ctx, actor);
  return (data ?? []).filter((row: any) => canAccessMagazineRow(row, scope));
});


