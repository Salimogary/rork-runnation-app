import type { Context } from "./create-context";

type RoleName =
  | "super_admin"
  | "country_admin"
  | "country_coordinator"
  | "club_coordinator"
  | "event_organizer"
  | "user";

type RoleAssignment = {
  roleName: RoleName;
  countryCode: string | null;
  clubId: string | null;
  organizerId: string | null;
};

export type ActorRoleSession = {
  authUserId: string | null;
  roles: RoleAssignment[];
  isSuperAdmin: boolean;
  isCountryAdmin: boolean;
  isCountryCoordinator: boolean;
  isClubCoordinator: boolean;
  isEventOrganizer: boolean;
  hasAdminAccess: boolean;
};

function isMissingSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("column") ||
    message.includes("schema cache")
  );
}

export async function getActorRoleSession(ctx: Context): Promise<ActorRoleSession> {
  const emptySession: ActorRoleSession = {
    authUserId: ctx.authUserId,
    roles: [],
    isSuperAdmin: false,
    isCountryAdmin: false,
    isCountryCoordinator: false,
    isClubCoordinator: false,
    isEventOrganizer: false,
    hasAdminAccess: false,
  };

  if (!ctx.authUserId) {
    return emptySession;
  }

  try {
    const { data, error } = await ctx.supabase
      .from("user_role_assignments")
      .select("country_code, club_id, organizer_id, roles(role_name)")
      .eq("user_id", ctx.authUserId)
      .eq("is_active", true);

    if (error) {
      if (isMissingSchemaError(error)) {
        return emptySession;
      }
      throw error;
    }

    const roles: RoleAssignment[] = (data ?? [])
      .map((row: any) => {
        const roleSource = Array.isArray(row.roles) ? row.roles[0] : row.roles;
        const roleName = roleSource?.role_name as RoleName | undefined;
        if (!roleName) return null;
        return {
          roleName,
          countryCode: row.country_code ?? null,
          clubId: row.club_id ?? null,
          organizerId: row.organizer_id ?? null,
        };
      })
      .filter(Boolean) as RoleAssignment[];

    const isSuperAdmin = roles.some((role) => role.roleName === "super_admin");
    const isCountryAdmin = roles.some((role) => role.roleName === "country_admin");
    const isCountryCoordinator = roles.some((role) => role.roleName === "country_coordinator");
    const isClubCoordinator = roles.some((role) => role.roleName === "club_coordinator");
    const isEventOrganizer = roles.some((role) => role.roleName === "event_organizer");

    return {
      authUserId: ctx.authUserId,
      roles,
      isSuperAdmin,
      isCountryAdmin,
      isCountryCoordinator,
      isClubCoordinator,
      isEventOrganizer,
      hasAdminAccess:
        isSuperAdmin || isCountryAdmin || isCountryCoordinator || isClubCoordinator || isEventOrganizer,
    };
  } catch (error) {
    console.warn("[RBAC] Failed to resolve actor roles:", error instanceof Error ? error.message : error);
    return emptySession;
  }
}

export async function requireAdminPermission(
  ctx: Context,
  options: {
    allowSuperAdmin?: boolean;
    allowCountryAdmin?: boolean;
    allowCountryCoordinator?: boolean;
    allowClubCoordinator?: boolean;
    allowEventOrganizer?: boolean;
    countryCode?: string | null;
    clubId?: string | null;
    organizerId?: string | null;
  }
): Promise<ActorRoleSession> {
  const actor = await getActorRoleSession(ctx);

  const canAccess =
    (options.allowSuperAdmin && actor.isSuperAdmin) ||
    (options.allowCountryAdmin &&
      actor.roles.some(
        (role) =>
          role.roleName === "country_admin" &&
          (!options.countryCode || role.countryCode === options.countryCode)
      )) ||
    (options.allowCountryCoordinator &&
      actor.roles.some(
        (role) =>
          role.roleName === "country_coordinator" &&
          (!options.countryCode || role.countryCode === options.countryCode)
      )) ||
    (options.allowClubCoordinator &&
      actor.roles.some(
        (role) =>
          role.roleName === "club_coordinator" &&
          (!options.clubId || role.clubId === options.clubId)
      )) ||
    (options.allowEventOrganizer &&
      actor.roles.some(
        (role) =>
          role.roleName === "event_organizer" &&
          (!options.organizerId || role.organizerId === options.organizerId)
      ));

  if (!canAccess) {
    throw new Error("You do not have permission to perform this action.");
  }

  return actor;
}

export async function requireRegistrationOwner(
  ctx: Context,
  registrationId: string,
  options: { allowAdmin?: boolean } = {}
): Promise<void> {
  if (!ctx.authUserId) {
    throw new Error("You must be signed in to perform this action.");
  }

  if (registrationId === ctx.authUserId) {
    return;
  }

  const { data: profile, error } = await ctx.supabase
    .from("profiles")
    .select("registration_id")
    .eq("profile_id", ctx.authUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not verify your account.");
  }

  if (profile?.registration_id === registrationId) {
    return;
  }

  if (options.allowAdmin) {
    const actor = await getActorRoleSession(ctx);
    if (actor.hasAdminAccess) {
      return;
    }
  }

  throw new Error("You do not have permission to access this user's data.");
}

export async function logAdminAction(
  ctx: Context,
  input: {
    actorUserId?: string | null;
    actionType: string;
    targetUserId?: string | null;
    targetCountryCode?: string | null;
    targetClubId?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const { error } = await ctx.supabase
      .from("admin_action_logs")
      .insert({
        actor_user_id: input.actorUserId ?? ctx.authUserId ?? null,
        action_type: input.actionType,
        target_user_id: input.targetUserId ?? null,
        target_country_code: input.targetCountryCode ?? null,
        target_club_id: input.targetClubId ?? null,
        metadata: input.metadata ?? {},
      });

    if (error && !isMissingSchemaError(error)) {
      console.warn("[RBAC] Failed to log admin action:", error.message);
    }
  } catch (error) {
    console.warn("[RBAC] Failed to log admin action:", error instanceof Error ? error.message : error);
  }
}
