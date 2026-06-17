import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { createFlutterwaveMobileMoneyPayment, getSubscriptionPlanDetails } from "../../../flutterwave";
import { requireRegistrationOwner } from "../../../rbac";

const paymentMethodSchema = z.enum(["mtn_mobile_money", "airtel_money", "mpesa"]);

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().uuid(),
      planId: z.string().trim().min(1).max(80),
      paymentMethod: paymentMethodSchema,
      amount: z.number().positive().max(1000000000),
      currency: z.string().trim().min(2).max(8),
      phoneNumber: z.string().trim().min(9).max(20),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const plan = getSubscriptionPlanDetails(input.planId);
    if (normalizePaymentMethodPlanPrefix(input.paymentMethod) !== normalizePaymentMethodPlanPrefix(input.planId)) {
      throw new Error("Selected payment method does not match the subscription plan.");
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
    await ctx.supabase.from("subscriptions").upsert(
      {
        registration_id: input.registrationId,
        status: "pending",
        payment_method: input.paymentMethod,
        payment_reference: null,
        amount: plan.amount,
        currency: plan.currency,
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: "registration_id" }
    );

    const payment = await createFlutterwaveMobileMoneyPayment(ctx.supabase, {
      registrationId: input.registrationId,
      purpose: "subscription",
      purposeId: input.planId,
      amount: plan.amount,
      currency: plan.currency,
      paymentMethod: input.paymentMethod,
      phoneNumber: input.phoneNumber,
      description: `${plan.label} - ${input.planId}`,
      metadata: {
        plan_id: input.planId,
        subscription_duration_days: plan.durationDays,
      },
    });

    return {
      success: true,
      ...payment,
    };
  });

function normalizePaymentMethodPlanPrefix(value: string): string {
  if (value === "mtn_mobile_money") return "ug_mtn";
  if (value === "airtel_money") return "ug_airtel";
  return value.split("_").slice(0, 2).join("_");
}
