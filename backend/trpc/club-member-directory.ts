import type { Context } from "./create-context";
import { requireAdminPermission } from "./rbac";

export function normalizeDirectoryEmail(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

export function normalizeDirectoryPhone(value: string | null | undefined): string | null {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || null;
}

export async function requireClubDirectoryAccess(ctx: Context, clubId: string) {
  const actor = await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryAdmin: true,
    allowCountryCoordinator: true,
    allowClubCoordinator: true,
    clubId,
  });

  if (actor.isSuperAdmin || actor.roles.some((role) => role.roleName === "club_coordinator" && role.clubId === clubId)) {
    return actor;
  }

  const { data: club, error } = await ctx.supabase
    .from("clubs")
    .select("country")
    .eq("club_id", clubId)
    .maybeSingle();
  if (error || !club) throw new Error(error?.message || "Club was not found.");

  const hasCountryAccess = actor.roles.some(
    (role) =>
      (role.roleName === "country_admin" || role.roleName === "country_coordinator") &&
      role.countryCode === club.country
  );
  if (!hasCountryAccess) throw new Error("You do not have permission to manage this club directory.");
  return actor;
}

export async function findDirectoryMatches(
  ctx: Context,
  registrationId: string,
  clubIds?: string[]
): Promise<any[]> {
  const { data: contact, error: contactError } = await ctx.supabase
    .from("contacts")
    .select("email, full_phone")
    .eq("registration_id", registrationId)
    .maybeSingle();
  if (contactError) throw new Error(contactError.message || "Could not check club membership.");

  const email = normalizeDirectoryEmail(contact?.email);
  const phone = normalizeDirectoryPhone(contact?.full_phone);
  if (!email && !phone) return [];

  let query = ctx.supabase
    .from("club_member_directory")
    .select("member_id, club_id, name, nickname, clubs(club_id, club_name, country, location)");
  if (clubIds?.length) query = query.in("club_id", clubIds);

  const filters = [
    email ? `normalized_email.eq.${email}` : null,
    phone ? `normalized_phone.eq.${phone}` : null,
  ].filter(Boolean).join(",");
  const { data, error } = await query.or(filters);
  if (error) throw new Error(error.message || "Could not check the club member list.");
  return data || [];
}

