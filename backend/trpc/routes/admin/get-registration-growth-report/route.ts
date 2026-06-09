import { z } from "zod";
import { WORLD_COUNTRIES } from "../../../countries";
import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

const inputSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const countryByCode = new Map(
  WORLD_COUNTRIES.map((country) => [country.iso_alpha2.toUpperCase(), country])
);
const countryByName = new Map(
  WORLD_COUNTRIES.map((country) => [country.name.trim().toLowerCase(), country])
);

function resolveCountry(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return { code: "UN", name: "Unspecified" };
  }

  const byCode = countryByCode.get(normalized.toUpperCase());
  if (byCode) {
    return { code: byCode.iso_alpha2.toUpperCase(), name: byCode.name };
  }

  const byName = countryByName.get(normalized.toLowerCase());
  if (byName) {
    return { code: byName.iso_alpha2.toUpperCase(), name: byName.name };
  }

  return { code: normalized.toUpperCase(), name: normalized };
}

export default publicProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryCoordinator: true,
    });

    const start = new Date(`${input.startDate}T00:00:00.000Z`);
    const end = new Date(`${input.endDate}T23:59:59.999Z`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new Error("Please enter a valid date range.");
    }

    const rangeDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    if (rangeDays > 366) {
      throw new Error("Please select a date range of one year or less.");
    }

    const coordinatorCountryCodes = new Set(
      actor.roles
        .filter((role) => role.roleName === "country_coordinator" && role.countryCode)
        .map((role) => resolveCountry(role.countryCode).code)
    );

    if (!actor.isSuperAdmin && coordinatorCountryCodes.size === 0) {
      return {
        scope: "country" as const,
        countryCodes: [],
        totalRegistrations: 0,
        rows: [],
      };
    }

    const registrations: Array<{ country: string | null; created_at: string }> = [];
    const pageSize = 1000;

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await ctx.supabase
        .from("registrations")
        .select("country, created_at")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        throw new Error(error.message || "Could not load registration report.");
      }

      const page = (data ?? []) as Array<{ country: string | null; created_at: string }>;
      registrations.push(...page);
      if (page.length < pageSize) break;
    }

    const counts = new Map<
      string,
      { date: string; countryCode: string; countryName: string; count: number }
    >();

    for (const registration of registrations) {
      const country = resolveCountry(registration.country);
      if (!actor.isSuperAdmin && !coordinatorCountryCodes.has(country.code)) continue;

      const date = String(registration.created_at || "").slice(0, 10);
      if (!date) continue;

      const key = `${date}:${country.code}`;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, {
          date,
          countryCode: country.code,
          countryName: country.name,
          count: 1,
        });
      }
    }

    const rows = [...counts.values()].sort(
      (a, b) => b.date.localeCompare(a.date) || a.countryName.localeCompare(b.countryName)
    );

    return {
      scope: actor.isSuperAdmin ? ("global" as const) : ("country" as const),
      countryCodes: actor.isSuperAdmin ? [] : [...coordinatorCountryCodes],
      totalRegistrations: rows.reduce((total, row) => total + row.count, 0),
      rows,
    };
  });
