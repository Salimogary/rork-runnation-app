import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { getActorRoleSession, logAdminAction } from "../../../rbac";

const inputSchema = z.object({
  profileType: z.enum(["club", "organizer"]),
  profileId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  location: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
  presenceTowns: z.array(z.string().trim().max(80)).max(12).optional(),
});

function cleanText(value: string | null | undefined): string | null {
  const cleaned = value?.trim().replace(/\s+/g, " ");
  return cleaned || null;
}

export default publicProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    const actor = await getActorRoleSession(ctx);

    if (input.profileType === "club") {
      const canEditClub = actor.roles.some(
        (role) => role.roleName === "club_coordinator" && role.clubId === input.profileId
      );
      if (!canEditClub) {
        throw new Error("You can only edit your own club profile.");
      }

      const presenceTowns = Array.from(
        new Set((input.presenceTowns ?? []).map((town) => cleanText(town)).filter(Boolean))
      );

      const { data, error } = await ctx.supabase
        .from("clubs")
        .update({
          club_name: input.name.trim().replace(/\s+/g, " "),
          location: cleanText(input.location),
          description: cleanText(input.description),
          presence_towns: presenceTowns,
        })
        .eq("club_id", input.profileId)
        .select("club_id, club_name, country")
        .maybeSingle();

      if (error || !data) {
        throw new Error(error?.message || "Could not update the club profile.");
      }

      await logAdminAction(ctx, {
        actorUserId: actor.authUserId,
        actionType: "club_profile_updated",
        targetClubId: data.club_id,
        targetCountryCode: data.country ?? null,
        metadata: {
          clubName: data.club_name,
          location: cleanText(input.location),
          presenceTowns,
        },
      });

      return { success: true, profileType: "club" as const, profileId: data.club_id };
    }

    const canEditOrganizer = actor.roles.some(
      (role) => role.roleName === "event_organizer" && role.organizerId === input.profileId
    );
    if (!canEditOrganizer) {
      throw new Error("You can only edit your own organizer profile.");
    }

    const descriptionParts = [
      cleanText(input.description),
      cleanText(input.location) ? `Base location: ${cleanText(input.location)}` : null,
    ].filter(Boolean);

    const { data, error } = await ctx.supabase
      .from("event_organizers")
      .update({
        organizer_name: input.name.trim().replace(/\s+/g, " "),
        description: descriptionParts.join("\n") || null,
      })
      .eq("organizer_id", input.profileId)
      .select("organizer_id, organizer_name, country")
      .maybeSingle();

    if (error || !data) {
      throw new Error(error?.message || "Could not update the organizer profile.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "event_organizer_profile_updated",
      targetCountryCode: data.country ?? null,
      metadata: {
        organizerId: data.organizer_id,
        organizerName: data.organizer_name,
      },
    });

    return { success: true, profileType: "organizer" as const, profileId: data.organizer_id };
  });

