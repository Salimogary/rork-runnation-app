import { z } from "zod";
import { ensureActionCooldown } from "../../../abuse";
import { publicProcedure } from "../../../create-context";
import { createFlutterwaveMobileMoneyPayment } from "../../../flutterwave";
import { requireRegistrationOwner } from "../../../rbac";

const paymentMethodSchema = z.enum(["mtn_mobile_money", "airtel_money", "mpesa"]);

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().uuid(),
      amount: z.number().positive().max(1000000000),
      currency: z.string().trim().min(2).max(8),
      countryCode: z.string().trim().length(2).nullable().optional(),
      paymentMethod: paymentMethodSchema,
      phoneNumber: z.string().trim().min(9).max(20),
      remarks: z.string().trim().max(1000).nullable().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);
    await ensureActionCooldown(ctx, {
      table: "donation_intents",
      filters: [{ column: "registration_id", value: input.registrationId }],
      cooldownSeconds: 30,
      errorMessage: "Please wait a moment before sending another donation.",
    });

    const { data: donation, error } = await ctx.supabase
      .from("donation_intents")
      .insert({
        user_id: ctx.authUserId,
        registration_id: input.registrationId,
        amount: input.amount,
        currency: input.currency.trim().toUpperCase(),
        country_code: input.countryCode?.trim().toUpperCase() || null,
        payment_method: "mobile_money",
        remarks: input.remarks?.trim() || null,
        status: "pledged",
      })
      .select("donation_id")
      .single();

    if (error || !donation?.donation_id) {
      throw new Error(error?.message || "Could not record the donation.");
    }

    const payment = await createFlutterwaveMobileMoneyPayment(ctx.supabase, {
      registrationId: input.registrationId,
      purpose: "donation",
      purposeId: donation.donation_id,
      amount: input.amount,
      currency: input.currency,
      paymentMethod: input.paymentMethod,
      phoneNumber: input.phoneNumber,
      description: "RunNation donation",
      metadata: {
        donation_id: donation.donation_id,
      },
    });

    return { success: true, donationId: donation.donation_id, ...payment };
  });
