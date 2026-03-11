import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(z.object({ userId: z.string() }))
  .query(async ({ input, ctx }) => {
    console.log("[getCart] Fetching cart for user:", JSON.stringify(input.userId), "length:", input.userId.length);
    
    if (!input.userId || input.userId.trim() === '') {
      console.log("[getCart] Empty userId, returning empty array");
      return [];
    }

    const { data: cartItems, error: cartError } = await ctx.supabase
      .from("shopping_cart")
      .select("cart_id, registration_id, catalogue_id, quantity, created_at, updated_at")
      .eq("registration_id", input.userId)
      .order("created_at", { ascending: false });

    console.log("[getCart] Cart items count:", cartItems?.length, "Error:", cartError, "Raw:", JSON.stringify(cartItems));
    if (cartError) {
      console.error("[getCart] Cart query error:", JSON.stringify(cartError));
      throw cartError;
    }
    if (!cartItems || cartItems.length === 0) return [];

    const catalogueIds = cartItems.map((item: any) => item.catalogue_id);

    const { data: products, error: productsError } = await ctx.supabase
      .from("catalogue")
      .select("CatalogueID, Catalogue_Item, Price, Size, Quanity, Photo_URL")
      .in("CatalogueID", catalogueIds);

    if (productsError) throw productsError;

    const productMap = new Map(
      (products || []).map((p: any) => [p.CatalogueID, p])
    );

    return cartItems.map((item: any) => ({
      cart_id: item.cart_id,
      catalogue_id: item.catalogue_id,
      quantity: item.quantity,
      created_at: item.created_at,
      product: productMap.get(item.catalogue_id) || null,
    }));
  });
