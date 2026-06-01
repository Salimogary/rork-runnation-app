import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

const userTypeSchema = z.enum(["all", "country_admin", "country_coordinator", "club_coordinator"]);

const inputSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  userType: userTypeSchema.default("all"),
});

function getRoleName(row: any): string | null {
  const roleSource = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  return roleSource?.role_name ?? null;
}

function formatActorType(roleNames: string[]): string {
  if (roleNames.includes("country_admin")) return "Country Admin";
  if (roleNames.includes("country_coordinator")) return "Country Coordinator";
  if (roleNames.includes("club_coordinator")) return "Club Coordinator";
  if (roleNames.includes("super_admin") || roleNames.includes("global_admin")) return "Global Admin";
  return "Admin";
}

export default publicProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
    });

    const start = new Date(`${input.startDate}T00:00:00.000Z`);
    const end = new Date(`${input.endDate}T23:59:59.999Z`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new Error("Please enter a valid date range.");
    }

    const { data: assignments, error: assignmentsError } = await ctx.supabase
      .from("user_role_assignments")
      .select("user_id, country_code, club_id, roles(role_name)")
      .eq("is_active", true);

    if (assignmentsError) {
      throw new Error(assignmentsError.message || "Could not load admin role assignments.");
    }

    const actorRoles = new Map<string, { roleNames: Set<string>; countryCodes: Set<string>; clubIds: Set<string> }>();

    (assignments ?? []).forEach((assignment: any) => {
      if (!assignment.user_id) return;
      const roleName = getRoleName(assignment);
      if (!roleName) return;

      const current = actorRoles.get(assignment.user_id) ?? {
        roleNames: new Set<string>(),
        countryCodes: new Set<string>(),
        clubIds: new Set<string>(),
      };

      current.roleNames.add(roleName);
      if (assignment.country_code) current.countryCodes.add(assignment.country_code);
      if (assignment.club_id) current.clubIds.add(assignment.club_id);
      actorRoles.set(assignment.user_id, current);
    });

    const filteredActorIds = [...actorRoles.entries()]
      .filter(([, roleInfo]) => {
        if (input.userType === "all") {
          return roleInfo.roleNames.has("super_admin") || roleInfo.roleNames.has("global_admin") || roleInfo.roleNames.has("country_admin") || roleInfo.roleNames.has("country_coordinator") || roleInfo.roleNames.has("club_coordinator");
        }
        return roleInfo.roleNames.has(input.userType);
      })
      .map(([userId]) => userId);

    if (filteredActorIds && filteredActorIds.length === 0) {
      return [];
    }

    let logsQuery = ctx.supabase
      .from("admin_action_logs")
      .select("*")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .order("created_at", { ascending: false })
      .limit(1000);

    logsQuery = logsQuery.in("actor_user_id", filteredActorIds);

    const { data: logs, error: logsError } = await logsQuery;

    if (logsError) {
      throw new Error(logsError.message || "Could not load audit logs.");
    }

    const profileIds = [
      ...new Set(
        (logs ?? [])
          .flatMap((log: any) => [log.actor_user_id, log.target_user_id])
          .filter(Boolean)
      ),
    ];

    const { data: profiles } = profileIds.length > 0
      ? await ctx.supabase
          .from("profiles")
          .select("profile_id, username, display_name, registration_id")
          .in("profile_id", profileIds)
      : { data: [] };

    const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.profile_id, profile]));

    return (logs ?? []).map((log: any) => {
      const roleInfo = log.actor_user_id ? actorRoles.get(log.actor_user_id) : null;
      const roleNames = roleInfo ? [...roleInfo.roleNames] : [];
      const actorProfile = log.actor_user_id ? profileMap.get(log.actor_user_id) : null;
      const targetProfile = log.target_user_id ? profileMap.get(log.target_user_id) : null;

      return {
        id: log.id ?? log.log_id ?? `${log.actor_user_id ?? "unknown"}-${log.created_at}`,
        createdAt: log.created_at,
        actionType: log.action_type,
        actorUserId: log.actor_user_id,
        actorName: actorProfile?.display_name ?? actorProfile?.username ?? log.actor_user_id ?? "Unknown admin",
        actorUsername: actorProfile?.username ?? null,
        actorType: formatActorType(roleNames),
        roleNames,
        countryCodes: roleInfo ? [...roleInfo.countryCodes] : [],
        clubIds: roleInfo ? [...roleInfo.clubIds] : [],
        targetUserId: log.target_user_id,
        targetName: targetProfile?.display_name ?? targetProfile?.username ?? log.target_user_id ?? null,
        targetCountryCode: log.target_country_code,
        targetClubId: log.target_club_id,
        metadata: log.metadata ?? {},
      };
    });
  });

