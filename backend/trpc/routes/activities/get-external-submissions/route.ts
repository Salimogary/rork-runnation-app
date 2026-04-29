import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

export default publicProcedure.query(async ({ ctx }) => {
  try {
    await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
            allowCountryCoordinator: true,
      allowClubCoordinator: true,
    });

    const { data: submissions, error } = await ctx.supabase
      .from("external_activity_submissions")
      .select(`
        registration_id,
        activity_date
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

    const groupedByDate = new Map<string, Map<string, number>>();

    submissions?.forEach((sub) => {
      const date = sub.activity_date;
      if (!groupedByDate.has(date)) {
        groupedByDate.set(date, new Map());
      }
      const dateGroup = groupedByDate.get(date)!;
      const currentCount = dateGroup.get(sub.registration_id) || 0;
      dateGroup.set(sub.registration_id, currentCount + 1);
    });

    const result = [];
    for (const [activityDate, registrationMap] of groupedByDate.entries()) {
      const users = [];
      for (const [registrationId, activityCount] of registrationMap.entries()) {
        const user = regMap.get(registrationId);
        users.push({
          registrationId,
          activityCount,
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

