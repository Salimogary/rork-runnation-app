import type { Context } from "./create-context";

export type ListingKind = "ride_share" | "accommodation";

const LISTING_KIND_LABELS: Record<ListingKind, string> = {
  ride_share: "Ride Share",
  accommodation: "Accommodation",
};

function normalizeCountryCode(country?: string | null): string {
  const value = String(country || "").trim().toLowerCase();
  if (!value) return "UG";
  if (["ug", "uga", "uganda"].includes(value)) return "UG";
  return value.slice(0, 2).toUpperCase();
}

export function listingFeeSchedule(countryCode: string) {
  const isUganda = countryCode.toUpperCase() === "UG";
  return {
    quarterlyFeeAmount: isUganda ? 20000 : 4,
    annualFeeAmount: isUganda ? 60000 : 12,
    feeCurrency: isUganda ? "UGX" : "USD",
  };
}

function isMissingSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("event_listing_entitlements") || message.includes("schema cache") || message.includes("does not exist");
}

function isEntitlementCurrent(entitlement: any): boolean {
  const now = new Date();
  if (entitlement?.status === "trial" && entitlement.trial_ends_at) {
    return new Date(entitlement.trial_ends_at) > now;
  }
  if (entitlement?.status === "active" && entitlement.expires_at) {
    return new Date(entitlement.expires_at) > now;
  }
  return false;
}

export async function getOrCreateListingEntitlement(ctx: Context, registrationId: string, listingKind: ListingKind) {
  const { data: registration, error: registrationError } = await ctx.supabase
    .from("registrations")
    .select("registration_id, country")
    .eq("registration_id", registrationId)
    .maybeSingle();

  if (registrationError || !registration) {
    throw new Error(registrationError?.message || "Could not find your registration.");
  }

  const countryCode = normalizeCountryCode(registration.country);
  const schedule = listingFeeSchedule(countryCode);
  const { data: existing, error: existingError } = await ctx.supabase
    .from("event_listing_entitlements")
    .select("*")
    .eq("registration_id", registrationId)
    .eq("listing_kind", listingKind)
    .maybeSingle();

  if (existingError && !isMissingSchemaError(existingError)) {
    throw new Error(existingError.message || "Could not check listing subscription.");
  }
  if (existing) return existing;

  const now = new Date();
  const trialEnds = new Date(now);
  trialEnds.setDate(trialEnds.getDate() + 30);

  const { data, error } = await ctx.supabase
    .from("event_listing_entitlements")
    .insert({
      registration_id: registrationId,
      listing_kind: listingKind,
      status: "trial",
      tier: "trial",
      country_code: countryCode,
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEnds.toISOString(),
      quarterly_fee_amount: schedule.quarterlyFeeAmount,
      quarterly_fee_currency: schedule.feeCurrency,
      annual_fee_amount: schedule.annualFeeAmount,
      annual_fee_currency: schedule.feeCurrency,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not start your listing trial.");
  }

  return data;
}

export async function requireActiveListingEntitlement(ctx: Context, registrationId: string, listingKind: ListingKind) {
  const entitlement = await getOrCreateListingEntitlement(ctx, registrationId, listingKind);
  if (isEntitlementCurrent(entitlement)) {
    return entitlement;
  }

  const schedule = listingFeeSchedule(String(entitlement.country_code || "UG"));
  throw new Error(
    `${LISTING_KIND_LABELS[listingKind]} listing trial has ended. Renew this listing subscription from Settings > Subscription: ${schedule.feeCurrency} ${schedule.quarterlyFeeAmount.toLocaleString()} quarterly or ${schedule.feeCurrency} ${schedule.annualFeeAmount.toLocaleString()} annually.`
  );
}

export async function getListingEntitlementStatuses(ctx: Context, registrationId: string) {
  const { data: registration } = await ctx.supabase
    .from("registrations")
    .select("registration_id, country")
    .eq("registration_id", registrationId)
    .maybeSingle();

  const countryCode = normalizeCountryCode(registration?.country);
  const schedule = listingFeeSchedule(countryCode);
  const { data: entitlements, error: entitlementError } = await ctx.supabase
    .from("event_listing_entitlements")
    .select("*")
    .eq("registration_id", registrationId);

  if (entitlementError && !isMissingSchemaError(entitlementError)) {
    throw new Error(entitlementError.message || "Could not load listing subscriptions.");
  }

  const byKind = new Map((entitlements ?? []).map((row: any) => [row.listing_kind, row]));
  return (["ride_share", "accommodation"] as ListingKind[]).map((kind) => {
    const entitlement = byKind.get(kind);
    const active = entitlement ? isEntitlementCurrent(entitlement) : false;
    return {
      kind,
      label: LISTING_KIND_LABELS[kind],
      status: entitlement?.status ?? "not_started",
      tier: entitlement?.tier ?? "trial",
      countryCode: entitlement?.country_code ?? countryCode,
      startsAt: entitlement?.trial_started_at ?? entitlement?.created_at ?? null,
      trialEndsAt: entitlement?.trial_ends_at ?? null,
      expiresAt: entitlement?.expires_at ?? null,
      isCurrent: active,
      quarterlyFeeAmount: entitlement?.quarterly_fee_amount ?? schedule.quarterlyFeeAmount,
      annualFeeAmount: entitlement?.annual_fee_amount ?? schedule.annualFeeAmount,
      feeCurrency: entitlement?.quarterly_fee_currency ?? schedule.feeCurrency,
    };
  });
}
