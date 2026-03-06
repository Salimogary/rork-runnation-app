import React, { useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { createTRPCReact } from "@trpc/react-query";
import { httpLink } from "@trpc/client";
import type { AppRouter } from "@/backend/trpc/app-router";
import superjson from "superjson";

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = (): string => {
  const baseUrl = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;
  if (baseUrl) return baseUrl;
  console.warn("[tRPC] EXPO_PUBLIC_RORK_API_BASE_URL not set");
  return "";
};

function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpLink({
        url: `${getBaseUrl()}/api/trpc`,
        transformer: superjson,
        async fetch(url, options) {
          console.log("[tRPC] Request:", url);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000);
          try {
            const response = await globalThis.fetch(url as string, {
              ...options,
              headers: {
                ...(options?.headers instanceof Headers
                  ? Object.fromEntries(options.headers.entries())
                  : (options?.headers as Record<string, string>) ?? {}),
                "Content-Type": "application/json",
              },
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            console.log("[tRPC] Response:", response.status);
            return response;
          } catch (error: unknown) {
            clearTimeout(timeoutId);
            const err = error as Error;
            console.error("[tRPC] Fetch error:", err?.message);
            if (err?.name === "AbortError") {
              throw new Error("Request timed out after 60 seconds.");
            }
            throw error;
          }
        },
      }),
    ],
  });
}

interface TRPCProviderProps {
  children: React.ReactNode;
  queryClient: QueryClient;
}

export function TRPCProvider({ children, queryClient }: TRPCProviderProps) {
  const [client] = useState(createTRPCClient);

  const ProviderComponent = trpc.Provider;

  if (!ProviderComponent) {
    console.error("[tRPC] trpc.Provider is undefined - rendering children without tRPC context");
    return <>{children}</>;
  }

  return (
    <ProviderComponent client={client} queryClient={queryClient}>
      {children}
    </ProviderComponent>
  );
}
