import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      cartId: z.string(),
      quantity: z.number().int().positive(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { cartId, quantity } = input;

    const { data: cartItem, error: cartError } = await ctx.supabase
      .from("shopping_cart")
      .select("catalogue_id")
      .eq("cart_id", cartId)
      .single();

    if (cartError || !cartItem) {
      throw new Error("Cart item not found");
    }

    const { data: product, error: productError } = await ctx.supabase
      .from("Catalogue Sample")
      .select("Quanity")
      .eq("CatalogueID", cartItem.catalogue_id)
      .single();

    if (productError || !product) {
      throw new Error("Product not found");
    }

    if (quantity > (product.Quanity || 0)) {
      throw new Error("Not enough stock available");
    }

    const { error } = await ctx.supabase
      .from("shopping_cart")
      .update({ quantity, updated_at: new Date().toISOString() })
      .eq("cart_id", cartId);

    if (error) throw error;

    return { success: true };
  });
