import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";
import { WORLD_COUNTRIES } from "../../../countries";

function normalizeCountry(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  const country = WORLD_COUNTRIES.find(
    (item) =>
      item.iso_alpha2.toLowerCase() === normalized.toLowerCase() ||
      item.name.toLowerCase() === normalized.toLowerCase()
  );
  return (country?.iso_alpha2 || normalized).toLowerCase();
}

export default publicProcedure.query(async ({ ctx }) => {
  const actor = await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryCoordinator: true,
  });

  await ctx.supabase.rpc("archive_expired_trial_accounts");

  const allowedCountries = new Set(
    actor.roles
      .filter((role) => role.roleName === "country_coordinator" && role.countryCode)
      .map((role) => normalizeCountry(role.countryCode))
  );

  const { data, error } = await ctx.supabase
    .from("user_account_archives")
    .select("*")
    .order("archived_at", { ascending: false });

  if (error) throw new Error(error.message || "Could not load archived accounts.");

  const rows = (data ?? []).filter(
    (row: any) => actor.isSuperAdmin || allowedCountries.has(normalizeCountry(row.country))
  );

  return rows.map((row: any) => ({
    registrationId: row.registration_id as string,
    displayName: row.display_name as string | null,
    username: row.username as string | null,
    country: row.country as string | null,
    registeredAt: row.registered_at as string | null,
    trialEndedAt: row.trial_ended_at as string | null,
    archivedAt: row.archived_at as string,
    archiveReason: row.archive_reason as string,
    activityCount: Number(row.activity_count || 0),
    lastActivityDate: row.last_activity_date as string | null,
  }));
});
