import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function getTrustedSocialProvider(user: any): "google" | "apple" | null {
  const provider =
    user?.app_metadata?.provider ||
    user?.identities?.[0]?.provider ||
    null;

  return provider === "google" || provider === "apple" ? provider : null;
}

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().uuid(),
      email: z.string().email(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    if (!ctx.authUserId) {
      throw new Error("You must be signed in to sync your contact email.");
    }

    const { data: authUserResult, error: authUserError } =
      await ctx.supabase.auth.admin.getUserById(ctx.authUserId);

    if (authUserError || !authUserResult.user) {
      throw new Error(authUserError?.message || "Could not load your signed-in account.");
    }

    const authUser = authUserResult.user;
    const provider = getTrustedSocialProvider(authUser);

    if (!provider) {
      throw new Error("Only Google or Apple sign-in accounts can sync contact email this way.");
    }

    const authEmail = normalizeEmail(authUser.email ?? "");
    const targetEmail = normalizeEmail(input.email);

    if (!authEmail || authEmail !== targetEmail) {
      throw new Error("The selected email does not match your signed-in social account.");
    }

    const { data: existingContact, error: contactLookupError } = await ctx.supabase
      .from("contacts")
      .select("contact_id")
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (contactLookupError) {
      throw new Error(contactLookupError.message || "Could not load your contact record.");
    }

    if (existingContact?.contact_id) {
      const { error: updateError } = await ctx.supabase
        .from("contacts")
        .update({
          email: targetEmail,
          em_verified: true,
        })
        .eq("registration_id", input.registrationId);

      if (updateError) {
        throw new Error(updateError.message || "Could not update your contact email.");
      }
    } else {
      const { error: insertError } = await ctx.supabase
        .from("contacts")
        .insert({
          registration_id: input.registrationId,
          email: targetEmail,
          em_verified: true,
        });

      if (insertError) {
        throw new Error(insertError.message || "Could not create your contact email record.");
      }
    }

    const { error: registrationUpdateError } = await ctx.supabase
      .from("registrations")
      .update({ email_verified: true })
      .eq("registration_id", input.registrationId);

    if (registrationUpdateError) {
      throw new Error(registrationUpdateError.message || "Could not update your registration email verification.");
    }

    return {
      success: true,
      email: targetEmail,
      provider,
    };
  });
