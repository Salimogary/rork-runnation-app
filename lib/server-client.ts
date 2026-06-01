import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../backend/trpc/app-router";
import { getBaseUrl } from "./api-base-url";
import { supabase } from "./supabase";

let client: ReturnType<typeof createTRPCProxyClient<AppRouter>> | null = null;

function isInvalidRefreshTokenError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();
  return normalized.includes("invalid refresh token") || normalized.includes("refresh token not found");
}

async function getAuthHeaders() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return {};
    }

    return {
      Authorization: `Bearer ${session.access_token}`,
    };
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      return {};
    }
    throw error;
  }
}

export function getServerClient() {
  if (!client) {
    client = createTRPCProxyClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          headers: getAuthHeaders,
        }),
      ],
    });
  }

  return client;
}
