import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      catalogueId: z.string(),
      quantity: z.number().int().nonnegative(),
      condition: z.enum(["New", "Used", "Refurbished"]).optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
    });

    const { catalogueId, quantity, condition } = input;

    const { error } = await ctx.supabase
      .from("catalogue")
      .update({
        quantity,
        ...(condition ? { condition } : {}),
      })
      .eq("catalogue_id", catalogueId);

    if (error) throw error;

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "update_stock",
      metadata: {
        catalogueId,
        quantity,
        condition,
      },
    });

    return { success: true };
  });

