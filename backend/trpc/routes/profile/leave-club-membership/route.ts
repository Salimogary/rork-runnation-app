import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      clubId: z.string().uuid().nullable().optional(),
      club: z.string().trim().min(1).nullable().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    let query = ctx.supabase
      .from("club_membership_request")
      .delete()
      .eq("registration_id", input.registrationId)
      .eq("request_type", "membership")
      .neq("status", "rejected");

    if (input.clubId) {
      query = query.eq("club_id", input.clubId);
    } else if (input.club) {
      query = query.eq("club", input.club);
    } else {
      throw new Error("Choose a club to leave.");
    }

    const { error } = await query;
    if (error) {
      throw new Error(error.message || "Could not leave this club.");
    }

    return { success: true };
  });
