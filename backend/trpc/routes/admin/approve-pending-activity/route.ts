import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";
import { ACTIVITY_UPLOADS_BUCKET } from "../../../storage";

function normalizeClubName(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

async function isTreadmillClubMember(ctx: any, registrationId: string): Promise<boolean> {
  const { data: treadmillClubs, error: clubsError } = await ctx.supabase
    .from("clubs")
    .select("club_id, club_name")
    .eq("special_club_code", "treadmill_runners");

  if (clubsError) {
    throw new Error(clubsError.message || "Could not check treadmill club membership.");
  }

  const treadmillClubIds = new Set((treadmillClubs || []).map((club: any) => club.club_id).filter(Boolean));
  const treadmillClubNames = new Set((treadmillClubs || []).map((club: any) => normalizeClubName(club.club_name)).filter(Boolean));
  if (treadmillClubIds.size === 0 && treadmillClubNames.size === 0) return false;

  const { data: memberships, error: membershipsError } = await ctx.supabase
    .from("club_membership_request")
    .select("registration_id, club_id, club, status, request_type")
    .eq("registration_id", registrationId)
    .eq("request_type", "membership")
    .eq("status", "approved");

  if (membershipsError) {
    throw new Error(membershipsError.message || "Could not check treadmill club membership.");
  }

  return (memberships || []).some((membership: any) => {
    const clubId = membership.club_id;
    const clubName = normalizeClubName(membership.club);
    return (clubId && treadmillClubIds.has(clubId)) || (clubName && treadmillClubNames.has(clubName));
  });
}

export default publicProcedure
  .input(z.object({ pendingActivityId: z.string().min(1) }))
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
      allowSpecialClubCoordinator: true,
    });

    const { data: activity, error: fetchError } = await ctx.supabase
      .from("pending_activities")
      .select("*")
      .eq("pending_activity_id", input.pendingActivityId)
      .single();

    if (fetchError || !activity) {
      throw new Error(fetchError?.message || "Pending activity not found");
    }

    const memberOfTreadmillClub = await isTreadmillClubMember(ctx, activity.registration_id);
    const canApproveNonMember = actor.isSuperAdmin || actor.isCountryCoordinator;
    const isTreadmillCoordinator = actor.roles.some((role) => role.roleName === "treadmill_runners_club_coordinator");

    if (!memberOfTreadmillClub && !canApproveNonMember) {
      throw new Error("Only Global Admin or Country Coordinator can approve treadmill activities for users who are not Treadmill Runners Club members.");
    }
    if (memberOfTreadmillClub && !canApproveNonMember && !isTreadmillCoordinator) {
      throw new Error("Only the Treadmill Runners Club coordinator, Country Coordinator, or Global Admin can approve this treadmill activity.");
    }

    const timeParts = String(activity.time_entered || "0:00:00").split(":");
    const hours = parseInt(timeParts[0] || "0", 10);
    const minutes = parseInt(timeParts[1] || "0", 10);
    const totalMinutes = hours * 60 + minutes;

    let distanceKm = activity.distance_entered;
    if (activity.distance_unit === "mi") {
      distanceKm = activity.distance_entered * 1.60934;
    }

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - totalMinutes * 60 * 1000);
    const calculatedPace = totalMinutes > 0 && distanceKm > 0 ? totalMinutes / distanceKm : 0;

    const { error: insertError } = await ctx.supabase
      .from("activities")
      .insert({
        registration_id: activity.registration_id,
        activity_date: new Date().toISOString().split("T")[0],
        exercise_type: activity.exercise_type,
        distance_km: distanceKm,
        start_time: startTime.toISOString().split("T")[1].split(".")[0],
        end_time: endTime.toISOString().split("T")[1].split(".")[0],
        pace_min_per_km: calculatedPace,
      });

    if (insertError) {
      throw new Error(insertError.message || "Failed to approve activity");
    }

    const { error: deleteError } = await ctx.supabase
      .from("pending_activities")
      .delete()
      .eq("pending_activity_id", input.pendingActivityId);

    if (deleteError) {
      throw new Error(deleteError.message || "Failed to finalize approved activity");
    }

    if (activity.photo_path) {
      await ctx.supabase.storage.from(ACTIVITY_UPLOADS_BUCKET).remove([activity.photo_path]);
    }

    return { success: true };
  });


