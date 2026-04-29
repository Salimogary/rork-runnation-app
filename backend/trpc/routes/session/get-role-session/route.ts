import { z } from "zod";
import { publicProcedure } from "../../../create-context";

const inputSchema = z.object({
  registrationId: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
});

type RoleAssignmentRow = {
  country_code: string | null;
  club_id: string | null;
  organizer_id: string | null;
  roles: { role_name: string } | { role_name: string }[] | null;
};

function getRoleName(row: RoleAssignmentRow): string | null {
  if (!row.roles) return null;
  if (Array.isArray(row.roles)) {
    return row.roles[0]?.role_name ?? null;
  }
  return row.roles.role_name;
}

function isMissingSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("column") ||
    message.includes("schema cache")
  );
}

export default publicProcedure
  .input(inputSchema)
  .query(async ({ ctx, input }) => {
    const emptySession = {
      authUserId: ctx.authUserId,
      profileId: null as string | null,
      registrationId: input.registrationId ?? null,
      username: input.username ?? null,
      displayName: null as string | null,
      roles: [] as Array<{
        roleName: string;
        countryCode: string | null;
        clubId: string | null;
        organizerId: string | null;
      }>,
      isSuperAdmin: false,
      isCountryAdmin: false,
      isCountryCoordinator: false,
      isClubCoordinator: false,
      isEventOrganizer: false,
      hasAdminAccess: false,
      countryAdminScopes: [] as string[],
      countryCoordinatorScopes: [] as string[],
      clubCoordinatorScopes: [] as string[],
      eventOrganizerScopes: [] as string[],
      source: ctx.authUserId ? "auth" : input.registrationId ? "legacy" : "none",
    };

    try {
      let profileQuery = ctx.supabase
        .from("profiles")
        .select("profile_id, registration_id, username, display_name")
        .limit(1);

      if (ctx.authUserId) {
        profileQuery = profileQuery.eq("profile_id", ctx.authUserId);
      } else if (input.registrationId) {
        profileQuery = profileQuery.eq("registration_id", input.registrationId);
      } else if (input.username) {
        profileQuery = profileQuery.eq("username", input.username.toLowerCase().trim());
      } else {
        return emptySession;
      }

      const { data: profile, error: profileError } = await profileQuery.maybeSingle();

      if (profileError) {
        if (isMissingSchemaError(profileError)) {
          console.warn("[RBAC] profiles table not ready yet, returning empty role session.");
          return emptySession;
        }
        throw profileError;
      }

      if (!profile) {
        return emptySession;
      }

      const { data: assignments, error: assignmentsError } = await ctx.supabase
        .from("user_role_assignments")
        .select("country_code, club_id, organizer_id, roles(role_name)")
        .eq("user_id", profile.profile_id)
        .eq("is_active", true);

      if (assignmentsError) {
        if (isMissingSchemaError(assignmentsError)) {
          console.warn("[RBAC] role assignment tables not ready yet, returning profile-only session.");
          return {
            ...emptySession,
            profileId: profile.profile_id,
            registrationId: profile.registration_id,
            username: profile.username,
            displayName: profile.display_name,
            source: ctx.authUserId ? "auth" : "legacy",
          };
        }
        throw assignmentsError;
      }

      const roles = (assignments ?? [])
        .map((row) => ({
          roleName: getRoleName(row as RoleAssignmentRow),
          countryCode: row.country_code,
          clubId: row.club_id,
          organizerId: row.organizer_id,
        }))
        .filter(
          (
            row
          ): row is {
            roleName: string;
            countryCode: string | null;
            clubId: string | null;
            organizerId: string | null;
          } => Boolean(row.roleName)
        );

      const isSuperAdmin = roles.some((role) => role.roleName === "super_admin");
      const countryAdminScopes = roles
        .filter((role) => role.roleName === "country_admin" && role.countryCode)
        .map((role) => role.countryCode as string);
      const countryCoordinatorScopes = roles
        .filter((role) => role.roleName === "country_coordinator" && role.countryCode)
        .map((role) => role.countryCode as string);
      const clubCoordinatorScopes = roles
        .filter((role) => role.roleName === "club_coordinator" && role.clubId)
        .map((role) => role.clubId as string);
      const eventOrganizerScopes = roles
        .filter((role) => role.roleName === "event_organizer" && role.organizerId)
        .map((role) => role.organizerId as string);
      const hasAuthBackedSession = Boolean(ctx.authUserId);

      return {
        authUserId: ctx.authUserId,
        profileId: profile.profile_id,
        registrationId: profile.registration_id,
        username: profile.username,
        displayName: profile.display_name,
        roles: hasAuthBackedSession ? roles : [],
        isSuperAdmin: hasAuthBackedSession ? isSuperAdmin : false,
        isCountryAdmin: hasAuthBackedSession ? countryAdminScopes.length > 0 : false,
        isCountryCoordinator: hasAuthBackedSession ? countryCoordinatorScopes.length > 0 : false,
        isClubCoordinator: hasAuthBackedSession ? clubCoordinatorScopes.length > 0 : false,
        isEventOrganizer: hasAuthBackedSession ? eventOrganizerScopes.length > 0 : false,
        hasAdminAccess: hasAuthBackedSession
          ? isSuperAdmin ||
            countryAdminScopes.length > 0 ||
            countryCoordinatorScopes.length > 0 ||
            clubCoordinatorScopes.length > 0 ||
            eventOrganizerScopes.length > 0
          : false,
        countryAdminScopes: hasAuthBackedSession ? countryAdminScopes : [],
        countryCoordinatorScopes: hasAuthBackedSession ? countryCoordinatorScopes : [],
        clubCoordinatorScopes: hasAuthBackedSession ? clubCoordinatorScopes : [],
        eventOrganizerScopes: hasAuthBackedSession ? eventOrganizerScopes : [],
        source: ctx.authUserId ? "auth" : "legacy",
      };
    } catch (error) {
      console.warn(
        "[RBAC] Failed to build role session, returning empty session:",
        error instanceof Error ? error.message : error
      );
      return emptySession;
    }
  });
