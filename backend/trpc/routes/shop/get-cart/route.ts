import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(z.object({ userId: z.string() }))
  .query(async ({ input, ctx }) => {
    const { data, error } = await ctx.supabase
      .from("shopping_cart")
      .select(`
        cart_id,
        catalogue_id,
        quantity,
        created_at,
        Catalogue Sample (
          CatalogueID,
          Catalogue_Item,
          Price,
          Size,
          Quanity,
          Photo_URL
        )
      `)
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return data || [];
  });
