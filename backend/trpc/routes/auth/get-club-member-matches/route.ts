import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";
import { findDirectoryMatches } from "../../../club-member-directory";

export default publicProcedure
  .input(z.object({ registrationId: z.string().min(1) }))
  .query(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);
    const rows = await findDirectoryMatches(ctx, input.registrationId);
    return rows.map((row: any) => {
      const club = Array.isArray(row.clubs) ? row.clubs[0] : row.clubs;
      return {
        memberId: row.member_id,
        clubId: row.club_id,
        clubName: club?.club_name || "Your club",
        country: club?.country || null,
        location: club?.location || null,
        matchedName: row.nickname || row.name,
      };
    });
  });

