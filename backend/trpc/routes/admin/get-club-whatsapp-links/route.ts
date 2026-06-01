import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

function isMissingSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("does not exist") || message.includes("schema cache") || message.includes("relation");
}

const SPECIAL_CLUB_CODE_BY_COORDINATOR_ROLE: Record<string, string> = {
  junior_runners_club_coordinator: "junior_runners",
  golden_age_runners_club_coordinator: "golden_age_runners",
  treadmill_runners_club_coordinator: "treadmill_runners",
  para_runners_club_coordinator: "para_runners",
  smartfit_club_coordinator: "smartfit_club",
};

export default publicProcedure.query(async ({ ctx }) => {
  const actor = await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryAdmin: true,
    allowCountryCoordinator: true,
    allowClubCoordinator: true,
    allowSpecialClubCoordinator: true,
  });

  const coordinatorClubIds = actor.roles
    .filter((role) => role.roleName === "club_coordinator" && role.clubId)
    .map((role) => role.clubId as string);
  const countryCodes = actor.roles
    .filter((role) => (role.roleName === "country_admin" || role.roleName === "country_coordinator") && role.countryCode)
    .map((role) => role.countryCode as string);
  const specialClubCodes = actor.roles
    .map((role) => SPECIAL_CLUB_CODE_BY_COORDINATOR_ROLE[role.roleName])
    .filter(Boolean);

  let shouldLoadClubs = true;
  let clubsQuery = ctx.supabase
    .from("clubs")
    .select("club_id, club_name, country")
    .order("club_name", { ascending: true });

  if (!actor.isSuperAdmin) {
    if (coordinatorClubIds.length > 0) {
      clubsQuery = clubsQuery.in("club_id", coordinatorClubIds);
    } else if (specialClubCodes.length > 0) {
      clubsQuery = clubsQuery.in("special_club_code", specialClubCodes);
    } else if (countryCodes.length > 0) {
      clubsQuery = clubsQuery.in("country", countryCodes);
    } else {
      shouldLoadClubs = false;
    }
  }

  const { data: clubs, error: clubsError } = shouldLoadClubs
    ? await clubsQuery
    : { data: [], error: null };
  if (clubsError) {
    throw new Error(clubsError.message || "Could not load clubs.");
  }

  const clubIds = (clubs ?? []).map((club: any) => club.club_id).filter(Boolean);
  const [{ data: links, error: linksError }, { data: globalLinks, error: globalLinksError }] = await Promise.all([
    clubIds.length > 0
    ? ctx.supabase
        .from("club_whatsap_link")
        .select("link_id, club_id, club_name, link")
        .in("club_id", clubIds)
    : { data: [], error: null },
    ctx.supabase
      .from("admin_whatsapp_links")
      .select("link_type, link, updated_at"),
  ]);

  if (linksError) {
    if (isMissingSchemaError(linksError)) {
      return {
        clubs: (clubs ?? []).map((club: any) => ({
          clubId: club.club_id,
          clubName: club.club_name,
          country: club.country ?? null,
        })),
        links: [],
        globalLinks: [],
      };
    }
    throw new Error(linksError.message || "Could not load WhatsApp links.");
  }

  if (globalLinksError && !isMissingSchemaError(globalLinksError)) {
    throw new Error(globalLinksError.message || "Could not load admin WhatsApp links.");
  }

  const allowedGlobalLinkTypes = new Set<string>(["service_team"]);
  if (actor.isSuperAdmin || actor.isCountryAdmin || actor.isCountryCoordinator) {
    allowedGlobalLinkTypes.add("admins");
  }

  return {
    clubs: (clubs ?? []).map((club: any) => ({
      clubId: club.club_id,
      clubName: club.club_name,
      country: club.country ?? null,
    })),
    links: (links ?? []).map((link: any) => ({
      linkId: link.link_id,
      clubId: link.club_id,
      clubName: link.club_name,
      link: link.link,
    })),
    globalLinks: (globalLinks ?? [])
      .filter((link: any) => allowedGlobalLinkTypes.has(link.link_type))
      .map((link: any) => ({
        linkType: link.link_type,
        link: link.link,
        updatedAt: link.updated_at ?? null,
      })),
  };
});

