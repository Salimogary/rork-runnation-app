import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

type DatedRow = { created_at?: string | null; activity_date?: string | null };
type SafeRows<T> = { rows: T[]; unavailable: boolean };

const COUNT_THRESHOLDS = {
  registered_users: [100, 1000, 10000, 100000, 1000000],
  subscribers: [100, 1000, 10000, 100000, 1000000],
  countries: [10, 100],
  service_team: [10, 100, 1000],
  daily_activity: [100, 1000, 10000, 100000, 1000000],
  gear_shops: [10, 50, 100],
  clubs: [10, 100, 1000],
};

const MANUAL_MILESTONES = [
  { key: "measurement_start_date", category: "Genesis", milestone: "Genesis date - first APK shared" },
  { key: "domain_name", category: "Platform", milestone: "Independent domain/website" },
  { key: "google_playstore", category: "Stores", milestone: "Google Play Store launch" },
  { key: "apple_app_store", category: "Stores", milestone: "Apple App Store launch" },
  { key: "first_apk_registered_user", category: "APK", milestone: "First registered user from APK" },
  { key: "company_registration", category: "Company", milestone: "Company/entity registration and management setup" },
];

function isMissingSchemaError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error);
  return message.includes("does not exist") || message.includes("schema cache") || message.includes("relation") || message.includes("column");
}

function dateOnly(value?: string | null): string | null {
  return value ? String(value).slice(0, 10) : null;
}

function onOrAfterStartDate(value: string | null, startDate: string | null): boolean {
  if (!startDate) return false;
  return Boolean(value && value >= startDate);
}

function filterRowsFromStartDate<T extends DatedRow>(rows: T[], startDate: string | null, field: "created_at" | "activity_date" = "created_at"): T[] {
  return rows.filter((row) => onOrAfterStartDate(dateOnly(row[field]), startDate));
}

function reachedAt(rows: DatedRow[], threshold: number, field: "created_at" | "activity_date" = "created_at") {
  const sorted = rows
    .map((row) => dateOnly(row[field]))
    .filter(Boolean)
    .sort() as string[];
  return sorted.length >= threshold ? sorted[threshold - 1] : null;
}

function uniqueCountryMilestone(rows: any[], threshold: number, startDate: string | null) {
  const seen = new Set<string>();
  const sorted = rows
    .map((row) => ({ country: String(row.country || row.country_code || "").trim().toUpperCase(), date: dateOnly(row.created_at) }))
    .filter((row) => row.country && onOrAfterStartDate(row.date, startDate))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  for (const row of sorted) {
    seen.add(row.country);
    if (seen.size >= threshold) return row.date;
  }
  return null;
}

function dailyActivityMilestone(rows: any[], threshold: number, startDate: string | null) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const date = dateOnly(row.activity_date ?? row.created_at);
    if (!date || !onOrAfterStartDate(date, startDate)) continue;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= threshold)
    .map(([date]) => date)
    .sort()[0] ?? null;
}

async function safeSelect<T>(query: PromiseLike<{ data: T[] | null; error: any }>): Promise<SafeRows<T>> {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) return { rows: [], unavailable: true };
    throw error;
  }
  return { rows: data ?? [], unavailable: false };
}

export default publicProcedure.query(async ({ ctx }) => {
  await requireAdminPermission(ctx, { allowSuperAdmin: true });

  const [
    registrationsResult,
    subscriptionsResult,
    roleAssignmentsResult,
    activitiesResult,
    catalogueResult,
    clubsResult,
    manualRowsResult,
  ] = await Promise.all([
    safeSelect<any>(ctx.supabase.from("registrations").select("registration_id, country, created_at")),
    safeSelect<any>(ctx.supabase.from("subscriptions").select("registration_id, status, created_at")),
    safeSelect<any>(ctx.supabase.from("user_role_assignments").select("assignment_id, is_active, created_at, roles(role_name)").eq("is_active", true)),
    safeSelect<any>(ctx.supabase.from("activities").select("activity_id, activity_date, created_at")),
    safeSelect<any>(ctx.supabase.from("catalogue").select("catalogue_id, country_code, quantity, created_at")),
    safeSelect<any>(ctx.supabase.from("clubs").select("club_id, created_at")),
    safeSelect<any>(ctx.supabase.from("admin_milestones").select("milestone_key, milestone_date, note")),
  ]);

  const registrations = registrationsResult.rows;
  const subscriptions = subscriptionsResult.rows;
  const roleAssignments = roleAssignmentsResult.rows;
  const activities = activitiesResult.rows;
  const catalogue = catalogueResult.rows;
  const clubs = clubsResult.rows;
  const manualRows = manualRowsResult.rows;
  const manualMap = new Map(manualRows.map((row: any) => [row.milestone_key, row]));
  const measurementStartDate = dateOnly((manualMap.get("measurement_start_date") as any)?.milestone_date);
  const registrationsFromStart = filterRowsFromStartDate(registrations, measurementStartDate);
  const subscriptionsFromStart = filterRowsFromStartDate(subscriptions, measurementStartDate);
  const roleAssignmentsFromStart = filterRowsFromStartDate(roleAssignments, measurementStartDate);
  const gearRowsFromStart = filterRowsFromStartDate(catalogue, measurementStartDate);
  const clubsFromStart = filterRowsFromStartDate(clubs, measurementStartDate);
  const serviceTeamRows = roleAssignments.filter((row: any) => {
    const roleSource = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    const roleName = String(roleSource?.role_name || "");
    return roleName && roleName !== "user";
  });
  const serviceTeamRowsFromStart = roleAssignmentsFromStart.filter((row: any) => {
    const roleSource = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    const roleName = String(roleSource?.role_name || "");
    return roleName && roleName !== "user";
  });
  const subscriberRows = subscriptionsFromStart.filter((row: any) => ["active", "paid", "trialing"].includes(String(row.status || "").toLowerCase()));
  const gearShopRows = gearRowsFromStart.filter((row: any) => Number(row.quantity ?? 0) > 0);

  const calculated = [
    ...COUNT_THRESHOLDS.registered_users.map((threshold) => ({
      key: `registered_users_${threshold}`,
      category: "Registered users",
      milestone: `${threshold.toLocaleString()} registered users`,
      threshold,
      milestoneDate: registrationsResult.unavailable || !measurementStartDate ? "soon" : reachedAt(registrationsFromStart, threshold),
    })),
    ...COUNT_THRESHOLDS.subscribers.map((threshold) => ({
      key: `subscribers_${threshold}`,
      category: "Subscribers",
      milestone: `${threshold.toLocaleString()} subscribers`,
      threshold,
      milestoneDate: subscriptionsResult.unavailable || !measurementStartDate ? "soon" : reachedAt(subscriberRows, threshold),
    })),
    ...COUNT_THRESHOLDS.countries.map((threshold) => ({
      key: `countries_${threshold}`,
      category: "Countries",
      milestone: `${threshold.toLocaleString()} countries represented`,
      threshold,
      milestoneDate: registrationsResult.unavailable || !measurementStartDate ? "soon" : uniqueCountryMilestone(registrations, threshold, measurementStartDate),
    })),
    ...COUNT_THRESHOLDS.service_team.map((threshold) => ({
      key: `service_team_${threshold}`,
      category: "Service team",
      milestone: `${threshold.toLocaleString()} service team members`,
      threshold,
      milestoneDate: roleAssignmentsResult.unavailable || !measurementStartDate ? "soon" : reachedAt(serviceTeamRowsFromStart, threshold),
    })),
    ...COUNT_THRESHOLDS.daily_activity.map((threshold) => ({
      key: `daily_activity_${threshold}`,
      category: "Daily activity",
      milestone: `First day with ${threshold.toLocaleString()} activities`,
      threshold,
      milestoneDate: activitiesResult.unavailable || !measurementStartDate ? "soon" : dailyActivityMilestone(activities, threshold, measurementStartDate),
    })),
    ...COUNT_THRESHOLDS.gear_shops.map((threshold) => ({
      key: `gear_shops_${threshold}`,
      category: "Gear shops",
      milestone: `${threshold.toLocaleString()} sportswear shop listings`,
      threshold,
      milestoneDate: catalogueResult.unavailable || !measurementStartDate ? "soon" : reachedAt(gearShopRows, threshold),
    })),
    ...COUNT_THRESHOLDS.clubs.map((threshold) => ({
      key: `clubs_${threshold}`,
      category: "Clubs",
      milestone: `${threshold.toLocaleString()} clubs`,
      threshold,
      milestoneDate: clubsResult.unavailable || !measurementStartDate ? "soon" : reachedAt(clubsFromStart, threshold),
    })),
  ];

  return {
    calculated,
    manual: MANUAL_MILESTONES.map((item) => {
      const row = manualMap.get(item.key) as any;
      return {
        ...item,
        milestoneDate: row?.milestone_date ?? null,
        note: row?.note ?? null,
      };
    }),
  };
});

