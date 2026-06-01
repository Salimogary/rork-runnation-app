import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

const inputSchema = z.object({
  action: z.enum(["verify_social_email", "create_missing_contact", "sync_usernames"]),
  authUserId: z.string().uuid().nullable().optional(),
  profileId: z.string().uuid().nullable().optional(),
  registrationId: z.string().uuid().nullable().optional(),
});

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function normalizeUsername(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function getSocialProvider(user: any): "google" | "apple" | null {
  const provider =
    user?.app_metadata?.provider ||
    user?.identities?.[0]?.provider ||
    null;

  return provider === "google" || provider === "apple" ? provider : null;
}

export default publicProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
    });

    const identifier = input.authUserId ?? input.profileId ?? input.registrationId ?? null;

    if (!identifier) {
      throw new Error("A target account identifier is required for this repair.");
    }

    const authUserId = input.authUserId ?? input.profileId ?? null;

    const authUser = authUserId
      ? (await ctx.supabase.auth.admin.getUserById(authUserId)).data.user ?? null
      : null;

    const profile = input.profileId || authUserId
      ? (
          await ctx.supabase
            .from("profiles")
            .select("profile_id, registration_id, username, display_name")
            .eq("profile_id", input.profileId ?? authUserId!)
            .maybeSingle()
        ).data ?? null
      : input.registrationId
      ? (
          await ctx.supabase
            .from("profiles")
            .select("profile_id, registration_id, username, display_name")
            .eq("registration_id", input.registrationId)
            .maybeSingle()
        ).data ?? null
      : null;

    const registrationId = input.registrationId ?? profile?.registration_id ?? null;

    const registration = registrationId
      ? (
          await ctx.supabase
            .from("registrations")
            .select("registration_id, username, email_verified")
            .eq("registration_id", registrationId)
            .maybeSingle()
        ).data ?? null
      : null;

    const contact = registrationId
      ? (
          await ctx.supabase
            .from("contacts")
            .select("contact_id, registration_id, email, em_verified")
            .eq("registration_id", registrationId)
            .maybeSingle()
        ).data ?? null
      : null;

    if (input.action === "verify_social_email") {
      if (!registrationId || !registration) {
        throw new Error("A linked registration is required before email flags can be repaired.");
      }

      const provider = getSocialProvider(authUser);
      if (!provider) {
        throw new Error("This repair is only available for Google or Apple sign-in accounts.");
      }

      const [registrationUpdate, contactUpdate] = await Promise.all([
        ctx.supabase
          .from("registrations")
          .update({ email_verified: true })
          .eq("registration_id", registrationId),
        ctx.supabase
          .from("contacts")
          .update({ em_verified: true })
          .eq("registration_id", registrationId),
      ]);

      if (registrationUpdate.error) {
        throw new Error(registrationUpdate.error.message || "Could not update registration email verification.");
      }
      if (contactUpdate.error) {
        throw new Error(contactUpdate.error.message || "Could not update contact email verification.");
      }

      await logAdminAction(ctx, {
        actorUserId: actor.authUserId,
        targetUserId: profile?.profile_id ?? authUserId ?? null,
        actionType: "account_link_repair_verified_social_email",
        metadata: {
          registrationId,
          provider,
        },
      });

      return { success: true, message: "Social sign-in email flags were marked as verified." };
    }

    if (input.action === "create_missing_contact") {
      if (!registrationId || !registration) {
        throw new Error("A linked registration is required before a contact can be created.");
      }

      if (contact?.contact_id) {
        throw new Error("This account already has a contact row.");
      }

      const email = normalizeEmail(authUser?.email);
      if (!email) {
        throw new Error("This auth account does not have an email address to copy into contacts.");
      }

      const provider = getSocialProvider(authUser);
      const { error: insertError } = await ctx.supabase
        .from("contacts")
        .insert({
          registration_id: registrationId,
          email,
          em_verified: provider === "google" || provider === "apple",
        });

      if (insertError) {
        throw new Error(insertError.message || "Could not create the missing contact row.");
      }

      await logAdminAction(ctx, {
        actorUserId: actor.authUserId,
        targetUserId: profile?.profile_id ?? authUserId ?? null,
        actionType: "account_link_repair_created_contact",
        metadata: {
          registrationId,
          email,
        },
      });

      return { success: true, message: "Missing contact row created from the auth email." };
    }

    if (!profile?.profile_id || !registrationId || !registration) {
      throw new Error("A linked profile and registration are required before usernames can be synchronized.");
    }

    const targetUsername = normalizeUsername(registration.username) || normalizeUsername(profile.username);
    if (!targetUsername) {
      throw new Error("This account does not have a username to synchronize.");
    }

    const [{ data: profileConflict }, { data: registrationConflict }] = await Promise.all([
      ctx.supabase
        .from("profiles")
        .select("profile_id")
        .eq("username", targetUsername)
        .neq("profile_id", profile.profile_id)
        .maybeSingle(),
      ctx.supabase
        .from("registrations")
        .select("registration_id")
        .eq("username", targetUsername)
        .neq("registration_id", registrationId)
        .maybeSingle(),
    ]);

    if (profileConflict || registrationConflict) {
      throw new Error("That username is already used by another account, so it cannot be auto-synced safely.");
    }

    const [profileUpdate, registrationUpdate] = await Promise.all([
      ctx.supabase
        .from("profiles")
        .update({ username: targetUsername })
        .eq("profile_id", profile.profile_id),
      ctx.supabase
        .from("registrations")
        .update({ username: targetUsername })
        .eq("registration_id", registrationId),
    ]);

    if (profileUpdate.error) {
      throw new Error(profileUpdate.error.message || "Could not update the profile username.");
    }
    if (registrationUpdate.error) {
      throw new Error(registrationUpdate.error.message || "Could not update the registration username.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      targetUserId: profile.profile_id,
      actionType: "account_link_repair_synced_usernames",
      metadata: {
        registrationId,
        username: targetUsername,
      },
    });

    return { success: true, message: "Profile and registration usernames are back in sync." };
  });

