import type { Context } from "./create-context";

type RoleName =
  | "super_admin"
  | "global_admin"
  | "country_admin"
  | "country_coordinator"
  | "club_coordinator"
  | "event_organizer"
  | "junior_runners_club_coordinator"
  | "golden_age_runners_club_coordinator"
  | "treadmill_runners_club_coordinator"
  | "para_runners_club_coordinator"
  | "smartfit_club_coordinator"
  | "magazine_editor"
  | "magazine_columnist_fitness_coach"
  | "magazine_columnist_sports_journalist"
  | "magazine_columnist_motivation_speaker"
  | "chat_room_administrator"
  | "shop_manager"
  | "shop_owner"
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
  isSpecialClubCoordinator: boolean;
  isEventOrganizer: boolean;
  isMagazineEditor: boolean;
  isMagazineColumnist: boolean;
  isChatRoomAdministrator: boolean;
  isShopManager: boolean;
  hasAdminAccess: boolean;
};

const SPECIAL_CLUB_CODE_BY_COORDINATOR_ROLE: Record<string, string> = {
  junior_runners_club_coordinator: "junior_runners",
  golden_age_runners_club_coordinator: "golden_age_runners",
  treadmill_runners_club_coordinator: "treadmill_runners",
  para_runners_club_coordinator: "para_runners",
  smartfit_club_coordinator: "smartfit_club",
};

function isSpecialClubCoordinatorRole(roleName: string | null | undefined): boolean {
  return Boolean(roleName && SPECIAL_CLUB_CODE_BY_COORDINATOR_ROLE[roleName]);
}

function getSpecialClubCodes(roles: RoleAssignment[]): string[] {
  return roles
    .map((role) => SPECIAL_CLUB_CODE_BY_COORDINATOR_ROLE[role.roleName])
    .filter(Boolean);
}

function isGlobalAdminRole(roleName: string | null | undefined): boolean {
  const normalized = roleName?.trim().toLowerCase();
  return normalized === "super_admin" || normalized === "global_admin";
}

async function actorCanManageSpecialClub(ctx: Context, actor: ActorRoleSession, clubId?: string | null): Promise<boolean> {
  const specialClubCodes = getSpecialClubCodes(actor.roles);
  if (specialClubCodes.length === 0) return false;
  if (!clubId) return true;

  const { data: club, error } = await ctx.supabase
    .from("clubs")
    .select("special_club_code")
    .eq("club_id", clubId)
    .maybeSingle();

  if (error || !club?.special_club_code) {
    return false;
  }

  return specialClubCodes.includes(club.special_club_code);
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

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

async function findRegistrationIdByEmail(ctx: Context, email: string): Promise<string | null> {
  const { data: contact, error: contactError } = await ctx.supabase
    .from("contacts")
    .select("registration_id")
    .eq("email", email)
    .maybeSingle();

  if (contactError && !isMissingSchemaError(contactError)) {
    throw contactError;
  }

  if (contact?.registration_id) {
    return contact.registration_id;
  }

  const { data: registration, error: registrationError } = await ctx.supabase
    .from("registrations")
    .select("registration_id")
    .eq("email", email)
    .maybeSingle();

  if (registrationError && !isMissingSchemaError(registrationError)) {
    throw registrationError;
  }

  return registration?.registration_id ?? null;
}

async function findRegistrationIdByUsername(ctx: Context, username: string): Promise<string | null> {
  const { data: registration, error } = await ctx.supabase
    .from("registrations")
    .select("registration_id")
    .eq("username", username)
    .maybeSingle();

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  return registration?.registration_id ?? null;
}

async function resolveAssignmentUserIds(ctx: Context): Promise<string[]> {
  if (!ctx.authUserId) return [];

  const { data: profile, error: profileError } = await ctx.supabase
    .from("profiles")
    .select("profile_id, registration_id, username")
    .eq("profile_id", ctx.authUserId)
    .maybeSingle();

  if (profileError && !isMissingSchemaError(profileError)) {
    throw profileError;
  }

  const ids = new Set<string>([ctx.authUserId]);
  if (profile?.profile_id) ids.add(profile.profile_id);
  if (profile?.registration_id) ids.add(profile.registration_id);

  if (!profile?.registration_id) {
    const { data: authUserResult, error: authUserError } =
      await ctx.supabase.auth.admin.getUserById(ctx.authUserId);

    if (authUserError && !isMissingSchemaError(authUserError)) {
      throw authUserError;
    }

    const authUser = authUserResult?.user;
    const email = normalizeText(authUser?.email);
    const metadata = (authUser?.user_metadata ?? {}) as Record<string, unknown>;
    const metadataUsername =
      normalizeText(typeof metadata.username === "string" ? metadata.username : null) ??
      normalizeText(typeof metadata.preferred_username === "string" ? metadata.preferred_username : null) ??
      normalizeText(typeof metadata.user_name === "string" ? metadata.user_name : null);
    const emailUsername = normalizeText(email?.split("@")[0]);
    const candidateUsernames = Array.from(
      new Set([metadataUsername, normalizeText(profile?.username), emailUsername].filter(Boolean))
    ) as string[];

    const registrationId = email ? await findRegistrationIdByEmail(ctx, email) : null;
    if (registrationId) {
      ids.add(registrationId);
    } else {
      for (const candidate of candidateUsernames) {
        const candidateRegistrationId = await findRegistrationIdByUsername(ctx, candidate);
        if (candidateRegistrationId) {
          ids.add(candidateRegistrationId);
          break;
        }
      }
    }
  }

  return Array.from(ids);
}

async function attachMissingClubCoordinatorScopes(
  ctx: Context,
  roles: RoleAssignment[],
  assignmentUserIds: string[]
): Promise<RoleAssignment[]> {
  const needsClubFallback = roles.some((role) => role.roleName === "club_coordinator" && !role.clubId);
  if (!needsClubFallback || assignmentUserIds.length === 0) return roles;

  const [byCoordinatorResult, byCreatorResult] = await Promise.all([
    ctx.supabase
      .from("clubs")
      .select("club_id, country, coordinator_id, created_by_user_id, is_active")
      .in("coordinator_id", assignmentUserIds),
    ctx.supabase
      .from("clubs")
      .select("club_id, country, coordinator_id, created_by_user_id, is_active")
      .in("created_by_user_id", assignmentUserIds),
  ]);

  const clubRows = [...(byCoordinatorResult.data ?? []), ...(byCreatorResult.data ?? [])]
    .filter((club: any) => club?.club_id && club.is_active !== false);
  const uniqueClubs = [...new Map(clubRows.map((club: any) => [String(club.club_id), club])).values()];

  if (uniqueClubs.length === 0) return roles;

  return roles.map((role) => {
    if (role.roleName !== "club_coordinator" || role.clubId) return role;
    const matchingClub =
      uniqueClubs.find((club: any) => role.countryCode && club.country === role.countryCode) ??
      uniqueClubs[0];
    return matchingClub?.club_id ? { ...role, clubId: String(matchingClub.club_id) } : role;
  });
}

export async function getActorRoleSession(ctx: Context): Promise<ActorRoleSession> {
  const emptySession: ActorRoleSession = {
    authUserId: ctx.authUserId,
    roles: [],
    isSuperAdmin: false,
    isCountryAdmin: false,
    isCountryCoordinator: false,
    isClubCoordinator: false,
    isSpecialClubCoordinator: false,
  isEventOrganizer: false,
  isMagazineEditor: false,
  isMagazineColumnist: false,
  isChatRoomAdministrator: false,
  isShopManager: false,
  hasAdminAccess: false,
};

  if (!ctx.authUserId) {
    return emptySession;
  }

  try {
    const assignmentUserIds = await resolveAssignmentUserIds(ctx);

    const { data, error } = await ctx.supabase
      .from("user_role_assignments")
      .select("country_code, club_id, organizer_id, roles(role_name)")
      .in("user_id", assignmentUserIds)
      .eq("is_active", true);

    if (error) {
      if (isMissingSchemaError(error)) {
        return emptySession;
      }
      throw error;
    }

    const rawRoles: RoleAssignment[] = (data ?? [])
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
    const roles = await attachMissingClubCoordinatorScopes(ctx, rawRoles, assignmentUserIds);

    const isSuperAdmin = roles.some((role) => isGlobalAdminRole(role.roleName));
    const isCountryAdmin = roles.some((role) => role.roleName === "country_admin");
    const isCountryCoordinator = roles.some((role) => role.roleName === "country_coordinator");
    const isClubCoordinator = roles.some((role) => role.roleName === "club_coordinator");
    const isSpecialClubCoordinator = roles.some((role) => isSpecialClubCoordinatorRole(role.roleName));
    const isEventOrganizer = roles.some((role) => role.roleName === "event_organizer");
    const isMagazineEditor = roles.some((role) => role.roleName === "magazine_editor");
    const isMagazineColumnist = roles.some((role) => role.roleName.startsWith("magazine_columnist_"));
    const isChatRoomAdministrator = roles.some((role) => role.roleName === "chat_room_administrator");
    const isShopManager = roles.some((role) => role.roleName === "shop_manager");

    return {
      authUserId: ctx.authUserId,
      roles,
      isSuperAdmin,
      isCountryAdmin,
      isCountryCoordinator,
      isClubCoordinator,
      isSpecialClubCoordinator,
      isEventOrganizer,
      isMagazineEditor,
      isMagazineColumnist,
      isChatRoomAdministrator,
      isShopManager,
      hasAdminAccess:
        isSuperAdmin || isCountryAdmin || isCountryCoordinator || isClubCoordinator || isSpecialClubCoordinator || isEventOrganizer || isMagazineEditor || isMagazineColumnist || isChatRoomAdministrator || isShopManager,
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
    allowSpecialClubCoordinator?: boolean;
    allowEventOrganizer?: boolean;
    allowMagazineEditor?: boolean;
    allowMagazineColumnist?: boolean;
    allowChatRoomAdministrator?: boolean;
    allowShopManager?: boolean;
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
          (role.roleName === "country_admin" || role.roleName === "country_coordinator") &&
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
      )) ||
    (options.allowMagazineEditor && actor.isMagazineEditor) ||
    (options.allowMagazineColumnist && actor.isMagazineColumnist) ||
    (options.allowChatRoomAdministrator && actor.isChatRoomAdministrator) ||
    (options.allowShopManager &&
      actor.roles.some(
        (role) =>
          role.roleName === "shop_manager" &&
          (!options.countryCode || role.countryCode === options.countryCode)
      )) ||
    (options.allowSpecialClubCoordinator && (await actorCanManageSpecialClub(ctx, actor, options.clubId)));

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
