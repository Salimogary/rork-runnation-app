import { publicProcedure } from "../../../create-context";

function normalizeCountryCode(country?: string | null) {
  const value = String(country || "").trim().toLowerCase();
  if (!value) return null;
  if (["ug", "uga", "uganda"].includes(value)) return "UG";
  if (["ke", "ken", "kenya"].includes(value)) return "KE";
  if (["tz", "tza", "tanzania"].includes(value)) return "TZ";
  if (["rw", "rwa", "rwanda"].includes(value)) return "RW";
  return value.slice(0, 2).toUpperCase();
}

function roleLabel(roleName: string) {
  switch (roleName) {
    case "super_admin":
      return "Global Admin";
    case "country_admin":
      return "Country Admin";
    case "country_coordinator":
      return "Country Coordinator";
    case "event_organizer":
      return "Event Organizer";
    default:
      return roleName;
  }
}

const SUPPORT_ROLE_NAMES = new Set(["super_admin", "country_admin", "country_coordinator"]);

function supportRolePriority(roleName: string) {
  switch (roleName) {
    case "super_admin":
      return 0;
    case "country_admin":
      return 1;
    case "country_coordinator":
      return 2;
    default:
      return 99;
  }
}

export default publicProcedure.query(async ({ ctx }) => {
  let actorCountryCode: string | null = null;

  if (ctx.authUserId) {
    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("registration_id")
      .eq("profile_id", ctx.authUserId)
      .maybeSingle();

    if (profile?.registration_id) {
      const { data: registration } = await ctx.supabase
        .from("registrations")
        .select("country")
        .eq("registration_id", profile.registration_id)
        .maybeSingle();

      actorCountryCode = normalizeCountryCode(registration?.country);
    }
  }

  const { data: assignments, error } = await ctx.supabase
    .from("user_role_assignments")
    .select("assignment_id, user_id, country_code, roles(role_name)")
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message || "Could not load admin contacts.");
  }

  const filteredAssignments = (assignments ?? [])
    .map((row: any) => {
      const roleSource = Array.isArray(row.roles) ? row.roles[0] : row.roles;
      const roleName = roleSource?.role_name as string | undefined;
      if (!roleName || !SUPPORT_ROLE_NAMES.has(roleName)) {
        return null;
      }
      return {
        assignmentId: row.assignment_id,
        userId: row.user_id as string,
        countryCode: row.country_code as string | null,
        roleName,
      };
    })
    .filter(Boolean) as Array<{
      assignmentId: number;
      userId: string;
      countryCode: string | null;
      roleName: string;
    }>;

  const userIds = [...new Set(filteredAssignments.map((item) => item.userId))];
  if (userIds.length === 0) {
    return [];
  }

  const { data: profiles, error: profilesError } = await ctx.supabase
    .from("profiles")
    .select("profile_id, registration_id, display_name, username")
    .in("profile_id", userIds);

  if (profilesError) {
    throw new Error(profilesError.message || "Could not load admin profiles.");
  }

  const profileById = new Map((profiles ?? []).map((profile: any) => [profile.profile_id, profile]));
  const registrationIds = [...new Set((profiles ?? []).map((profile: any) => profile.registration_id).filter(Boolean))];

  const [{ data: registrations, error: registrationsError }, { data: contacts, error: contactsError }] =
    await Promise.all([
      registrationIds.length
        ? ctx.supabase
            .from("registrations")
            .select("registration_id, first_name, other_names, country")
            .in("registration_id", registrationIds)
        : Promise.resolve({ data: [], error: null }),
      registrationIds.length
        ? ctx.supabase
            .from("contacts")
            .select("registration_id, phone, full_phone, email")
            .in("registration_id", registrationIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (registrationsError) {
    throw new Error(registrationsError.message || "Could not load admin registrations.");
  }

  if (contactsError) {
    throw new Error(contactsError.message || "Could not load admin contact details.");
  }

  const registrationById = new Map((registrations ?? []).map((registration: any) => [registration.registration_id, registration]));
  const contactByRegistrationId = new Map((contacts ?? []).map((contact: any) => [contact.registration_id, contact]));

  const contactsResult = filteredAssignments
    .map((assignment) => {
      const profile = profileById.get(assignment.userId);
      const registration = profile?.registration_id
        ? registrationById.get(profile.registration_id)
        : null;
      const contact = profile?.registration_id
        ? contactByRegistrationId.get(profile.registration_id)
        : null;

      const fallbackName = [registration?.first_name, registration?.other_names].filter(Boolean).join(" ").trim();
      const displayName = profile?.display_name || fallbackName || profile?.username || "RunNation Admin";
      const effectiveCountryCode =
        assignment.roleName === "super_admin"
          ? null
          : normalizeCountryCode(assignment.countryCode || registration?.country);

      return {
        id: `${assignment.assignmentId}`,
        roleName: assignment.roleName,
        roleLabel: roleLabel(assignment.roleName),
        countryCode: effectiveCountryCode,
        countryLabel: assignment.roleName === "super_admin" ? "All Countries" : effectiveCountryCode || registration?.country || "Unspecified",
        name: displayName,
        phone: contact?.full_phone ? String(contact.full_phone) : contact?.phone ? String(contact.phone) : null,
        email: contact?.email ? String(contact.email) : null,
      };
    })
    .sort((a, b) => {
      const aPriority = supportRolePriority(a.roleName);
      const bPriority = supportRolePriority(b.roleName);
      if (aPriority !== bPriority) return aPriority - bPriority;
      return `${a.countryLabel} ${a.name}`.localeCompare(`${b.countryLabel} ${b.name}`);
    });

  const globalAdmin = contactsResult.find((contact) => contact.roleName === "super_admin") ?? null;
  const countryAdmin = actorCountryCode
    ? contactsResult.find(
        (contact) =>
          contact.countryCode === actorCountryCode &&
          (contact.roleName === "country_admin" || contact.roleName === "country_coordinator")
      ) ?? null
    : null;

  if (!countryAdmin) {
    return globalAdmin ? [globalAdmin] : [];
  }

  if (!globalAdmin || globalAdmin.id === countryAdmin.id) {
    return [countryAdmin];
  }

  return [countryAdmin, globalAdmin];
});
