import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      goals: z.array(z.string()).default([]),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.supabase.from("user_goals").delete().eq("registration_id", input.registrationId);

    if (input.goals.length > 0) {
      const rows = input.goals.map((goal) => ({
        registration_id: input.registrationId,
        goal,
      }));
      const { error } = await ctx.supabase.from("user_goals").insert(rows);
      if (error) {
        throw new Error(error.message || "Failed to update goals");
      }
    }

    return { success: true };
  });
