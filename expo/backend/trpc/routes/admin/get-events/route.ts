import { publicProcedure } from "../../../create-context";
import { TRPCError } from "@trpc/server";

export default publicProcedure.query(async ({ ctx }) => {
  console.log('[getEvents] Starting query...');
  
  try {
    const { data, error } = await ctx.supabase
      .from("events")
      .select("*")
      .order("starts_at", { ascending: false });

    console.log('[getEvents] Query result:', { dataCount: data?.length, error });

    if (error) {
      console.error('[getEvents] Supabase error:', error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to fetch events: ${error.message}`,
        cause: error,
      });
    }
    
    console.log('[getEvents] Returning', data?.length || 0, 'events');
    return data || [];
  } catch (err: any) {
    console.error('[getEvents] Catch block error:', err);
    
    if (err instanceof TRPCError) {
      throw err;
    }
    
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: err?.message || "Failed to fetch events",
      cause: err,
    });
  }
});
