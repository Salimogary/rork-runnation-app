import { z } from "zod";
import { publicProcedure } from "../../../create-context";

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
        .eq("CatalogueID", item.catalogue_id)
        .single();

      if (productError || !product) {
        throw new Error("Product not found");
      }

      if (item.quantity > (product.Quanity || 0)) {
        throw new Error(`Not enough stock for ${product.Catalogue_Item}`);
      }

      totalAmount += (product.Price || 0) * item.quantity;
      orderItems.push({
        catalogue_id: product.CatalogueID,
        quantity: item.quantity,
        price: product.Price || 0,
        item_name: product.Catalogue_Item || "Unknown",
        item_size: product.Size,
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
        .select("Quanity")
        .eq("CatalogueID", orderItem.catalogue_id)
        .single();

      if (fetchError || !currentProduct) {
        console.error("Error fetching product for stock update:", fetchError);
      } else {
        const newStock = (currentProduct.Quanity || 0) - orderItem.quantity;
        const { error: stockError } = await ctx.supabase
          .from("catalogue")
          .update({ Quanity: Math.max(0, newStock) })
          .eq("CatalogueID", orderItem.catalogue_id);

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
