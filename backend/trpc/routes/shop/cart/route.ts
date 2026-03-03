import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      userId: z.string(),
      catalogueId: z.string(),
      quantity: z.number().int().positive(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { userId, catalogueId, quantity } = input;

    const { data: product, error: productError } = await ctx.supabase
      .from("catalogue")
      .select("Quanity")
      .eq("CatalogueID", catalogueId)
      .single();

    if (productError || !product) {
      throw new Error("Product not found");
    }

    const { data: existingCart } = await ctx.supabase
      .from("shopping_cart")
      .select("quantity")
      .eq("user_id", userId)
      .eq("catalogue_id", catalogueId)
      .single();

    const newQuantity = existingCart
      ? existingCart.quantity + quantity
      : quantity;

    if (newQuantity > (product.Quanity || 0)) {
      throw new Error("Not enough stock available");
    }

    if (existingCart) {
      const { error } = await ctx.supabase
        .from("shopping_cart")
        .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("catalogue_id", catalogueId);

      if (error) throw error;
    } else {
      const { error } = await ctx.supabase
        .from("shopping_cart")
        .insert({ user_id: userId, catalogue_id: catalogueId, quantity });

      if (error) throw error;
    }

    return { success: true, message: "Added to cart" };
  });
