import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      clubId: z.string().uuid(),
      amount: z.number().positive(),
      currency: z.string().trim().min(3).max(8).default("UGX"),
      destinationType: z.enum(["bank", "mobile_money"]),
      destinationDetails: z.string().trim().min(5).max(700),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { data: club, error: clubError } = await ctx.supabase
      .from("clubs")
      .select("club_id, club_name, country")
      .eq("club_id", input.clubId)
      .maybeSingle();

    if (clubError || !club) {
      throw new Error(clubError?.message || "Club was not found.");
    }

    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
      countryCode: club.country ?? null,
      clubId: input.clubId,
    });

    const { data: payments, error: paymentsError } = await ctx.supabase
      .from("club_payment_items")
      .select("payment_id")
      .eq("club_id", input.clubId);

    if (paymentsError) {
      throw new Error(paymentsError.message || "Could not load club collections.");
    }

    const paymentIds = (payments ?? []).map((payment: any) => payment.payment_id);
    const { data: records, error: recordsError } = paymentIds.length > 0
      ? await ctx.supabase
          .from("club_payment_records")
          .select("amount_paid")
          .in("payment_id", paymentIds)
          .eq("status", "paid")
      : { data: [], error: null };

    if (recordsError) {
      throw new Error(recordsError.message || "Could not calculate collected funds.");
    }

    const { data: requests, error: requestsError } = await ctx.supabase
      .from("club_collection_withdrawal_requests")
      .select("amount, status")
      .eq("club_id", input.clubId)
      .neq("status", "rejected");

    if (requestsError) {
      throw new Error(requestsError.message || "Could not calculate pending payouts.");
    }

    const collected = (records ?? []).reduce((sum: number, record: any) => sum + Number(record.amount_paid ?? 0), 0);
    const requested = (requests ?? []).reduce((sum: number, request: any) => sum + Number(request.amount ?? 0), 0);
    const available = Math.max(collected - requested, 0);

    if (input.amount > available) {
      throw new Error(`Requested amount is above the available club balance (${available.toLocaleString()} ${input.currency}).`);
    }

    const { data, error } = await ctx.supabase
      .from("club_collection_withdrawal_requests")
      .insert({
        club_id: input.clubId,
        requested_by: actor.authUserId,
        amount: input.amount,
        currency: input.currency.trim().toUpperCase(),
        destination_type: input.destinationType,
        destination_details: input.destinationDetails.trim(),
        status: "pending",
      })
      .select("request_id")
      .maybeSingle();

    if (error || !data?.request_id) {
      throw new Error(error?.message || "Could not submit the payout request.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "club_payout_requested",
      targetClubId: input.clubId,
      metadata: {
        requestId: data.request_id,
        amount: input.amount,
        currency: input.currency.trim().toUpperCase(),
        destinationType: input.destinationType,
      },
    });

    return { success: true, requestId: data.request_id };
  });

