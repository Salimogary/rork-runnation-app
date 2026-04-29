import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import * as trpcExpress from "@trpc/server/adapters/express";
import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { env } from "./trpc/env";
import { getAllowedCorsOrigins, rateLimit, sanitizeJsonBody, securityHeaders } from "./security";

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
