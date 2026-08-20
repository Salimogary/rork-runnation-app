import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Check, ChevronRight, Store } from "lucide-react-native";
import colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";

const COUNTRY_CURRENCY: Record<string, { label: string; quarterly: number; annual: number }> = {
  UG: { label: "UGX", quarterly: 20000, annual: 60000 },
  USD: { label: "USD", quarterly: 4, annual: 12 },
};

const PAYMENT_MODES = [
  { key: "card", label: "Card" },
  { key: "mobile_money", label: "Mobile money" },
  { key: "cash_on_delivery", label: "Cash on delivery" },
] as const;

function normalizeCountryCode(country?: string | null) {
  const value = String(country || "").trim().toLowerCase();
  if (!value) return "";
  if (["ug", "uga", "uganda"].includes(value)) return "UG";
  return value.slice(0, 2).toUpperCase();
}

export default function ShopRetailerRegistrationScreen() {
  const router = useRouter();
  const { registrationId } = useAuth();
  const { colors: themeColors } = useTheme();
  const trpcUtils = trpc.useUtils();
  const [shopName, setShopName] = useState("");
  const [selectedPaymentModes, setSelectedPaymentModes] = useState<string[]>(["card"]);

  const { data: profileBundle } = trpc.profile.getBundle.useQuery(
    { registrationId },
    { enabled: !!registrationId }
  );
  const profileCountry = String(profileBundle?.profile?.country || "").trim();
  const profileCountryCode = normalizeCountryCode(profileCountry);
  const fallbackFees = COUNTRY_CURRENCY[profileCountryCode] ?? COUNTRY_CURRENCY.USD;

  const { data: shopStatus, isLoading } = trpc.shop.getMyShop.useQuery(
    { userId: registrationId },
    { enabled: !!registrationId }
  );

  const registerShopMutation = trpc.shop.registerOwner.useMutation({
    onSuccess: () => {
      void trpcUtils.shop.getMyShop.invalidate();
      Alert.alert("Shop submitted", "Your retailer registration is pending approval.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Could not submit your retailer registration");
    },
  });

  const togglePaymentMode = (mode: string) => {
    setSelectedPaymentModes((current) => {
      if (current.includes(mode)) {
        return current.length === 1 ? current : current.filter((item) => item !== mode);
      }
      return [...current, mode];
    });
  };

  const handleSubmit = () => {
    const cleanName = shopName.trim();
    if (!cleanName) {
      Alert.alert("Shop name required", "Please enter the shop name.");
      return;
    }

    registerShopMutation.mutate({
      userId: registrationId,
      shopName: cleanName,
      paymentModes: selectedPaymentModes as ("card" | "mobile_money" | "cash_on_delivery")[],
    });
  };

  const feeCurrency = shopStatus?.feeCurrency || fallbackFees.label;
  const quarterlyFee = shopStatus?.quarterlyFeeAmount ?? fallbackFees.quarterly;
  const annualFee = shopStatus?.annualFeeAmount ?? fallbackFees.annual;
  const application = shopStatus?.application;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Stack.Screen options={{ title: "Retailer Registration" }} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.headerCard, { backgroundColor: themeColors.cardBackground }]}>
          <View style={styles.headerIcon}>
            <Store size={28} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: themeColors.text }]}>Register as an apparel retailer</Text>
            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
              30 days free, then {feeCurrency} {quarterlyFee.toLocaleString()} quarterly or {feeCurrency} {annualFee.toLocaleString()} annually.
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : application ? (
          <View style={[styles.statusCard, { backgroundColor: themeColors.cardBackground }]}>
            <Text style={[styles.statusTitle, { color: themeColors.text }]}>{application.shop_name}</Text>
            <Text style={[styles.statusText, { color: themeColors.textSecondary }]}>
              Application status: {String(application.status).toUpperCase()}
            </Text>
          </View>
        ) : (
          <View style={[styles.formCard, { backgroundColor: themeColors.cardBackground }]}>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: themeColors.text }]}>Shop name</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: themeColors.text,
                    borderColor: themeColors.border,
                    backgroundColor: themeColors.background,
                  },
                ]}
                value={shopName}
                onChangeText={setShopName}
                placeholder="Shop name"
                placeholderTextColor={themeColors.textLight}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: themeColors.text }]}>Payment modes</Text>
              <View style={styles.paymentModes}>
                {PAYMENT_MODES.map((mode) => {
                  const checked = selectedPaymentModes.includes(mode.key);
                  return (
                    <TouchableOpacity
                      key={mode.key}
                      style={[styles.paymentMode, { borderColor: themeColors.border }, checked && styles.paymentModeActive]}
                      onPress={() => togglePaymentMode(mode.key)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.checkBox, { borderColor: themeColors.border }, checked && styles.checkBoxActive]}>
                        {checked ? <Check size={13} color="#fff" /> : null}
                      </View>
                      <Text style={[styles.paymentModeText, { color: checked ? colors.primary : themeColors.text }]}>
                        {mode.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, registerShopMutation.isPending && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={registerShopMutation.isPending}
              activeOpacity={0.8}
            >
              {registerShopMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.submitText}>Submit for approval</Text>
                  <ChevronRight size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
    paddingBottom: 36,
    gap: 14,
  },
  headerCard: {
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: "#FFF4ED",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "800" as const,
    lineHeight: 25,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  loadingBox: {
    paddingVertical: 30,
    alignItems: "center",
  },
  statusCard: {
    borderRadius: 10,
    padding: 14,
  },
  statusTitle: {
    fontSize: 17,
    fontWeight: "800" as const,
  },
  statusText: {
    fontSize: 13,
    marginTop: 4,
    fontWeight: "600" as const,
  },
  formCard: {
    borderRadius: 10,
    padding: 14,
    gap: 16,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "800" as const,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: "600" as const,
  },
  paymentModes: {
    gap: 9,
  },
  paymentMode: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  paymentModeActive: {
    borderColor: colors.primary,
    backgroundColor: "#FFF4ED",
  },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  paymentModeText: {
    fontSize: 14,
    fontWeight: "800" as const,
  },
  submitButton: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800" as const,
  },
});
