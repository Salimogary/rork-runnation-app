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

    const { data: existingProfile } = await ctx.supabase
      .from("profiles")
      .select("profile_id")
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (existingProfile?.profile_id) {
      return { authUserId: existingProfile.profile_id, created: false };
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

    const createResult = await ctx.supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: input.pin.trim(),
      email_confirm: true,
      user_metadata: {
        username: authProfileUsername,
        display_name: [registration.first_name, registration.other_names].filter(Boolean).join(" ").trim() || registration.username,
      },
    });

    if (createResult.error || !createResult.data.user) {
      console.error("[create-auth-user] Supabase auth.admin.createUser failed:", {
        registrationId: input.registrationId,
        username: registration.username,
        error: createResult.error
          ? {
              message: createResult.error.message,
              name: createResult.error.name,
              status: (createResult.error as { status?: number }).status ?? null,
              code: (createResult.error as { code?: string }).code ?? null,
            }
          : null,
      });
      throw new Error(createResult.error?.message || "Failed to create auth user");
    }

    const authUserId = createResult.data.user.id;

    const { error: profileError } = await ctx.supabase
      .from("profiles")
      .upsert({
        profile_id: authUserId,
        registration_id: input.registrationId,
        username: authProfileUsername,
        display_name:
          [registration.first_name, registration.other_names].filter(Boolean).join(" ").trim() || registration.username,
      });

    if (profileError) {
      console.error("[create-auth-user] Failed to link auth profile:", {
        authUserId,
        registrationId: input.registrationId,
        error: {
          message: profileError.message,
          code: profileError.code,
          details: profileError.details,
          hint: profileError.hint,
        },
      });
      throw new Error(profileError.message || "Failed to link auth profile");
    }

    return {
      authUserId,
      created: true,
    };
  });
