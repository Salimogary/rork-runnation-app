import type { Context } from "../../create-context";
import { requireRegistrationOwner } from "../../rbac";

export async function resolveRideShareRegistrationId(ctx: Context, registrationId: string) {
  await requireRegistrationOwner(ctx, registrationId, { allowAdmin: true });

  const { data: registration } = await ctx.supabase
    .from("registrations")
    .select("registration_id")
    .eq("registration_id", registrationId)
    .maybeSingle();

  if (registration?.registration_id) return registrationId;

  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("registration_id")
    .eq("profile_id", registrationId)
    .maybeSingle();

  return profile?.registration_id ?? registrationId;
}

export function displayName(registration: any) {
  return [registration?.first_name, registration?.other_names].filter(Boolean).join(" ").trim() ||
    registration?.username ||
    "RunNation user";
}

export async function getRideSharePeople(ctx: Context, registrationIds: string[]) {
  const ids = Array.from(new Set(registrationIds.filter(Boolean)));
  if (ids.length === 0) {
    return new Map<string, any>();
  }

  const [{ data: registrations, error: registrationError }, { data: contacts, error: contactError }] = await Promise.all([
    ctx.supabase
      .from("registrations")
      .select("registration_id, first_name, other_names, username, sex, country")
      .in("registration_id", ids),
    ctx.supabase
      .from("contacts")
      .select("registration_id, email, phone, full_phone")
      .in("registration_id", ids),
  ]);

  if (registrationError) throw new Error(registrationError.message || "Could not load ride-share profiles.");
  if (contactError) throw new Error(contactError.message || "Could not load ride-share contacts.");

  const contactMap = new Map((contacts ?? []).map((contact: any) => [contact.registration_id, contact]));

  return new Map((registrations ?? []).map((registration: any) => {
    const contact = contactMap.get(registration.registration_id);
    return [registration.registration_id, {
      registrationId: registration.registration_id,
      name: displayName(registration),
      username: registration.username ?? null,
      sex: registration.sex ?? null,
      country: registration.country ?? null,
      phone: contact?.full_phone ? String(contact.full_phone) : contact?.phone ? String(contact.phone) : null,
      email: contact?.email ? String(contact.email) : null,
    }];
  }));
}

export function publicPerson(person: any, includeContact = false) {
  return {
    registrationId: person?.registrationId ?? null,
    name: person?.name ?? "RunNation user",
    username: person?.username ?? null,
    sex: person?.sex ?? null,
    country: person?.country ?? null,
    phone: includeContact ? person?.phone ?? null : null,
    email: includeContact ? person?.email ?? null : null,
  };
}
