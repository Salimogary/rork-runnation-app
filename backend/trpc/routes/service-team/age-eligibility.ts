export const SERVICE_TEAM_ADULT_AGE = 18;

export const JUNIOR_RUNNERS_CLUB_COORDINATOR_ROLE = "junior_runners_club_coordinator";

export function getAgeFromDob(value: string | null | undefined): number | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const ddmmyyyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const dob = ddmmyyyy
    ? new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]))
    : new Date(raw);

  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export function isServiceTeamMinor(age: number | null): boolean {
  return age !== null && age < SERVICE_TEAM_ADULT_AGE;
}

export async function getApplicantAgeFromAuth(
  ctx: { supabase: any; authUserId: string | null }
): Promise<number | null> {
  if (!ctx.authUserId) return null;

  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("registration_id")
    .eq("profile_id", ctx.authUserId)
    .maybeSingle();

  const registrationId = profile?.registration_id;
  if (!registrationId) return null;

  const { data: registration } = await ctx.supabase
    .from("registrations")
    .select("dob")
    .eq("registration_id", registrationId)
    .maybeSingle();

  return getAgeFromDob(registration?.dob ?? null);
}

export function assertServiceTeamRoleAllowedForAge(age: number | null, roleName: string) {
  if (!isServiceTeamMinor(age)) return;
  if (roleName === JUNIOR_RUNNERS_CLUB_COORDINATOR_ROLE) return;
  throw new Error(
    "Users under 18 may only apply for the Junior Runners Club Coordinator role when it is available."
  );
}
