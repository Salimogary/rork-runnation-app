import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

type HealthSeverity = "critical" | "warning";

type AccountHealthIssue = {
  code: string;
  message: string;
};

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function getSocialProvider(user: any): string | null {
  const provider =
    user?.app_metadata?.provider ||
    user?.identities?.[0]?.provider ||
    null;
  return provider === "google" || provider === "apple" ? provider : null;
}

async function listAllAuthUsers(supabase: any): Promise<any[]> {
  const users: any[] = [];
  const perPage = 200;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message || "Could not load auth users.");
    }

    const batch = data?.users ?? [];
    users.push(...batch);

    if (batch.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
}

type UuidPkDefaultHealthRow = {
  table_name: string;
  column_name: string;
  default_expression: string | null;
  has_default: boolean;
};

export default publicProcedure.query(async ({ ctx }) => {
  await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
  });

  const authUsers = await listAllAuthUsers(ctx.supabase);

  const [
    { data: profiles, error: profilesError },
    { data: registrations, error: registrationsError },
    { data: contacts, error: contactsError },
    { data: uuidPkHealthRows, error: uuidPkHealthError },
  ] =
    await Promise.all([
      ctx.supabase
        .from("profiles")
        .select("profile_id, registration_id, username, display_name"),
      ctx.supabase
        .from("registrations")
        .select("registration_id, username, first_name, other_names, email_verified"),
      ctx.supabase
        .from("contacts")
        .select("registration_id, email, em_verified"),
      ctx.supabase.rpc("get_uuid_pk_default_health"),
    ]);

  if (profilesError) {
    throw new Error(profilesError.message || "Could not load profiles.");
  }
  if (registrationsError) {
    throw new Error(registrationsError.message || "Could not load registrations.");
  }
  if (contactsError) {
    throw new Error(contactsError.message || "Could not load contacts.");
  }
  if (uuidPkHealthError) {
    throw new Error(uuidPkHealthError.message || "Could not load schema health.");
  }

  const authUserMap = new Map(authUsers.map((user) => [user.id, user]));
  const profileById = new Map((profiles ?? []).map((profile: any) => [profile.profile_id, profile]));
  const profileByRegistrationId = new Map(
    (profiles ?? [])
      .filter((profile: any) => profile.registration_id)
      .map((profile: any) => [profile.registration_id, profile])
  );
  const registrationById = new Map((registrations ?? []).map((registration: any) => [registration.registration_id, registration]));
  const contactByRegistrationId = new Map((contacts ?? []).map((contact: any) => [contact.registration_id, contact]));

  const issues: Array<{
    key: string;
    severity: HealthSeverity;
    authUserId: string | null;
    profileId: string | null;
    registrationId: string | null;
    provider: string | null;
    authEmail: string | null;
    contactEmail: string | null;
    displayName: string | null;
    username: string | null;
    issueCount: number;
    issues: AccountHealthIssue[];
  }> = [];

  for (const authUser of authUsers) {
    const socialProvider = getSocialProvider(authUser);
    const profile = profileById.get(authUser.id);
    const registration = profile?.registration_id
      ? registrationById.get(profile.registration_id)
      : null;
    const contact = registration ? contactByRegistrationId.get(registration.registration_id) : null;
    const authEmail = normalizeEmail(authUser.email);
    const contactEmail = normalizeEmail(contact?.email);
    const entryIssues: AccountHealthIssue[] = [];

    if (!profile) {
      entryIssues.push({
        code: "missing_profile",
        message: "Auth user is missing a linked profile record.",
      });
    }

    if (profile && !registration) {
      entryIssues.push({
        code: "missing_registration",
        message: "Linked profile is missing its registration record.",
      });
    }

    if (registration && !contact && authEmail) {
      entryIssues.push({
        code: "missing_contact",
        message: "Registration has no contact row for the signed-in email.",
      });
    }

    if (socialProvider && registration && registration.email_verified !== true) {
      entryIssues.push({
        code: "registration_email_unverified",
        message: `${socialProvider === "apple" ? "Apple" : "Google"} sign-in should mark registration email as verified.`,
      });
    }

    if (socialProvider && contact && contact.em_verified !== true) {
      entryIssues.push({
        code: "contact_email_unverified",
        message: `${socialProvider === "apple" ? "Apple" : "Google"} sign-in should mark contact email as verified.`,
      });
    }

    if (authEmail && contactEmail && authEmail !== contactEmail) {
      entryIssues.push({
        code: "email_mismatch",
        message: "Auth email and contact email do not match.",
      });
    }

    if (profile && registration && profile.username && registration.username && profile.username !== registration.username) {
      entryIssues.push({
        code: "username_mismatch",
        message: "Profile username and registration username do not match.",
      });
    }

    if (entryIssues.length > 0) {
      issues.push({
        key: authUser.id,
        severity: entryIssues.some((issue) =>
          ["missing_profile", "missing_registration", "missing_contact"].includes(issue.code)
        )
          ? "critical"
          : "warning",
        authUserId: authUser.id,
        profileId: profile?.profile_id ?? null,
        registrationId: profile?.registration_id ?? null,
        provider: socialProvider,
        authEmail,
        contactEmail,
        displayName: profile?.display_name ?? authUser.user_metadata?.full_name ?? authEmail,
        username: profile?.username ?? registration?.username ?? null,
        issueCount: entryIssues.length,
        issues: entryIssues,
      });
    }
  }

  for (const profile of profiles ?? []) {
    if (authUserMap.has(profile.profile_id)) {
      continue;
    }

    issues.push({
      key: `orphan-profile-${profile.profile_id}`,
      severity: "critical",
      authUserId: null,
      profileId: profile.profile_id,
      registrationId: profile.registration_id ?? null,
      provider: null,
      authEmail: null,
      contactEmail: profile.registration_id
        ? normalizeEmail(contactByRegistrationId.get(profile.registration_id)?.email)
        : null,
      displayName: profile.display_name ?? null,
      username: profile.username ?? null,
      issueCount: 1,
      issues: [
        {
          code: "orphan_profile",
          message: "Profile points to a linked account, but the auth user no longer exists.",
        },
      ],
    });
  }

  for (const registration of registrations ?? []) {
    const linkedProfile = profileByRegistrationId.get(registration.registration_id);
    const contact = contactByRegistrationId.get(registration.registration_id);
    const hasLoginEmail = normalizeEmail(contact?.email);

    if (!linkedProfile && hasLoginEmail) {
      issues.push({
        key: `unlinked-registration-${registration.registration_id}`,
        severity: "warning",
        authUserId: null,
        profileId: null,
        registrationId: registration.registration_id,
        provider: null,
        authEmail: null,
        contactEmail: hasLoginEmail,
        displayName:
          [registration.first_name, registration.other_names].filter(Boolean).join(" ").trim() ||
          registration.username ||
          registration.registration_id,
        username: registration.username ?? null,
        issueCount: 1,
        issues: [
          {
            code: "unlinked_registration",
            message: "Registration has a contact email but no linked auth/profile record yet.",
          },
        ],
      });
    }
  }

  for (const row of (uuidPkHealthRows ?? []) as UuidPkDefaultHealthRow[]) {
    issues.push({
      key: `schema-uuid-default-${row.table_name}-${row.column_name}`,
      severity: "warning",
      authUserId: null,
      profileId: null,
      registrationId: null,
      provider: null,
      authEmail: null,
      contactEmail: null,
      displayName: `Schema: ${row.table_name}`,
      username: null,
      issueCount: 1,
      issues: [
        {
          code: "uuid_pk_missing_default",
          message: `Primary key column ${row.table_name}.${row.column_name} is UUID but has no default generator.`,
        },
      ],
    });
  }

  const criticalCount = issues.filter((issue) => issue.severity === "critical").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const schemaIssueCount = (uuidPkHealthRows ?? []).length;

  return {
    summary: {
      authUserCount: authUsers.length,
      profileCount: profiles?.length ?? 0,
      registrationCount: registrations?.length ?? 0,
      contactCount: contacts?.length ?? 0,
      schemaIssueCount,
      issueCount: issues.length,
      criticalCount,
      warningCount,
    },
    issues: issues.sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === "critical" ? -1 : 1;
      }
      return (a.displayName || "").localeCompare(b.displayName || "");
    }),
  };
});
