import { createHash } from "crypto";
import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      pin: z.string().min(1),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { data, error } = await ctx.supabase
      .from("registrations")
      .select("pin_hash")
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (error || !data) {
      throw new Error(error?.message || "Failed to verify PIN");
    }

    const pinHash = createHash("sha256").update(input.pin.trim()).digest("hex");
    return { valid: pinHash === data.pin_hash };
  });
