import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

async function requireClubPaymentAccess(ctx: any, clubId: string) {
  const { data: club, error } = await ctx.supabase
    .from("clubs")
    .select("club_id, club_name, country")
    .eq("club_id", clubId)
    .maybeSingle();

  if (error || !club) {
    throw new Error(error?.message || "Club was not found.");
  }

  const actor = await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryAdmin: true,
    allowCountryCoordinator: true,
    allowClubCoordinator: true,
    countryCode: club.country ?? null,
    clubId,
  });

  return { actor, club };
}

export default publicProcedure
  .input(
    z.object({
      clubId: z.string().uuid(),
      title: z.string().trim().min(2).max(120),
      description: z.string().trim().max(500).optional().nullable(),
      amount: z.number().min(0),
      currency: z.string().trim().min(3).max(8).default("UGX"),
      dueDate: z.string().trim().max(10).optional().nullable(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { actor, club } = await requireClubPaymentAccess(ctx, input.clubId);

    const { data, error } = await ctx.supabase
      .from("club_payment_items")
      .insert({
        club_id: input.clubId,
        created_by: actor.authUserId,
        title: input.title,
        description: input.description?.trim() || null,
        amount: input.amount,
        currency: input.currency.trim().toUpperCase(),
        due_date: input.dueDate || null,
        is_active: true,
      })
      .select("payment_id")
      .maybeSingle();

    if (error || !data?.payment_id) {
      throw new Error(error?.message || "Could not create the club payment.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "club_payment_created",
      targetClubId: input.clubId,
      metadata: {
        paymentId: data.payment_id,
        clubName: club.club_name,
        title: input.title,
        amount: input.amount,
        currency: input.currency.trim().toUpperCase(),
      },
    });

    return { success: true, paymentId: data.payment_id };
  });

