import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { createClient } from "@supabase/supabase-js";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { env } from "./env";

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

// ✅ Correct context for Express
export const createContext = async ({ req }: CreateExpressContextOptions) => {
  const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);

  let authUserId: string | null = null;
  const bearerToken = getBearerToken(req);

  if (bearerToken) {
    const { data, error } = await supabase.auth.getUser(bearerToken);
    if (!error) {
      authUserId = data.user?.id ?? null;
    }
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
