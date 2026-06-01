import { z } from "zod";
import { ADMIN_TERMS_VERSION, getAdminTermsRoleLabel, getAdminTermsSections } from "../../../admin-terms";
import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

const inputSchema = z.object({
  role: z.enum([
    "global_admin",
    "country_admin",
    "country_coordinator",
    "club_coordinator",
    "special_club_coordinator",
    "junior_runners_club_coordinator",
    "golden_age_runners_club_coordinator",
    "treadmill_runners_club_coordinator",
    "para_runners_club_coordinator",
    "smartfit_club_coordinator",
    "event_organizer",
    "magazine_editor",
    "chat_room_administrator",
    "magazine_columnist",
  ]),
});

export default publicProcedure.input(inputSchema).query(async ({ ctx, input }) => {
  await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowCountryAdmin: true,
    allowCountryCoordinator: true,
    allowClubCoordinator: true,
    allowSpecialClubCoordinator: true,
    allowEventOrganizer: true,
    allowMagazineEditor: true,
    allowMagazineColumnist: true,
    allowChatRoomAdministrator: true,
  });

  return {
    currentVersion: ADMIN_TERMS_VERSION,
    role: input.role,
    roleLabel: getAdminTermsRoleLabel(input.role),
    sections: getAdminTermsSections(input.role),
  };
});

