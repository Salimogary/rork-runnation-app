import { useState } from "react";
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from "react-native";
import { useRouter, Stack } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Package, Phone, MapPin, Clock, Check } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import colors from "@/constants/colors";
import * as Haptics from "expo-haptics";

interface DeliveryTimeSlot {
  id: string;
  label: string;
  time: string;
}

const DELIVERY_SLOTS: DeliveryTimeSlot[] = [
  { id: "morning", label: "Morning", time: "9:00 - 11:00 AM" },
  { id: "noon", label: "Noon", time: "11:00 AM - 1:00 PM" },
  { id: "afternoon", label: "Afternoon", time: "1:00 - 5:00 PM" },
  { id: "evening", label: "Evening", time: "5:00 - 8:00 PM" },
];

export default function CheckoutScreen() {
  const router = useRouter();
  const { registrationId } = useAuth();
  const { colors: themeColors } = useTheme();
  const queryClient = useQueryClient();

  const [deliveryPhone, setDeliveryPhone] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState<string>("");
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);

  const { data: cartItems } = trpc.shop.getCart.useQuery({ userId: registrationId });

  const checkoutMutation = trpc.shop.buyNow.useMutation({
    onSuccess: (data: any) => {
      void queryClient.invalidateQueries({ queryKey: [["shop", "getCart"]] });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Order Placed!",
        `Your order has been placed successfully.\nOrder ID: ${data.orderId.substring(0, 8)}...\n\nYou will be contacted for delivery.`,
        [{ text: "OK", onPress: () => router.push("/(tabs)/shop" as any) }]
      );
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to place order");
    },
  });

  const totalAmount = cartItems?.reduce((total: number, item: any) => {
    const product = item.product;
    return total + (product?.Price || 0) * item.quantity;
  }, 0) || 0;

  const toggleSlot = (slotId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSlots((prev) =>
      prev.includes(slotId)
        ? prev.filter((s) => s !== slotId)
        : [...prev, slotId]
    );
  };

  const handlePlaceOrder = () => {
    if (!deliveryPhone.trim()) {
      Alert.alert("Missing Information", "Please enter your phone number");
      return;
    }
    if (!deliveryAddress.trim()) {
      Alert.alert("Missing Information", "Please enter your delivery address");
      return;
    }
    if (selectedSlots.length === 0) {
      Alert.alert("Missing Information", "Please select at least one delivery time slot");
      return;
    }

    const slotLabels = selectedSlots
      .map((id) => {
        const slot = DELIVERY_SLOTS.find((s) => s.id === id);
        return slot ? `${slot.label} (${slot.time})` : id;
      })
      .join(", ");

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    checkoutMutation.mutate({
      userId: registrationId,
      deliveryPhone: deliveryPhone.trim(),
      deliveryAddress: deliveryAddress.trim(),
      deliveryTimeSlots: slotLabels,
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Stack.Screen
        options={{
          title: "Buy Now",
          headerBackTitle: "Cart",
          headerStyle: { backgroundColor: themeColors.headerBackground },
          headerTintColor: themeColors.headerText,
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.section, { backgroundColor: themeColors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <Phone size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Contact</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: themeColors.textSecondary }]}>Phone Number</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              value={deliveryPhone}
              onChangeText={setDeliveryPhone}
              placeholder="e.g. 0771234567"
              placeholderTextColor={colors.textLight}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: themeColors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <MapPin size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Delivery Address</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: themeColors.textSecondary }]}>Address</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              value={deliveryAddress}
              onChangeText={setDeliveryAddress}
              placeholder="Enter your delivery address"
              placeholderTextColor={colors.textLight}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: themeColors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <Clock size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Preferred Delivery Time</Text>
          </View>
          <Text style={[styles.slotHint, { color: themeColors.textSecondary }]}>
            Select one or more suitable time slots
          </Text>

          <View style={styles.slotsGrid}>
            {DELIVERY_SLOTS.map((slot) => {
              const isSelected = selectedSlots.includes(slot.id);
              return (
                <TouchableOpacity
                  key={slot.id}
                  style={[
                    styles.slotCard,
                    { borderColor: isSelected ? colors.primary : themeColors.border },
                    isSelected && styles.slotCardSelected,
                  ]}
                  onPress={() => toggleSlot(slot.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.slotCheckbox, isSelected && styles.slotCheckboxSelected]}>
                    {isSelected && <Check size={14} color="#fff" />}
                  </View>
                  <View style={styles.slotInfo}>
                    <Text style={[styles.slotLabel, { color: isSelected ? colors.primary : themeColors.text }]}>
                      {slot.label}
                    </Text>
                    <Text style={[styles.slotTime, { color: themeColors.textSecondary }]}>
                      {slot.time}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: themeColors.cardBackground }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 12 }]}>Order Summary</Text>
          {cartItems?.map((item: any) => {
            const product = item.product;
            return (
              <View key={item.cart_id} style={styles.summaryItem}>
                <Text style={[styles.summaryItemName, { color: themeColors.text }]} numberOfLines={1}>
                  {product?.Catalogue_Item} x{item.quantity}
                </Text>
                <Text style={[styles.summaryItemPrice, { color: themeColors.text }]}>
                  ugx.{((product?.Price || 0) * item.quantity).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </Text>
              </View>
            );
          })}

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: themeColors.text }]}>Total</Text>
            <Text style={styles.totalAmount}>
              ugx.{totalAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: themeColors.cardBackground }]}>
        <TouchableOpacity
          style={[styles.placeOrderBtn, checkoutMutation.isPending && styles.placeOrderBtnDisabled]}
          onPress={handlePlaceOrder}
          disabled={checkoutMutation.isPending}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={checkoutMutation.isPending ? [colors.mediumGray, colors.mediumGray] : colors.gradient.orange}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.placeOrderGradient}
          >
            {checkoutMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Package size={20} color="#fff" />
            )}
            <Text style={styles.placeOrderText}>
              {checkoutMutation.isPending ? "Placing Order..." : "Place Order"}
            </Text>
            <Text style={styles.placeOrderPrice}>
              ugx.{totalAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  section: {
    borderRadius: 16,
    padding: 20,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600" as const,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 14,
  },
  slotHint: {
    fontSize: 13,
    marginTop: -4,
  },
  slotsGrid: {
    gap: 10,
  },
  slotCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 2,
  },
  slotCardSelected: {
    backgroundColor: "#FFF5F0",
  },
  slotCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.lightGray,
    alignItems: "center",
    justifyContent: "center",
  },
  slotCheckboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  slotInfo: {
    flex: 1,
    gap: 2,
  },
  slotLabel: {
    fontSize: 16,
    fontWeight: "700" as const,
  },
  slotTime: {
    fontSize: 13,
    fontWeight: "500" as const,
  },
  summaryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  summaryItemName: {
    fontSize: 15,
    flex: 1,
    marginRight: 12,
  },
  summaryItemPrice: {
    fontSize: 15,
    fontWeight: "600" as const,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 8,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 4,
  },
  totalLabel: {
    fontSize: 20,
    fontWeight: "700" as const,
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: "800" as const,
    color: colors.success,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  placeOrderBtn: {
    borderRadius: 14,
    overflow: "hidden" as const,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  placeOrderBtnDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  placeOrderGradient: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
  },
  placeOrderText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700" as const,
    flex: 1,
  },
  placeOrderPrice: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 16,
    fontWeight: "700" as const,
  },
});
