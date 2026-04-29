import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../backend/trpc/app-router";
import { getBaseUrl } from "./api-base-url";
import { supabase } from "./supabase";

let client: ReturnType<typeof createTRPCProxyClient<AppRouter>> | null = null;

export function getServerClient() {
  if (!client) {
    client = createTRPCProxyClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          async headers() {
            const {
              data: { session },
            } = await supabase.auth.getSession();

            if (!session?.access_token) {
              return {};
            }

            return {
              Authorization: `Bearer ${session.access_token}`,
            };
          },
        }),
      ],
    });
  }

  return client;
}
