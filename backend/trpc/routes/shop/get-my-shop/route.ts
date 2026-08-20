import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { getActorRoleSession, requireRegistrationOwner } from "../../../rbac";

function isMissingShopSchema(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("shop_owner_applications") || message.includes("schema cache") || message.includes("does not exist");
}

function normalizeCountryCode(country?: string | null): string {
  const value = String(country || "").trim().toLowerCase();
  if (!value) return "UG";
  if (["ug", "uga", "uganda"].includes(value)) return "UG";
  return value.slice(0, 2).toUpperCase();
}

export default publicProcedure
  .input(z.object({ userId: z.string() }))
  .query(async ({ input, ctx }) => {
    if (!input.userId || input.userId.trim() === "") {
      return null;
    }

    await requireRegistrationOwner(ctx, input.userId);

    const [{ data: registration }, actor] = await Promise.all([
      ctx.supabase
        .from("registrations")
        .select("registration_id, country")
        .eq("registration_id", input.userId)
        .maybeSingle(),
      getActorRoleSession(ctx),
    ]);

    const countryCode = normalizeCountryCode(registration?.country);
    const isUgandaStore = countryCode === "UG";
    const feeCurrency = isUgandaStore ? "UGX" : "USD";

    const { data: application, error } = await ctx.supabase
      .from("shop_owner_applications")
      .select("*")
      .eq("registration_id", input.userId)
      .maybeSingle();

    if (error) {
      if (isMissingShopSchema(error)) {
        return {
          application: null,
          countryCode,
          isUgandaStore,
          quarterlyFeeAmount: isUgandaStore ? 20000 : 4,
          annualFeeAmount: isUgandaStore ? 60000 : 12,
          feeCurrency,
          isClubCoordinator: actor.isClubCoordinator || actor.isSpecialClubCoordinator,
          isGlobalAdmin: actor.isSuperAdmin,
        };
      }
      throw error;
    }

    return {
      application,
      countryCode,
      isUgandaStore,
      quarterlyFeeAmount: isUgandaStore ? 20000 : 4,
      annualFeeAmount: isUgandaStore ? 60000 : 12,
      feeCurrency,
      isClubCoordinator: actor.isClubCoordinator || actor.isSpecialClubCoordinator,
      isGlobalAdmin: actor.isSuperAdmin,
    };
  });
