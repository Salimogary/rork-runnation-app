import { createTRPCReact } from "@trpc/react-query";
import { httpLink } from "@trpc/client";
import type { AppRouter } from "@/backend/trpc/app-router";
import superjson from "superjson";
import React from "react";
import type { QueryClient } from "@tanstack/react-query";

export const trpc = createTRPCReact<AppRouter>();

const TRPCInternalProvider = trpc.Provider as React.ComponentType<{
  client: ReturnType<typeof trpc.createClient>;
  queryClient: QueryClient;
  children: React.ReactNode;
}> | undefined;

export function TRPCProvider({
  client,
  queryClient,
  children,
}: {
  client: ReturnType<typeof trpc.createClient>;
  queryClient: QueryClient;
  children: React.ReactNode;
}) {
  if (TRPCInternalProvider) {
    return (
      <TRPCInternalProvider client={client} queryClient={queryClient}>
        {children}
      </TRPCInternalProvider>
    );
  }
  return <>{children}</>;
}

const getBaseUrl = () => {
  const baseUrl = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;
  
  if (baseUrl) {
    return baseUrl;
  }

  console.warn('[tRPC] EXPO_PUBLIC_RORK_API_BASE_URL not set, using empty string');
  return '';
};

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
      fetch: async (url, options) => {
        console.log('[tRPC] Request URL:', url);
        console.log('[tRPC] Request method:', options?.method);
        if (options?.body) {
          const bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
          console.log('[tRPC] Request body size:', (bodyStr.length / 1024).toFixed(2), 'KB');
        }
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000);
          
          const response = await fetch(url, {
            ...options,
            headers: {
              ...options?.headers,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          console.log('[tRPC] Response status:', response.status);
          console.log('[tRPC] Response headers:', response.headers);
          
          if (!response.ok) {
            const text = await response.clone().text();
            console.error('[tRPC] Error response body:', text.substring(0, 500));
          }
          
          return response;
        } catch (error: any) {
          console.error('[tRPC] Fetch error:', error);
          console.error('[tRPC] Error name:', error?.name);
          console.error('[tRPC] Error message:', error?.message);
          if (error.name === 'AbortError') {
            throw new Error('Request timed out after 60 seconds. The file might be too large or the server is not responding.');
          }
          throw error;
        }
      },
    }),
  ],
});
