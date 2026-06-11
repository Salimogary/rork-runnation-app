import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireClubDirectoryAccess } from "../../../club-member-directory";

export default publicProcedure
  .input(z.object({ clubId: z.string().uuid(), memberId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => {
    await requireClubDirectoryAccess(ctx, input.clubId);
    const { error } = await ctx.supabase
      .from("club_member_directory")
      .delete()
      .eq("member_id", input.memberId)
      .eq("club_id", input.clubId);
    if (error) throw new Error(error.message || "Could not remove the club member.");
    return { success: true };
  });

