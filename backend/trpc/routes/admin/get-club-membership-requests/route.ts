import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

function normalizeClubName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeCountryValue(
  value: string | null | undefined,
  countryMap: Map<string, string>
): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (countryMap.has(upper)) return upper;
  const byName = [...countryMap.entries()].find(([, name]) => name.toLowerCase() === raw.toLowerCase());
  return byName?.[0] ?? null;
}

export default publicProcedure.query(async ({ ctx }) => {
  const actor = await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryAdmin: true,
    allowCountryCoordinator: true,
    allowClubCoordinator: true,
  });

  const coordinatorClubIds = actor.roles
    .filter((role) => role.roleName === "club_coordinator" && role.clubId)
    .map((role) => role.clubId as string);
  const countryCodes = actor.roles
    .filter((role) => (role.roleName === "country_admin" || role.roleName === "country_coordinator") && role.countryCode)
    .map((role) => role.countryCode as string);
  const countryAdminCodes = actor.roles
    .filter((role) => role.roleName === "country_admin" && role.countryCode)
    .map((role) => role.countryCode as string);

  const { data: countries } = await ctx.supabase
    .from("countries")
    .select("iso_alpha2, name");

  const countryMap = new Map(
    (countries ?? []).map((country: any) => [String(country.iso_alpha2).toUpperCase(), String(country.name)])
  );

  let clubsQuery = ctx.supabase
    .from("clubs")
    .select("club_id, club_name, country, location");

  if (!actor.isSuperAdmin) {
    if (coordinatorClubIds.length > 0) {
      clubsQuery = clubsQuery.in("club_id", coordinatorClubIds);
    } else if (countryCodes.length > 0) {
      clubsQuery = clubsQuery.in("country", countryCodes);
    } else {
      return [];
    }
  }

  const { data: clubs, error: clubsError } = await clubsQuery;

  if (clubsError) {
    throw new Error(clubsError.message || "Could not load coordinator clubs.");
  }

  const visibleClubIds = new Set((clubs ?? []).map((club: any) => club.club_id).filter(Boolean));
  const visibleClubNames = new Set((clubs ?? []).map((club: any) => normalizeClubName(club.club_name)).filter(Boolean));

  if (!actor.isSuperAdmin && visibleClubIds.size === 0 && visibleClubNames.size === 0) {
    return [];
  }

  const { data: requests, error: requestsError } = await ctx.supabase
    .from("club_membership_request")
    .select("*")
    .order("created_at", { ascending: false });

  if (requestsError) {
    throw new Error(requestsError.message || "Could not load club membership requests.");
  }

  const registrationIds = [...new Set((requests ?? []).map((request: any) => request.registration_id).filter(Boolean))];
  const { data: registrations } = registrationIds.length > 0
    ? await ctx.supabase
        .from("registrations")
        .select("registration_id, first_name, other_names, username, country, city_town_district")
        .in("registration_id", registrationIds)
    : { data: [] };

  const registrationMap = new Map(
    (registrations ?? []).map((registration: any) => [registration.registration_id, registration])
  );

  const clubMap = new Map((clubs ?? []).map((club: any) => [club.club_id, club]));
  const clubNameMap = new Map((clubs ?? []).map((club: any) => [normalizeClubName(club.club_name), club]));

  return (requests ?? [])
    .filter((request: any) => {
      if (actor.isSuperAdmin) return true;
      if (request.request_type === "event_organizer") {
        const requestCountry = normalizeCountryValue(request.proposed_country, countryMap);
        return !!(requestCountry && countryAdminCodes.includes(requestCountry));
      }
      if (request.request_type === "start_club") {
        const requestCountry = normalizeCountryValue(request.proposed_country, countryMap);
        return !!(requestCountry && countryCodes.includes(requestCountry));
      }
      return (
        (request.club_id && visibleClubIds.has(request.club_id)) ||
        visibleClubNames.has(normalizeClubName(request.club))
      );
    })
    .map((request: any) => {
      const club = request.club_id
        ? clubMap.get(request.club_id)
        : clubNameMap.get(normalizeClubName(request.club));

      return {
        ...request,
        club_id: request.club_id ?? club?.club_id ?? null,
        club_name: club?.club_name ?? request.club ?? null,
        club_country: club?.country ?? null,
        club_location: club?.location ?? null,
        request_type: request.request_type ?? "membership",
        proposed_club_name: request.proposed_club_name ?? null,
        proposed_country: request.proposed_country ?? null,
        proposed_description: request.proposed_description ?? null,
        member: registrationMap.get(request.registration_id) ?? null,
      };
    });
});
