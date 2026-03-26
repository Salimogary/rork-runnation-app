import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(z.object({ cartId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const { error } = await ctx.supabase
      .from("shopping_cart")
      .delete()
      .eq("cart_id", input.cartId);

    if (error) throw error;

    return { success: true };
  });
