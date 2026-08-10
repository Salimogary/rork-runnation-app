import type { Context } from "../../create-context";
import { getActorRoleSession, type ActorRoleSession } from "../../rbac";

export function getRideShareEventEndDate(event: any): string {
  const explicitType = event?.event_type || event?.eventType;
  if (explicitType === "same_day" || explicitType === "recurring") {
    return String(event?.starts_at || event?.startsAt || "").slice(0, 10);
  }
  return String(event?.ends_at || event?.endsAt || event?.starts_at || event?.startsAt || "").slice(0, 10);
}

export function isRideShareEventExpired(event: any, todayDate = new Date().toISOString().slice(0, 10)): boolean {
  const endDate = getRideShareEventEndDate(event);
  return Boolean(endDate && endDate < todayDate);
}

export function actorCanModerateRideShareEvent(actor: ActorRoleSession, event: any): boolean {
  if (actor.isSuperAdmin) return true;

  const eventCountry = String(event?.country_code || event?.country || "").trim();
  const eventOrganizer = String(event?.organizer || "").trim();

  return actor.roles.some((role) => {
    if ((role.roleName === "country_admin" || role.roleName === "country_coordinator") && eventCountry) {
      return role.countryCode === eventCountry;
    }
    if (role.roleName === "event_organizer" && eventOrganizer) {
      return role.organizerId === eventOrganizer;
    }
    return false;
  });
}

export async function getRideShareModerator(ctx: Context, event: any) {
  const actor = await getActorRoleSession(ctx);
  return {
    actor,
    canModerate: actorCanModerateRideShareEvent(actor, event),
  };
}
