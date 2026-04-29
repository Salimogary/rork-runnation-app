import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      rating: z.number().int().min(1).max(5),
      feedback: z.string().trim().max(600).nullable().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const { error } = await ctx.supabase
      .from("app_ratings")
      .upsert(
        {
          registration_id: input.registrationId,
          rating: input.rating,
          feedback: input.feedback?.trim() || null,
        },
        { onConflict: "registration_id" }
      );

    if (error) {
      throw new Error(error.message || "Failed to submit rating");
    }

    return { success: true };
  });
