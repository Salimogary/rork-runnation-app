import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction } from "../../../rbac";
import {
  normalizeDirectoryEmail,
  normalizeDirectoryPhone,
  requireClubDirectoryAccess,
} from "../../../club-member-directory";

const memberSchema = z.object({
  memberId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  nickname: z.string().trim().max(100).nullable().optional(),
  phone: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
});

export default publicProcedure
  .input(z.object({
    clubId: z.string().uuid(),
    members: z.array(memberSchema).min(1).max(1000),
  }))
  .mutation(async ({ input, ctx }) => {
    const actor = await requireClubDirectoryAccess(ctx, input.clubId);
    const rows = input.members.map((member) => {
      const normalizedPhone = normalizeDirectoryPhone(member.phone);
      const normalizedEmail = normalizeDirectoryEmail(member.email);
      if (!normalizedPhone && !normalizedEmail) {
        throw new Error(`${member.name} needs a phone number or email address.`);
      }
      return {
        ...(member.memberId ? { member_id: member.memberId } : {}),
        club_id: input.clubId,
        name: member.name.trim(),
        nickname: member.nickname?.trim() || null,
        phone: member.phone?.trim() || null,
        normalized_phone: normalizedPhone,
        email: member.email?.trim().toLowerCase() || null,
        normalized_email: normalizedEmail,
        created_by: actor.authUserId,
        updated_at: new Date().toISOString(),
      };
    });

    for (const row of rows) {
      let existingMemberId = "member_id" in row ? row.member_id : null;
      if (!existingMemberId && row.normalized_email) {
        const { data } = await ctx.supabase
          .from("club_member_directory")
          .select("member_id")
          .eq("club_id", input.clubId)
          .eq("normalized_email", row.normalized_email)
          .maybeSingle();
        existingMemberId = data?.member_id || null;
      }
      if (!existingMemberId && row.normalized_phone) {
        const { data } = await ctx.supabase
          .from("club_member_directory")
          .select("member_id")
          .eq("club_id", input.clubId)
          .eq("normalized_phone", row.normalized_phone)
          .maybeSingle();
        existingMemberId = data?.member_id || null;
      }

      const { member_id: _memberId, ...payload } = row as typeof row & { member_id?: string };
      const { error } = existingMemberId
        ? await ctx.supabase.from("club_member_directory").update(payload).eq("member_id", existingMemberId).eq("club_id", input.clubId)
        : await ctx.supabase.from("club_member_directory").insert(payload);
      if (error) throw new Error(error.message || `Could not save ${row.name}.`);
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "club_member_directory_upsert",
      targetClubId: input.clubId,
      metadata: { count: rows.length },
    });
    return { success: true, count: rows.length };
  });
