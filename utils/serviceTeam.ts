import { getAgeFromDob } from "@/utils/specialClubs";

export const SERVICE_TEAM_ADULT_AGE = 18;

export const JUNIOR_RUNNERS_CLUB_COORDINATOR_ROLE = "junior_runners_club_coordinator";

export type ServiceTeamRoleAvailability = {
  roleName: string;
  available: boolean;
};

export function getServiceTeamApplicantAge(dob?: string | null): number | null {
  return getAgeFromDob(dob);
}

export function isServiceTeamMinor(dob?: string | null): boolean {
  const age = getServiceTeamApplicantAge(dob);
  return age !== null && age < SERVICE_TEAM_ADULT_AGE;
}

export function isJuniorRunnersCoordinatorAvailable(
  roles: ServiceTeamRoleAvailability[] | undefined
): boolean {
  return (
    roles?.some(
      (role) => role.roleName === JUNIOR_RUNNERS_CLUB_COORDINATOR_ROLE && role.available
    ) ?? false
  );
}

export function canOpenServiceTeamEntry(
  dob: string | null | undefined,
  roles: ServiceTeamRoleAvailability[] | undefined,
  hasExistingRole?: boolean
): boolean {
  if (hasExistingRole) return true;
  if (!isServiceTeamMinor(dob)) return true;
  return isJuniorRunnersCoordinatorAvailable(roles);
}

export function filterServiceTeamRolesForApplicant<T extends { roleName: string }>(
  dob: string | null | undefined,
  roles: T[]
): T[] {
  if (!isServiceTeamMinor(dob)) return roles;
  return roles.filter((role) => role.roleName === JUNIOR_RUNNERS_CLUB_COORDINATOR_ROLE);
}

export function getServiceTeamEntrySubtitle(
  dob: string | null | undefined,
  roles: ServiceTeamRoleAvailability[] | undefined
): string {
  const age = getServiceTeamApplicantAge(dob);
  if (age === null) {
    return "Add your date of birth in Profile to check service team eligibility.";
  }
  if (!isServiceTeamMinor(dob)) {
    return "Take up a role or opportunity in the community";
  }
  if (isJuniorRunnersCoordinatorAvailable(roles)) {
    return "Junior Runners Club Coordinator is open for applicants under 18.";
  }
  return "Service team roles for users under 18 open only when Junior Runners Club Coordinator is vacant.";
}
