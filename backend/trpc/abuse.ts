import type { Context } from "./create-context";

type CooldownFilter = {
  column: string;
  value: string | number | boolean | null;
};

type CooldownOptions = {
  table: string;
  filters: CooldownFilter[];
  cooldownSeconds: number;
  errorMessage: string;
};

type DuplicateOptions = {
  table: string;
  filters: CooldownFilter[];
  textColumn: string;
  textValue: string | null | undefined;
  windowSeconds: number;
  errorMessage: string;
};

function applyFilters(query: any, filters: CooldownFilter[]) {
  return filters.reduce((current, filter) => {
    if (filter.value === null) {
      return current.is(filter.column, null);
    }
    return current.eq(filter.column, filter.value);
  }, query);
}

function toMillis(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function ensureActionCooldown(
  ctx: Context,
  options: CooldownOptions
): Promise<void> {
  let query = ctx.supabase
    .from(options.table)
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1);

  query = applyFilters(query, options.filters);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to validate request timing.");
  }

  const lastCreatedAt = toMillis(data?.created_at);
  if (lastCreatedAt === null) return;

  const elapsedSeconds = (Date.now() - lastCreatedAt) / 1000;
  if (elapsedSeconds < options.cooldownSeconds) {
    throw new Error(options.errorMessage);
  }
}

export async function ensureNoRecentDuplicateText(
  ctx: Context,
  options: DuplicateOptions
): Promise<void> {
  const textValue = options.textValue?.trim();
  if (!textValue) return;

  let query = ctx.supabase
    .from(options.table)
    .select("created_at")
    .eq(options.textColumn, textValue)
    .order("created_at", { ascending: false })
    .limit(1);

  query = applyFilters(query, options.filters);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to validate duplicate content.");
  }

  const lastCreatedAt = toMillis(data?.created_at);
  if (lastCreatedAt === null) return;

  const elapsedSeconds = (Date.now() - lastCreatedAt) / 1000;
  if (elapsedSeconds < options.windowSeconds) {
    throw new Error(options.errorMessage);
  }
}
