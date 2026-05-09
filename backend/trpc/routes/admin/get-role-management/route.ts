import { ADMIN_TERMS_VERSION } from "../../../admin-terms";
import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

const MANAGED_ROLE_NAMES = [
  "country_admin",
  "country_coordinator",
  "club_coordinator",
  "event_organizer",
  "shop_manager",
  "junior_runners_club_coordinator",
  "golden_age_runners_club_coordinator",
  "treadmill_runners_club_coordinator",
  "para_runners_club_coordinator",
  "magazine_columnist_fitness_coach",
  "magazine_columnist_sports_journalist",
  "magazine_columnist_motivation_speaker",
] as const;

function getRoleName(row: any): string | null {
  const roleSource = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  return roleSource?.role_name ?? null;
}

export default publicProcedure.query(async ({ ctx }) => {
  await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
  });

  const [
    { data: assignments, error: assignmentsError },
    { data: invites, error: invitesError },
    { data: countries, error: countriesError },
    { data: clubs, error: clubsError },
    { data: organizers, error: organizersError },
  ] =
    await Promise.all([
      ctx.supabase
        .from("user_role_assignments")
        .select("assignment_id, user_id, role_id, country_code, club_id, organizer_id, assigned_by, created_at, is_active, roles(role_name)")
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      ctx.supabase
        .from("admin_invites")
        .select("invite_id, email, role_id, country_code, club_id, organizer_id, applicant_website_url, applicant_linkedin_url, applicant_social_url, invited_by, accepted_by, status, created_at, expires_at, roles(role_name)")
        .in("status", ["pending", "revoked"])
        .order("created_at", { ascending: false }),
      ctx.supabase
        .from("countries")
        .select("iso_alpha2, name")
        .order("name", { ascending: true }),
      ctx.supabase
        .from("clubs")
        .select("club_id, club_name, country")
        .order("club_name", { ascending: true }),
      ctx.supabase
        .from("event_organizers")
        .select("organizer_id, organizer_name, registration_id, country, is_active")
        .order("organizer_name", { ascending: true }),
    ]);

  if (assignmentsError) {
    throw new Error(assignmentsError.message || "Could not load role assignments.");
  }
  if (invitesError) {
    throw new Error(invitesError.message || "Could not load pending role requests.");
  }
  if (countriesError) {
    throw new Error(countriesError.message || "Could not load countries.");
  }
  if (clubsError) {
    throw new Error(clubsError.message || "Could not load clubs.");
  }
  if (organizersError) {
    throw new Error(organizersError.message || "Could not load event organizers.");
  }

  const filteredAssignments = (assignments ?? []).filter((row: any) => MANAGED_ROLE_NAMES.includes(getRoleName(row) as any));
  const filteredInvites = (invites ?? []).filter((row: any) => MANAGED_ROLE_NAMES.includes(getRoleName(row) as any));

  const profileIds = [
    ...new Set(
      [...filteredAssignments, ...filteredInvites]
        .flatMap((row: any) => [row.user_id, row.assigned_by, row.invited_by, row.accepted_by])
        .filter(Boolean)
    ),
  ];

  const { data: profiles, error: profilesError } = profileIds.length
    ? await ctx.supabase
        .from("profiles")
        .select("profile_id, username, display_name, registration_id")
        .in("profile_id", profileIds)
    : { data: [], error: null };

  if (profilesError) {
    throw new Error(profilesError.message || "Could not load admin profiles.");
  }

  const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.profile_id, profile]));
  const countryMap = new Map((countries ?? []).map((country: any) => [country.iso_alpha2, country]));
  const clubMap = new Map((clubs ?? []).map((club: any) => [club.club_id, club]));
  const organizerMap = new Map((organizers ?? []).map((organizer: any) => [organizer.organizer_id, organizer]));
  const assignmentUserIds = [...new Set(filteredAssignments.map((assignment: any) => assignment.user_id).filter(Boolean))];

  const { data: adminTermsRows, error: adminTermsError } = assignmentUserIds.length
    ? await ctx.supabase
        .from("admin_terms_acceptances")
        .select("user_id, accepted_at")
        .eq("terms_version", ADMIN_TERMS_VERSION)
        .in("user_id", assignmentUserIds)
    : { data: [], error: null };

  if (adminTermsError) {
    throw new Error(adminTermsError.message || "Could not load admin terms acceptance records.");
  }

  const termsAcceptanceMap = new Map((adminTermsRows ?? []).map((row: any) => [row.user_id, row]));

  return {
    pendingRequests: filteredInvites.map((invite: any) => ({
      inviteId: invite.invite_id,
      email: invite.email,
      roleName: getRoleName(invite),
      countryCode: invite.country_code ?? null,
      countryName: invite.country_code ? countryMap.get(invite.country_code)?.name ?? null : null,
      clubId: invite.club_id ?? null,
      clubName: invite.club_id ? clubMap.get(invite.club_id)?.club_name ?? null : null,
      organizerId: invite.organizer_id ?? null,
      organizerName: invite.organizer_id ? organizerMap.get(invite.organizer_id)?.organizer_name ?? null : null,
      websiteUrl: invite.applicant_website_url ?? null,
      linkedinUrl: invite.applicant_linkedin_url ?? null,
      socialUrl: invite.applicant_social_url ?? null,
      status: invite.status,
      createdAt: invite.created_at,
      expiresAt: invite.expires_at,
      invitedByName:
        profileMap.get(invite.invited_by)?.display_name ??
        profileMap.get(invite.invited_by)?.username ??
        null,
    })),
    activeAssignments: filteredAssignments.map((assignment: any) => ({
      assignmentId: assignment.assignment_id,
      userId: assignment.user_id,
      roleName: getRoleName(assignment),
      countryCode: assignment.country_code ?? null,
      countryName: assignment.country_code ? countryMap.get(assignment.country_code)?.name ?? null : null,
      clubId: assignment.club_id ?? null,
      clubName: assignment.club_id ? clubMap.get(assignment.club_id)?.club_name ?? null : null,
      organizerId: assignment.organizer_id ?? null,
      organizerName: assignment.organizer_id ? organizerMap.get(assignment.organizer_id)?.organizer_name ?? null : null,
      createdAt: assignment.created_at,
      hasAcceptedTerms: termsAcceptanceMap.has(assignment.user_id),
      termsAcceptedAt: termsAcceptanceMap.get(assignment.user_id)?.accepted_at ?? null,
      userName:
        profileMap.get(assignment.user_id)?.display_name ??
        profileMap.get(assignment.user_id)?.username ??
        assignment.user_id,
      username: profileMap.get(assignment.user_id)?.username ?? null,
      assignedByName:
        profileMap.get(assignment.assigned_by)?.display_name ??
        profileMap.get(assignment.assigned_by)?.username ??
        null,
    })),
    countries: (countries ?? []).map((country: any) => ({
      code: country.iso_alpha2,
      name: country.name,
    })),
    clubs: (clubs ?? []).map((club: any) => ({
      clubId: club.club_id,
      clubName: club.club_name,
      countryCode: club.country ?? null,
    })),
    organizers: (organizers ?? []).map((organizer: any) => ({
      organizerId: organizer.organizer_id,
      organizerName: organizer.organizer_name,
      registrationId: organizer.registration_id,
      countryCode: organizer.country ?? null,
      isActive: organizer.is_active !== false,
    })),
  };
});
