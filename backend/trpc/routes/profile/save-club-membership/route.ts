import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      club: z.string().nullable(),
      clubId: z.string().uuid().nullable().optional(),
      newMember: z.string().min(1),
      requestType: z.enum(["membership", "start_club", "event_organizer"]).default("membership"),
      proposedClubName: z.string().nullable().optional(),
      proposedCountry: z.string().nullable().optional(),
      proposedDescription: z.string().nullable().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { data: existing } = await ctx.supabase
      .from("club_membership_request")
      .select("registration_id")
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (existing) {
      const { error } = await ctx.supabase
        .from("club_membership_request")
        .update({
          club: input.club,
          club_id: input.clubId ?? null,
          new_member: input.newMember,
          request_type: input.requestType,
          proposed_club_name: input.proposedClubName?.trim() || null,
          proposed_country: input.proposedCountry?.trim() || null,
          proposed_description: input.proposedDescription?.trim() || null,
        })
        .eq("registration_id", input.registrationId);
      if (error) {
        throw new Error(error.message || "Failed to update club membership");
      }
    } else {
      const { error } = await ctx.supabase
        .from("club_membership_request")
        .insert({
          registration_id: input.registrationId,
          club: input.club,
          club_id: input.clubId ?? null,
          new_member: input.newMember,
          request_type: input.requestType,
          proposed_club_name: input.proposedClubName?.trim() || null,
          proposed_country: input.proposedCountry?.trim() || null,
          proposed_description: input.proposedDescription?.trim() || null,
        });
      if (error) {
        throw new Error(error.message || "Failed to save club membership");
      }
    }

    return { success: true };
  });
