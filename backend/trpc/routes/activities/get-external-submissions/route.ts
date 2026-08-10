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

    const submissionSelect = `
      submission_id,
      registration_id,
      activity_date,
      exercise_type,
      start_time,
      duration,
      distance_km,
      steps_count,
      source_type,
      source_label,
      external_event_name,
      external_event_location,
      external_event_id,
      evidence_path,
      evidence_mime_type
    `;
    const submissionSelectWithoutSteps = `
      submission_id,
      registration_id,
      activity_date,
      exercise_type,
      start_time,
      duration,
      distance_km,
      source_type,
      source_label,
      external_event_name,
      external_event_location,
      external_event_id,
      evidence_path,
      evidence_mime_type
    `;

    let submissionsResult: any = await ctx.supabase
      .from("external_activity_submissions")
      .select(submissionSelect)
      .order("activity_date", { ascending: false });

    if (submissionsResult.error?.message?.includes("steps_count")) {
      console.warn("[Get External Submissions] steps_count missing; loading external submissions without stair step data.");
      submissionsResult = await ctx.supabase
        .from("external_activity_submissions")
        .select(submissionSelectWithoutSteps)
        .order("activity_date", { ascending: false });
    }

    const { data: submissions, error } = submissionsResult;

    if (error) {
      console.error("[Get External Submissions] Error:", error);
      throw new Error(error.message || "Failed to fetch submissions");
    }

    let registrationsResult: any = await ctx.supabase
      .from("registrations")
      .select('registration_id, first_name, other_names, email, username');

    if (registrationsResult.error?.message?.includes("registrations.email")) {
      console.warn("[Get External Submissions] registrations.email missing; loading registrations without email.");
      registrationsResult = await ctx.supabase
        .from("registrations")
        .select('registration_id, first_name, other_names, username');
    }

    const { data: registrations, error: regError } = registrationsResult;

    if (regError) {
      console.error("[Get External Submissions] Registration error:", regError);
      throw new Error(regError.message || "Failed to fetch user data");
    }

    const regMap = new Map<string, { firstName: string; otherNames: string; email: string; username: string }>(
      (registrations || []).map((r: any) => [
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
        stepsCount: sub.steps_count,
        sourceType: sub.source_type,
        sourceLabel: sub.source_label,
        externalEventName: sub.external_event_name,
        externalEventLocation: sub.external_event_location,
        externalEventId: sub.external_event_id,
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

