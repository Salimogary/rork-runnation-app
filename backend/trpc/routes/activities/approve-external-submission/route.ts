import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";
import { sendActivityApprovalPush } from "../../../push-notifications";
import { randomUUID } from "crypto";

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
        allowSpecialClubCoordinator: true,
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

      const { data: approvedActivity, error: insertError } = await ctx.supabase
        .from("activities")
        .insert({
          registration_id: submission.registration_id,
          activity_date: submission.activity_date,
          exercise_type: submission.exercise_type,
          distance_km: submission.distance_km,
          start_time: submission.start_time,
          end_time: endTime,
          pace_min_per_km: paceMinPerKm,
        })
        .select("activity_id")
        .single();

      if (insertError) {
        console.error("[Approve External Submission] Insert error:", insertError);
        throw new Error(insertError.message || "Failed to create activity");
      }

      if (submission.source_type === "medal_claim") {
        const externalEventName = String(submission.external_event_name || "").trim();
        const externalEventLocation = String(submission.external_event_location || "").trim();
        if (!externalEventName || !externalEventLocation) {
          throw new Error("External medal claim is missing event details.");
        }

        const eventId = submission.external_event_id || randomUUID();
        const activityDate = getDateOnly(submission.activity_date);
        const eventPayload = {
          event_id: eventId,
          event_name: externalEventName,
          starts_at: activityDate,
          ends_at: activityDate,
          registration_closes_at: activityDate,
          event_type: "same_day",
          country: externalEventLocation,
          country_code: "EX",
          is_virtual: true,
          event_location: externalEventLocation,
          entry: "free",
          has_medal: true,
          approval_status: "approved",
          club: "External",
          external_organizer_name: "External source",
          medal_date_start: activityDate,
          medal_date_end: activityDate,
          available_distances_km: [Number(submission.distance_km) || 0].filter((value) => value > 0),
        };

        const { error: eventUpsertError } = await ctx.supabase
          .from("events")
          .upsert(eventPayload, { onConflict: "event_id" });

        if (eventUpsertError) {
          console.error("[Approve External Submission] Medal event error:", eventUpsertError);
          throw new Error(eventUpsertError.message || "Failed to create external medal event.");
        }

        const participantPayload = {
          event_id: eventId,
          registration_id: submission.registration_id,
          registration_date: activityDate,
          distance_km: Number(Number(submission.distance_km || 0).toFixed(2)),
          time_seconds: timeSeconds,
        };

        const { data: existingParticipant, error: existingParticipantError } = await ctx.supabase
          .from("events_participants")
          .select("event_participant_id")
          .eq("event_id", eventId)
          .eq("registration_id", submission.registration_id)
          .maybeSingle();

        if (existingParticipantError) {
          throw new Error(existingParticipantError.message || "Could not check external medal participant row.");
        }

        const participantWrite = existingParticipant?.event_participant_id
          ? await ctx.supabase
              .from("events_participants")
              .update(participantPayload)
              .eq("event_participant_id", existingParticipant.event_participant_id)
          : await ctx.supabase
              .from("events_participants")
              .insert({
            event_participant_id: randomUUID(),
            ...participantPayload,
          });

        if (participantWrite.error) {
          console.error("[Approve External Submission] Medal participant error:", participantWrite.error);
          throw new Error(participantWrite.error.message || "Failed to add external medal to participant list.");
        }

        await ctx.supabase
          .from("external_activity_submissions")
          .update({
            external_event_id: eventId,
            approved_activity_id: approvedActivity.activity_id,
          })
          .eq("submission_id", input.submissionId);
      }

      const { error: notificationError } = await ctx.supabase
        .from("activity_approval_notifications")
        .insert({
          registration_id: submission.registration_id,
          activity_id: approvedActivity.activity_id,
          source_label: submission.source_label || (
            submission.source_type === "smart_watch" ? "Smart Watch" : "Sports App"
          ),
        });

      if (notificationError) {
        console.error("[Approve External Submission] Notification error:", notificationError);
      } else {
        const pushSent = await sendActivityApprovalPush(ctx, {
          registrationId: submission.registration_id,
          activityId: approvedActivity.activity_id,
          sourceLabel: submission.source_label || (
            submission.source_type === "smart_watch" ? "Smart Watch" : "Sports App"
          ),
        });
        if (pushSent) {
          await ctx.supabase
            .from("activity_approval_notifications")
            .update({ delivered_at: new Date().toISOString() })
            .eq("activity_id", approvedActivity.activity_id);
        }
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
          throw new Error(participantEventsError.message || "Could not check matching event registrations.");
        }

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

          const eventCreditResults = await Promise.all(
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

          const failedEventCredit = eventCreditResults.find((result: any) => result.error);
          if (failedEventCredit?.error) {
            throw new Error(failedEventCredit.error.message || "Activity was saved, but event credit could not be updated.");
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

