import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

const COUNTRY_TEAM_ROLES = new Set(["club_coordinator", "event_organizer", "shop_manager"]);
const MAGAZINE_TEAM_ROLES = new Set([
  "magazine_columnist_fitness_coach",
  "magazine_columnist_sports_journalist",
  "magazine_columnist_motivation_speaker",
]);

function getRoleName(row: any): string | null {
  const roleSource = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  return roleSource?.role_name ?? null;
}

export default publicProcedure.query(async ({ ctx }) => {
  const actor = await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryAdmin: true,
    allowCountryCoordinator: true,
    allowMagazineEditor: true,
  });

  const actorCountries = actor.roles
    .filter((role) => role.roleName === "country_admin" || role.roleName === "country_coordinator")
    .map((role) => role.countryCode)
    .filter((countryCode): countryCode is string => Boolean(countryCode));

  const [
    { data: assignments, error: assignmentsError },
    { data: invites, error: invitesError },
    { data: profiles, error: profilesError },
    { data: registrations, error: registrationsError },
    { data: clubs, error: clubsError },
    { data: organizers, error: organizersError },
    { data: countries, error: countriesError },
  ] = await Promise.all([
    ctx.supabase
      .from("user_role_assignments")
      .select("assignment_id, user_id, role_id, country_code, club_id, organizer_id, created_at, is_active, roles(role_name)")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    ctx.supabase
      .from("admin_invites")
      .select("invite_id, email, role_id, country_code, club_id, organizer_id, applicant_website_url, applicant_linkedin_url, applicant_social_url, applicant_statement, applicant_contact_consent, applicant_contact_instructions, accepted_by, status, created_at, roles(role_name)")
      .order("created_at", { ascending: false }),
    ctx.supabase.from("profiles").select("profile_id, username, display_name, registration_id"),
    ctx.supabase.from("registrations").select("registration_id, country"),
    ctx.supabase.from("clubs").select("club_id, club_name, country"),
    ctx.supabase.from("event_organizers").select("organizer_id, organizer_name, country"),
    ctx.supabase.from("countries").select("iso_alpha2, name"),
  ]);

  if (assignmentsError) throw new Error(assignmentsError.message || "Could not load team assignments.");
  if (invitesError) throw new Error(invitesError.message || "Could not load team applications.");
  if (profilesError) throw new Error(profilesError.message || "Could not load team profiles.");
  if (registrationsError) throw new Error(registrationsError.message || "Could not load team registration countries.");
  if (clubsError) throw new Error(clubsError.message || "Could not load clubs.");
  if (organizersError) throw new Error(organizersError.message || "Could not load organizers.");
  if (countriesError) throw new Error(countriesError.message || "Could not load countries.");

  const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.profile_id, profile]));
  const registrationMap = new Map((registrations ?? []).map((registration: any) => [registration.registration_id, registration]));
  const clubMap = new Map((clubs ?? []).map((club: any) => [club.club_id, club]));
  const organizerMap = new Map((organizers ?? []).map((organizer: any) => [organizer.organizer_id, organizer]));
  const countryMap = new Map((countries ?? []).map((country: any) => [country.iso_alpha2, country.name]));
  const acceptedInvites = (invites ?? []).filter((invite: any) => invite.status === "accepted");

  const findApplication = (assignment: any, roleName: string | null, countryCode: string | null) => {
    return acceptedInvites.find((invite: any) => {
      if (getRoleName(invite) !== roleName) return false;
      if (assignment.club_id && invite.club_id && assignment.club_id !== invite.club_id) return false;
      if (assignment.organizer_id && invite.organizer_id && assignment.organizer_id !== invite.organizer_id) return false;
      if (countryCode && invite.country_code && countryCode !== invite.country_code) return false;
      return true;
    }) ?? null;
  };

  const includeRole = (roleName: string | null, countryCode: string | null) => {
    if (!roleName) return false;
    if (actor.isSuperAdmin) return COUNTRY_TEAM_ROLES.has(roleName) || MAGAZINE_TEAM_ROLES.has(roleName);
    if (actor.isMagazineEditor) return MAGAZINE_TEAM_ROLES.has(roleName);
    if ((actor.isCountryAdmin || actor.isCountryCoordinator) && COUNTRY_TEAM_ROLES.has(roleName)) {
      return actorCountries.length === 0 || (!!countryCode && actorCountries.includes(countryCode));
    }
    return false;
  };

  const members = (assignments ?? [])
    .map((assignment: any) => {
      const roleName = getRoleName(assignment);
      const club = assignment.club_id ? clubMap.get(assignment.club_id) : null;
      const organizer = assignment.organizer_id ? organizerMap.get(assignment.organizer_id) : null;
      const countryCode = assignment.country_code ?? club?.country ?? organizer?.country ?? null;

      if (!includeRole(roleName, countryCode)) return null;

      const profile = profileMap.get(assignment.user_id);
      const registration = registrationMap.get(profile?.registration_id ?? assignment.user_id);
      const userCountryCode = registration?.country ?? null;
      const invite = findApplication(assignment, roleName, countryCode);

      return {
        assignmentId: assignment.assignment_id,
        userId: assignment.user_id,
        name: profile?.display_name ?? profile?.username ?? invite?.email ?? assignment.user_id,
        username: profile?.username ?? null,
        email: invite?.email ?? null,
        roleName,
        countryCode,
        countryName: countryCode ? countryMap.get(countryCode) ?? countryCode : null,
        userCountryCode,
        userCountryName: userCountryCode ? countryMap.get(userCountryCode) ?? userCountryCode : null,
        clubName: club?.club_name ?? null,
        organizerName: organizer?.organizer_name ?? null,
        websiteUrl: invite?.applicant_website_url ?? null,
        linkedinUrl: invite?.applicant_linkedin_url ?? null,
        socialUrl: invite?.applicant_social_url ?? null,
        applicantStatement: invite?.applicant_statement ?? null,
        contactConsent: invite?.applicant_contact_consent === true,
        contactInstructions: invite?.applicant_contact_instructions ?? null,
        assignedAt: assignment.created_at,
      };
    })
    .filter(Boolean);

  return {
    members,
  };
});

