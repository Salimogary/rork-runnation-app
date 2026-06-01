import { ADMIN_TERMS_VERSION } from "../../../admin-terms";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure.mutation(async ({ ctx }) => {
  const actor = await requireAdminPermission(ctx, {
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

  if (!actor.authUserId) {
    throw new Error("You must be signed in.");
  }

  const { error } = await ctx.supabase
    .from("admin_terms_acceptances")
    .upsert(
      {
        user_id: actor.authUserId,
        terms_version: ADMIN_TERMS_VERSION,
        accepted_at: new Date().toISOString(),
        accepted_from: "admin_portal",
      },
      {
        onConflict: "user_id,terms_version",
      }
    );

  if (error) {
    throw new Error(error.message || "Could not save admin terms acceptance.");
  }

  await logAdminAction(ctx, {
    actorUserId: actor.authUserId,
    actionType: "admin_terms_accepted",
    metadata: {
      termsVersion: ADMIN_TERMS_VERSION,
    },
  });

  return {
    success: true,
    termsVersion: ADMIN_TERMS_VERSION,
  };
});

