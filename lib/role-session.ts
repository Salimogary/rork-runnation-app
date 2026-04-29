export type RoleAssignment = {
  roleName: string;
  countryCode: string | null;
  clubId: string | null;
  organizerId: string | null;
};

export type RoleSession = {
  authUserId: string | null;
  profileId: string | null;
  registrationId: string | null;
  username: string | null;
  displayName: string | null;
  roles: RoleAssignment[];
  isSuperAdmin: boolean;
  isCountryAdmin: boolean;
  isCountryCoordinator: boolean;
  isClubCoordinator: boolean;
  isEventOrganizer: boolean;
  hasAdminAccess: boolean;
  countryAdminScopes: string[];
  countryCoordinatorScopes: string[];
  clubCoordinatorScopes: string[];
  eventOrganizerScopes: string[];
  source: "auth" | "legacy" | "none";
};

export const EMPTY_ROLE_SESSION: RoleSession = {
  authUserId: null,
  profileId: null,
  registrationId: null,
  username: null,
  displayName: null,
  roles: [],
  isSuperAdmin: false,
  isCountryAdmin: false,
  isCountryCoordinator: false,
  isClubCoordinator: false,
  isEventOrganizer: false,
  hasAdminAccess: false,
  countryAdminScopes: [],
  countryCoordinatorScopes: [],
  clubCoordinatorScopes: [],
  eventOrganizerScopes: [],
  source: "none",
};
