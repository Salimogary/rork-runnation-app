import { useState } from "react";
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from "react-native";
import { useRouter, Stack } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Package } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";

export default function CheckoutScreen() {
  const router = useRouter();
  const { registrationId } = useAuth();
  const queryClient = useQueryClient();

  const [deliveryName, setDeliveryName] = useState<string>("");
  const [deliveryPhone, setDeliveryPhone] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState<string>("");

  const { data: cartItems } = trpc.shop.getCart.useQuery({ userId: registrationId });

  const checkoutMutation = trpc.shop.checkout.useMutation({
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [["shop", "getCart"]] });
      Alert.alert(
        "Order Placed!",
        `Your order has been placed successfully. Order ID: ${data.orderId.substring(0, 8)}...`,
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

  const handlePlaceOrder = () => {
    if (!deliveryName.trim()) {
      Alert.alert("Missing Information", "Please enter your name");
      return;
    }
    if (!deliveryPhone.trim()) {
      Alert.alert("Missing Information", "Please enter your phone number");
      return;
    }
    if (!deliveryAddress.trim()) {
      Alert.alert("Missing Information", "Please enter your delivery address");
      return;
    }

    checkoutMutation.mutate({
      userId: registrationId,
      deliveryName: deliveryName.trim(),
      deliveryPhone: deliveryPhone.trim(),
      deliveryAddress: deliveryAddress.trim(),
    });
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Checkout", headerBackTitle: "Cart" }} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Information</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={deliveryName}
              onChangeText={setDeliveryName}
              placeholder="Enter your full name"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={deliveryPhone}
              onChangeText={setDeliveryPhone}
              placeholder="Enter your phone number"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Delivery Address</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={deliveryAddress}
              onChangeText={setDeliveryAddress}
              placeholder="Enter your delivery address"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          {cartItems?.map((item: any) => {
            const product = item.product;
            return (
              <View key={item.cart_id} style={styles.summaryItem}>
                <Text style={styles.summaryItemName}>
                  {product?.Catalogue_Item} x{item.quantity}
                </Text>
                <Text style={styles.summaryItemPrice}>
                  ugx.{((product?.Price || 0) * item.quantity).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </Text>
              </View>
            );
          })}

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>
              ugx.{totalAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.placeOrderButton, checkoutMutation.isPending && styles.placeOrderButtonDisabled]}
          onPress={handlePlaceOrder}
          disabled={checkoutMutation.isPending}
        >
          <Package size={20} color="#fff" />
          <Text style={styles.placeOrderButtonText}>
            {checkoutMutation.isPending ? "Placing Order..." : "Place Order"}
          </Text>
        </TouchableOpacity>
      </View>
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
    gap: 20,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#111827",
    marginBottom: 8,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#374151",
  },
  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
  },
  textArea: {
    minHeight: 100,
    paddingTop: 14,
  },
  summaryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  summaryItemName: {
    fontSize: 15,
    color: "#374151",
    flex: 1,
  },
  summaryItemPrice: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#111827",
  },
  divider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 8,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
  },
  totalLabel: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#111827",
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: "800" as const,
    color: "#10b981",
  },
  footer: {
    backgroundColor: "#fff",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  placeOrderButton: {
    flexDirection: "row",
    backgroundColor: "#10b981",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  placeOrderButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  placeOrderButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700" as const,
  },
});
