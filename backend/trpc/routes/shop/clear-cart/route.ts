import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(z.object({ userId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const { error } = await ctx.supabase
      .from("shopping_cart")
      .delete()
      .eq("user_id", input.userId);

    if (error) throw error;

    return { success: true };
  });
