import { z } from "zod";
import { publicProcedure } from "../../../create-context";

const reportSchema = z.object({
  reportId: z.string().uuid(),
  registrationId: z.string().nullable(),
  occurredAt: z.string().datetime(),
  errorName: z.string().max(120),
  message: z.string().max(2000),
  stack: z.string().max(12000).nullable(),
  componentStack: z.string().max(12000).nullable(),
  fatal: z.boolean(),
  platform: z.string().max(30),
  osVersion: z.string().max(120),
  appVersion: z.string().max(60),
  buildNumber: z.string().max(60),
  source: z.string().max(120),
});

export default publicProcedure
  .input(z.object({ reports: z.array(reportSchema).min(1).max(20) }))
  .mutation(async ({ ctx, input }) => {
    const rows = input.reports.map((report) => ({
      report_id: report.reportId,
      auth_user_id: ctx.authUserId,
      registration_id: report.registrationId,
      occurred_at: report.occurredAt,
      error_name: report.errorName,
      message: report.message,
      stack: report.stack,
      component_stack: report.componentStack,
      is_fatal: report.fatal,
      platform: report.platform,
      os_version: report.osVersion,
      app_version: report.appVersion,
      build_number: report.buildNumber,
      source: report.source,
    }));

    const { error } = await ctx.supabase
      .from("app_crash_reports")
      .upsert(rows, { onConflict: "report_id", ignoreDuplicates: true });

    if (error) throw new Error(error.message || "Could not save crash reports.");
    return { accepted: rows.length };
  });
