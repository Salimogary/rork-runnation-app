import { createHash } from "crypto";
import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      email: z.string().email(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const cleanEmail = input.email.trim().toLowerCase();

    const { data: adminByEmail, error: adminEmailError } = await ctx.supabase
      .from("admin_users")
      .select("*")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (adminEmailError) {
      throw new Error(adminEmailError.message || "Failed to look up admin account");
    }

    let adminUser = adminByEmail;

    if (!adminUser) {
      const { data: adminByUsername, error: adminUsernameError } = await ctx.supabase
        .from("admin_users")
        .select("*")
        .eq("username", cleanEmail)
        .maybeSingle();

      if (adminUsernameError) {
        throw new Error(adminUsernameError.message || "Failed to look up admin account");
      }

      adminUser = adminByUsername;
    }

    if (!adminUser) {
      throw new Error("No admin account found for that email");
    }

    if (adminUser.is_active === false) {
      throw new Error("This admin account has been deactivated");
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const registrationKey = `admin:${adminUser.admin_id}`;
    const resetHash = createHash("sha256").update(`${registrationKey}:${code}`).digest("hex");

    const { error: insertError } = await ctx.supabase
      .from("email_verification_codes")
      .insert({
        registration_id: registrationKey,
        email: cleanEmail,
        code,
        used: false,
      });

    if (insertError) {
      throw new Error(insertError.message || "Failed to create reset code");
    }

    return {
      success: true,
      resetHash,
      code,
    };
  });
