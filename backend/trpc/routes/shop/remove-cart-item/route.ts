import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(z.object({ cartId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const { data: cartItem, error: cartLookupError } = await ctx.supabase
      .from("shopping_cart")
      .select("registration_id")
      .eq("cart_id", input.cartId)
      .single();

    if (cartLookupError || !cartItem) {
      throw new Error("Cart item not found");
    }

    await requireRegistrationOwner(ctx, cartItem.registration_id);

    const { error } = await ctx.supabase
      .from("shopping_cart")
      .delete()
      .eq("cart_id", input.cartId);

    if (error) throw error;

    return { success: true };
  });
