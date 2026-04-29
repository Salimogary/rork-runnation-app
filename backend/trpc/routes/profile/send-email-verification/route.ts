import { z } from "zod";
import { ensureActionCooldown } from "../../../abuse";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";
import { env } from "../../../env";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      email: z.string().email(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);
    await ensureActionCooldown(ctx, {
      table: "email_verification_codes",
      filters: [{ column: "registration_id", value: input.registrationId }],
      cooldownSeconds: 60,
      errorMessage: "Please wait a minute before requesting another verification code.",
    });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const { error } = await ctx.supabase.from("email_verification_codes").insert({
      registration_id: input.registrationId,
      email: input.email,
      code,
    });

    if (error) {
      throw new Error(error.message || "Failed to send verification code");
    }

    return env.isProduction
      ? { success: true }
      : { success: true, code };
  });
