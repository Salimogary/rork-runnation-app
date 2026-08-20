import { publicProcedure } from "../../../create-context";
import { getActorRoleSession } from "../../../rbac";

export default publicProcedure.query(async ({ ctx }) => {
  const actor = await getActorRoleSession(ctx);

  const clubId = actor.roles.find((role) => role.roleName === "club_coordinator" && role.clubId)?.clubId ?? null;
  if (clubId) {
    const { data: club, error } = await ctx.supabase
      .from("clubs")
      .select("club_id, club_name, description, location, country, presence_towns, membership_type, virtual_membership_enabled, meeting_point, meeting_time, activity_options, is_active")
      .eq("club_id", clubId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Could not load club profile.");
    }

    return club
      ? {
          type: "club" as const,
          id: String(club.club_id),
          name: club.club_name ?? "",
          description: club.description ?? "",
          location: club.location ?? "",
          country: club.country ?? null,
          presenceTowns: Array.isArray(club.presence_towns) ? club.presence_towns : [],
          membershipType: club.membership_type ?? "free",
          virtualMembershipEnabled: club.virtual_membership_enabled === true,
          meetingPoint: club.meeting_point ?? "",
          meetingTime: club.meeting_time ?? "",
          activityOptions: Array.isArray(club.activity_options) ? club.activity_options : [],
          isActive: club.is_active !== false,
        }
      : null;
  }

  const organizerId = actor.roles.find((role) => role.roleName === "event_organizer" && role.organizerId)?.organizerId ?? null;
  if (organizerId) {
    const { data: organizer, error } = await ctx.supabase
      .from("event_organizers")
      .select("organizer_id, organizer_name, description, country, is_active")
      .eq("organizer_id", organizerId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Could not load organizer profile.");
    }

    return organizer
      ? {
          type: "organizer" as const,
          id: String(organizer.organizer_id),
          name: organizer.organizer_name ?? "",
          description: organizer.description ?? "",
          location: "",
          country: organizer.country ?? null,
          presenceTowns: [],
          isActive: organizer.is_active !== false,
        }
      : null;
  }

  return null;
});

