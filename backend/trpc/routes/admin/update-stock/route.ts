import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      catalogueId: z.string(),
      quantity: z.number().int().nonnegative(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { catalogueId, quantity } = input;

    const { error } = await ctx.supabase
      .from("Catalogue Sample")
      .update({ Quanity: quantity })
      .eq("CatalogueID", catalogueId);

    if (error) throw error;

    return { success: true };
  });
