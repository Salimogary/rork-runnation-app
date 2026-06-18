import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import * as trpcExpress from "@trpc/server/adapters/express";
import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { env } from "./trpc/env";
import { getAllowedCorsOrigins, rateLimit, sanitizeJsonBody, securityHeaders } from "./security";
import { handleFlutterwaveWebhook } from "./flutterwave-webhook";

const app = express();

app.set("trust proxy", env.trustProxy ? 1 : false);
app.use(securityHeaders);
app.use(rateLimit);

app.use(
  cors({
    origin: getAllowedCorsOrigins(),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.post(
  "/api/flutterwave/webhook",
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf.toString("utf8");
    },
  }),
  handleFlutterwaveWebhook
);

app.get("/api/flutterwave/return", (_req, res) => {
  res.type("html").send(`
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>RunNation Payment</title>
        <style>
          body { font-family: system-ui, sans-serif; margin: 0; padding: 32px; background: #0f172a; color: #fff; }
          .card { max-width: 520px; margin: 8vh auto; background: #111827; border-radius: 18px; padding: 24px; }
          h1 { margin-top: 0; color: #f97316; }
          p { line-height: 1.5; color: #cbd5e1; }
        </style>
      </head>
      <body>
        <main class="card">
          <h1>Payment received</h1>
          <p>You can return to RunNation. Your payment status will update after Flutterwave confirms the transaction.</p>
        </main>
      </body>
    </html>
  `);
});

app.use(
  express.json({
    limit: "15mb",
  })
);

app.use(sanitizeJsonBody);

app.use(
  "/api/trpc",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

const port = env.port;

app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${port}`);
});
