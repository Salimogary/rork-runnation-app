import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      code: z.string().min(1),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { data, error } = await ctx.supabase
      .from("email_verification_codes")
      .select("*")
      .eq("registration_id", input.registrationId)
      .eq("code", input.code)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to verify code");
    }

    if (!data) {
      throw new Error("Invalid or expired code");
    }

    await ctx.supabase
      .from("email_verification_codes")
      .update({ used: true })
      .eq("id", data.id);

    const { error: updateError } = await ctx.supabase
      .from("registrations")
      .update({ email_verified: true })
      .eq("registration_id", input.registrationId);

    if (updateError) {
      throw new Error(updateError.message || "Failed to mark email verified");
    }

    return { success: true };
  });
