import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
    })
  )
  .query(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const { data, error } = await ctx.supabase
      .from("chat_moderation_reports")
      .select(`
        report_id,
        reported_registration_id,
        social_post_id,
        comment_id,
        reason_category,
        description,
        status,
        admin_notes,
        reviewed_at,
        created_at
      `)
      .eq("reporter_registration_id", input.registrationId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message || "Could not load your chat report feedback.");
    }

    const reportedIds = [
      ...new Set((data ?? []).map((report: any) => report.reported_registration_id).filter(Boolean)),
    ];

    const { data: reportedUsers } = reportedIds.length
      ? await ctx.supabase
          .from("registrations")
          .select("registration_id, first_name, other_names, username")
          .in("registration_id", reportedIds)
      : { data: [] };

    const reportedUserMap = new Map((reportedUsers ?? []).map((user: any) => [user.registration_id, user]));

    return (data ?? []).map((report: any) => {
      const reportedUser = report.reported_registration_id
        ? reportedUserMap.get(report.reported_registration_id) ?? null
        : null;
      const reportedName = reportedUser
        ? [reportedUser.first_name, reportedUser.other_names].filter(Boolean).join(" ") || reportedUser.username
        : null;

      return {
        reportId: report.report_id,
        reportedName,
        reportedUsername: reportedUser?.username ?? null,
        postId: report.social_post_id,
        commentId: report.comment_id,
        reasonCategory: report.reason_category,
        description: report.description,
        status: report.status,
        adminNotes: report.admin_notes,
        reviewedAt: report.reviewed_at,
        createdAt: report.created_at,
      };
    });
  });
