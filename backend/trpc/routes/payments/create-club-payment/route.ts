import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { createFlutterwaveMobileMoneyPayment } from "../../../flutterwave";
import { requireRegistrationOwner } from "../../../rbac";

const paymentMethodSchema = z.enum(["mtn_mobile_money", "airtel_money", "mpesa"]);

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().uuid(),
      paymentId: z.string().uuid(),
      paymentMethod: paymentMethodSchema,
      phoneNumber: z.string().trim().min(9).max(20),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const { data: paymentItem, error } = await ctx.supabase
      .from("club_payment_items")
      .select("payment_id, title, amount, currency, is_active")
      .eq("payment_id", input.paymentId)
      .maybeSingle();

    if (error || !paymentItem) {
      throw new Error(error?.message || "Club payment was not found.");
    }
    if (paymentItem.is_active === false) {
      throw new Error("This club payment is no longer active.");
    }

    await ctx.supabase.from("club_payment_records").upsert(
      {
        payment_id: input.paymentId,
        registration_id: input.registrationId,
        status: "pending",
        amount_paid: 0,
        notes: "Flutterwave payment started",
      },
      { onConflict: "payment_id,registration_id" }
    );

    const payment = await createFlutterwaveMobileMoneyPayment(ctx.supabase, {
      registrationId: input.registrationId,
      purpose: "club_payment",
      purposeId: input.paymentId,
      amount: Number(paymentItem.amount || 0),
      currency: paymentItem.currency || "UGX",
      paymentMethod: input.paymentMethod,
      phoneNumber: input.phoneNumber,
      description: `RunNation club payment - ${paymentItem.title}`,
      metadata: {
        club_payment_id: input.paymentId,
        title: paymentItem.title,
      },
    });

    return { success: true, ...payment };
  });
