import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(z.object({ userId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.userId);

    const { error } = await ctx.supabase
      .from("shopping_cart")
      .delete()
      .eq("registration_id", input.userId);

    if (error) throw error;

    return { success: true };
  });
