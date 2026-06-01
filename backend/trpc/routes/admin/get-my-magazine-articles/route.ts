import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

async function getActorRegistrationIds(ctx: any, authUserId: string): Promise<string[]> {
  const ids = new Set<string>([authUserId]);

  const { data: profile, error } = await ctx.supabase
    .from("profiles")
    .select("profile_id, registration_id, legacy_registration_id")
    .eq("profile_id", authUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not resolve your profile.");
  }

  if (profile?.profile_id) ids.add(String(profile.profile_id));
  if (profile?.registration_id) ids.add(String(profile.registration_id));
  if (profile?.legacy_registration_id) ids.add(String(profile.legacy_registration_id));

  return Array.from(ids);
}

export default publicProcedure.query(async ({ ctx }) => {
  const actor = await requireAdminPermission(ctx, {
    allowMagazineColumnist: true,
    allowMagazineEditor: true,
    allowSuperAdmin: true,
  });

  if (!actor.authUserId) {
    throw new Error("You must be signed in to view your articles.");
  }

  const registrationIds = await getActorRegistrationIds(ctx, actor.authUserId);
  const profileIds = [actor.authUserId];

  const { data, error } = await ctx.supabase
    .from("magazine_article_submissions")
    .select("*")
    .neq("status", "deleted")
    .or(`profile_id.in.(${profileIds.join(",")}),registration_id.in.(${registrationIds.join(",")})`)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Could not load your magazine articles.");
  }

  return data ?? [];
});

