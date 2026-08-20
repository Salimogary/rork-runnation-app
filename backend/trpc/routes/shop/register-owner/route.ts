import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

const paymentModeSchema = z.enum(["card", "mobile_money", "cash_on_delivery"]);

function normalizeCountryCode(country?: string | null): string {
  const value = String(country || "").trim().toLowerCase();
  if (!value) return "UG";
  if (["ug", "uga", "uganda"].includes(value)) return "UG";
  return value.slice(0, 2).toUpperCase();
}

export default publicProcedure
  .input(
    z.object({
      userId: z.string(),
      shopName: z.string().trim().min(2).max(80),
      paymentModes: z.array(paymentModeSchema).min(1).max(3),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.userId);

    const { data: registration, error: registrationError } = await ctx.supabase
      .from("registrations")
      .select("registration_id, country")
      .eq("registration_id", input.userId)
      .maybeSingle();

    if (registrationError || !registration) {
      throw new Error(registrationError?.message || "Could not find your registration.");
    }

    const countryCode = normalizeCountryCode(registration.country);
    const isUgandaStore = countryCode === "UG";
    const uniquePaymentModes = Array.from(new Set(input.paymentModes));
    const nowIso = new Date().toISOString();
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 30);

    const payload = {
      registration_id: input.userId,
      shop_name: input.shopName.trim(),
      country_code: countryCode,
      payment_modes: uniquePaymentModes,
      status: "pending",
      free_trial_started_at: nowIso,
      free_trial_ends_at: trialEnds.toISOString(),
      quarterly_fee_amount: isUgandaStore ? 20000 : 4,
      quarterly_fee_currency: isUgandaStore ? "UGX" : "USD",
      annual_fee_amount: isUgandaStore ? 60000 : 12,
      annual_fee_currency: isUgandaStore ? "UGX" : "USD",
      rejection_reason: null,
      updated_at: nowIso,
    };

    const { data, error } = await ctx.supabase
      .from("shop_owner_applications")
      .upsert(payload, { onConflict: "registration_id" })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Could not submit your shop registration.");
    }

    return data;
  });
