import { z } from "zod";
import { publicProcedure } from "../../../create-context";

const SERVICE_ROLE_DEFINITIONS = [
  {
    roleName: "club_coordinator",
    label: "Club Coordinator",
    description: "Support club onboarding, club activity, and local running group coordination.",
    maxPerCountry: 50,
  },
  {
    roleName: "country_coordinator",
    label: "Country Coordinator",
    description: "Help coordinate RunNation activities, clubs, and community support in your country.",
    maxPerCountry: 1,
  },
  {
    roleName: "event_organizer",
    label: "Event Organizer",
    description: "Create and manage running events for the RunNation community in your country.",
    maxPerCountry: 50,
  },
  {
    roleName: "shop_manager",
    label: "Shop Manager",
    description: "Manage the RunNation shop presence for your country.",
    maxPerCountry: 1,
  },
  {
    roleName: "junior_runners_club_coordinator",
    label: "Junior Runners Club Coordinator",
    description: "Coordinate the Junior Runners special club for ages 8 to 15.",
    maxGlobal: 1,
  },
  {
    roleName: "golden_age_runners_club_coordinator",
    label: "Golden Age Runners Club Coordinator",
    description: "Coordinate the Golden Age Runners special club for runners aged 60 and above.",
    maxGlobal: 1,
  },
  {
    roleName: "treadmill_runners_club_coordinator",
    label: "Treadmill Runners Club Coordinator",
    description: "Coordinate treadmill runner activity and support treadmill data workflows as they are introduced.",
    maxGlobal: 1,
  },
  {
    roleName: "para_runners_club_coordinator",
    label: "Para Runners Club Coordinator",
    description: "Coordinate inclusive support for para runners and runners with disabilities or physical impairments.",
    maxGlobal: 1,
  },
  {
    roleName: "magazine_columnist_fitness_coach",
    label: "Magazine Columnist (Fitness Coach)",
    description: "Contribute practical fitness, training, recovery, and healthy running guidance to The Running Post.",
    maxGlobal: 2,
  },
  {
    roleName: "magazine_columnist_sports_journalist",
    label: "Magazine Columnist (Sports Journalist)",
    description: "Write informed running news, event analysis, interviews, and community sport stories for The Running Post.",
    maxGlobal: 2,
  },
  {
    roleName: "magazine_columnist_motivation_speaker",
    label: "Magazine Columnist (Motivation Speaker)",
    description: "Share motivational running columns that encourage consistency, confidence, and community participation.",
    maxGlobal: 2,
  },
] as const;

const SERVICE_ROLE_NAMES = SERVICE_ROLE_DEFINITIONS.map((role) => role.roleName);

function roleFromRelation(row: any): string | null {
  const roleSource = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  return roleSource?.role_name ?? null;
}

function roleLabel(roleName: string) {
  const match = SERVICE_ROLE_DEFINITIONS.find((role) => role.roleName === roleName);
  if (match) return match.label;

  switch (roleName) {
    case "super_admin":
      return "Super Admin";
    case "country_admin":
      return "Country Admin";
    case "country_coordinator":
      return "Country Coordinator";
    case "club_coordinator":
      return "Club Coordinator";
    case "event_organizer":
      return "Event Organizer";
    case "shop_manager":
      return "Shop Manager";
    case "junior_runners_club_coordinator":
      return "Junior Runners Club Coordinator";
    case "golden_age_runners_club_coordinator":
      return "Golden Age Runners Club Coordinator";
    case "treadmill_runners_club_coordinator":
      return "Treadmill Runners Club Coordinator";
    case "para_runners_club_coordinator":
      return "Para Runners Club Coordinator";
    case "magazine_columnist_fitness_coach":
      return "Magazine Columnist (Fitness Coach)";
    case "magazine_columnist_sports_journalist":
      return "Magazine Columnist (Sports Journalist)";
    case "magazine_columnist_motivation_speaker":
      return "Magazine Columnist (Motivation Speaker)";
    default:
      return roleName
        .split("_")
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(" ");
  }
}

export default publicProcedure
  .input(z.object({ countryCode: z.string().trim().min(2).max(3) }))
  .query(async ({ input, ctx }) => {
    const countryCode = input.countryCode.trim().toUpperCase();

    const [{ data: country }, { data: roles, error: rolesError }] = await Promise.all([
      ctx.supabase
        .from("countries")
        .select("iso_alpha2, name")
        .eq("iso_alpha2", countryCode)
        .maybeSingle(),
      ctx.supabase
        .from("roles")
        .select("role_id, role_name")
        .in("role_name", SERVICE_ROLE_NAMES),
    ]);

    if (rolesError) {
      throw new Error(rolesError.message || "Could not load service team roles.");
    }

    const roleRows = roles ?? [];
    const roleIds = roleRows.map((role: any) => role.role_id).filter(Boolean);
    const roleIdByName = new Map(roleRows.map((role: any) => [role.role_name, role.role_id]));

    const authUser = ctx.authUserId
      ? (await ctx.supabase.auth.admin.getUserById(ctx.authUserId)).data?.user ?? null
      : null;
    const authEmail = authUser?.email?.trim().toLowerCase() ?? null;

    const [assignmentsResult, currentUserAssignmentsResult, clubsResult, organizersResult, activitiesResult, invitesResult] = await Promise.all([
      roleIds.length
        ? ctx.supabase
            .from("user_role_assignments")
            .select("assignment_id, user_id, role_id, country_code, club_id, organizer_id, roles(role_name)")
            .eq("is_active", true)
            .in("role_id", roleIds)
        : Promise.resolve({ data: [], error: null }),
      ctx.authUserId
        ? ctx.supabase
            .from("user_role_assignments")
            .select("assignment_id, role_id, country_code, club_id, organizer_id, roles(role_name)")
            .eq("user_id", ctx.authUserId)
            .eq("is_active", true)
        : Promise.resolve({ data: [], error: null }),
      ctx.supabase
        .from("clubs")
        .select("club_id, country")
        .eq("country", countryCode),
      ctx.supabase
        .from("event_organizers")
        .select("organizer_id, country")
        .eq("country", countryCode)
        .eq("is_active", true),
      roleIds.length
        ? ctx.supabase
            .from("role_activities")
            .select("role_id, activity")
            .in("role_id", roleIds)
        : Promise.resolve({ data: [], error: null }),
      authEmail && roleIds.length
        ? ctx.supabase
            .from("admin_invites")
            .select("invite_id, role_id, country_code, status")
            .eq("email", authEmail)
            .or(`country_code.eq.${countryCode},country_code.is.null`)
            .eq("status", "pending")
            .in("role_id", roleIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (assignmentsResult.error) {
      throw new Error(assignmentsResult.error.message || "Could not load service team assignments.");
    }
    if (currentUserAssignmentsResult.error) {
      throw new Error(currentUserAssignmentsResult.error.message || "Could not load your current service role.");
    }
    if (clubsResult.error) {
      throw new Error(clubsResult.error.message || "Could not load country clubs.");
    }
    if (organizersResult.error) {
      throw new Error(organizersResult.error.message || "Could not load country organizers.");
    }
    if (activitiesResult.error) {
      throw new Error(activitiesResult.error.message || "Could not load role activities.");
    }
    if (invitesResult.error) {
      throw new Error(invitesResult.error.message || "Could not load role requests.");
    }

    const clubCountryById = new Map((clubsResult.data ?? []).map((club: any) => [club.club_id, club.country]));
    const organizerCountryById = new Map((organizersResult.data ?? []).map((organizer: any) => [organizer.organizer_id, organizer.country]));
    const clubIdsInCountry = new Set(clubCountryById.keys());
    const organizerIdsInCountry = new Set(organizerCountryById.keys());
    const assignments = assignmentsResult.data ?? [];
    const currentUserAssignments = currentUserAssignmentsResult.data ?? [];
    const isCurrentUserSuperAdmin = currentUserAssignments.some(
      (assignment: any) => roleFromRelation(assignment) === "super_admin"
    );
    const currentAssignment = isCurrentUserSuperAdmin ? null : currentUserAssignments.find((assignment: any) => {
      const roleName = roleFromRelation(assignment);
      return roleName && roleName !== "user" && roleName !== "super_admin";
    });
    const currentRoleName = currentAssignment ? roleFromRelation(currentAssignment) : null;
    const currentRoleCountryCode =
      currentAssignment?.country_code ??
      (currentAssignment?.club_id ? clubCountryById.get(currentAssignment.club_id) : null) ??
      (currentAssignment?.organizer_id ? organizerCountryById.get(currentAssignment.organizer_id) : null) ??
      countryCode;
    const activitiesByRoleId = new Map<number, string[]>();
    (activitiesResult.data ?? []).forEach((row: any) => {
      const roleId = Number(row.role_id);
      const activity = String(row.activity || "").trim();
      if (!roleId || !activity) return;
      const existing = activitiesByRoleId.get(roleId) ?? [];
      existing.push(activity);
      activitiesByRoleId.set(roleId, existing);
    });
    const pendingRoleIds = new Set((invitesResult.data ?? []).map((invite: any) => invite.role_id).filter(Boolean));
    const isGlobalRole = (roleName: string) =>
      SERVICE_ROLE_DEFINITIONS.some((definition) => definition.roleName === roleName && "maxGlobal" in definition);

    const countRoleAssignmentsInCountry = (roleName: string) =>
      assignments.filter((assignment: any) => {
        if (roleFromRelation(assignment) !== roleName) return false;
        if (isGlobalRole(roleName)) return true;
        if (assignment.country_code === countryCode) return true;
        if (roleName === "club_coordinator" && assignment.club_id && clubIdsInCountry.has(assignment.club_id)) return true;
        if (roleName === "event_organizer" && assignment.organizer_id && organizerIdsInCountry.has(assignment.organizer_id)) return true;
        return false;
      }).length;

    return {
      countryCode,
      countryName: country?.name ?? null,
      existingRole: currentRoleName
        ? {
            roleName: currentRoleName,
            roleLabel: roleLabel(currentRoleName),
            countryCode: currentRoleCountryCode,
            countryName: isGlobalRole(currentRoleName)
              ? "Global"
              : currentRoleCountryCode === countryCode
                ? country?.name ?? currentRoleCountryCode
                : currentRoleCountryCode,
          }
        : null,
      roles: SERVICE_ROLE_DEFINITIONS.map((definition) => {
        const roleId = roleIdByName.get(definition.roleName) ?? null;

        if (!roleId) {
          return {
            ...definition,
            roleId,
            activities: [],
            hasPendingRequest: false,
            slotsUsed: 0,
            slotsTotal: "maxGlobal" in definition ? definition.maxGlobal : definition.maxPerCountry,
            status: "not_configured" as const,
            statusLabel: "Not configured",
            available: false,
          };
        }

        const slotsUsed = countRoleAssignmentsInCountry(definition.roleName);
        const slotsTotal = "maxGlobal" in definition ? definition.maxGlobal : definition.maxPerCountry;
        const slotsRemaining = Math.max(slotsTotal - slotsUsed, 0);
        const available = slotsRemaining > 0;

        return {
          ...definition,
          roleId,
          activities: activitiesByRoleId.get(Number(roleId)) ?? [],
          hasPendingRequest: pendingRoleIds.has(roleId),
          slotsUsed,
          slotsTotal,
          status: pendingRoleIds.has(roleId) ? ("pending" as const) : available ? ("available" as const) : ("filled" as const),
          statusLabel: pendingRoleIds.has(roleId) ? "Pending approval" : available ? `Available (${slotsRemaining} left)` : "Filled",
          available: available && !pendingRoleIds.has(roleId),
        };
      }),
    };
  });
