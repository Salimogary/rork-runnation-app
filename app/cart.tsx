import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useRouter, Stack } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { ShoppingCart, Trash2, Plus, Minus } from "lucide-react-native";
import { Image } from "expo-image";
import { useQueryClient } from "@tanstack/react-query";

export default function CartScreen() {
  const router = useRouter();
  const { registrationId } = useAuth();
  const queryClient = useQueryClient();

  const { data: cartItems, isLoading } = trpc.shop.getCart.useQuery({ userId: registrationId });

  const updateCartMutation = trpc.shop.updateCartItem.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [["shop", "getCart"]] });
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to update cart");
    },
  });

  const removeCartMutation = trpc.shop.removeCartItem.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [["shop", "getCart"]] });
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to remove item");
    },
  });

  const handleQuantityChange = (cartId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    updateCartMutation.mutate({ cartId, quantity: newQuantity });
  };

  const handleRemoveItem = (cartId: string) => {
    Alert.alert("Remove Item", "Are you sure you want to remove this item?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", onPress: () => removeCartMutation.mutate({ cartId }), style: "destructive" },
    ]);
  };

  const totalAmount = cartItems?.reduce((total: number, item: any) => {
    const product = item.product;
    return total + (product?.Price || 0) * item.quantity;
  }, 0) || 0;

  const handleCheckout = () => {
    if (!cartItems || cartItems.length === 0) {
      Alert.alert("Empty Cart", "Please add items to your cart before checking out");
      return;
    }
    router.push("/checkout" as any);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Shopping Cart", headerBackTitle: "Shop" }} />

      {isLoading ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Loading cart...</Text>
        </View>
      ) : !cartItems || cartItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ShoppingCart size={80} color="#d1d5db" />
          <Text style={styles.emptyText}>Your cart is empty</Text>
          <Text style={styles.emptySubtext}>Add items from the shop to get started</Text>
          <TouchableOpacity style={styles.shopButton} onPress={() => router.back()}>
            <Text style={styles.shopButtonText}>Continue Shopping</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {cartItems.map((item: any) => {
              const product = item.product;
              return (
                <View key={item.cart_id} style={styles.cartItem}>
                  {product?.Photo_URL ? (
                    <Image
                      source={{ uri: product.Photo_URL }}
                      style={styles.productImage}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.productImagePlaceholder}>
                      <ShoppingCart size={24} color="#9ca3af" />
                    </View>
                  )}

                  <View style={styles.itemDetails}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {product?.Catalogue_Item || "Unknown Item"}
                    </Text>
                    {product?.Size && (
                      <Text style={styles.itemSize}>Size: {product.Size}</Text>
                    )}
                    <Text style={styles.itemPrice}>
                      ugx.{(product?.Price || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </Text>
                  </View>

                  <View style={styles.itemActions}>
                    <View style={styles.quantityControl}>
                      <TouchableOpacity
                        style={styles.quantityButton}
                        onPress={() => handleQuantityChange(item.cart_id, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                      >
                        <Minus size={16} color={item.quantity <= 1 ? "#d1d5db" : "#374151"} />
                      </TouchableOpacity>
                      <Text style={styles.quantityText}>{item.quantity}</Text>
                      <TouchableOpacity
                        style={styles.quantityButton}
                        onPress={() => handleQuantityChange(item.cart_id, item.quantity + 1)}
                      >
                        <Plus size={16} color="#374151" />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => handleRemoveItem(item.cart_id)}
                    >
                      <Trash2 size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total:</Text>
              <Text style={styles.totalAmount}>
                ugx.{totalAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </Text>
            </View>
            <TouchableOpacity style={styles.checkoutButton} onPress={handleCheckout}>
              <Text style={styles.checkoutButtonText}>Proceed to Checkout</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 16,
  },
  emptyText: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: "#374151",
  },
  emptySubtext: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
  },
  shopButton: {
    backgroundColor: "#10b981",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 16,
  },
  shopButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700" as const,
  },
  cartItem: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  productImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  itemDetails: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#111827",
  },
  itemSize: {
    fontSize: 13,
    color: "#6b7280",
  },
  itemPrice: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: "#10b981",
    marginTop: 4,
  },
  itemActions: {
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  quantityControl: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  quantityButton: {
    padding: 4,
  },
  quantityText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#111827",
    minWidth: 24,
    textAlign: "center",
  },
  removeButton: {
    padding: 8,
  },
  footer: {
    backgroundColor: "#fff",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 16,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#374151",
  },
  totalAmount: {
    fontSize: 26,
    fontWeight: "800" as const,
    color: "#10b981",
  },
  checkoutButton: {
    backgroundColor: "#10b981",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  checkoutButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700" as const,
  },
});
