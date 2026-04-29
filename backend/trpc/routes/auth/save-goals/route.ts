import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      goals: z.array(z.string().min(1)).min(1),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const rows = input.goals.map((goal) => ({
      registration_id: input.registrationId,
      goal,
    }));

    const { error } = await ctx.supabase.from("user_goals").insert(rows);

    if (error) {
      throw new Error(error.message || "Failed to save goals");
    }

    return { success: true };
  });
