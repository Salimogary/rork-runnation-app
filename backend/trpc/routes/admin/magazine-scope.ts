import type { Context } from "../../create-context";
import type { ActorRoleSession } from "../../rbac";

const SPECIAL_CLUB_CODE_BY_COORDINATOR_ROLE: Record<string, string> = {
  junior_runners_club_coordinator: "junior_runners",
  golden_age_runners_club_coordinator: "golden_age_runners",
  treadmill_runners_club_coordinator: "treadmill_runners",
  para_runners_club_coordinator: "para_runners",
  smartfit_club_coordinator: "smartfit_club",
};

function isMissingSchemaError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error);
  return message.includes("does not exist") || message.includes("schema cache") || message.includes("relation") || message.includes("column");
}

async function safeRows<T>(query: PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) return [];
    throw error;
  }
  return data ?? [];
}

export async function getScopedMagazineAccess(ctx: Context, actor: ActorRoleSession) {
  const isScoped =
    (actor.isClubCoordinator || actor.isSpecialClubCoordinator || actor.isEventOrganizer) &&
    !actor.isSuperAdmin &&
    !actor.isCountryAdmin &&
      !actor.isCountryCoordinator &&
    !actor.isMagazineEditor;

  if (!isScoped) {
    return { isScoped: false, clubNames: new Set<string>(), registrationIds: new Set<string>(), eventIds: new Set<string>() };
  }

  const clubIds = actor.roles
    .filter((role) => role.roleName === "club_coordinator" && role.clubId)
    .map((role) => role.clubId as string);
  const specialClubCodes = actor.roles
    .map((role) => SPECIAL_CLUB_CODE_BY_COORDINATOR_ROLE[role.roleName])
    .filter(Boolean);
  const organizerIds = actor.roles
    .filter((role) => role.roleName === "event_organizer" && role.organizerId)
    .map((role) => role.organizerId as string);

  let clubRows: any[] = [];
  if (clubIds.length > 0 || specialClubCodes.length > 0) {
    let clubQuery = ctx.supabase.from("clubs").select("club_id, club_name, special_club_code");
    if (clubIds.length > 0 && specialClubCodes.length > 0) {
      clubQuery = clubQuery.or(`club_id.in.(${clubIds.join(",")}),special_club_code.in.(${specialClubCodes.join(",")})`);
    } else if (clubIds.length > 0) {
      clubQuery = clubQuery.in("club_id", clubIds);
    } else {
      clubQuery = clubQuery.in("special_club_code", specialClubCodes);
    }
    clubRows = await safeRows<any>(clubQuery);
  }

  const clubNames = new Set(clubRows.map((club) => String(club.club_name || "").trim()).filter(Boolean));
  const registrationIds = new Set<string>();

  if (actor.authUserId) {
    registrationIds.add(actor.authUserId);
    const profiles = await safeRows<any>(
      ctx.supabase
        .from("profiles")
        .select("profile_id, registration_id, legacy_registration_id")
        .eq("profile_id", actor.authUserId)
    );
    profiles.forEach((profile) => {
      if (profile.profile_id) registrationIds.add(String(profile.profile_id));
      if (profile.registration_id) registrationIds.add(String(profile.registration_id));
      if (profile.legacy_registration_id) registrationIds.add(String(profile.legacy_registration_id));
    });
  }

  if (clubNames.size > 0) {
    const clubNameList = Array.from(clubNames);
    const memberships = await safeRows<any>(
      ctx.supabase
        .from("club_membership_request")
        .select("registration_id, club, status")
        .in("club", clubNameList)
        .in("status", ["approved", "pending"])
    );
    memberships.forEach((membership) => {
      if (membership.registration_id) registrationIds.add(String(membership.registration_id));
    });
  }

  const eventIds = new Set<string>();
  if (organizerIds.length > 0 || clubNames.size > 0) {
    let eventsQuery = ctx.supabase.from("events").select("event_id, organizer, club");
    if (organizerIds.length > 0 && clubNames.size > 0) {
      eventsQuery = eventsQuery.or(`organizer.in.(${organizerIds.join(",")}),club.in.(${Array.from(clubNames).join(",")})`);
    } else if (organizerIds.length > 0) {
      eventsQuery = eventsQuery.in("organizer", organizerIds);
    } else {
      eventsQuery = eventsQuery.in("club", Array.from(clubNames));
    }
    const events = await safeRows<any>(eventsQuery);
    events.forEach((event) => {
      if (event.event_id) eventIds.add(String(event.event_id));
    });
  }

  return { isScoped: true, clubNames, registrationIds, eventIds };
}

export function canAccessMagazineRow(row: any, scope: Awaited<ReturnType<typeof getScopedMagazineAccess>>) {
  if (!scope.isScoped) return true;
  const registrationId = String(row.registration_id || "").trim();
  const club = String(row.club || "").trim();
  const eventId = String(row.event_id || "").trim();
  return (
    (registrationId && scope.registrationIds.has(registrationId)) ||
    (club && scope.clubNames.has(club)) ||
    (eventId && scope.eventIds.has(eventId))
  );
}


