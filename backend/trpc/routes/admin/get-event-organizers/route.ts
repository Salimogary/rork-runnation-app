import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

export default publicProcedure.query(async ({ ctx }) => {
  const actor = await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryAdmin: true,
    allowCountryCoordinator: true,
    allowClubCoordinator: true,
    allowSpecialClubCoordinator: true,
    allowEventOrganizer: true,
  });

  let query = ctx.supabase
    .from("event_organizers")
    .select("organizer_id, organizer_name, description, registration_id, country, is_active, created_at")
    .eq("is_active", true)
    .order("organizer_name", { ascending: true });

  const organizerScopes = actor.roles
    .filter((role) => role.roleName === "event_organizer" && role.organizerId)
    .map((role) => role.organizerId as string);

  const shouldRestrictToOrganizerScope =
    actor.isEventOrganizer &&
    !actor.isSuperAdmin &&
    !actor.isCountryAdmin &&
      !actor.isCountryCoordinator &&
    !actor.isClubCoordinator &&
    !actor.isSpecialClubCoordinator;

  if (shouldRestrictToOrganizerScope) {
    if (organizerScopes.length === 0) {
      return [];
    }
    query = query.in("organizer_id", organizerScopes);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || "Could not load event organizers.");
  }

  return data ?? [];
});


