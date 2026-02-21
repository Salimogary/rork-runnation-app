import { StyleSheet, View, Text, ScrollView, TouchableOpacity, RefreshControl, Dimensions, Alert, TextInput, ActivityIndicator, Animated } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";
import { Package, ShoppingCart, Lock, ShieldCheck } from "lucide-react-native";
import { Image } from "expo-image";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, Stack } from "expo-router";
import colors from "@/constants/colors";
import React, { useState, useRef, useEffect, useCallback } from "react";
import * as Haptics from "expo-haptics";

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

interface CatalogueItem {
  CatalogueID: string;
  Catalogue_Item: string | null;
  Quanity: number | null;
  Size: string | null;
  Price: number | null;
  Photo_URL?: string | null;
}

export default function ShopScreen() {
  const { registrationId, verifyPin } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pinInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!pinUnlocked) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, [pinUnlocked]);

  const triggerShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handlePinSubmit = useCallback(async () => {
    if (pinValue.length !== 4) {
      setPinError('Enter your 4-digit PIN');
      return;
    }
    setIsVerifying(true);
    setPinError('');
    try {
      const valid = await verifyPin(pinValue);
      if (valid) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPinUnlocked(true);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setPinError('Incorrect PIN. Please try again.');
        setPinValue('');
        triggerShake();
      }
    } catch {
      setPinError('Verification failed. Try again.');
      setPinValue('');
    } finally {
      setIsVerifying(false);
    }
  }, [pinValue, verifyPin, triggerShake]);

  useEffect(() => {
    if (pinValue.length === 4 && !pinUnlocked) {
      handlePinSubmit();
    }
  }, [pinValue, pinUnlocked, handlePinSubmit]);
  
  const { data: products, isLoading, refetch } = useQuery<CatalogueItem[]>({
    queryKey: ["catalogue"],
    queryFn: async () => {
      console.log("Fetching catalogue items...");
      const { data, error } = await supabase
        .from("Catalogue Sample")
        .select("*")
        .order("Catalogue_Item", { ascending: true });

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
      return data || [];
    },
  });
  
  const { data: cartData } = trpc.shop.getCart.useQuery({ userId: registrationId });
  
  const cartCount = cartData?.reduce((total: number, item: any) => total + (item.quantity || 0), 0) || 0;
  
  const addToCartMutation = trpc.shop.addToCart.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [["shop", "getCart"]] });
      Alert.alert("Success", "Item added to cart");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to add item to cart");
    },
  });
  
  const handleAddToCart = (item: CatalogueItem) => {
    if ((item.Quanity || 0) <= 0) {
      Alert.alert("Out of Stock", "This item is currently unavailable");
      return;
    }
    addToCartMutation.mutate({
      userId: registrationId,
      catalogueId: item.CatalogueID,
      quantity: 1,
    });
  };

  if (!pinUnlocked) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Shop" }} />
        <Animated.View style={[styles.pinGateContainer, { opacity: fadeAnim }]}>
          <View style={styles.pinGateContent}>
            <View style={styles.lockIconWrap}>
              <Lock size={36} color={colors.primary} />
            </View>
            <Text style={styles.pinGateTitle}>Shop Access</Text>
            <Text style={styles.pinGateSubtitle}>Enter your 4-digit PIN to access the shop</Text>

            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              <View style={styles.pinDotsRow}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.pinDot,
                      pinValue.length > i && styles.pinDotFilled,
                      pinError ? styles.pinDotError : null,
                    ]}
                  />
                ))}
              </View>
            </Animated.View>

            <TextInput
              ref={pinInputRef}
              style={styles.hiddenPinInput}
              value={pinValue}
              onChangeText={(text) => {
                const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
                setPinValue(digits);
                if (pinError) setPinError('');
              }}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              autoFocus
              editable={!isVerifying}
            />

            <TouchableOpacity
              style={styles.pinPadTouchArea}
              onPress={() => pinInputRef.current?.focus()}
              activeOpacity={1}
            >
              <Text style={styles.tapToEnterText}>
                {isVerifying ? '' : 'Tap here to enter PIN'}
              </Text>
            </TouchableOpacity>

            {isVerifying && (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 12 }} />
            )}

            {!!pinError && (
              <Text style={styles.pinErrorText}>{pinError}</Text>
            )}

            <View style={styles.pinGateFooter}>
              <ShieldCheck size={14} color={colors.textLight} />
              <Text style={styles.pinGateFooterText}>PIN protects your shop purchases</Text>
            </View>
          </View>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Shop",
          headerRight: () => (
            <TouchableOpacity
              style={styles.cartButton}
              onPress={() => router.push("/cart")}
            >
              <ShoppingCart size={24} color={colors.white} />
              {cartCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cartCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {isLoading ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Loading products...</Text>
          </View>
        ) : !products || products.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Package size={64} color={colors.lightGray} />
            <Text style={styles.emptyText}>No items available</Text>
            <Text style={styles.emptySubtext}>Check back soon for new arrivals!</Text>
          </View>
        ) : (
          <View style={styles.productGrid}>
            {products.map((item) => (
              <View key={item.CatalogueID} style={styles.productCard}>
                {item.Photo_URL ? (
                  <Image
                    source={{ uri: item.Photo_URL }}
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
                  <Text style={styles.productName} numberOfLines={2}>
                    {item.Catalogue_Item || 'Unnamed Item'}
                  </Text>
                  
                  <View style={styles.detailsRow}>
                    {item.Size && (
                      <View style={styles.sizeTag}>
                        <Text style={styles.sizeText}>{item.Size}</Text>
                      </View>
                    )}
                    
                    <View style={styles.stockBadge}>
                      <View style={[
                        styles.stockDot,
                        (item.Quanity || 0) > 0 ? styles.inStock : styles.outOfStockDot
                      ]} />
                      <Text style={styles.stockText}>
                        {(item.Quanity || 0) > 0 ? `${item.Quanity} left` : 'Out of stock'}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>ugx.</Text>
                    <Text style={styles.priceValue}>
                      {(item.Price || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.addToCartBtn}
                    onPress={() => handleAddToCart(item)}
                    disabled={(item.Quanity || 0) <= 0 || addToCartMutation.isPending}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={(item.Quanity || 0) <= 0 ? [colors.mediumGray, colors.mediumGray] : colors.gradient.orange}
                      style={styles.addToCartGradient}
                    >
                      <ShoppingCart size={16} color={colors.white} />
                      <Text style={styles.addToCartText}>
                        {(item.Quanity || 0) <= 0 ? "Out of Stock" : "Add to Cart"}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    marginTop: 80,
    gap: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: colors.text,
  },
  emptySubtext: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
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
  cartButton: {
    marginRight: 16,
    position: "relative" as const,
  },
  cartBadge: {
    position: "absolute" as const,
    top: -6,
    right: -6,
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "700" as const,
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
