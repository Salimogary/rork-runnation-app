import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(z.object({ userId: z.string() }))
  .query(async ({ input, ctx }) => {
    if (!input.userId || input.userId.trim() === '') {
      return [];
    }

    await requireRegistrationOwner(ctx, input.userId);

    const { data: cartItems, error: cartError } = await ctx.supabase
      .from("shopping_cart")
      .select("cart_id, registration_id, catalogue_id, quantity, created_at, updated_at")
      .eq("registration_id", input.userId)
      .order("created_at", { ascending: false });

    if (cartError) {
      console.error("[getCart] Cart query error:", JSON.stringify(cartError));
      throw cartError;
    }
    if (!cartItems || cartItems.length === 0) return [];

    const catalogueIds = cartItems.map((item: any) => item.catalogue_id);

    const { data: products, error: productsError } = await ctx.supabase
      .from("catalogue")
      .select("catalogue_id, catalogue_item, price, size, quantity, photo_url, currency_code, listing_status, condition")
      .in("catalogue_id", catalogueIds);

    if (productsError) throw productsError;

    const productMap = new Map(
      (products || []).map((p: any) => [p.catalogue_id, p])
    );

    return cartItems.map((item: any) => ({
      cart_id: item.cart_id,
      catalogue_id: item.catalogue_id,
      quantity: item.quantity,
      created_at: item.created_at,
      product: (() => {
        const product = productMap.get(item.catalogue_id);
        return product?.listing_status && product.listing_status !== "approved" ? null : product || null;
      })(),
    }));
  });
