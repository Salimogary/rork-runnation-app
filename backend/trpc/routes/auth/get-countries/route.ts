import { WORLD_COUNTRIES } from "../../../countries";
import { publicProcedure } from "../../../create-context";

export default publicProcedure.query(async ({ ctx }) => {
  const merged = new Map<string, { name: string; iso_alpha2: string; currency_code?: string | null }>();

  for (const country of WORLD_COUNTRIES) {
    merged.set(country.iso_alpha2, country);
  }

  try {
    let data: Array<{ name: string; iso_alpha2: string; currency_code?: string | null }> | null = null;

    const withCurrency = await ctx.supabase
      .from("countries")
      .select("name, iso_alpha2, currency_code")
      .order("name", { ascending: true });

    if (withCurrency.error) {
      const withLegacyCurrency = await ctx.supabase
        .from("countries")
        .select("name, iso_alpha2, currency")
        .order("name", { ascending: true });

      if (!withLegacyCurrency.error) {
        data = (withLegacyCurrency.data || []).map((country: any) => ({
          name: country.name,
          iso_alpha2: country.iso_alpha2,
          currency_code: country.currency ?? null,
        }));
      } else {
        const fallbackQuery = await ctx.supabase
          .from("countries")
          .select("name, iso_alpha2")
          .order("name", { ascending: true });

        if (!fallbackQuery.error) {
          data = (fallbackQuery.data || []).map((country: any) => ({
            name: country.name,
            iso_alpha2: country.iso_alpha2,
            currency_code: null,
          }));
        } else {
          console.warn("[get-countries] Using bundled fallback countries:", fallbackQuery.error.message);
        }
      }
    } else {
      data = withCurrency.data;
    }

    for (const country of data ?? []) {
      if (country?.iso_alpha2 && country?.name) {
        merged.set(country.iso_alpha2, {
          name: country.name,
          iso_alpha2: country.iso_alpha2,
          currency_code: country.currency_code ?? null,
        });
      }
    }
  } catch (error) {
    console.warn(
      "[get-countries] Using bundled fallback countries:",
      error instanceof Error ? error.message : String(error)
    );
  }

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
});
