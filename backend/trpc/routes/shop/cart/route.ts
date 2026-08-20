import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

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
    await requireRegistrationOwner(ctx, userId);

    const { data: product, error: productError } = await ctx.supabase
      .from("catalogue")
      .select("*")
      .eq("catalogue_id", catalogueId)
      .single();

    if (productError || !product) {
      throw new Error("Product not found: " + (productError?.message || "unknown"));
    }
    if (product.listing_status && product.listing_status !== "approved") {
      throw new Error("This item is not available yet.");
    }

    const { data: existingCart } = await ctx.supabase
      .from("shopping_cart")
      .select("quantity")
      .eq("registration_id", userId)
      .eq("catalogue_id", catalogueId)
      .maybeSingle();

    const newQuantity = existingCart
      ? existingCart.quantity + quantity
      : quantity;

    const stock = product.quantity ?? 0;
    if (newQuantity > stock) {
      throw new Error("Not enough stock available");
    }

    if (existingCart) {
      const { error } = await ctx.supabase
        .from("shopping_cart")
        .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
        .eq("registration_id", userId)
        .eq("catalogue_id", catalogueId);

      if (error) throw error;
    } else {
      const { error } = await ctx.supabase
        .from("shopping_cart")
        .insert({ registration_id: userId, catalogue_id: catalogueId, quantity });

      if (error) throw error;
    }

    return { success: true, message: "Added to cart" };
  });
