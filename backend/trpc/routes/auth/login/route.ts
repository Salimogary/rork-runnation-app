import { createHash } from "crypto";
import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      username: z.string().min(1),
      pin: z.string().min(1),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const cleanUsername = input.username.trim().toLowerCase();
    const cleanPin = input.pin.trim();

    const { data: userData, error } = await ctx.supabase
      .from("registrations")
      .select("registration_id, username, pin_hash, created_at")
      .eq("username", cleanUsername)
      .maybeSingle();

    if (error || !userData) {
      throw new Error("Username not found or incorrect PIN");
    }

    const pinHash = createHash("sha256").update(cleanPin).digest("hex");
    if (pinHash !== userData.pin_hash) {
      throw new Error("Username not found or incorrect PIN");
    }

    return {
      id: userData.registration_id,
      username: userData.username,
      createdAt: userData.created_at || new Date().toISOString(),
    };
  });
