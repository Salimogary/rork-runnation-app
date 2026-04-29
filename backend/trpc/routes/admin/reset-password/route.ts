import { createHash } from "crypto";
import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      email: z.string().email(),
      code: z.string().min(6).max(6),
      newPassword: z.string().min(4),
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

    const registrationKey = `admin:${adminUser.admin_id}`;

    const { data: resetCode, error: codeError } = await ctx.supabase
      .from("email_verification_codes")
      .select("*")
      .eq("registration_id", registrationKey)
      .eq("email", cleanEmail)
      .eq("code", input.code.trim())
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (codeError) {
      throw new Error(codeError.message || "Failed to verify reset code");
    }

    if (!resetCode) {
      throw new Error("Invalid or expired reset code");
    }

    const passwordHash = createHash("sha256").update(input.newPassword).digest("hex");

    const { error: updatePasswordError } = await ctx.supabase
      .from("admin_users")
      .update({ password_hash: passwordHash })
      .eq("admin_id", adminUser.admin_id);

    if (updatePasswordError) {
      throw new Error(updatePasswordError.message || "Failed to update password");
    }

    const { error: markUsedError } = await ctx.supabase
      .from("email_verification_codes")
      .update({ used: true })
      .eq("id", resetCode.id);

    if (markUsedError) {
      throw new Error(markUsedError.message || "Failed to finalize password reset");
    }

    return { success: true };
  });
