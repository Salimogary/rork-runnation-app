import { ADMIN_TERMS_VERSION } from "../../../admin-terms";
import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

const MANAGED_ROLE_NAMES = new Set([
  "super_admin",
  "country_admin",
  "country_coordinator",
  "club_coordinator",
  "event_organizer",
]);

export default publicProcedure.query(async ({ ctx }) => {
  const actor = await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryAdmin: true,
    allowCountryCoordinator: true,
    allowClubCoordinator: true,
    allowEventOrganizer: true,
  });

  if (!actor.authUserId) {
    throw new Error("You must be signed in.");
  }

  const { data: assignments, error: assignmentsError } = await ctx.supabase
    .from("user_role_assignments")
    .select("roles(role_name)")
    .eq("user_id", actor.authUserId)
    .eq("is_active", true);

  if (assignmentsError) {
    throw new Error(assignmentsError.message || "Could not load admin roles.");
  }

  const roleNames = (assignments ?? [])
    .map((row: any) => {
      const roleSource = Array.isArray(row.roles) ? row.roles[0] : row.roles;
      return roleSource?.role_name ?? null;
    })
    .filter((roleName: string | null): roleName is string => Boolean(roleName))
    .filter((roleName) => MANAGED_ROLE_NAMES.has(roleName));

  const { data: acceptance, error: acceptanceError } = await ctx.supabase
    .from("admin_terms_acceptances")
    .select("accepted_at, terms_version")
    .eq("user_id", actor.authUserId)
    .eq("terms_version", ADMIN_TERMS_VERSION)
    .maybeSingle();

  if (acceptanceError) {
    throw new Error(acceptanceError.message || "Could not load admin terms status.");
  }

  return {
    currentVersion: ADMIN_TERMS_VERSION,
    hasAcceptedCurrentVersion: !!acceptance,
    acceptedAt: acceptance?.accepted_at ?? null,
    roleNames,
  };
});
