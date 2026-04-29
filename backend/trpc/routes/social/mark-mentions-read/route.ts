import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { error } = await ctx.supabase
      .from("social_mentions")
      .update({ is_read: true })
      .eq("mentioned_registration_id", input.registrationId)
      .eq("is_read", false);

    if (error) {
      throw new Error(error.message || "Failed to mark mentions as read");
    }

    return { success: true };
  });
