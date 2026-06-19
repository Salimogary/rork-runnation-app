import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { env } from "./env";

type PaymentPurpose = "subscription" | "shop_order" | "event_enrollment" | "club_payment" | "donation";

type SubscriptionPlanDetails = {
  planId: string;
  amount: number;
  currency: string;
  durationDays: number;
  label: string;
};

const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlanDetails> = {
  ug_quarterly: {
    planId: "ug_quarterly",
    amount: 20000,
    currency: "UGX",
    durationDays: 90,
    label: "RunNation quarterly subscription",
  },
  ug_yearly: {
    planId: "ug_yearly",
    amount: 60000,
    currency: "UGX",
    durationDays: 365,
    label: "RunNation yearly subscription",
  },
  intl_quarterly: {
    planId: "intl_quarterly",
    amount: 5,
    currency: "USD",
    durationDays: 90,
    label: "RunNation quarterly subscription",
  },
  intl_yearly: {
    planId: "intl_yearly",
    amount: 15,
    currency: "USD",
    durationDays: 365,
    label: "RunNation yearly subscription",
  },
  ug_mtn_quarterly: {
    planId: "ug_mtn_quarterly",
    amount: 20000,
    currency: "UGX",
    durationDays: 90,
    label: "RunNation quarterly subscription",
  },
  ug_airtel_quarterly: {
    planId: "ug_airtel_quarterly",
    amount: 20000,
    currency: "UGX",
    durationDays: 90,
    label: "RunNation quarterly subscription",
  },
  ug_mtn_yearly: {
    planId: "ug_mtn_yearly",
    amount: 60000,
    currency: "UGX",
    durationDays: 365,
    label: "RunNation yearly subscription",
  },
  ug_airtel_yearly: {
    planId: "ug_airtel_yearly",
    amount: 60000,
    currency: "UGX",
    durationDays: 365,
    label: "RunNation yearly subscription",
  },
  intl_card_quarterly: {
    planId: "intl_card_quarterly",
    amount: 5,
    currency: "USD",
    durationDays: 90,
    label: "RunNation quarterly subscription",
  },
  intl_card_yearly: {
    planId: "intl_card_yearly",
    amount: 15,
    currency: "USD",
    durationDays: 365,
    label: "RunNation yearly subscription",
  },
};

const INTERNATIONAL_EQUIVALENT_PRICES: Record<string, { quarterly: number; yearly: number }> = {
  USD: { quarterly: 5, yearly: 15 },
  KES: { quarterly: 650, yearly: 1950 },
  TZS: { quarterly: 13000, yearly: 39000 },
  RWF: { quarterly: 7000, yearly: 21000 },
  NGN: { quarterly: 8000, yearly: 24000 },
  GHS: { quarterly: 60, yearly: 180 },
  ZAR: { quarterly: 90, yearly: 270 },
  ZMW: { quarterly: 140, yearly: 420 },
  MWK: { quarterly: 9000, yearly: 27000 },
};

export function getSubscriptionPlanDetails(planId: string): SubscriptionPlanDetails {
  const plan = SUBSCRIPTION_PLANS[planId];
  if (!plan) {
    throw new Error("Unknown subscription plan. Please update the app and try again.");
  }
  return plan;
}

export function getSubscriptionChargeDetails(
  planId: string,
  requestedAmount: number,
  requestedCurrency: string
): SubscriptionPlanDetails {
  const plan = getSubscriptionPlanDetails(planId);
  const currency = requestedCurrency.trim().toUpperCase();
  const amount = Number(requestedAmount);

  if (planId === "intl_quarterly" || planId === "intl_yearly") {
    const period = planId === "intl_yearly" ? "yearly" : "quarterly";
    const equivalentAmount = INTERNATIONAL_EQUIVALENT_PRICES[currency]?.[period];
    if (!equivalentAmount || amount !== equivalentAmount) {
      throw new Error("Selected subscription price is not available. Please refresh the app and try again.");
    }
    return {
      ...plan,
      amount: equivalentAmount,
      currency,
    };
  }

  if (plan.amount !== amount || plan.currency !== currency) {
    throw new Error("Selected subscription price does not match the current plan.");
  }

  return plan;
}

type FlutterwaveToken = {
  accessToken: string;
  expiresAtMs: number;
};

class FlutterwaveApiError extends Error {
  status: number;
  path: string;
  response: unknown;

  constructor(message: string, status: number, path: string, response: unknown) {
    super(message);
    this.name = "FlutterwaveApiError";
    this.status = status;
    this.path = path;
    this.response = response;
  }
}

type CreateMobileMoneyPaymentInput = {
  registrationId: string;
  purpose: PaymentPurpose;
  purposeId?: string | null;
  amount: number;
  currency: string;
  paymentMethod: string;
  phoneNumber: string;
  description: string;
  metadata?: Record<string, unknown>;
};

let cachedToken: FlutterwaveToken | null = null;

function stringifyErrorValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidate =
      record.message ??
      record.error_description ??
      record.error ??
      record.detail ??
      record.details ??
      record.title;
    if (candidate) return stringifyErrorValue(candidate);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value || "");
}

function parseJsonResponse(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function assertFlutterwaveConfigured() {
  if (!env.flutterwave.clientId || !env.flutterwave.clientSecret) {
    throw new Error("Flutterwave is not configured on the backend.");
  }
}

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

function normalizePhoneNumber(value: string): string {
  return value.replace(/[^\d+]/g, "").trim();
}

function splitName(fullName: string | null | undefined) {
  const parts = String(fullName || "RunNation Runner").trim().split(/\s+/).filter(Boolean);
  return {
    first: parts[0] || "RunNation",
    last: parts.slice(1).join(" ") || "Runner",
  };
}

function getCountryDialCode(currency: string): string {
  if (currency === "KES") return "254";
  if (currency === "GHS") return "233";
  if (currency === "NGN") return "234";
  return "256";
}

function getFlutterwaveMobileNetwork(paymentMethod: string): string {
  const normalized = paymentMethod.trim().toLowerCase();
  if (normalized.includes("airtel")) return "AIRTEL";
  if (normalized.includes("mpesa") || normalized.includes("m-pesa")) return "MPESA";
  return "MTN";
}

function getValidRedirectUrl(): string | undefined {
  const value = env.flutterwave.redirectUrl.trim();
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  console.warn("[Flutterwave] Ignoring invalid redirect URL. Flutterwave requires http(s).", { redirectUrl: value });
  return undefined;
}

function getFlutterwaveData(value: unknown): any {
  if (!value || typeof value !== "object") return null;
  return (value as any).data ?? null;
}

function getFirstFlutterwaveItem(value: unknown): any {
  const data = getFlutterwaveData(value);
  if (Array.isArray(data)) return data[0] ?? null;
  if (Array.isArray(data?.items)) return data.items[0] ?? null;
  if (Array.isArray(data?.data)) return data.data[0] ?? null;
  return data ?? null;
}

function isExistingCustomerError(error: unknown): boolean {
  if (!(error instanceof FlutterwaveApiError)) return false;
  const response = error.response as any;
  const code = response?.error?.code ?? response?.code;
  const message = stringifyErrorValue(response?.error?.message ?? response?.message ?? error.message).toLowerCase();
  return error.status === 409 || code === "10409" || message.includes("customer already exists");
}

async function flutterwaveRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT";
    body?: Record<string, unknown>;
    idempotencyKey?: string;
    traceId?: string;
  } = {}
): Promise<T> {
  const accessToken = await getFlutterwaveAccessToken();
  const response = await fetch(`${env.flutterwave.apiBaseUrl}${path}`, {
    method: options.method ?? "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Trace-Id": options.traceId ?? `rn-trace-${randomUUID()}`,
      ...(options.idempotencyKey ? { "X-Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const json = parseJsonResponse(text) as Record<string, unknown>;

  if (!response.ok) {
    const message =
      stringifyErrorValue(json?.message || json?.error || json) ||
      `Flutterwave request failed with status ${response.status}.`;
    console.error("[Flutterwave] API request failed", {
      path,
      status: response.status,
      message,
      response: json,
    });
    throw new FlutterwaveApiError(message, response.status, path, json);
  }

  return json as T;
}

async function getFlutterwaveAccessToken(): Promise<string> {
  assertFlutterwaveConfigured();

  if (cachedToken && cachedToken.expiresAtMs - Date.now() > 60_000) {
    return cachedToken.accessToken;
  }

  const response = await fetch("https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.flutterwave.clientId,
      client_secret: env.flutterwave.clientSecret,
      grant_type: "client_credentials",
    }).toString(),
  });

  const text = await response.text();
  const json = parseJsonResponse(text) as Record<string, unknown>;
  if (!response.ok || !json?.access_token) {
    const message =
      stringifyErrorValue(json?.error_description || json?.error || json) ||
      "Could not authenticate with Flutterwave.";
    console.error("[Flutterwave] Authentication failed", {
      status: response.status,
      message,
      response: json,
    });
    throw new Error(message);
  }

  const expiresInSeconds = Number(json.expires_in || 600);
  cachedToken = {
    accessToken: String(json.access_token),
    expiresAtMs: Date.now() + expiresInSeconds * 1000,
  };
  return cachedToken.accessToken;
}

async function assertPaymentIntentsTableReady(supabase: SupabaseClient) {
  const { error } = await supabase
    .from("payment_intents")
    .select("payment_intent_id", { count: "exact", head: true })
    .limit(1);

  if (error) {
    const message = String(error.message || "");
    if (message.includes("payment_intents") || message.includes("schema cache") || message.includes("does not exist")) {
      throw new Error(
        "Payment setup is incomplete. Run the Supabase migration 20260616_flutterwave_payment_intents.sql before testing Flutterwave payments."
      );
    }
    throw new Error(error.message || "Could not verify payment setup.");
  }
}

async function getRegistrationIdentity(supabase: SupabaseClient, registrationId: string) {
  const [{ data: registration }, { data: contact }] = await Promise.all([
    supabase
      .from("registrations")
      .select("first_name, other_names, username, email, country")
      .eq("registration_id", registrationId)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("email, phone")
      .eq("registration_id", registrationId)
      .maybeSingle(),
  ]);

  const fullName =
    [registration?.first_name, registration?.other_names].filter(Boolean).join(" ").trim() ||
    registration?.username ||
    "RunNation Runner";
  return {
    fullName,
    email: contact?.email || registration?.email || `${registrationId}@runnation.local`,
    phone: contact?.phone || null,
  };
}

async function findExistingFlutterwaveCustomer(identity: { email: string; phone: string | null }, phoneNumber: string) {
  const queries = [
    identity.email ? `/customers?email=${encodeURIComponent(identity.email)}` : null,
    phoneNumber ? `/customers?phone=${encodeURIComponent(phoneNumber)}` : null,
    phoneNumber ? `/customers?phone_number=${encodeURIComponent(phoneNumber)}` : null,
  ].filter(Boolean) as string[];

  for (const path of queries) {
    try {
      const response = await flutterwaveRequest<any>(path, { method: "GET" });
      const customer = getFirstFlutterwaveItem(response);
      if (customer?.id) {
        console.log("[Flutterwave] Reusing existing customer", {
          customerId: customer.id,
          lookup: path.replace(identity.email, "[email]").replace(phoneNumber, "[phone]"),
        });
        return customer.id;
      }
    } catch (error) {
      console.warn("[Flutterwave] Existing customer lookup failed", {
        path: path.replace(identity.email, "[email]").replace(phoneNumber, "[phone]"),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return null;
}

async function getOrCreateFlutterwaveCustomer(input: {
  traceId: string;
  reference: string;
  registrationId: string;
  purpose: PaymentPurpose;
  name: { first: string; last: string };
  identity: { email: string; phone: string | null };
  currency: string;
  phoneNumber: string;
}) {
  try {
    const customerResponse = await flutterwaveRequest<any>("/customers", {
      traceId: input.traceId,
      idempotencyKey: `rn-customer-${input.registrationId}`,
      body: {
        name: input.name,
        email: input.identity.email,
        phone: {
          country_code: getCountryDialCode(input.currency),
          number: input.phoneNumber.replace(/^\+?256|^\+?254|^\+?233|^\+?234/, ""),
        },
        meta: {
          registration_id: input.registrationId,
          runnation_purpose: input.purpose,
        },
      },
    });

    const customerId = customerResponse?.data?.id;
    if (!customerId) {
      console.error("[Flutterwave] Customer response missing ID", customerResponse);
      throw new Error(`Flutterwave did not return a customer ID: ${stringifyErrorValue(customerResponse)}`);
    }
    return customerId;
  } catch (error) {
    if (isExistingCustomerError(error)) {
      const existingCustomerId = await findExistingFlutterwaveCustomer(input.identity, input.phoneNumber);
      if (existingCustomerId) return existingCustomerId;
      throw new Error("Flutterwave says this customer already exists, but the sandbox did not return the existing customer record. Try a different sandbox phone number or email.");
    }
    throw error;
  }
}

export async function createFlutterwaveMobileMoneyPayment(
  supabase: SupabaseClient,
  input: CreateMobileMoneyPaymentInput
) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid payment amount.");
  }

  const currency = normalizeCurrency(input.currency);
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  if (phoneNumber.length < 9) {
    throw new Error("Please enter a valid payment phone number.");
  }

  await assertPaymentIntentsTableReady(supabase);

  const identity = await getRegistrationIdentity(supabase, input.registrationId);
  const name = splitName(identity.fullName);
  const reference = `RN-${input.purpose.slice(0, 3).toUpperCase()}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const traceId = `rn-trace-${randomUUID()}`;

  console.log("[Flutterwave] Starting mobile money payment", {
    purpose: input.purpose,
    amount,
    currency,
    paymentMethod: input.paymentMethod,
    reference,
    traceId,
  });

  const customerId = await getOrCreateFlutterwaveCustomer({
    traceId,
    reference,
    registrationId: input.registrationId,
    purpose: input.purpose,
    name,
    identity,
    currency,
    phoneNumber,
  });

  const paymentMethodResponse = await flutterwaveRequest<any>("/payment-methods", {
    traceId,
    idempotencyKey: `rn-pmd-${reference}`,
    body: {
      type: "mobile_money",
      mobile_money: {
        country_code: getCountryDialCode(currency),
        network: getFlutterwaveMobileNetwork(input.paymentMethod),
        phone_number: phoneNumber.replace(/^\+?256|^\+?254|^\+?233|^\+?234/, ""),
      },
    },
  });

  const paymentMethodId = paymentMethodResponse?.data?.id;
  if (!paymentMethodId) {
    console.error("[Flutterwave] Payment method response missing ID", paymentMethodResponse);
    throw new Error(`Flutterwave did not return a payment method ID: ${stringifyErrorValue(paymentMethodResponse)}`);
  }

  const chargeResponse = await flutterwaveRequest<any>("/charges", {
    traceId,
    idempotencyKey: `rn-charge-${reference}`,
    body: {
      reference,
      amount,
      currency,
      customer_id: customerId,
      payment_method_id: paymentMethodId,
      ...(getValidRedirectUrl() ? { redirect_url: getValidRedirectUrl() } : {}),
      meta: {
        ...(input.metadata ?? {}),
        registration_id: input.registrationId,
        purpose: input.purpose,
        purpose_id: input.purposeId ?? null,
      },
    },
  });

  const charge = chargeResponse?.data ?? {};
  const nextAction = charge.next_action ?? {};
  const checkoutUrl = nextAction?.redirect_url?.url || null;
  const paymentInstruction = nextAction?.payment_instruction?.note || null;

  console.log("[Flutterwave] Charge created", {
    reference,
    chargeId: charge.id ?? null,
    status: charge.status ?? null,
    hasCheckoutUrl: Boolean(checkoutUrl),
    hasPaymentInstruction: Boolean(paymentInstruction),
  });

  const { error } = await supabase.from("payment_intents").insert({
    registration_id: input.registrationId,
    purpose: input.purpose,
    purpose_id: input.purposeId ?? null,
    amount,
    currency,
    status: charge.status === "succeeded" ? "succeeded" : "pending",
    provider: "flutterwave",
    provider_reference: reference,
    provider_charge_id: charge.id ?? null,
    provider_customer_id: customerId,
    provider_payment_method_id: paymentMethodId,
    payment_method: input.paymentMethod,
    phone_number: phoneNumber,
    checkout_url: checkoutUrl,
    payment_instruction: paymentInstruction,
    metadata: input.metadata ?? {},
    paid_at: charge.status === "succeeded" ? new Date().toISOString() : null,
  });

  if (error) {
    console.error("[Flutterwave] Could not record payment intent", {
      reference,
      error,
    });
    throw new Error(error.message || "Could not record payment intent.");
  }

  return {
    reference,
    chargeId: charge.id ?? null,
    status: charge.status ?? "pending",
    checkoutUrl,
    paymentInstruction,
  };
}

export async function applySuccessfulPayment(supabase: SupabaseClient, payment: any) {
  const reference = String(payment?.reference || payment?.tx_ref || "").trim();
  const chargeId = String(payment?.id || "").trim();
  if (!reference && !chargeId) return;

  const query = supabase
    .from("payment_intents")
    .select("*")
    .or([
      reference ? `provider_reference.eq.${reference}` : "",
      chargeId ? `provider_charge_id.eq.${chargeId}` : "",
    ].filter(Boolean).join(","))
    .maybeSingle();

  const { data: intent, error } = await query;
  if (error || !intent) {
    console.warn("[Flutterwave] Payment intent not found for webhook", { reference, chargeId, error: error?.message });
    return;
  }

  const paidAmount = Number(payment?.amount ?? intent.amount);
  const paidCurrency = normalizeCurrency(String(payment?.currency ?? intent.currency));
  const expectedAmount = Number(intent.amount);
  const expectedCurrency = normalizeCurrency(String(intent.currency));
  const status = String(payment?.status || "").toLowerCase();
  const succeeded = status === "succeeded" || status === "successful" || status === "success";

  if (!succeeded || paidAmount < expectedAmount || paidCurrency !== expectedCurrency) {
    await supabase
      .from("payment_intents")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("payment_intent_id", intent.payment_intent_id);
    return;
  }

  await supabase
    .from("payment_intents")
    .update({
      status: "succeeded",
      provider_charge_id: chargeId || intent.provider_charge_id,
      updated_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
    })
    .eq("payment_intent_id", intent.payment_intent_id);

  if (intent.purpose === "subscription") {
    const now = new Date();
    let durationDays = 365;
    if (intent.purpose_id) {
      try {
        durationDays = getSubscriptionPlanDetails(String(intent.purpose_id)).durationDays;
      } catch {
        durationDays = 365;
      }
    }
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    await supabase.from("subscriptions").upsert(
      {
        registration_id: intent.registration_id,
        status: "active",
        payment_method: intent.payment_method,
        payment_reference: intent.provider_reference,
        amount: intent.amount,
        currency: intent.currency,
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: "registration_id" }
    );
    await supabase.from("registrations").update({ subscription: 3 }).eq("registration_id", intent.registration_id);
  }

  if (intent.purpose === "club_payment" && intent.purpose_id) {
    await supabase.from("club_payment_records").upsert(
      {
        payment_id: intent.purpose_id,
        registration_id: intent.registration_id,
        status: "paid",
        amount_paid: intent.amount,
        paid_at: new Date().toISOString(),
        notes: `Paid via Flutterwave ${intent.provider_reference}`,
      },
      { onConflict: "payment_id,registration_id" }
    );
  }

  if (intent.purpose === "donation" && intent.purpose_id) {
    await supabase
      .from("donation_intents")
      .update({ status: "paid" })
      .eq("donation_id", intent.purpose_id);
  }
}
