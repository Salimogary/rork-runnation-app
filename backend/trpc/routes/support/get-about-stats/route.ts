import { publicProcedure } from "../../../create-context";

const ADMIN_ROLE_NAMES = new Set(["super_admin", "global_admin", "country_admin", "country_coordinator"]);
const EVENT_ORGANIZER_ROLE_NAME = "event_organizer";

function getRoleName(row: any): string | null {
  const roleSource = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  return roleSource?.role_name ?? null;
}

function getAge(dob: string): number | null {
  const date = new Date(dob);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function getSexBucket(sex: string | null | undefined): "male" | "female" | null {
  const value = String(sex || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "m" || value.startsWith("male")) return "male";
  if (value === "f" || value.startsWith("female")) return "female";
  return null;
}

function formatMaleFemaleRatio(male: number, female: number): string | null {
  if (male === 0 && female === 0) return null;
  const total = male + female;
  const malePercent = Math.round((male / total) * 100);
  const femalePercent = 100 - malePercent;
  return `${malePercent}:${femalePercent}`;
}

function formatAverageDailyRegistrations(registrations: any[]): string | null {
  if (registrations.length === 0) return null;
  const activeDates = new Set(
    registrations
      .map((row: any) => String(row.created_at || "").slice(0, 10))
      .filter(Boolean)
  );
  if (activeDates.size === 0) return null;
  const average = registrations.length / activeDates.size;
  return average >= 10 ? average.toFixed(0) : average.toFixed(1);
}

async function getAuthUserIds(ctx: any): Promise<Set<string> | null> {
  const ids = new Set<string>();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await ctx.supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn("[AboutStats] Could not list auth users:", error.message);
      return null;
    }

    const users = data?.users || [];
    users.forEach((user: any) => {
      if (user.id) ids.add(user.id);
    });

    if (users.length < perPage) break;
    page += 1;
  }

  return ids;
}

export default publicProcedure.query(async ({ ctx }) => {
  const [
    registrationsResult,
    clubsResult,
    roleAssignmentsResult,
    eventOrganizersResult,
    shopsResult,
  ] = await Promise.allSettled([
    ctx.supabase
      .from("registrations")
      .select("registration_id, city_town_district, country, dob, sex, created_at"),
    ctx.supabase
      .from("clubs")
      .select("club_id", { count: "exact", head: true }),
    ctx.supabase
      .from("user_role_assignments")
      .select("user_id, roles(role_name)")
      .eq("is_active", true),
    ctx.supabase
      .from("event_organizers")
      .select("organizer_id", { count: "exact", head: true })
      .eq("is_active", true),
    ctx.supabase
      .from("catalogue")
      .select("country_code")
      .gt("quantity", 0),
  ]);

  const registrations =
    registrationsResult.status === "fulfilled" && !registrationsResult.value.error
      ? registrationsResult.value.data || []
      : [];

  const ages = registrations
    .map((row: any) => getAge(String(row.dob || "")))
    .filter((age: number | null): age is number => age !== null)
    .sort((a: number, b: number) => a - b);
  const maleCount = registrations.filter((row: any) => getSexBucket(row.sex) === "male").length;
  const femaleCount = registrations.filter((row: any) => getSexBucket(row.sex) === "female").length;

  let admins: number | null = null;
  let eventOrganizers: number | null = null;

  if (roleAssignmentsResult.status === "fulfilled" && !roleAssignmentsResult.value.error) {
    const authUserIds = await getAuthUserIds(ctx);
    const roleRows = roleAssignmentsResult.value.data || [];

    const filterToAuthUsers = (userId: string | null | undefined) => {
      if (!userId) return false;
      return authUserIds ? authUserIds.has(userId) : true;
    };

    admins = new Set(
      roleRows
        .filter((row: any) => ADMIN_ROLE_NAMES.has(getRoleName(row) || ""))
        .map((row: any) => row.user_id)
        .filter(filterToAuthUsers)
    ).size;

    eventOrganizers = new Set(
      roleRows
        .filter((row: any) => getRoleName(row) === EVENT_ORGANIZER_ROLE_NAME)
        .map((row: any) => row.user_id)
        .filter(filterToAuthUsers)
    ).size;
  }

  if (eventOrganizersResult.status === "fulfilled" && !eventOrganizersResult.value.error) {
    eventOrganizers = eventOrganizersResult.value.count ?? eventOrganizers ?? 0;
  }

  return {
    runners: registrationsResult.status === "fulfilled" && !registrationsResult.value.error ? registrations.length : null,
    clubs: clubsResult.status === "fulfilled" && !clubsResult.value.error ? clubsResult.value.count ?? 0 : null,
    towns:
      registrationsResult.status === "fulfilled" && !registrationsResult.value.error
        ? new Set(
            registrations
              .map((row: any) => String(row.city_town_district || "").trim().toLowerCase())
              .filter(Boolean)
          ).size
        : null,
    countries:
      registrationsResult.status === "fulfilled" && !registrationsResult.value.error
        ? new Set(
            registrations
              .map((row: any) => String(row.country || "").trim().toLowerCase())
              .filter(Boolean)
          ).size
        : null,
    ageRange: ages.length > 0 ? `${ages[0]}-${ages[ages.length - 1]}` : null,
    averageDailyRegistrations: formatAverageDailyRegistrations(registrations),
    maleFemaleRatio: formatMaleFemaleRatio(maleCount, femaleCount),
    admins,
    eventOrganizers,
    activeShops:
      shopsResult.status === "fulfilled" && !shopsResult.value.error
        ? new Set(
            (shopsResult.value.data || [])
              .map((row: any) => String(row.country_code || "").trim().toUpperCase())
              .filter(Boolean)
          ).size
        : null,
  };
});
