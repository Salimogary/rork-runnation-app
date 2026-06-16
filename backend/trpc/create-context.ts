import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { env } from "./env";
import { createServerSupabaseClient } from "./supabase-server";

function getBearerToken(req: CreateExpressContextOptions["req"]): string | null {
  const rawHeader = req.headers.authorization;

  if (!rawHeader) {
    return null;
  }

  const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const [scheme, token] = headerValue.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAuthUserIdWithRetry(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  bearerToken: string
): Promise<string | null> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { data, error } = await supabase.auth.getUser(bearerToken);
      if (error) {
        console.warn("[Auth] Could not verify bearer token:", error.message);
        return null;
      }
      return data.user?.id ?? null;
    } catch (error) {
      lastError = error;
      console.warn(
        `[Auth] Supabase token verification attempt ${attempt} failed:`,
        error instanceof Error ? error.message : error
      );
      if (attempt < 3) {
        await wait(350 * attempt);
      }
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `Could not verify your session with Supabase Auth: ${lastError.message}`
      : "Could not verify your session with Supabase Auth."
  );
}

// ✅ Correct context for Express
export const createContext = async ({ req }: CreateExpressContextOptions) => {
  const supabase = createServerSupabaseClient();

  let authUserId: string | null = null;
  const bearerToken = getBearerToken(req);

  if (bearerToken) {
    authUserId = await getAuthUserIdWithRetry(supabase, bearerToken);
  }

  return {
    req,
    supabase,
    authUserId,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        stack: env.isProduction ? undefined : shape.data.stack,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
