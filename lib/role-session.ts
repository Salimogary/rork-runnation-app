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
  isSpecialClubCoordinator: boolean;
  isEventOrganizer: boolean;
  isMagazineEditor: boolean;
  isMagazineColumnist: boolean;
  isChatRoomAdministrator: boolean;
  hasAdminAccess: boolean;
  countryAdminScopes: string[];
  countryCoordinatorScopes: string[];
  clubCoordinatorScopes: string[];
  specialClubCoordinatorScopes: string[];
  eventOrganizerScopes: string[];
  magazineEditorScopes: string[];
  chatRoomAdministratorScopes: string[];
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
  isSpecialClubCoordinator: false,
  isEventOrganizer: false,
  isMagazineEditor: false,
  isMagazineColumnist: false,
  isChatRoomAdministrator: false,
  hasAdminAccess: false,
  countryAdminScopes: [],
  countryCoordinatorScopes: [],
  clubCoordinatorScopes: [],
  specialClubCoordinatorScopes: [],
  eventOrganizerScopes: [],
  magazineEditorScopes: [],
  chatRoomAdministratorScopes: [],
  source: "none",
};

const FREE_ADMIN_SUBSCRIPTION_ROLE_NAMES = new Set([
  "super_admin",
  "global_admin",
  "country_admin",
  "country_coordinator",
  "club_coordinator",
  "junior_runners_club_coordinator",
  "golden_age_runners_club_coordinator",
  "treadmill_runners_club_coordinator",
  "para_runners_club_coordinator",
  "smartfit_club_coordinator",
  "event_organizer",
  "magazine_editor",
  "magazine_columnist_fitness_coach",
  "magazine_columnist_sports_journalist",
  "magazine_columnist_motivation_speaker",
  "chat_room_administrator",
  "shop_manager",
]);

export function roleNameHasFreeAdminSubscriptionAccess(roleName: string | null | undefined): boolean {
  return FREE_ADMIN_SUBSCRIPTION_ROLE_NAMES.has((roleName ?? "").trim().toLowerCase());
}

export function hasFreeAdminSubscriptionAccess(roleSession: RoleSession): boolean {
  return (
    roleSession.isSuperAdmin ||
    roleSession.isCountryAdmin ||
    roleSession.isCountryCoordinator ||
    roleSession.isClubCoordinator ||
    roleSession.isSpecialClubCoordinator ||
    roleSession.isEventOrganizer ||
    roleSession.isMagazineEditor ||
    roleSession.isMagazineColumnist ||
    roleSession.isChatRoomAdministrator ||
    roleSession.roles.some((role) => roleNameHasFreeAdminSubscriptionAccess(role.roleName))
  );
}

export function hasAdminPortalAccess(roleSession: RoleSession): boolean {
  return (
    roleSession.hasAdminAccess ||
    roleSession.isSuperAdmin ||
    roleSession.isCountryAdmin ||
    roleSession.isCountryCoordinator ||
    roleSession.isClubCoordinator ||
    roleSession.isSpecialClubCoordinator ||
    roleSession.isEventOrganizer ||
    roleSession.isMagazineEditor ||
    roleSession.isMagazineColumnist ||
    roleSession.isChatRoomAdministrator ||
    roleSession.roles.some((role) => {
      const roleName = role.roleName.trim().toLowerCase();
      return roleName !== "user";
    })
  );
}
