import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { getListingEntitlementStatuses, listingFeeSchedule } from "../../../listing-entitlements";
import { requireRegistrationOwner } from "../../../rbac";

function normalizeCountryCode(country?: string | null): string {
  const value = String(country || "").trim().toLowerCase();
  if (!value) return "UG";
  if (["ug", "uga", "uganda"].includes(value)) return "UG";
  return value.slice(0, 2).toUpperCase();
}

function isCurrent(status?: string | null, expiresAt?: string | null, trialEndsAt?: string | null): boolean {
  const now = new Date();
  if (status === "trial" && trialEndsAt) return new Date(trialEndsAt) > now;
  if (status === "active" && expiresAt) return new Date(expiresAt) > now;
  return false;
}

export default publicProcedure
  .input(z.object({ registrationId: z.string() }))
  .query(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const [{ data: registration }, { data: subscription }, { data: shopApplication }] = await Promise.all([
      ctx.supabase
        .from("registrations")
        .select("registration_id, country, created_at")
        .eq("registration_id", input.registrationId)
        .maybeSingle(),
      ctx.supabase
        .from("subscriptions")
        .select("status, started_at, expires_at")
        .eq("registration_id", input.registrationId)
        .maybeSingle(),
      ctx.supabase
        .from("shop_owner_applications")
        .select("status, created_at, free_trial_ends_at, quarterly_fee_amount, quarterly_fee_currency, annual_fee_amount, annual_fee_currency")
        .eq("registration_id", input.registrationId)
        .maybeSingle(),
    ]);

    const countryCode = normalizeCountryCode(registration?.country);
    const schedule = listingFeeSchedule(countryCode);
    const eventListingStatuses = await getListingEntitlementStatuses(ctx, input.registrationId);
    const membershipTrialEndsAt = registration?.created_at
      ? new Date(new Date(registration.created_at).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    return [
      {
        key: "membership",
        label: "Membership",
        status: subscription?.status ?? "trial",
        tier: subscription?.status === "active" ? "paid" : "trial",
        startsAt: subscription?.started_at ?? registration?.created_at ?? null,
        expiresAt: subscription?.expires_at ?? null,
        trialEndsAt: membershipTrialEndsAt,
        isCurrent: subscription?.status === "active"
          ? isCurrent("active", subscription.expires_at, null)
          : isCurrent("trial", null, membershipTrialEndsAt),
        quarterlyFeeAmount: countryCode === "UG" ? 20000 : 5,
        annualFeeAmount: countryCode === "UG" ? 60000 : 15,
        feeCurrency: countryCode === "UG" ? "UGX" : "USD",
      },
      {
        key: "shop_listing",
        label: "Shop Listing",
        status: shopApplication?.status ?? "not_registered",
        tier: shopApplication?.status === "approved" ? "trial" : "not_started",
        startsAt: shopApplication?.created_at ?? null,
        expiresAt: null,
        trialEndsAt: shopApplication?.free_trial_ends_at ?? null,
        isCurrent: shopApplication?.status === "approved"
          ? isCurrent("trial", null, shopApplication.free_trial_ends_at)
          : false,
        quarterlyFeeAmount: shopApplication?.quarterly_fee_amount ?? schedule.quarterlyFeeAmount,
        annualFeeAmount: shopApplication?.annual_fee_amount ?? schedule.annualFeeAmount,
        feeCurrency: shopApplication?.quarterly_fee_currency ?? schedule.feeCurrency,
      },
      ...eventListingStatuses.map((status) => ({
        key: status.kind,
        label: status.label,
        status: status.status,
        tier: status.tier,
        startsAt: status.startsAt,
        expiresAt: status.expiresAt,
        trialEndsAt: status.trialEndsAt,
        isCurrent: status.isCurrent,
        quarterlyFeeAmount: status.quarterlyFeeAmount,
        annualFeeAmount: status.annualFeeAmount,
        feeCurrency: status.feeCurrency,
      })),
    ];
  });
