import type { Request, Response } from "express";
import { env } from "./trpc/env";
import { applySuccessfulPayment } from "./trpc/flutterwave";
import { createServerSupabaseClient } from "./trpc/supabase-server";

const supabase = createServerSupabaseClient();

export async function handleFlutterwaveWebhook(req: Request, res: Response) {
  const signature = req.headers["flutterwave-signature"];
  const expected = env.flutterwave.webhookSecretHash;

  if (expected && signature !== expected) {
    res.status(401).json({ error: "Invalid Flutterwave signature" });
    return;
  }

  try {
    const payload = req.body ?? {};
    const eventType = String(payload.type || payload.event || "");
    const paymentData = payload.data ?? payload;

    if (eventType.includes("charge") || paymentData?.reference || paymentData?.id) {
      await applySuccessfulPayment(supabase, paymentData);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[Flutterwave] Webhook processing failed:", error);
    res.status(200).json({ received: true, processing: "deferred" });
  }
}
