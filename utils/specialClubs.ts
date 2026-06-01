export const MIN_RUNNATION_AGE = 8;

export const SPECIAL_CLUB_CODES = {
  junior: "junior_runners",
  golden: "golden_age_runners",
  treadmill: "treadmill_runners",
  para: "para_runners",
  smartfit: "smartfit_club",
} as const;

export type SpecialClubCode = (typeof SPECIAL_CLUB_CODES)[keyof typeof SPECIAL_CLUB_CODES];

export interface SpecialClubLike {
  club_id: string;
  club_name: string;
  country?: string | null;
  presence_towns?: string[] | string | null;
  special_club_code?: string | null;
  is_special_club?: boolean | null;
}

export interface SpecialClubEligibility {
  age: number | null;
  hasDisability?: boolean | null;
  doesIndoorWorkouts?: boolean | null;
  hasSmartWatch?: boolean | null;
  hasGeneralHealthGoal?: boolean | null;
}

export function getAgeFromDob(dob?: string | null): number | null {
  const value = String(dob || "").trim();
  if (!value) return null;
  const ddmmyyyy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const date = ddmmyyyy
    ? new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDelta = today.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
}

export function isAtLeastRunNationAge(dob?: string | null): boolean {
  const age = getAgeFromDob(dob);
  return age !== null && age >= MIN_RUNNATION_AGE;
}

export function normalizeClubCountry(value?: string | null): string {
  return String(value || "").trim().toLowerCase();
}

export function isGlobalClubCountry(value?: string | null): boolean {
  const normalized = normalizeClubCountry(value);
  return !normalized || normalized === "global" || normalized === "all";
}

export function clubMatchesCountry(club: SpecialClubLike, userCountry?: string | null): boolean {
  const normalizedUserCountry = normalizeClubCountry(userCountry);
  if (!normalizedUserCountry) return false;
  return normalizeClubCountry(club.country) === normalizedUserCountry;
}

export function getClubPresenceTowns(club: Pick<SpecialClubLike, "presence_towns">): string[] {
  const value = club.presence_towns;
  if (Array.isArray(value)) {
    return value.map((town) => String(town).trim()).filter(Boolean);
  }
  const raw = String(value || "").trim();
  if (!raw) return [];
  return raw.split(",").map((town) => town.trim()).filter(Boolean);
}

export function normalizeTown(value?: string | null): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function clubMatchesTown(club: Pick<SpecialClubLike, "presence_towns">, userTown?: string | null): boolean {
  const normalizedUserTown = normalizeTown(userTown);
  if (!normalizedUserTown) return false;
  return getClubPresenceTowns(club).some((town) => normalizeTown(town) === normalizedUserTown);
}

export function canSelectSpecialClub(
  code: string | null | undefined,
  eligibilityOrAge: SpecialClubEligibility | number | null
): boolean {
  const eligibility =
    typeof eligibilityOrAge === "number" || eligibilityOrAge === null
      ? { age: eligibilityOrAge }
      : eligibilityOrAge;
  const age = eligibility.age;
  if (!code) return true;
  if (code === SPECIAL_CLUB_CODES.junior) return age !== null && age >= 8 && age <= 15;
  if (code === SPECIAL_CLUB_CODES.golden) return age !== null && age >= 60;
  if (code === SPECIAL_CLUB_CODES.treadmill) return eligibility.doesIndoorWorkouts === true;
  if (code === SPECIAL_CLUB_CODES.para) return eligibility.hasDisability === true;
  if (code === SPECIAL_CLUB_CODES.smartfit) {
    return eligibility.hasSmartWatch === true && eligibility.hasGeneralHealthGoal === true;
  }
  return true;
}

export function filterVisibleClubsForAge<T extends SpecialClubLike>(
  clubs: T[],
  countryClubs: T[],
  age: number | null,
  options: {
    hasDisability?: boolean | null;
    doesIndoorWorkouts?: boolean | null;
    hasSmartWatch?: boolean | null;
    hasGeneralHealthGoal?: boolean | null;
    userCountry?: string | null;
  } = {}
): T[] {
  const specialClubs = clubs.filter((club) => club.is_special_club || club.special_club_code);
  const visibleSpecialClubs = specialClubs.filter((club) => {
    const countryOk =
      !options.userCountry ||
      clubMatchesCountry(club, options.userCountry) ||
      isGlobalClubCountry(club.country);
    return (
      countryOk &&
      canSelectSpecialClub(club.special_club_code, {
        age,
        hasDisability: options.hasDisability,
        doesIndoorWorkouts: options.doesIndoorWorkouts,
        hasSmartWatch: options.hasSmartWatch,
        hasGeneralHealthGoal: options.hasGeneralHealthGoal,
      })
    );
  });

  if (age !== null && age >= 8 && age <= 15) {
    return visibleSpecialClubs;
  }

  const byId = new Map<string, T>();
  [...countryClubs, ...visibleSpecialClubs].forEach((club) => byId.set(club.club_id, club));
  return [...byId.values()];
}
