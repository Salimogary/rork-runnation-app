import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { env } from "./env";

const WebSocketTransport = WebSocket as unknown as typeof globalThis.WebSocket;

export function createServerSupabaseClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: WebSocketTransport,
    },
  });
}
