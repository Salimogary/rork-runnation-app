import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      requestId: z.string().uuid(),
      action: z.enum(["approve", "reject"]),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
      allowCountryCoordinator: true,
    });

    const { data: request, error: requestError } = await ctx.supabase
      .from("club_deletion_requests")
      .select("request_id, club_id, status, reason, eligible_at, clubs(country, club_name)")
      .eq("request_id", input.requestId)
      .maybeSingle();

    if (requestError || !request) {
      throw new Error(requestError?.message || "Club deletion request was not found.");
    }

    if (request.status !== "pending") {
      throw new Error("This deletion request has already been actioned.");
    }

    const club = Array.isArray(request.clubs) ? request.clubs[0] : request.clubs;
    const canReview =
      actor.isSuperAdmin ||
      actor.roles.some(
        (role) =>
          (role.roleName === "country_admin" || role.roleName === "country_coordinator") &&
          role.countryCode &&
          role.countryCode === club?.country
      );

    if (!canReview) {
      throw new Error("You do not have permission to review this club deletion request.");
    }

    if (input.action === "reject") {
      const { error } = await ctx.supabase
        .from("club_deletion_requests")
        .update({
          status: "rejected",
          actioned_by: actor.authUserId,
          actioned_at: new Date().toISOString(),
        })
        .eq("request_id", input.requestId);

      if (error) {
        throw new Error(error.message || "Could not reject the club deletion request.");
      }

      await logAdminAction(ctx, {
        actorUserId: actor.authUserId,
        targetClubId: request.club_id,
        actionType: "club_deletion_rejected",
        metadata: { requestId: input.requestId, reason: request.reason },
      });

      return { success: true };
    }

    const { error: deleteError } = await ctx.supabase
      .from("clubs")
      .delete()
      .eq("club_id", request.club_id);

    if (deleteError) {
      throw new Error(deleteError.message || "Could not delete the club.");
    }

    const { error } = await ctx.supabase
      .from("club_deletion_requests")
      .update({
        status: "approved",
        actioned_by: actor.authUserId,
        actioned_at: new Date().toISOString(),
      })
      .eq("request_id", input.requestId);

    if (error) {
      throw new Error(error.message || "Club was deleted, but the request status could not be updated.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      targetClubId: request.club_id,
      actionType: "club_deletion_approved",
      metadata: { requestId: input.requestId, reason: request.reason, clubName: club?.club_name ?? null },
    });

    return { success: true };
  });

