import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

function daysSince(value: string | null | undefined): number {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

function getInactiveReason(ageDays: number, memberCount: number): string | null {
  if (ageDays >= 180 && memberCount < 10) return "180 days since launch with fewer than 10 members.";
  if (ageDays >= 90 && memberCount < 6) return "90 days since launch with fewer than 6 members.";
  if (ageDays >= 30 && memberCount === 0) return "30 days since launch with no enrolment.";
  return null;
}

export default publicProcedure
  .input(
    z.object({
      clubId: z.string().uuid(),
      reason: z.string().trim().min(10, "Please give a short reason.").max(1000),
      inactiveAdminDelete: z.boolean().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
    });

    const { data: club, error: clubError } = await ctx.supabase
      .from("clubs")
      .select("club_id, club_name, country, created_at, created_by_user_id")
      .eq("club_id", input.clubId)
      .maybeSingle();

    if (clubError || !club) {
      throw new Error(clubError?.message || "Club was not found.");
    }

    const isAssignedCoordinator = actor.roles.some(
      (role) => role.roleName === "club_coordinator" && role.clubId === input.clubId
    );
    const isCreator = club.created_by_user_id && club.created_by_user_id === actor.authUserId;
    const isCountryScopedAdmin = actor.roles.some(
      (role) =>
        (role.roleName === "country_admin" || role.roleName === "country_coordinator") &&
        role.countryCode &&
        role.countryCode === club.country
    );

    if (!actor.isSuperAdmin && !isCountryScopedAdmin && !isAssignedCoordinator && !isCreator) {
      throw new Error("Only the club creator or assigned club coordinator can request deletion.");
    }

    const { count, error: countError } = await ctx.supabase
      .from("club_membership_request")
      .select("registration_id", { count: "exact", head: true })
      .eq("club_id", input.clubId)
      .eq("status", "approved");

    if (countError) {
      throw new Error(countError.message || "Could not check club members.");
    }

    const memberCount = count ?? 0;
    const inactiveReason = getInactiveReason(daysSince(club.created_at), memberCount);
    const canAdminDeleteInactive = Boolean(input.inactiveAdminDelete && inactiveReason && (actor.isSuperAdmin || isCountryScopedAdmin));

    if (input.inactiveAdminDelete && !canAdminDeleteInactive) {
      throw new Error("Only Global Admins or country-scoped admins can delete clubs that meet the inactive-club rules.");
    }

    if (memberCount === 0 || canAdminDeleteInactive) {
      const { error: deleteError } = await ctx.supabase
        .from("clubs")
        .delete()
        .eq("club_id", input.clubId);

      if (deleteError) {
        throw new Error(deleteError.message || "Could not delete the empty club.");
      }

      await logAdminAction(ctx, {
        actorUserId: actor.authUserId,
        targetClubId: input.clubId,
        actionType: canAdminDeleteInactive ? "inactive_club_deleted" : "club_deleted_immediately",
        metadata: { reason: input.reason, clubName: club.club_name, memberCount, inactiveReason },
      });

      return {
        success: true,
        immediate: true,
        message: canAdminDeleteInactive
          ? "The inactive club was deleted."
          : "The club had no members, so it was deleted immediately.",
      };
    }

    const { data: existing, error: existingError } = await ctx.supabase
      .from("club_deletion_requests")
      .select("request_id")
      .eq("club_id", input.clubId)
      .eq("status", "pending")
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message || "Could not check pending club deletion requests.");
    }

    if (existing) {
      throw new Error("This club already has a pending deletion request.");
    }

    const eligibleAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const { error } = await ctx.supabase
      .from("club_deletion_requests")
      .insert({
        club_id: input.clubId,
        requested_by: actor.authUserId,
        reason: input.reason,
        member_count_at_request: memberCount,
        status: "pending",
        eligible_at: eligibleAt,
      });

    if (error) {
      throw new Error(error.message || "Could not submit the club deletion request.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      targetClubId: input.clubId,
      actionType: "club_deletion_requested",
      metadata: { reason: input.reason, clubName: club.club_name, memberCount, eligibleAt },
    });

    return {
      success: true,
      immediate: false,
      eligibleAt,
      message: "The club has members, so deletion is pending for 12 hours and requires admin approval/actioning.",
    };
  });

