import { randomUUID } from "crypto";
import { publicProcedure } from "../../../create-context";

type AuthMetadata = Record<string, unknown>;

function metadataString(metadata: AuthMetadata, keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function sanitizeUsername(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/@.*$/, "")
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);

  return cleaned || `runner_${randomUUID().slice(0, 8)}`;
}

async function usernameExists(
  ctx: { supabase: any },
  username: string,
  currentProfileId?: string
): Promise<boolean> {
  let profileQuery = ctx.supabase
    .from("profiles")
    .select("id")
    .eq("username", username);

  if (currentProfileId) {
    profileQuery = profileQuery.neq("id", currentProfileId);
  }

  const [{ data: registration }, { data: profile }] = await Promise.all([
    ctx.supabase
      .from("registrations")
      .select("registration_id")
      .eq("username", username)
      .maybeSingle(),
    profileQuery.maybeSingle(),
  ]);

  return Boolean(registration || profile);
}

async function buildUniqueUsername(
  ctx: { supabase: any },
  seed: string,
  currentProfileId?: string
): Promise<string> {
  const base = sanitizeUsername(seed);

  if (!(await usernameExists(ctx, base, currentProfileId))) {
    return base;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${base.slice(0, 20)}_${randomUUID().slice(0, 6)}`;
    if (!(await usernameExists(ctx, candidate, currentProfileId))) {
      return candidate;
    }
  }

  return `runner_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export default publicProcedure.mutation(async ({ ctx }) => {
  if (!ctx.authUserId) {
    throw new Error("You must be signed in to finish social registration.");
  }

  const { data: authUserResult, error: authUserError } =
    await ctx.supabase.auth.admin.getUserById(ctx.authUserId);

  if (authUserError || !authUserResult.user) {
    throw new Error(authUserError?.message || "Could not load your social account.");
  }

  const authUser = authUserResult.user;
  const metadata = (authUser.user_metadata ?? {}) as AuthMetadata;
  const provider =
    authUser.app_metadata?.provider ||
    authUser.identities?.[0]?.provider ||
    null;
  const isTrustedSocialProvider = provider === "google" || provider === "apple";
  const email = authUser.email?.trim().toLowerCase() ?? null;

  const { data: existingProfile, error: existingProfileError } = await ctx.supabase
    .from("profiles")
    .select("profile_id, registration_id, username, display_name")
    .eq("profile_id", ctx.authUserId)
    .maybeSingle();

  if (existingProfileError) {
    throw new Error(existingProfileError.message || "Could not check your profile.");
  }

  if (existingProfile?.registration_id) {
    if (isTrustedSocialProvider) {
      await Promise.all([
        ctx.supabase
          .from("registrations")
          .update({ email_verified: true })
          .eq("registration_id", existingProfile.registration_id),
        ctx.supabase
          .from("contacts")
          .update({ em_verified: true })
          .eq("registration_id", existingProfile.registration_id),
      ]);
    }

    return {
      registrationId: existingProfile.registration_id,
      profileId: existingProfile.profile_id,
      username: existingProfile.username,
      created: false,
    };
  }

  const displayName =
    metadataString(metadata, ["full_name", "name", "display_name"]) ??
    email?.split("@")[0] ??
    "RunNation Runner";
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? "Runner";
  const otherNames = nameParts.slice(1).join(" ") || "RunNation";
  const username = await buildUniqueUsername(
    ctx,
    existingProfile?.username ??
      metadataString(metadata, ["preferred_username", "user_name", "username"]) ??
      email ??
      displayName,
    ctx.authUserId
  );
  const avatarUrl = metadataString(metadata, ["avatar_url", "picture"]);
  const registrationId = randomUUID();

  const { error: registrationError } = await ctx.supabase.from("registrations").insert({
    registration_id: registrationId,
    first_name: firstName,
    other_names: otherNames,
    username,
    email_verified: isTrustedSocialProvider,
  });

  if (registrationError) {
    throw new Error(registrationError.message || "Could not create your RunNation account.");
  }

  if (email) {
    const { data: existingContact } = await ctx.supabase
      .from("contacts")
      .select("contact_id")
      .eq("registration_id", registrationId)
      .maybeSingle();

    if (!existingContact) {
      const { error: contactError } = await ctx.supabase.from("contacts").insert({
        registration_id: registrationId,
        email,
        em_verified: isTrustedSocialProvider,
      });

      if (contactError) {
        throw new Error(contactError.message || "Could not save your email contact.");
      }
    } else if (isTrustedSocialProvider) {
      const { error: contactUpdateError } = await ctx.supabase
        .from("contacts")
        .update({ em_verified: true })
        .eq("registration_id", registrationId);

      if (contactUpdateError) {
        throw new Error(contactUpdateError.message || "Could not update your email contact verification.");
      }
    }
  }

  const { error: profileError } = await ctx.supabase.from("profiles").upsert({
    profile_id: ctx.authUserId,
    registration_id: registrationId,
    username,
    display_name: displayName,
    avatar_url: avatarUrl,
  });

  if (profileError) {
    throw new Error(profileError.message || "Could not link your RunNation profile.");
  }

  const { data: userRole } = await ctx.supabase
    .from("roles")
    .select("role_id")
    .eq("role_name", "user")
    .maybeSingle();

  if (userRole?.role_id) {
    await ctx.supabase.from("user_role_assignments").upsert({
      user_id: ctx.authUserId,
      role_id: userRole.role_id,
      is_active: true,
    });
  }

  return {
    registrationId,
    profileId: ctx.authUserId,
    username,
    created: true,
  };
});
