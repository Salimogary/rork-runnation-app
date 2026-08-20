import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      userId: z.string(),
      deliveryPhone: z.string(),
      deliveryAddress: z.string(),
      deliveryTimeSlots: z.string(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { userId, deliveryPhone, deliveryAddress, deliveryTimeSlots } = input;
    await requireRegistrationOwner(ctx, userId);

    const { data: cartItems, error: cartError } = await ctx.supabase
      .from("shopping_cart")
      .select("*")
      .eq("registration_id", userId);

    if (cartError) throw cartError;
    if (!cartItems || cartItems.length === 0) {
      throw new Error("Cart is empty");
    }

    let totalAmount = 0;
    const orderItems: Array<{
      catalogue_id: string;
      quantity: number;
      price: number;
      item_name: string;
      item_size: string | null;
    }> = [];

    for (const item of cartItems) {
      const { data: product, error: productError } = await ctx.supabase
        .from("catalogue")
        .select("*")
        .eq("catalogue_id", item.catalogue_id)
        .single();

      if (productError || !product) {
        throw new Error("Product not found");
      }
      if (product.listing_status && product.listing_status !== "approved") {
        throw new Error(`${product.catalogue_item || "This item"} is not available yet`);
      }

      const stock = product.quantity ?? 0;
      console.log(`[buyNow] Product ${product.catalogue_item} stock check:`, JSON.stringify({ rawProduct: product, resolvedStock: stock, requestedQty: item.quantity }));
      if (item.quantity > stock) {
        throw new Error(`Not enough stock for ${product.catalogue_item}`);
      }

      totalAmount += (product.price || 0) * item.quantity;
      orderItems.push({
        catalogue_id: product.catalogue_id,
        quantity: item.quantity,
        price: product.price || 0,
        item_name: product.catalogue_item || "Unknown",
        item_size: product.size,
      });
    }

    const itemsSummary = orderItems.map((oi) => ({
      name: oi.item_name,
      size: oi.item_size,
      qty: oi.quantity,
      price: oi.price,
      subtotal: oi.price * oi.quantity,
    }));

    const { data: order, error: orderError } = await ctx.supabase
      .from("orders_to_deliver")
      .insert({
        user_id: userId,
        phone_number: deliveryPhone,
        delivery_address: deliveryAddress,
        delivery_time_slots: deliveryTimeSlots,
        items: itemsSummary,
        total_amount: totalAmount,
        status: "pending",
      })
      .select()
      .single();

    if (orderError) {
      console.error("Error creating order:", orderError);
      throw new Error(orderError.message || "Failed to create order");
    }

    for (const orderItem of orderItems) {
      const { data: currentProduct, error: fetchError } = await ctx.supabase
        .from("catalogue")
        .select("*")
        .eq("catalogue_id", orderItem.catalogue_id)
        .single();

      if (fetchError || !currentProduct) {
        console.error("Error fetching product for stock update:", fetchError);
      } else {
        const currentStock = currentProduct.quantity ?? 0;
        const newStock = currentStock - orderItem.quantity;
        const { error: stockError } = await ctx.supabase
          .from("catalogue")
          .update({ quantity: Math.max(0, newStock) })
          .eq("catalogue_id", orderItem.catalogue_id);

        if (stockError) {
          console.error("Error updating stock:", stockError);
        }
      }
    }

    const { error: clearCartError } = await ctx.supabase
      .from("shopping_cart")
      .delete()
      .eq("registration_id", userId);

    if (clearCartError) {
      console.error("Error clearing cart:", clearCartError);
    }

    return { success: true, orderId: order.order_id, totalAmount };
  });
