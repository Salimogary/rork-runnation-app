import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

function normalizeClubName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export default publicProcedure
  .input(z.object({ registrationId: z.string().uuid() }))
  .query(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const { data: clubs, error: clubsError } = await ctx.supabase
      .from("clubs")
      .select("club_id, club_name, coordinator_id");

    if (clubsError) {
      throw new Error(clubsError.message || "Could not load clubs.");
    }

    const clubByCoordinator = new Map((clubs ?? []).map((club: any) => [club.coordinator_id, club]));
    const clubByName = new Map((clubs ?? []).map((club: any) => [normalizeClubName(club.club_name), club]));
    const userClubIds = new Set<string>();

    const { data: memberRows } = await ctx.supabase
      .from("club_members")
      .select("coordinator_id")
      .eq("registration_id", input.registrationId);

    for (const member of memberRows ?? []) {
      const club = clubByCoordinator.get(member.coordinator_id);
      if (club?.club_id) userClubIds.add(club.club_id);
    }

    const { data: approvedRequests } = await ctx.supabase
      .from("club_membership_request")
      .select("club_id, club, status")
      .eq("registration_id", input.registrationId)
      .eq("status", "approved");

    for (const request of approvedRequests ?? []) {
      const club = request.club_id ? (clubs ?? []).find((item: any) => item.club_id === request.club_id) : clubByName.get(normalizeClubName(request.club));
      if (club?.club_id) userClubIds.add(club.club_id);
    }

    const clubIds = [...userClubIds];
    if (clubIds.length === 0) {
      return [];
    }

    const { data: payments, error: paymentsError } = await ctx.supabase
      .from("club_payment_items")
      .select("*")
      .in("club_id", clubIds)
      .eq("is_active", true)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (paymentsError) {
      throw new Error(paymentsError.message || "Could not load club payments.");
    }

    const paymentIds = (payments ?? []).map((payment: any) => payment.payment_id);
    const { data: records, error: recordsError } = paymentIds.length > 0
      ? await ctx.supabase
          .from("club_payment_records")
          .select("*")
          .in("payment_id", paymentIds)
          .eq("registration_id", input.registrationId)
      : { data: [], error: null };

    if (recordsError) {
      throw new Error(recordsError.message || "Could not load your club payment status.");
    }

    const recordMap = new Map((records ?? []).map((record: any) => [record.payment_id, record]));
    const clubMap = new Map((clubs ?? []).map((club: any) => [club.club_id, club]));

    return (payments ?? []).map((payment: any) => {
      const record = recordMap.get(payment.payment_id);
      return {
        paymentId: payment.payment_id,
        clubId: payment.club_id,
        clubName: clubMap.get(payment.club_id)?.club_name ?? "Club",
        title: payment.title,
        description: payment.description ?? null,
        amount: Number(payment.amount ?? 0),
        currency: payment.currency ?? "UGX",
        dueDate: payment.due_date ?? null,
        status: record?.status ?? "unpaid",
        amountPaid: Number(record?.amount_paid ?? 0),
        paidAt: record?.paid_at ?? null,
      };
    });
  });
