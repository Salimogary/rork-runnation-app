import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

const REPORT_SCREENSHOT_BUCKET = "chat_report_screenshots";

async function resolveScreenshotUrl(supabase: any, path?: string | null) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(REPORT_SCREENSHOT_BUCKET)
    .createSignedUrl(path, 60 * 30);

  if (error) {
    console.warn("Report screenshot signed URL warning:", error.message);
    return null;
  }

  return data?.signedUrl ?? null;
}

export default publicProcedure.query(async ({ ctx }) => {
  await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowChatRoomAdministrator: true,
  });

  const { data, error } = await ctx.supabase
    .from("chat_moderation_reports")
    .select(`
      report_id,
      reporter_registration_id,
      reported_registration_id,
      social_post_id,
      comment_id,
      reason_category,
      description,
      screenshot_path,
      status,
      admin_notes,
      reviewed_at,
      created_at
    `)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Could not load chat moderation reports.");
  }

  const registrationIds = [
    ...new Set(
      (data || [])
        .flatMap((report: any) => [report.reporter_registration_id, report.reported_registration_id])
        .filter(Boolean)
    ),
  ];

  const { data: users } = registrationIds.length
    ? await ctx.supabase
        .from("registrations")
        .select("registration_id, first_name, other_names, username, country")
        .in("registration_id", registrationIds)
    : { data: [] };

  const { data: flags } = registrationIds.length
    ? await ctx.supabase
        .from("user_moderation_flags")
        .select("registration_id, confirmed_flags, dismissed_reports, is_banned, ban_reason, suspended_until, suspension_status")
        .in("registration_id", registrationIds)
    : { data: [] };

  const userMap = new Map((users || []).map((user: any) => [user.registration_id, user]));
  const flagMap = new Map((flags || []).map((flag: any) => [flag.registration_id, flag]));

  return await Promise.all(
    (data || []).map(async (report: any) => {
      const reporter = userMap.get(report.reporter_registration_id) ?? null;
      const reported = report.reported_registration_id ? userMap.get(report.reported_registration_id) ?? null : null;
      return {
        reportId: report.report_id,
        reporterRegistrationId: report.reporter_registration_id,
        reportedRegistrationId: report.reported_registration_id,
        postId: report.social_post_id,
        commentId: report.comment_id,
        reasonCategory: report.reason_category,
        description: report.description,
        screenshotUrl: await resolveScreenshotUrl(ctx.supabase, report.screenshot_path),
        status: report.status,
        adminNotes: report.admin_notes,
        reviewedAt: report.reviewed_at,
        createdAt: report.created_at,
        reporterName: reporter ? [reporter.first_name, reporter.other_names].filter(Boolean).join(" ") || reporter.username : null,
        reportedName: reported ? [reported.first_name, reported.other_names].filter(Boolean).join(" ") || reported.username : null,
        reportedUsername: reported?.username ?? null,
        reportedCountry: reported?.country ?? null,
        offenderFlags: report.reported_registration_id ? flagMap.get(report.reported_registration_id) ?? null : null,
      };
    })
  );
});

