import { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mbbjijvxmwluubkzgkpl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iYmppanZ4bXdsdXVia3pna3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMjMzMjEsImV4cCI6MjA3NzU5OTMyMX0.Hpy30sfwABdmEIb67M7nABhCeESmnL8m33Nmi0cJnV4';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const createContext = async (opts: FetchCreateContextFnOptions) => {
  return {
    req: opts.req,
    supabase,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
