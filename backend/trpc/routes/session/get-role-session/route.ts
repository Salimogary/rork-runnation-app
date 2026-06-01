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

type ProfileRow = {
  profile_id: string;
  registration_id: string | null;
  username: string | null;
  display_name: string | null;
};

type RegistrationRow = {
  registration_id: string;
  username: string | null;
  first_name: string | null;
  other_names: string | null;
};

const SPECIAL_CLUB_CODE_BY_COORDINATOR_ROLE: Record<string, string> = {
  junior_runners_club_coordinator: "junior_runners",
  golden_age_runners_club_coordinator: "golden_age_runners",
  treadmill_runners_club_coordinator: "treadmill_runners",
  para_runners_club_coordinator: "para_runners",
  smartfit_club_coordinator: "smartfit_club",
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

function isGlobalAdminRole(roleName: string | null | undefined): boolean {
  const normalized = roleName?.trim().toLowerCase();
  return normalized === "super_admin" || normalized === "global_admin";
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function normalizeUsername(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function emailHandle(email: string | null): string | null {
  return normalizeUsername(email?.split("@")[0]);
}

function buildDisplayName(registration: RegistrationRow | null): string | null {
  if (!registration) return null;
  return (
    [registration.first_name, registration.other_names].filter(Boolean).join(" ").trim() ||
    registration.username ||
    null
  );
}

async function attachMissingClubCoordinatorScopes(
  ctx: { supabase: any },
  roles: {
    roleName: string;
    countryCode: string | null;
    clubId: string | null;
    organizerId: string | null;
  }[],
  assignmentUserIds: string[]
) {
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

async function findRegistrationByEmail(ctx: { supabase: any }, email: string): Promise<RegistrationRow | null> {
  const { data: contact } = await ctx.supabase
    .from("contacts")
    .select("registration_id")
    .eq("email", email)
    .maybeSingle();

  if (contact?.registration_id) {
    const { data: registration, error } = await ctx.supabase
      .from("registrations")
      .select("registration_id, username, first_name, other_names")
      .eq("registration_id", contact.registration_id)
      .maybeSingle();

    if (error && !isMissingSchemaError(error)) {
      throw error;
    }

    if (registration) {
      return registration as RegistrationRow;
    }
  }

  const { data: registration, error } = await ctx.supabase
    .from("registrations")
    .select("registration_id, username, first_name, other_names")
    .eq("email", email)
    .maybeSingle();

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  return (registration as RegistrationRow | null) ?? null;
}

async function findRegistrationByUsername(ctx: { supabase: any }, username: string): Promise<RegistrationRow | null> {
  const { data: registration, error } = await ctx.supabase
    .from("registrations")
    .select("registration_id, username, first_name, other_names")
    .eq("username", username)
    .maybeSingle();

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  return (registration as RegistrationRow | null) ?? null;
}

async function resolveAuthProfile(ctx: { supabase: any; authUserId: string | null }): Promise<ProfileRow | null> {
  if (!ctx.authUserId) {
    return null;
  }

  const { data: profile, error: profileError } = await ctx.supabase
    .from("profiles")
    .select("profile_id, registration_id, username, display_name")
    .eq("profile_id", ctx.authUserId)
    .maybeSingle();

  if (profileError) {
    if (isMissingSchemaError(profileError)) {
      return null;
    }
    throw profileError;
  }

  if (profile?.registration_id) {
    return profile as ProfileRow;
  }

  const { data: authUserResult, error: authUserError } =
    await ctx.supabase.auth.admin.getUserById(ctx.authUserId);

  if (authUserError) {
    throw authUserError;
  }

  const authUser = authUserResult?.user;
  const email = normalizeEmail(authUser?.email);
  const metadata = (authUser?.user_metadata ?? {}) as Record<string, unknown>;
  const metadataUsername =
    normalizeUsername(typeof metadata.username === "string" ? metadata.username : null) ??
    normalizeUsername(typeof metadata.preferred_username === "string" ? metadata.preferred_username : null) ??
    normalizeUsername(typeof metadata.user_name === "string" ? metadata.user_name : null);
  const profileUsername = normalizeUsername(profile?.username);
  const emailUsername = emailHandle(email);
  const candidateUsernames = Array.from(
    new Set([metadataUsername, profileUsername, emailUsername].filter(Boolean))
  ) as string[];

  let registration = email ? await findRegistrationByEmail(ctx, email) : null;

  if (!registration?.registration_id) {
    for (const candidate of candidateUsernames) {
      registration = await findRegistrationByUsername(ctx, candidate);
      if (registration?.registration_id) break;
    }
  }

  if (!registration?.registration_id) {
    return (profile as ProfileRow | null) ?? null;
  }

  const username = profile?.username || registration.username;
  const displayName = profile?.display_name || buildDisplayName(registration);

  const { error: upsertError } = await ctx.supabase
    .from("profiles")
    .upsert({
      profile_id: ctx.authUserId,
      registration_id: registration.registration_id,
      username,
      display_name: displayName,
    });

  if (upsertError) {
    throw upsertError;
  }

  return {
    profile_id: ctx.authUserId,
    registration_id: registration.registration_id,
    username,
    display_name: displayName,
  };
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
      roles: [] as {
        roleName: string;
        countryCode: string | null;
        clubId: string | null;
        organizerId: string | null;
      }[],
      isSuperAdmin: false,
      isCountryAdmin: false,
      isCountryCoordinator: false,
      isClubCoordinator: false,
      isSpecialClubCoordinator: false,
      isEventOrganizer: false,
      isMagazineEditor: false,
      isMagazineColumnist: false,
      isChatRoomAdministrator: false,
      hasAdminAccess: false,
      countryAdminScopes: [] as string[],
      countryCoordinatorScopes: [] as string[],
      clubCoordinatorScopes: [] as string[],
      specialClubCoordinatorScopes: [] as string[],
      eventOrganizerScopes: [] as string[],
      magazineEditorScopes: [] as string[],
      chatRoomAdministratorScopes: [] as string[],
      source: ctx.authUserId ? "auth" : input.registrationId ? "legacy" : "none",
    };

    try {
      let profile: ProfileRow | null = null;

      if (ctx.authUserId) {
        profile = await resolveAuthProfile(ctx);
      } else if (input.registrationId || input.username) {
        let profileQuery = ctx.supabase
          .from("profiles")
          .select("profile_id, registration_id, username, display_name")
          .limit(1);

        if (input.registrationId) {
          profileQuery = profileQuery.eq("registration_id", input.registrationId);
        } else if (input.username) {
          profileQuery = profileQuery.eq("username", input.username.toLowerCase().trim());
        }

        const { data: legacyProfile, error: profileError } = await profileQuery.maybeSingle();

        if (profileError) {
          if (isMissingSchemaError(profileError)) {
            console.warn("[RBAC] profiles table not ready yet, returning empty role session.");
            return emptySession;
          }
          throw profileError;
        }

        profile = legacyProfile as ProfileRow | null;
      }

      if (!profile && !ctx.authUserId) {
        return emptySession;
      }

      const assignmentUserIds = Array.from(
        new Set([profile?.profile_id, profile?.registration_id, ctx.authUserId, input.registrationId].filter(Boolean))
      ) as string[];

      if (assignmentUserIds.length === 0) {
        return emptySession;
      }

      const { data: assignments, error: assignmentsError } = await ctx.supabase
        .from("user_role_assignments")
        .select("country_code, club_id, organizer_id, roles(role_name)")
        .in("user_id", assignmentUserIds)
        .eq("is_active", true);

      if (assignmentsError) {
        if (isMissingSchemaError(assignmentsError)) {
          console.warn("[RBAC] role assignment tables not ready yet, returning profile-only session.");
          return {
            ...emptySession,
            profileId: profile?.profile_id ?? ctx.authUserId,
            registrationId: profile?.registration_id ?? input.registrationId ?? null,
            username: profile?.username ?? input.username ?? null,
            displayName: profile?.display_name ?? null,
            source: ctx.authUserId ? "auth" : "legacy",
          };
        }
        throw assignmentsError;
      }

      const rawRoles = (assignments ?? [])
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
      const roles = await attachMissingClubCoordinatorScopes(ctx, rawRoles, assignmentUserIds);

      const isSuperAdmin = roles.some((role) => isGlobalAdminRole(role.roleName));
      const countryAdminScopes = roles
        .filter((role) => role.roleName === "country_admin" && role.countryCode)
        .map((role) => role.countryCode as string);
      const countryCoordinatorScopes = roles
        .filter((role) => role.roleName === "country_coordinator" && role.countryCode)
        .map((role) => role.countryCode as string);
      const clubCoordinatorScopes = roles
        .filter((role) => role.roleName === "club_coordinator" && role.clubId)
        .map((role) => role.clubId as string);
      const hasClubCoordinatorRole = roles.some((role) => role.roleName === "club_coordinator");
      const specialClubCoordinatorScopes = roles
        .map((role) => SPECIAL_CLUB_CODE_BY_COORDINATOR_ROLE[role.roleName])
        .filter(Boolean);
      const eventOrganizerScopes = roles
        .filter((role) => role.roleName === "event_organizer" && role.organizerId)
        .map((role) => role.organizerId as string);
      const magazineEditorScopes = roles
        .filter((role) => role.roleName === "magazine_editor")
        .map(() => "global");
      const magazineColumnistScopes = roles
        .filter((role) => role.roleName.startsWith("magazine_columnist_"))
        .map(() => "global");
      const chatRoomAdministratorScopes = roles
        .filter((role) => role.roleName === "chat_room_administrator")
        .map(() => "global");
      const hasAuthBackedSession = Boolean(ctx.authUserId);

      return {
        authUserId: ctx.authUserId,
        profileId: profile?.profile_id ?? ctx.authUserId,
        registrationId: profile?.registration_id ?? input.registrationId ?? null,
        username: profile?.username ?? input.username ?? null,
        displayName: profile?.display_name ?? null,
        roles: hasAuthBackedSession ? roles : [],
        isSuperAdmin: hasAuthBackedSession ? isSuperAdmin : false,
        isCountryAdmin: hasAuthBackedSession ? countryAdminScopes.length > 0 : false,
        isCountryCoordinator: hasAuthBackedSession ? countryCoordinatorScopes.length > 0 : false,
        isClubCoordinator: hasAuthBackedSession ? hasClubCoordinatorRole : false,
        isSpecialClubCoordinator: hasAuthBackedSession ? specialClubCoordinatorScopes.length > 0 : false,
        isEventOrganizer: hasAuthBackedSession ? eventOrganizerScopes.length > 0 : false,
        isMagazineEditor: hasAuthBackedSession ? magazineEditorScopes.length > 0 : false,
        isMagazineColumnist: hasAuthBackedSession ? magazineColumnistScopes.length > 0 : false,
        isChatRoomAdministrator: hasAuthBackedSession ? chatRoomAdministratorScopes.length > 0 : false,
        hasAdminAccess: hasAuthBackedSession
          ? isSuperAdmin ||
            countryAdminScopes.length > 0 ||
            countryCoordinatorScopes.length > 0 ||
            hasClubCoordinatorRole ||
            specialClubCoordinatorScopes.length > 0 ||
            eventOrganizerScopes.length > 0 ||
            magazineEditorScopes.length > 0 ||
            magazineColumnistScopes.length > 0 ||
            chatRoomAdministratorScopes.length > 0
          : false,
        countryAdminScopes: hasAuthBackedSession ? countryAdminScopes : [],
        countryCoordinatorScopes: hasAuthBackedSession ? countryCoordinatorScopes : [],
        clubCoordinatorScopes: hasAuthBackedSession ? clubCoordinatorScopes : [],
        specialClubCoordinatorScopes: hasAuthBackedSession ? specialClubCoordinatorScopes : [],
        eventOrganizerScopes: hasAuthBackedSession ? eventOrganizerScopes : [],
        magazineEditorScopes: hasAuthBackedSession ? magazineEditorScopes : [],
        chatRoomAdministratorScopes: hasAuthBackedSession ? chatRoomAdministratorScopes : [],
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
