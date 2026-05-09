export const MIN_RUNNATION_AGE = 8;

export const SPECIAL_CLUB_CODES = {
  junior: "junior_runners",
  golden: "golden_age_runners",
  treadmill: "treadmill_runners",
  para: "para_runners",
} as const;

export type SpecialClubCode = (typeof SPECIAL_CLUB_CODES)[keyof typeof SPECIAL_CLUB_CODES];

export interface SpecialClubLike {
  club_id: string;
  club_name: string;
  country?: string | null;
  special_club_code?: string | null;
  is_special_club?: boolean | null;
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

export function canSelectSpecialClub(code: string | null | undefined, age: number | null): boolean {
  if (!code) return true;
  if (code === SPECIAL_CLUB_CODES.junior) return age !== null && age >= 8 && age <= 15;
  if (code === SPECIAL_CLUB_CODES.golden) return age !== null && age >= 60;
  if (code === SPECIAL_CLUB_CODES.treadmill || code === SPECIAL_CLUB_CODES.para) return true;
  return true;
}

export function filterVisibleClubsForAge<T extends SpecialClubLike>(
  clubs: T[],
  countryClubs: T[],
  age: number | null
): T[] {
  const specialClubs = clubs.filter((club) => club.is_special_club || club.special_club_code);
  const visibleSpecialClubs = specialClubs.filter((club) => canSelectSpecialClub(club.special_club_code, age));

  if (age !== null && age >= 8 && age <= 15) {
    return visibleSpecialClubs.filter((club) => club.special_club_code === SPECIAL_CLUB_CODES.junior);
  }

  const byId = new Map<string, T>();
  [...countryClubs, ...visibleSpecialClubs].forEach((club) => byId.set(club.club_id, club));
  return [...byId.values()];
}
