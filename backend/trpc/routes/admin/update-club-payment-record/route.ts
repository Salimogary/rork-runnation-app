import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      paymentId: z.string().uuid(),
      registrationId: z.string().uuid(),
      status: z.enum(["unpaid", "pending", "paid", "waived"]),
      amountPaid: z.number().min(0).optional(),
      notes: z.string().trim().max(500).optional().nullable(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { data: payment, error: paymentError } = await ctx.supabase
      .from("club_payment_items")
      .select("payment_id, club_id, title, amount, currency, clubs(country)")
      .eq("payment_id", input.paymentId)
      .maybeSingle();

    if (paymentError || !payment) {
      throw new Error(paymentError?.message || "Payment item was not found.");
    }

    const clubSource = Array.isArray(payment.clubs) ? payment.clubs[0] : payment.clubs;
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
      countryCode: clubSource?.country ?? null,
      clubId: payment.club_id,
    });

    const amountPaid = input.status === "paid"
      ? input.amountPaid ?? Number(payment.amount ?? 0)
      : input.status === "waived"
      ? 0
      : input.amountPaid ?? 0;

    const { error } = await ctx.supabase
      .from("club_payment_records")
      .upsert(
        {
          payment_id: input.paymentId,
          registration_id: input.registrationId,
          status: input.status,
          amount_paid: amountPaid,
          paid_at: input.status === "paid" ? new Date().toISOString() : null,
          notes: input.notes?.trim() || null,
          updated_by: actor.authUserId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "payment_id,registration_id" }
      );

    if (error) {
      throw new Error(error.message || "Could not update payment status.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "club_payment_record_updated",
      targetClubId: payment.club_id,
      metadata: {
        paymentId: input.paymentId,
        registrationId: input.registrationId,
        status: input.status,
        amountPaid,
      },
    });

    return { success: true };
  });

