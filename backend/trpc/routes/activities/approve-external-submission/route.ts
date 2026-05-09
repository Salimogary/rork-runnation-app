import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

function getDateOnly(value?: string | null) {
  return String(value || "").slice(0, 10);
}

function getUtcWeekday(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export default publicProcedure
  .input(
    z.object({
      submissionId: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    try {
      await requireAdminPermission(ctx, {
        allowSuperAdmin: true,
              allowCountryCoordinator: true,
        allowClubCoordinator: true,
      });

      const { data: submission, error: fetchError } = await ctx.supabase
        .from("external_activity_submissions")
        .select("*")
        .eq("submission_id", input.submissionId)
        .single();

      if (fetchError || !submission) {
        throw new Error("Submission not found");
      }

      const durationParts = (submission.duration || "00:00:00").split(":");
      const durationHours = parseInt(durationParts[0] || "0");
      const durationMins = parseInt(durationParts[1] || "0");
      const durationSecs = parseInt(durationParts[2] || "0");
      const totalDurationMinutes = durationHours * 60 + durationMins + durationSecs / 60;

      const startTimeParts = submission.start_time.split(":");
      const startHours = parseInt(startTimeParts[0]);
      const startMinutes = parseInt(startTimeParts[1]);
      const totalMinutes = startHours * 60 + startMinutes + Math.round(totalDurationMinutes);
      const endHours = Math.floor(totalMinutes / 60) % 24;
      const endMinutes = totalMinutes % 60;
      const endTime = `${endHours.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}:00`;

      const paceMinPerKm = totalDurationMinutes > 0 && submission.distance_km > 0 ? totalDurationMinutes / submission.distance_km : 0;
      const timeSeconds = Math.round(totalDurationMinutes * 60);

      const { error: insertError } = await ctx.supabase
        .from("activities")
        .insert({
          registration_id: submission.registration_id,
          activity_date: submission.activity_date,
          exercise_type: submission.exercise_type,
          distance_km: submission.distance_km,
          start_time: submission.start_time,
          end_time: endTime,
          pace_min_per_km: paceMinPerKm,
        });

      if (insertError) {
        console.error("[Approve External Submission] Insert error:", insertError);
        throw new Error(insertError.message || "Failed to create activity");
      }

      if (submission.evidence_path) {
        const { data: participantEvents, error: participantEventsError } = await ctx.supabase
          .from("events_participants")
          .select(`
            event_id,
            events!events_participants_event_id_fkey(event_id, starts_at, ends_at, event_type, recurrence_weekday)
          `)
          .eq("registration_id", submission.registration_id);

        if (participantEventsError) {
          console.warn("[Approve External Submission] Could not check event matches:", participantEventsError.message);
        } else {
        const activityDate = getDateOnly(submission.activity_date);
        const activityWeekday = getUtcWeekday(activityDate);
        const matchingEventIds = (participantEvents || [])
          .filter((row: any) => {
            const event = Array.isArray(row.events) ? row.events[0] : row.events;
            const eventType = event?.event_type || (getDateOnly(event?.starts_at) === getDateOnly(event?.ends_at) ? "same_day" : "multiday");
            if (eventType === "multiday") return false;
            const startDate = getDateOnly(event?.starts_at);
            const endDate = getDateOnly(event?.ends_at);
            if (startDate && activityDate < startDate) return false;
            if (endDate && activityDate > endDate) return false;
            if (eventType === "recurring") {
              return event?.recurrence_weekday === null ||
                event?.recurrence_weekday === undefined ||
                Number(event.recurrence_weekday) === activityWeekday;
            }
            return startDate === activityDate;
          })
          .map((row: any) => row.event_id)
          .filter(Boolean);

        await Promise.all(
          matchingEventIds.map((eventId: string) =>
            ctx.supabase
              .from("events_participants")
              .update({
                distance_km: Number(Number(submission.distance_km || 0).toFixed(2)),
                time_seconds: timeSeconds,
              })
              .eq("event_id", eventId)
              .eq("registration_id", submission.registration_id)
          )
        );
        }
      }

      const { error: deleteError } = await ctx.supabase
        .from("external_activity_submissions")
        .delete()
        .eq("submission_id", input.submissionId);

      if (deleteError) {
        console.error("[Approve External Submission] Delete error:", deleteError);
      }

      return { success: true };
    } catch (error: any) {
      console.error("[Approve External Submission] Error:", error);
      throw new Error(error.message || "Failed to approve submission");
    }
  });

