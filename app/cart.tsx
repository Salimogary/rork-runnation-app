import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useRouter, Stack } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { ShoppingCart, Trash2, Plus, Minus, CreditCard, ArrowLeft } from "lucide-react-native";
import { Image } from "expo-image";

import { useTheme } from "@/contexts/ThemeContext";
import { LinearGradient } from "expo-linear-gradient";
import colors from "@/constants/colors";
import * as Haptics from "expo-haptics";

export default function CartScreen() {
  const router = useRouter();
  const { registrationId } = useAuth();
  const { colors: themeColors } = useTheme();
  const trpcUtils = trpc.useUtils();

  const { data: cartItems, isLoading } = trpc.shop.getCart.useQuery(
    { userId: registrationId },
    { enabled: !!registrationId }
  );

  const updateCartMutation = trpc.shop.updateCartItem.useMutation({
    onSuccess: () => {
      void trpcUtils.shop.getCart.invalidate();
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to update cart");
    },
  });

  const removeCartMutation = trpc.shop.removeCartItem.useMutation({
    onSuccess: () => {
      void trpcUtils.shop.getCart.invalidate();
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to remove item");
    },
  });

  const clearCartMutation = trpc.shop.clearCart.useMutation({
    onSuccess: () => {
      void trpcUtils.shop.getCart.invalidate();
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to clear cart");
    },
  });

  const handleQuantityChange = (cartId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateCartMutation.mutate({ cartId, quantity: newQuantity });
  };

  const handleRemoveItem = (cartId: string) => {
    Alert.alert("Remove Item", "Are you sure you want to remove this item?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        onPress: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          removeCartMutation.mutate({ cartId });
        },
        style: "destructive",
      },
    ]);
  };

  const handleClearCart = () => {
    Alert.alert("Clear Cart", "Remove all items from your cart?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear All",
        onPress: () => {
          clearCartMutation.mutate({ userId: registrationId });
        },
        style: "destructive",
      },
    ]);
  };

  const itemCount = cartItems?.reduce((total: number, item: any) => total + (item.quantity || 0), 0) || 0;

  const totalAmount = cartItems?.reduce((total: number, item: any) => {
    const product = item.product;
    return total + (product?.price || 0) * item.quantity;
  }, 0) || 0;

  const handleCheckout = () => {
    if (!cartItems || cartItems.length === 0) {
      Alert.alert("Empty Cart", "Please add items to your cart before checking out");
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/checkout" as any);
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Stack.Screen
        options={{
          title: "My Cart",
          headerBackTitle: "Shop",
          headerStyle: { backgroundColor: themeColors.headerBackground },
          headerTintColor: themeColors.headerText,
          headerRight: () =>
            cartItems && cartItems.length > 0 ? (
              <TouchableOpacity
                onPress={handleClearCart}
                style={styles.clearButton}
              >
                <Text style={[styles.clearButtonText, { color: themeColors.error }]}>Clear</Text>
              </TouchableOpacity>
            ) : null,
        }}
      />

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
            Loading your cart...
          </Text>
        </View>
      ) : !cartItems || cartItems.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={[styles.emptyIconWrap, { backgroundColor: themeColors.cardBackground }]}>
            <ShoppingCart size={48} color={themeColors.iconMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: themeColors.text }]}>Your cart is empty</Text>
          <Text style={[styles.emptySubtext, { color: themeColors.textSecondary }]}>
            Browse the shop and add items you'd like to purchase
          </Text>
          <TouchableOpacity
            style={styles.continueShopping}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={colors.gradient.orange}
              style={styles.continueShoppingGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <ArrowLeft size={18} color="#fff" />
              <Text style={styles.continueShoppingText}>Continue Shopping</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
              {itemCount} {itemCount === 1 ? 'item' : 'items'} in your cart
            </Text>

            {cartItems.map((item: any) => {
              const product = item.product;
              const lineTotal = (product?.price || 0) * item.quantity;
              return (
                <View
                  key={item.cart_id}
                  style={[styles.cartItem, { backgroundColor: themeColors.cardBackground }]}
                >
                  {product?.photo_url ? (
                    <Image
                      source={{ uri: product.photo_url }}
                      style={styles.productImage}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View style={[styles.productImagePlaceholder, { backgroundColor: themeColors.inputBackground }]}>
                      <ShoppingCart size={24} color={themeColors.iconMuted} />
                    </View>
                  )}

                  <View style={styles.itemContent}>
                    <View style={styles.itemHeader}>
                      <Text style={[styles.itemName, { color: themeColors.text }]} numberOfLines={2}>
                        {product?.catalogue_item || "Unknown Item"}
                      </Text>
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => handleRemoveItem(item.cart_id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Trash2 size={18} color={themeColors.error} />
                      </TouchableOpacity>
                    </View>

                    {product?.size && (
                      <View style={[styles.sizeTag, { backgroundColor: themeColors.inputBackground }]}>
                        <Text style={[styles.sizeText, { color: themeColors.textSecondary }]}>
                          Size: {product.size}
                        </Text>
                      </View>
                    )}

                    <View style={styles.itemFooter}>
                      <View style={[styles.quantityControl, { backgroundColor: themeColors.inputBackground }]}>
                        <TouchableOpacity
                          style={[
                            styles.quantityButton,
                            item.quantity <= 1 && styles.quantityButtonDisabled,
                          ]}
                          onPress={() => handleQuantityChange(item.cart_id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                        >
                          <Minus size={14} color={item.quantity <= 1 ? themeColors.iconMuted : themeColors.text} />
                        </TouchableOpacity>
                        <Text style={[styles.quantityText, { color: themeColors.text }]}>
                          {item.quantity}
                        </Text>
                        <TouchableOpacity
                          style={styles.quantityButton}
                          onPress={() => handleQuantityChange(item.cart_id, item.quantity + 1)}
                        >
                          <Plus size={14} color={themeColors.text} />
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.lineTotal}>
                        ugx.{lineTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}

            <View style={{ height: 120 }} />
          </ScrollView>

          <View style={[styles.footer, { backgroundColor: themeColors.cardBackground }]}>
            <View style={styles.footerTop}>
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: themeColors.textSecondary }]}>
                  Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                </Text>
                <Text style={[styles.totalAmount, { color: themeColors.text }]}>
                  ugx.{totalAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.buyButton}
              onPress={handleCheckout}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={colors.gradient.orange}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buyButtonGradient}
              >
                <CreditCard size={20} color="#fff" />
                <Text style={styles.buyButtonText}>Buy Now</Text>
                <Text style={styles.buyButtonPrice}>
                  ugx.{totalAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </Text>
              </LinearGradient>
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
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    marginTop: 8,
  },
  emptyIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700" as const,
  },
  emptySubtext: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  continueShopping: {
    marginTop: 16,
    borderRadius: 12,
    overflow: "hidden" as const,
  },
  continueShoppingGradient: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  continueShoppingText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700" as const,
  },
  clearButton: {
    marginRight: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearButtonText: {
    fontSize: 15,
    fontWeight: "600" as const,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cartItem: {
    flexDirection: "row" as const,
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
    width: 90,
    height: 90,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  productImagePlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  itemContent: {
    flex: 1,
    gap: 6,
  },
  itemHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-start" as const,
    gap: 8,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "700" as const,
    flex: 1,
    lineHeight: 20,
  },
  removeButton: {
    padding: 4,
  },
  sizeTag: {
    alignSelf: "flex-start" as const,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sizeText: {
    fontSize: 12,
    fontWeight: "500" as const,
  },
  itemFooter: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginTop: 4,
  },
  quantityControl: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    borderRadius: 10,
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  quantityButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  quantityButtonDisabled: {
    opacity: 0.4,
  },
  quantityText: {
    fontSize: 16,
    fontWeight: "700" as const,
    minWidth: 28,
    textAlign: "center" as const,
  },
  lineTotal: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: colors.primary,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  footerTop: {
    gap: 6,
  },
  totalRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: "500" as const,
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: "800" as const,
  },
  buyButton: {
    borderRadius: 14,
    overflow: "hidden" as const,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buyButtonGradient: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
  },
  buyButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700" as const,
    flex: 1,
  },
  buyButtonPrice: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 16,
    fontWeight: "700" as const,
  },
});
