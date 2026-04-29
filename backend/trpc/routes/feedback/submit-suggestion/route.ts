import { z } from "zod";
import { ensureActionCooldown, ensureNoRecentDuplicateText } from "../../../abuse";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      suggestion: z.string().trim().min(8).max(600),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);
    await ensureActionCooldown(ctx, {
      table: "suggestions",
      filters: [{ column: "registration_id", value: input.registrationId }],
      cooldownSeconds: 60,
      errorMessage: "Please wait a minute before sending more feedback.",
    });
    await ensureNoRecentDuplicateText(ctx, {
      table: "suggestions",
      filters: [{ column: "registration_id", value: input.registrationId }],
      textColumn: "suggestion",
      textValue: input.suggestion,
      windowSeconds: 24 * 60 * 60,
      errorMessage: "That feedback looks like something you already sent recently.",
    });

    const { error } = await ctx.supabase
      .from("suggestions")
      .insert({
        registration_id: input.registrationId,
        suggestion: input.suggestion.trim(),
      });

    if (error) {
      throw new Error(error.message || "Failed to submit suggestion");
    }

    return { success: true };
  });
