import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { getActorRoleSession, logAdminAction } from "../../../rbac";

const inputSchema = z.object({
  clubName: z.string().trim().min(3, "Club name must be at least 3 characters.").max(120),
  location: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  presenceTowns: z.array(z.string().trim().max(80)).max(12).optional(),
  membershipType: z.enum(["free", "paid"]).optional().default("free"),
  virtualMembershipEnabled: z.boolean().optional().default(false),
  meetingPoint: z.string().trim().max(160).nullable().optional(),
  meetingTime: z.string().trim().max(160).nullable().optional(),
  activityOptions: z.array(z.enum(["walk", "run", "stairs", "cycle", "treadmill"])).max(5).optional().default([]),
});

function normalizeClubName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanOptionalText(value: string | null | undefined): string | null {
  const cleaned = value?.trim().replace(/\s+/g, " ");
  return cleaned || null;
}

export default publicProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    if (!ctx.authUserId) {
      throw new Error("You must be signed in to create a club profile.");
    }

    const actor = await getActorRoleSession(ctx);
    const setupRole = actor.roles.find(
      (role) => role.roleName === "club_coordinator" && role.countryCode && !role.clubId
    );

    if (!setupRole?.countryCode) {
      throw new Error("Your Club Coordinator role is not ready for club profile setup.");
    }

    const existingClubRole = actor.roles.find((role) => role.roleName === "club_coordinator" && role.clubId);
    if (existingClubRole?.clubId) {
      throw new Error("Your Club Coordinator role is already connected to a club.");
    }

    const normalizedName = normalizeClubName(input.clubName);
    const { data: existingClubs, error: existingClubError } = await ctx.supabase
      .from("clubs")
      .select("club_id, club_name")
      .eq("country", setupRole.countryCode)
      .eq("is_active", true);

    if (existingClubError) {
      throw new Error(existingClubError.message || "Could not check existing clubs.");
    }

    const duplicateClub = (existingClubs ?? []).find(
      (club: any) => normalizeClubName(club.club_name) === normalizedName
    );
    if (duplicateClub) {
      throw new Error("A club with this name already exists in your country.");
    }

    const { data: coordinatorId, error: coordinatorError } = await ctx.supabase.rpc(
      "ensure_coordinator_for_profile",
      { p_user_id: ctx.authUserId }
    );

    if (coordinatorError || !coordinatorId) {
      throw new Error(coordinatorError?.message || "Could not create your coordinator profile.");
    }

    const presenceTowns = Array.from(
      new Set((input.presenceTowns ?? []).map((town) => cleanOptionalText(town)).filter(Boolean))
    );

    const { data: club, error: clubError } = await ctx.supabase
      .from("clubs")
      .insert({
        club_name: input.clubName.trim().replace(/\s+/g, " "),
        description: cleanOptionalText(input.description),
        location: cleanOptionalText(input.location),
        country: setupRole.countryCode,
        coordinator_id: String(coordinatorId),
        created_by_user_id: ctx.authUserId,
        is_active: true,
        presence_towns: presenceTowns,
        membership_type: input.membershipType,
        virtual_membership_enabled: input.virtualMembershipEnabled,
        meeting_point: cleanOptionalText(input.meetingPoint),
        meeting_time: cleanOptionalText(input.meetingTime),
        activity_options: input.activityOptions,
      })
      .select("club_id, club_name, country")
      .maybeSingle();

    if (clubError || !club?.club_id) {
      throw new Error(clubError?.message || "Could not create the club profile.");
    }

    const { data: roleRow, error: roleError } = await ctx.supabase
      .from("roles")
      .select("role_id")
      .eq("role_name", "club_coordinator")
      .maybeSingle();

    if (roleError || !roleRow?.role_id) {
      throw new Error(roleError?.message || "Club was created, but the coordinator role could not be resolved.");
    }

    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("profile_id, registration_id")
      .eq("profile_id", ctx.authUserId)
      .maybeSingle();
    const assignmentUserIds = Array.from(
      new Set([ctx.authUserId, profile?.profile_id, profile?.registration_id].filter(Boolean))
    ) as string[];

    const { data: assignmentRows, error: assignmentError } = await ctx.supabase
      .from("user_role_assignments")
      .update({
        club_id: club.club_id,
        country_code: null,
      })
      .in("user_id", assignmentUserIds)
      .eq("role_id", roleRow.role_id)
      .eq("country_code", setupRole.countryCode)
      .is("club_id", null)
      .eq("is_active", true)
      .select("assignment_id");

    if (assignmentError) {
      throw new Error(assignmentError.message || "Club was created, but role access could not be linked to it.");
    }
    if (!assignmentRows || assignmentRows.length === 0) {
      throw new Error("Club was created, but the matching coordinator role assignment was not found.");
    }

    await logAdminAction(ctx, {
      actorUserId: ctx.authUserId,
      actionType: "club_profile_created",
      targetClubId: club.club_id,
      targetCountryCode: setupRole.countryCode,
      metadata: {
        clubName: club.club_name,
        location: cleanOptionalText(input.location),
        presenceTowns,
        membershipType: input.membershipType,
        virtualMembershipEnabled: input.virtualMembershipEnabled,
        meetingPoint: cleanOptionalText(input.meetingPoint),
        meetingTime: cleanOptionalText(input.meetingTime),
        activityOptions: input.activityOptions,
      },
    });

    return {
      success: true,
      clubId: club.club_id as string,
      clubName: club.club_name as string,
      countryCode: club.country as string | null,
    };
  });

