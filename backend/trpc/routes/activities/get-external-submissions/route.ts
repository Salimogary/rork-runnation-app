import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";
import { resolvePrivateActivityUploadUrl } from "../../../storage";

export default publicProcedure.query(async ({ ctx }) => {
  try {
    await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
      allowSpecialClubCoordinator: true,
    });

    const { data: submissions, error } = await ctx.supabase
      .from("external_activity_submissions")
      .select(`
        submission_id,
        registration_id,
        activity_date,
        exercise_type,
        start_time,
        duration,
        distance_km,
        source_type,
        source_label,
        evidence_path,
        evidence_mime_type
      `)
      .order("activity_date", { ascending: false });

    if (error) {
      console.error("[Get External Submissions] Error:", error);
      throw new Error(error.message || "Failed to fetch submissions");
    }

    const { data: registrations, error: regError } = await ctx.supabase
      .from("registrations")
      .select('registration_id, first_name, other_names, email, username');

    if (regError) {
      console.error("[Get External Submissions] Registration error:", regError);
      throw new Error(regError.message || "Failed to fetch user data");
    }

    const regMap = new Map(
      registrations?.map((r) => [
        r.registration_id,
        {
          firstName: r.first_name || "",
          otherNames: r.other_names || "",
          email: r.email || "",
          username: r.username || "",
        },
      ])
    );

    const submissionsWithEvidence = await Promise.all(
      (submissions || []).map(async (sub: any) => ({
        submissionId: sub.submission_id,
        registrationId: sub.registration_id,
        activityDate: sub.activity_date,
        exerciseType: sub.exercise_type,
        startTime: sub.start_time,
        duration: sub.duration,
        distanceKm: sub.distance_km,
        sourceType: sub.source_type,
        sourceLabel: sub.source_label,
        evidencePath: sub.evidence_path,
        evidenceMimeType: sub.evidence_mime_type,
        evidenceUrl: sub.evidence_path
          ? await resolvePrivateActivityUploadUrl(ctx.supabase, sub.evidence_path)
          : null,
      }))
    );

    const groupedByDate = new Map<string, Map<string, any[]>>();

    submissionsWithEvidence.forEach((sub) => {
      const date = sub.activityDate;
      if (!groupedByDate.has(date)) {
        groupedByDate.set(date, new Map());
      }
      const dateGroup = groupedByDate.get(date)!;
      const currentSubmissions = dateGroup.get(sub.registrationId) || [];
      dateGroup.set(sub.registrationId, [...currentSubmissions, sub]);
    });

    const result = [];
    for (const [activityDate, registrationMap] of groupedByDate.entries()) {
      const users = [];
      for (const [registrationId, userSubmissions] of registrationMap.entries()) {
        const user = regMap.get(registrationId);
        users.push({
          registrationId,
          activityCount: userSubmissions.length,
          submissions: userSubmissions,
          userName: user
            ? `${user.firstName} ${user.otherNames}`.trim() || user.username
            : "Unknown User",
          email: user?.email || "N/A",
        });
      }
      result.push({
        activityDate,
        users,
        totalEntries: users.reduce((sum, u) => sum + u.activityCount, 0),
      });
    }

    result.sort((a, b) => a.activityDate.localeCompare(b.activityDate));

    return result;
  } catch (error: any) {
    console.error("[Get External Submissions] Error:", error);
    throw new Error(error.message || "Failed to fetch submissions");
  }
});

