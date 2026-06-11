import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireClubDirectoryAccess } from "../../../club-member-directory";

export default publicProcedure
  .input(z.object({ clubId: z.string().uuid() }))
  .query(async ({ input, ctx }) => {
    await requireClubDirectoryAccess(ctx, input.clubId);
    const { data, error } = await ctx.supabase
      .from("club_member_directory")
      .select("member_id, club_id, name, nickname, phone, email, linked_registration_id, created_at, updated_at")
      .eq("club_id", input.clubId)
      .order("name");
    if (error) throw new Error(error.message || "Could not load the club member list.");
    return data || [];
  });

