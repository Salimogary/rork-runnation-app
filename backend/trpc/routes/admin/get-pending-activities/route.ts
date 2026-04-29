import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";
import { resolvePrivateActivityUploadUrl } from "../../../storage";

export default publicProcedure.query(async ({ ctx }) => {
  await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
          allowCountryCoordinator: true,
    allowClubCoordinator: true,
  });

  const { data, error } = await ctx.supabase
    .from("pending_activities")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to fetch pending activities");
  }

  return await Promise.all(
    (data || []).map(async (activity: any) => ({
      ...activity,
      photoUrl: await resolvePrivateActivityUploadUrl(ctx.supabase, activity.photo_path),
    }))
  );
});

