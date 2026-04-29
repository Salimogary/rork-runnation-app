import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
    })
  )
  .query(async ({ input, ctx }) => {
    const { count, error } = await ctx.supabase
      .from("social_mentions")
      .select("mention_id", { count: "exact", head: true })
      .eq("mentioned_registration_id", input.registrationId)
      .eq("is_read", false);

    if (error) {
      throw new Error(error.message || "Failed to fetch mention count");
    }

    return {
      unreadCount: count || 0,
    };
  });
