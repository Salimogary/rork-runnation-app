import { z } from "zod";
import { ensureActionCooldown } from "../../../abuse";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

const paymentMethodSchema = z.enum(["card", "mobile_money"]);

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      amount: z.number().positive().max(1000000000),
      currency: z.string().trim().min(2).max(8),
      countryCode: z.string().trim().length(2).nullable().optional(),
      paymentMethod: paymentMethodSchema,
      remarks: z.string().trim().max(1000).nullable().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);
    await ensureActionCooldown(ctx, {
      table: "donation_intents",
      filters: [{ column: "registration_id", value: input.registrationId }],
      cooldownSeconds: 30,
      errorMessage: "Please wait a moment before sending another donation pledge.",
    });

    const { error } = await ctx.supabase
      .from("donation_intents")
      .insert({
        user_id: ctx.authUserId,
        registration_id: input.registrationId,
        amount: input.amount,
        currency: input.currency.trim().toUpperCase(),
        country_code: input.countryCode?.trim().toUpperCase() || null,
        payment_method: input.paymentMethod,
        remarks: input.remarks?.trim() || null,
        status: "pledged",
      });

    if (error) {
      throw new Error(error.message || "Could not record the donation pledge.");
    }

    return { success: true };
  });
