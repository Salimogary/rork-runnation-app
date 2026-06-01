import { StyleSheet, View, Text, ScrollView, TouchableOpacity, RefreshControl, Dimensions, Alert, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";
import { Globe2, Package, ShoppingCart, Trash2, Plus, Minus, ArrowRight } from "lucide-react-native";
import { Image } from "expo-image";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, Stack, useFocusEffect } from "expo-router";
import colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import SubscriptionGate from "@/components/SubscriptionGate";
import React, { useState, useEffect, useCallback } from "react";
import * as Haptics from "expo-haptics";

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;
const COMING_SOON_SHOP_COUNTRY_CODES = new Set(["UG"]);
const COUNTRY_CURRENCY: Record<string, { label: string; locale: string }> = {
  UG: { label: "UGX", locale: "en-UG" },
};

function normalizeCountryCode(country?: string | null) {
  const value = String(country || "").trim().toLowerCase();
  if (!value) return "";
  if (["ug", "uga", "uganda"].includes(value)) return "UG";
  return value.slice(0, 2).toUpperCase();
}

interface CatalogueItemRaw {
  catalogue_id: string;
  catalogue_item: string | null;
  quantity?: number | null;
  size: string | null;
  price: number | null;
  photo_url?: string | null;
}

interface CatalogueItem {
  catalogue_id: string;
  catalogue_item: string | null;
  stock: number;
  size: string | null;
  price: number | null;
  photo_url?: string | null;
}

type ShopTab = "catalogue" | "cart";

export default function ShopScreen() {
  const { registrationId } = useAuth();
  const { colors: themeColors } = useTheme();
  const { isSubscribed } = useSubscription();
  const router = useRouter();
  const trpcUtils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<ShopTab>("catalogue");
  const { data: profileBundle, isLoading: profileLoading } = trpc.profile.getBundle.useQuery(
    { registrationId },
    { enabled: !!registrationId }
  );
  const profileCountry = String(profileBundle?.profile?.country || "").trim();
  const profileCountryCode = normalizeCountryCode(profileCountry);
  const hasCountry = profileCountry.length > 0;
  const isComingSoonShopCountry = COMING_SOON_SHOP_COUNTRY_CODES.has(profileCountryCode);
  const canShopInCountry = false;
  const currency = COUNTRY_CURRENCY[profileCountryCode] ?? { label: "USD", locale: "en-US" };

  const { data: products, isLoading, refetch } = useQuery<CatalogueItem[]>({
    queryKey: ["catalogue", profileCountryCode],
    queryFn: async () => {
      console.log("Fetching catalogue items...");
      let query = supabase
        .from("catalogue")
        .select("*")
        .order("catalogue_item", { ascending: true });
      if (profileCountryCode) {
        query = query.eq("country_code", profileCountryCode);
      }
      let { data, error } = await query;
      if (error && error.message?.toLowerCase().includes("country_code")) {
        const fallback = await supabase
          .from("catalogue")
          .select("*")
          .order("catalogue_item", { ascending: true });
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        console.error("Error fetching catalogue:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(error.message || "Failed to fetch catalogue");
      }

      console.log("Catalogue items fetched:", data?.length || 0);
      return (data || []).map((item: CatalogueItemRaw) => ({
        catalogue_id: item.catalogue_id,
        catalogue_item: item.catalogue_item,
        stock: item.quantity ?? 0,
        size: item.size,
        price: item.price,
        photo_url: item.photo_url,
      }));
    },
    enabled: canShopInCountry,
  });

  console.log('[Shop] registrationId for cart query:', JSON.stringify(registrationId), 'enabled:', !!registrationId);

  const { data: cartData, refetch: refetchCart, error: cartError } = trpc.shop.getCart.useQuery(
    { userId: registrationId },
    { enabled: !!registrationId && canShopInCountry }
  );

  useEffect(() => {
    if (cartError) {
      console.error('[Shop] Cart query error:', cartError);
    }
    console.log('[Shop] Cart data received:', JSON.stringify(cartData));
  }, [cartData, cartError]);

  useFocusEffect(
    useCallback(() => {
      if (registrationId && canShopInCountry) {
        void refetchCart();
      }
    }, [canShopInCountry, registrationId, refetchCart])
  );

  const cartCount = cartData?.reduce((total: number, item: any) => total + (item.quantity || 0), 0) || 0;
  const cartTotal = cartData?.reduce((total: number, item: any) => {
    const product = item.product;
    return total + (product?.price || 0) * item.quantity;
  }, 0) || 0;

  const addToCartMutation = trpc.shop.addToCart.useMutation({
    onSuccess: () => {
      console.log('[Shop] Add to cart success, invalidating getCart');
      void trpcUtils.shop.getCart.invalidate();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Added", "Item added to cart");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to add item to cart");
    },
  });

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

  const handleAddToCart = (item: CatalogueItem) => {
    if (!canShopInCountry) return;
    console.log("🔥 BUTTON PRESSED");
  
    addToCartMutation.mutate(
      {
        userId: registrationId,
        catalogueId: item.catalogue_id,
        quantity: 1,
      },
      {
        onSuccess: () => {
          console.log("✅ SUCCESS");
        },
        onError: (err) => {
          console.log("❌ ERROR", err);
        },
      }
    );
  };

  const handleQuantityChange = (cartId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateCartMutation.mutate({ cartId, quantity: newQuantity });
  };

  const handleRemoveItem = (cartId: string) => {
    Alert.alert("Remove Item", "Remove this item from cart?", [
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

  const handleBuyNow = () => {
    if (!canShopInCountry) return;
    if (!cartData || cartData.length === 0) {
      Alert.alert("Empty Cart", "Please add items before buying");
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/checkout" as any);
  };

  if (!isSubscribed) {
    return (
      <SubscriptionGate featureName="Shop">
        <></>
      </SubscriptionGate>
    );
  }

  if (profileLoading) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <Stack.Screen options={{ title: "Shop" }} />
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>Checking your shopping region...</Text>
        </View>
      </View>
    );
  }

  if (!hasCountry) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <Stack.Screen options={{ title: "Shop" }} />
        <View style={styles.emptyContainer}>
          <Globe2 size={58} color={colors.primary} />
          <Text style={[styles.emptyTitle, { color: themeColors.text }]}>Add your country first</Text>
          <Text style={[styles.emptySubtext, { color: themeColors.textSecondary }]}>
            Shopping is country-specific. Please add your country to your profile before accessing the Shop.
          </Text>
          <TouchableOpacity style={styles.goToCatalogueBtn} onPress={() => router.push("/profile" as any)} activeOpacity={0.8}>
            <LinearGradient colors={colors.gradient.orange} style={styles.goToCatalogueGradient}>
              <Globe2 size={18} color="#fff" />
              <Text style={styles.goToCatalogueText}>Update Profile</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!canShopInCountry) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <Stack.Screen options={{ title: "Shop" }} />
        <View style={styles.emptyContainer}>
          <Package size={64} color={colors.primary} />
          <Text style={[styles.emptyTitle, { color: themeColors.text }]}>Shop coming soon</Text>
          <Text style={[styles.emptySubtext, { color: themeColors.textSecondary }]}>
            {isComingSoonShopCountry
              ? "RunNation Shop Uganda is not open yet because stock is still being prepared. Please check back soon."
              : `Your country is set to ${profileCountry}. RunNation Shop is not open in this country yet.`}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Stack.Screen options={{ title: "Shop" }} />

      <View style={[styles.countryBanner, { backgroundColor: themeColors.cardBackground }]}>
        <Globe2 size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.countryBannerTitle, { color: themeColors.text }]}>Shopping in {profileCountry || "your country"}</Text>
          <Text style={[styles.countryBannerText, { color: themeColors.textSecondary }]}>Prices shown in {currency.label}</Text>
        </View>
      </View>

      <View style={[styles.tabBar, { backgroundColor: themeColors.cardBackground }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "catalogue" && styles.tabActive]}
          onPress={() => { setActiveTab("catalogue"); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          activeOpacity={0.7}
        >
          <Package size={18} color={activeTab === "catalogue" ? colors.primary : themeColors.textSecondary} />
          <Text style={[styles.tabText, activeTab === "catalogue" && styles.tabTextActive, { color: activeTab === "catalogue" ? colors.primary : themeColors.textSecondary }]}>
            Catalogue
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "cart" && styles.tabActive]}
          onPress={() => { setActiveTab("cart"); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          activeOpacity={0.7}
        >
          <View style={styles.cartTabIcon}>
            <ShoppingCart size={18} color={activeTab === "cart" ? colors.primary : themeColors.textSecondary} />
            {cartCount > 0 && (
              <View style={styles.cartTabBadge}>
                <Text style={styles.cartTabBadgeText}>{cartCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.tabText, activeTab === "cart" && styles.tabTextActive, { color: activeTab === "cart" ? colors.primary : themeColors.textSecondary }]}>
            Cart
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === "catalogue" ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        >
          {isLoading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>Loading products...</Text>
            </View>
          ) : !products || products.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Package size={64} color={colors.lightGray} />
              <Text style={[styles.emptyText, { color: themeColors.text }]}>No items available</Text>
              <Text style={[styles.emptySubtext, { color: themeColors.textSecondary }]}>Check back soon for new arrivals!</Text>
            </View>
          ) : (
            <View style={styles.productGrid}>
              {products.map((item) => (
                <View key={item.catalogue_id} style={[styles.productCard, { backgroundColor: themeColors.cardBackground }]}>
                  {item.photo_url ? (
                    <Image
                      source={{ uri: item.photo_url }}
                      style={styles.productImage}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View style={styles.productImagePlaceholder}>
                      <Package size={40} color="#9ca3af" />
                    </View>
                  )}

                  <View style={styles.productInfo}>
                    <Text style={[styles.productName, { color: themeColors.text }]} numberOfLines={2}>
                      {item.catalogue_item || 'Unnamed Item'}
                    </Text>

                    <View style={styles.detailsRow}>
                      {item.size && (
                        <View style={styles.sizeTag}>
                          <Text style={styles.sizeText}>{item.size}</Text>
                        </View>
                      )}
                      <View style={styles.stockBadge}>
                        <View style={[
                          styles.stockDot,
                          item.stock > 0 ? styles.inStock : styles.outOfStockDot
                        ]} />
                        <Text style={styles.stockText}>
                          {item.stock > 0 ? `${item.stock} left` : 'Out of stock'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>{currency.label}</Text>
                      <Text style={[styles.priceValue, { color: themeColors.text }]}>
                        {(item.price || 0).toLocaleString(currency.locale, { maximumFractionDigits: 0 })}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.addToCartBtn}
                      onPress={() => handleAddToCart(item)}
                      disabled={item.stock <= 0 || addToCartMutation.isPending}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={item.stock <= 0 ? [colors.mediumGray, colors.mediumGray] : colors.gradient.orange}
                        style={styles.addToCartGradient}
                      >
                        <ShoppingCart size={16} color={colors.white} />
                        <Text style={styles.addToCartText}>
                          {item.stock <= 0 ? "Out of Stock" : "Add to Cart"}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
          <View style={{ height: 20 }} />
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {!cartData || cartData.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconWrap, { backgroundColor: themeColors.cardBackground }]}>
                <ShoppingCart size={48} color={colors.lightGray} />
              </View>
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>Your cart is empty</Text>
              <Text style={[styles.emptySubtext, { color: themeColors.textSecondary }]}>
                Browse the catalogue and add items
              </Text>
              <TouchableOpacity
                style={styles.goToCatalogueBtn}
                onPress={() => setActiveTab("catalogue")}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={colors.gradient.orange}
                  style={styles.goToCatalogueGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Package size={18} color="#fff" />
                  <Text style={styles.goToCatalogueText}>Browse Catalogue</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.cartHeader}>
                <Text style={[styles.cartHeaderText, { color: themeColors.textSecondary }]}>
                  {cartCount} {cartCount === 1 ? 'item' : 'items'} in your cart
                </Text>
                <TouchableOpacity onPress={handleClearCart}>
                  <Text style={styles.clearText}>Clear All</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.cartScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {cartData.map((item: any) => {
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
                          style={styles.cartProductImage}
                          contentFit="cover"
                          transition={200}
                        />
                      ) : (
                        <View style={[styles.cartImagePlaceholder, { backgroundColor: themeColors.background }]}>
                          <ShoppingCart size={24} color={colors.lightGray} />
                        </View>
                      )}

                      <View style={styles.cartItemContent}>
                        <View style={styles.cartItemHeader}>
                          <Text style={[styles.cartItemName, { color: themeColors.text }]} numberOfLines={2}>
                            {product?.catalogue_item || "Unknown Item"}
                          </Text>
                          <TouchableOpacity
                            style={styles.removeButton}
                            onPress={() => handleRemoveItem(item.cart_id)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Trash2 size={18} color={colors.error} />
                          </TouchableOpacity>
                        </View>

                        {product?.size && (
                          <View style={[styles.cartSizeTag, { backgroundColor: themeColors.background }]}>
                            <Text style={[styles.cartSizeText, { color: themeColors.textSecondary }]}>
                              Size: {product.size}
                            </Text>
                          </View>
                        )}

                        <View style={styles.cartItemFooter}>
                          <View style={[styles.quantityControl, { backgroundColor: themeColors.background }]}>
                            <TouchableOpacity
                              style={[styles.quantityButton, item.quantity <= 1 && styles.quantityButtonDisabled]}
                              onPress={() => handleQuantityChange(item.cart_id, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                            >
                              <Minus size={14} color={item.quantity <= 1 ? colors.lightGray : themeColors.text} />
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
                            {currency.label}.{lineTotal.toLocaleString(currency.locale, { maximumFractionDigits: 0 })}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
                <View style={{ height: 140 }} />
              </ScrollView>

              <View style={[styles.cartFooter, { backgroundColor: themeColors.cardBackground }]}>
                <View style={styles.cartFooterRow}>
                  <Text style={[styles.cartFooterLabel, { color: themeColors.textSecondary }]}>
                    Total ({cartCount} {cartCount === 1 ? 'item' : 'items'})
                  </Text>
                  <Text style={[styles.cartFooterTotal, { color: themeColors.text }]}>
                    {currency.label}.{cartTotal.toLocaleString(currency.locale, { maximumFractionDigits: 0 })}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.buyNowBtn}
                  onPress={handleBuyNow}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={colors.gradient.orange}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.buyNowGradient}
                  >
                    <Text style={styles.buyNowText}>Buy Now</Text>
                    <ArrowRight size={20} color="#fff" />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600" as const,
  },
  tabTextActive: {
    fontWeight: "700" as const,
  },
  cartTabIcon: {
    position: "relative" as const,
  },
  cartTabBadge: {
    position: "absolute" as const,
    top: -6,
    right: -10,
    backgroundColor: colors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  cartTabBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700" as const,
  },
  countryBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  countryBannerTitle: {
    fontSize: 14,
    fontWeight: "800" as const,
  },
  countryBannerText: {
    fontSize: 12,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  cartScrollContent: {
    padding: 16,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    marginTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: colors.text,
  },
  emptySubtext: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700" as const,
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
  goToCatalogueBtn: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden" as const,
  },
  goToCatalogueGradient: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  goToCatalogueText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700" as const,
  },
  productGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "space-between",
  },
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.white,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  productImage: {
    width: "100%",
    height: 180,
    backgroundColor: colors.extraLightGray,
  },
  productImagePlaceholder: {
    width: "100%",
    height: 180,
    backgroundColor: colors.extraLightGray,
    alignItems: "center",
    justifyContent: "center",
  },
  productInfo: {
    padding: 12,
    gap: 8,
  },
  productName: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.text,
    lineHeight: 20,
    minHeight: 40,
  },
  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  sizeTag: {
    backgroundColor: colors.extraLightGray,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sizeText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: colors.text,
  },
  stockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  inStock: {
    backgroundColor: colors.success,
  },
  outOfStockDot: {
    backgroundColor: colors.error,
  },
  stockText: {
    fontSize: 11,
    fontWeight: "500" as const,
    color: colors.textSecondary,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 4,
  },
  priceLabel: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: colors.primary,
  },
  priceValue: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: colors.primary,
    marginLeft: 2,
  },
  addToCartBtn: {
    borderRadius: 12,
    marginTop: 4,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  addToCartGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  addToCartText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700" as const,
  },
  cartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  cartHeaderText: {
    fontSize: 14,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  clearText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: colors.error,
  },
  cartItem: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 12,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cartProductImage: {
    width: 90,
    height: 90,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  cartImagePlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cartItemContent: {
    flex: 1,
    gap: 6,
  },
  cartItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  cartItemName: {
    fontSize: 15,
    fontWeight: "700" as const,
    flex: 1,
    lineHeight: 20,
  },
  removeButton: {
    padding: 4,
  },
  cartSizeTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cartSizeText: {
    fontSize: 12,
    fontWeight: "500" as const,
  },
  cartItemFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  quantityControl: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  quantityButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonDisabled: {
    opacity: 0.4,
  },
  quantityText: {
    fontSize: 16,
    fontWeight: "700" as const,
    minWidth: 28,
    textAlign: "center",
  },
  lineTotal: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: colors.primary,
  },
  cartFooter: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
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
  cartFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cartFooterLabel: {
    fontSize: 15,
    fontWeight: "500" as const,
  },
  cartFooterTotal: {
    fontSize: 22,
    fontWeight: "800" as const,
  },
  buyNowBtn: {
    borderRadius: 14,
    overflow: "hidden" as const,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buyNowGradient: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
  },
  buyNowText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700" as const,
  },
  pinGateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    paddingHorizontal: 32,
  },
  pinGateContent: {
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
  },
  lockIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF0E8',
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  pinGateTitle: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: colors.text,
    marginBottom: 8,
  },
  pinGateSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
  },
  passwordInput: {
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  pinDotsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.lightGray,
    backgroundColor: "transparent",
  },
  pinDotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pinDotError: {
    borderColor: colors.error,
  },
  hiddenPinInput: {
    position: "absolute",
    opacity: 0,
    height: 0,
    width: 0,
  },
  pinPadTouchArea: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  tapToEnterText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "500" as const,
  },
  pinErrorText: {
    fontSize: 14,
    color: colors.error,
    marginTop: 8,
    fontWeight: "500" as const,
  },
  unlockButton: {
    width: "100%",
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  unlockButtonDisabled: {
    opacity: 0.5,
  },
  unlockButtonText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.white,
  },
  pinGateFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 40,
  },
  pinGateFooterText: {
    fontSize: 13,
    color: colors.textLight,
  },
});
