import React, { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  dehydrate,
  hydrate,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson, {
  parse as parseSuperJson,
  stringify as stringifySuperJson,
} from "superjson";
import { getBaseUrl } from "./api-base-url";
import type { AppRouter } from "../backend/trpc/app-router";
import { supabase } from "./supabase";
import {
  QUERY_CACHE_STORAGE_KEY,
  registerActiveQueryClient,
} from "./query-cache";

export const trpc = createTRPCReact<AppRouter>();
const QUERY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const QUERY_CACHE_WRITE_DELAY_MS = 800;

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

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [isCacheRestored, setIsCacheRestored] = useState(false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            gcTime: QUERY_CACHE_MAX_AGE_MS,
            networkMode: "offlineFirst",
            refetchOnMount: true,
            refetchOnReconnect: true,
            refetchOnWindowFocus: false,
          },
          mutations: {
            networkMode: "online",
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          headers: getAuthHeaders,
        }),
      ],
    })
  );

  useEffect(() => {
    registerActiveQueryClient(queryClient);
    return () => registerActiveQueryClient(null);
  }, [queryClient]);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(QUERY_CACHE_STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        const persisted = parseSuperJson(stored) as {
          savedAt?: number;
          state?: ReturnType<typeof dehydrate>;
        };
        if (
          persisted.state &&
          persisted.savedAt &&
          Date.now() - persisted.savedAt <= QUERY_CACHE_MAX_AGE_MS
        ) {
          hydrate(queryClient, persisted.state);
        }
      })
      .catch((error) => {
        console.warn("[QueryCache] Could not restore persisted cache:", error);
      })
      .finally(() => {
        if (active) setIsCacheRestored(true);
      });

    return () => {
      active = false;
    };
  }, [queryClient]);

  useEffect(() => {
    if (!isCacheRestored) return;

    let writeTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (writeTimer) clearTimeout(writeTimer);
      writeTimer = setTimeout(() => {
        const state = dehydrate(queryClient, {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" && query.state.data !== undefined,
        });
        void AsyncStorage.setItem(
          QUERY_CACHE_STORAGE_KEY,
          stringifySuperJson({ savedAt: Date.now(), state })
        ).catch((error) => {
          console.warn("[QueryCache] Could not persist cache:", error);
        });
      }, QUERY_CACHE_WRITE_DELAY_MS);
    });

    return () => {
      unsubscribe();
      if (writeTimer) clearTimeout(writeTimer);
    };
  }, [isCacheRestored, queryClient]);

  useEffect(() => {
    if (Platform.OS === "web") {
      const refresh = () => {
        void queryClient.refetchQueries({ type: "active", stale: true });
      };
      window.addEventListener("online", refresh);
      return () => window.removeEventListener("online", refresh);
    }

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void queryClient.refetchQueries({ type: "active", stale: true });
      }
    });
    return () => subscription.remove();
  }, [queryClient]);

  useEffect(() => {
    const retryFailedQueries = setInterval(() => {
      void queryClient.refetchQueries({
        type: "active",
        predicate: (query) => query.state.status === "error",
      });
    }, 30_000);

    return () => clearInterval(retryFailedQueries);
  }, [queryClient]);

  if (!isCacheRestored) {
    return null;
  }

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
