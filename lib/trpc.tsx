import { createTRPCReact } from "@trpc/react-query";
import { httpLink } from "@trpc/client";
import type { AppRouter } from "@/backend/trpc/app-router";
import superjson from "superjson";
import React from "react";
import type { QueryClient } from "@tanstack/react-query";

export const trpc = createTRPCReact<AppRouter>();

const InternalProvider = trpc.Provider;

export function TRPCProvider({
  client,
  queryClient,
  children,
}: {
  client: ReturnType<typeof trpc.createClient>;
  queryClient: QueryClient;
  children: React.ReactNode;
}) {
  if (!InternalProvider) {
    console.warn('[TRPCProvider] trpc.Provider is undefined, rendering children without tRPC context');
    return <>{children}</>;
  }
  return (
    <InternalProvider client={client} queryClient={queryClient}>
      {children}
    </InternalProvider>
  );
}

const getBaseUrl = () => {
  const baseUrl = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;
  if (baseUrl) {
    return baseUrl;
  }
  console.warn("[tRPC] EXPO_PUBLIC_RORK_API_BASE_URL not set, using empty string");
  return "";
};

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
      fetch: async (url, options) => {
        console.log("[tRPC] Request URL:", url);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000);

          const response = await fetch(url, {
            ...options,
            headers: Object.assign(
              {},
              options?.headers instanceof Headers
                ? Object.fromEntries(options.headers.entries())
                : options?.headers,
              { "Content-Type": "application/json" }
            ),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          console.log("[tRPC] Response status:", response.status);

          if (!response.ok) {
            const text = await response.clone().text();
            console.error("[tRPC] Error response body:", text.substring(0, 500));
          }

          return response;
        } catch (error: any) {
          console.error("[tRPC] Fetch error:", error?.message);
          if (error.name === "AbortError") {
            throw new Error("Request timed out after 60 seconds.");
          }
          throw error;
        }
      },
    }),
  ],
});
