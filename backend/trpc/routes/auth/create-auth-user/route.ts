import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().uuid(),
      email: z.string().email(),
      pin: z.string().min(8),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const normalizedEmail = input.email.trim().toLowerCase();
    const usernameSuffix = input.registrationId.slice(0, 8).replace(/-/g, "");

    if (!ctx.authUserId) {
      throw new Error("Please confirm your email address and sign in before continuing registration.");
    }

    const { data: registration, error: registrationError } = await ctx.supabase
      .from("registrations")
      .select("registration_id, username, first_name, other_names")
      .eq("registration_id", input.registrationId)
      .single();

    if (registrationError || !registration) {
      throw new Error(registrationError?.message || "Registration record not found");
    }

    let authProfileUsername = registration.username;

    const { data: usernameProfile } = await ctx.supabase
      .from("profiles")
      .select("profile_id, registration_id")
      .eq("username", registration.username)
      .maybeSingle();

    if (
      usernameProfile?.profile_id &&
      usernameProfile.registration_id !== input.registrationId
    ) {
      authProfileUsername = `${registration.username}_${usernameSuffix}`;
    }

    const { data: authUserResult, error: authUserError } = await ctx.supabase.auth.admin.getUserById(ctx.authUserId);
    const authUser = authUserResult?.user;

    if (authUserError || !authUser) {
      throw new Error(authUserError?.message || "Could not verify your email account.");
    }

    if (authUser.email?.trim().toLowerCase() !== normalizedEmail) {
      throw new Error("The signed-in email does not match the registration email.");
    }

    const emailConfirmedAt =
      (authUser as any).email_confirmed_at ||
      (authUser as any).confirmed_at ||
      null;
    const confirmationSentAt = (authUser as any).confirmation_sent_at || null;

    if (!emailConfirmedAt) {
      throw new Error("Please confirm your email address before continuing registration.");
    }

    if (!confirmationSentAt) {
      throw new Error("Email confirmation is not active for this account. Please contact RunNation support before continuing.");
    }

    const { data: existingProfile } = await ctx.supabase
      .from("profiles")
      .select("profile_id")
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (existingProfile?.profile_id) {
      if (existingProfile.profile_id !== ctx.authUserId) {
        throw new Error("This registration is already linked to another email account.");
      }
      return { authUserId: existingProfile.profile_id, created: false, verified: true };
    }

    const { error: updateAuthError } = await ctx.supabase.auth.admin.updateUserById(ctx.authUserId, {
      user_metadata: {
        ...(authUser.user_metadata ?? {}),
        username: authProfileUsername,
        display_name: [registration.first_name, registration.other_names].filter(Boolean).join(" ").trim() || registration.username,
      },
    });

    if (updateAuthError) {
      throw new Error(updateAuthError.message || "Could not update your auth profile.");
    }

    const { error: linkedProfileError } = await ctx.supabase
      .from("profiles")
      .upsert({
        profile_id: ctx.authUserId,
        registration_id: input.registrationId,
        username: authProfileUsername,
        display_name:
          [registration.first_name, registration.other_names].filter(Boolean).join(" ").trim() || registration.username,
      });

    if (linkedProfileError) {
      console.error("[create-auth-user] Failed to link verified auth profile:", {
        authUserId: ctx.authUserId,
        registrationId: input.registrationId,
        error: {
          message: linkedProfileError.message,
          code: linkedProfileError.code,
          details: linkedProfileError.details,
          hint: linkedProfileError.hint,
        },
      });
      throw new Error(linkedProfileError.message || "Failed to link auth profile");
    }

    return {
      authUserId: ctx.authUserId,
      created: false,
      verified: true,
    };
  });
