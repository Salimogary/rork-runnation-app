import type { Request, Response } from "express";
import crypto from "crypto";
import { env } from "./trpc/env";
import { applySuccessfulPayment } from "./trpc/flutterwave";
import { createServerSupabaseClient } from "./trpc/supabase-server";

const supabase = createServerSupabaseClient();

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function isValidFlutterwaveSignature(req: Request): boolean {
  const secretHash = env.flutterwave.webhookSecretHash;
  if (!secretHash) return true;

  const signature = headerValue(req.headers["flutterwave-signature"]);
  if (!signature) return false;

  const rawBody = String((req as any).rawBody || "");
  if (rawBody) {
    const expectedHmac = crypto
      .createHmac("sha256", secretHash)
      .update(rawBody)
      .digest("base64");

    if (signature === expectedHmac) return true;
  }

  // Older Flutterwave examples compare the header directly with the secret hash.
  return signature === secretHash;
}

export async function handleFlutterwaveWebhook(req: Request, res: Response) {
  if (!isValidFlutterwaveSignature(req)) {
    res.status(401).json({ error: "Invalid Flutterwave signature" });
    return;
  }

  try {
    const payload = req.body ?? {};
    const eventType = String(payload.type || payload.event || "");
    const paymentData = payload.data ?? payload;

    console.log("[Flutterwave] Webhook received", {
      eventType,
      chargeId: paymentData?.id,
      reference: paymentData?.reference,
      status: paymentData?.status,
    });

    if (eventType.includes("charge") || paymentData?.reference || paymentData?.id) {
      await applySuccessfulPayment(supabase, paymentData);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[Flutterwave] Webhook processing failed:", error);
    res.status(200).json({ received: true, processing: "deferred" });
  }
}
