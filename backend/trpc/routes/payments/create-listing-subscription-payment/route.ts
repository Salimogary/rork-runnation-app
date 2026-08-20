import { z } from "zod";
import { createFlutterwaveMobileMoneyPayment } from "../../../flutterwave";
import { getOrCreateListingEntitlement, listingFeeSchedule } from "../../../listing-entitlements";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

const paymentMethodSchema = z.enum(["mtn_mobile_money", "airtel_money", "mpesa"]);
const listingKindSchema = z.enum(["ride_share", "accommodation"]);
const tierSchema = z.enum(["quarterly", "annual"]);

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string(),
      listingKind: listingKindSchema,
      tier: tierSchema,
      paymentMethod: paymentMethodSchema,
      phoneNumber: z.string().trim().min(9).max(20),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);
    const entitlement = await getOrCreateListingEntitlement(ctx, input.registrationId, input.listingKind);
    const schedule = listingFeeSchedule(String(entitlement.country_code || "UG"));
    const isAnnual = input.tier === "annual";
    const amount = isAnnual ? schedule.annualFeeAmount : schedule.quarterlyFeeAmount;
    const currency = schedule.feeCurrency;
    const durationDays = isAnnual ? 365 : 90;
    const label = input.listingKind === "ride_share" ? "Ride Share" : "Accommodation";

    await ctx.supabase
      .from("event_listing_entitlements")
      .update({
        status: "pending",
        tier: input.tier,
        updated_at: new Date().toISOString(),
      })
      .eq("entitlement_id", entitlement.entitlement_id);

    const payment = await createFlutterwaveMobileMoneyPayment(ctx.supabase, {
      registrationId: input.registrationId,
      purpose: "listing_subscription",
      purposeId: `${input.listingKind}:${input.tier}`,
      amount,
      currency,
      paymentMethod: input.paymentMethod,
      phoneNumber: input.phoneNumber,
      description: `${label} ${input.tier} listing subscription`,
      metadata: {
        listing_kind: input.listingKind,
        tier: input.tier,
        duration_days: durationDays,
        entitlement_id: entitlement.entitlement_id,
      },
    });

    return {
      success: true,
      amount,
      currency,
      ...payment,
    };
  });
