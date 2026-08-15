import { z } from "zod";
import { randomUUID } from "crypto";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";
import { secondsBetween } from "../stair-utils";

export default publicProcedure
  .input(z.object({ registrationId: z.string(), sessionId: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    await requireRegistrationOwner(ctx, input.registrationId, { allowAdmin: true });

    const endedAt = new Date().toISOString();
    const { data: session, error: sessionError } = await ctx.supabase
      .from("stair_sessions")
      .select("*")
      .eq("session_id", input.sessionId)
      .eq("registration_id", input.registrationId)
      .maybeSingle();
    if (sessionError) throw new Error(sessionError.message || "Could not load stair session.");
    if (!session) throw new Error("Stair session not found.");

    const totalDurationSeconds = secondsBetween(session.started_at, session.ended_at || endedAt);
    const finalStatus = Number(session.verified_ascending_steps || 0) > 0
      ? session.status === "manual_review" || session.status === "partially_verified"
        ? session.status
        : "accepted"
      : "rejected";

    const { data: updatedSession, error: updateError } = await ctx.supabase
      .from("stair_sessions")
      .update({
        ended_at: session.ended_at || endedAt,
        total_duration_seconds: totalDurationSeconds,
        status: finalStatus,
      })
      .eq("session_id", input.sessionId)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message || "Could not end stair session.");

    let activityId: string | null = null;
    if (Number(updatedSession.verified_ascending_steps || 0) > 0) {
      const { data: existingActivity, error: existingError } = await ctx.supabase
        .from("activities")
        .select("activity_id")
        .eq("stair_session_id", input.sessionId)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message || "Could not check stair activity.");

      activityId = existingActivity?.activity_id || randomUUID();
      if (!existingActivity) {
        const startedAt = new Date(updatedSession.started_at);
        const endedAtDate = new Date(updatedSession.ended_at);
        const { error: activityError } = await ctx.supabase.from("activities").insert({
          activity_id: activityId,
          registration_id: input.registrationId,
          activity_date: startedAt.toISOString().split("T")[0],
          exercise_type: "Stairs",
          distance_km: 0,
          steps_count: Number(updatedSession.verified_ascending_steps || 0),
          pause_duration_seconds: 0,
          start_time: startedAt.toISOString().split("T")[1].split(".")[0],
          end_time: endedAtDate.toISOString().split("T")[1].split(".")[0],
          pace_min_per_km: 0,
          stair_session_id: input.sessionId,
        });
        if (activityError) throw new Error(activityError.message || "Could not save stair activity.");
      }
    }

    return {
      success: true,
      session: {
        sessionId: updatedSession.session_id,
        status: updatedSession.status,
        completedAscents: updatedSession.completed_ascents,
        verifiedAscendingSteps: updatedSession.verified_ascending_steps,
        totalDurationSeconds: updatedSession.total_duration_seconds,
        activityId,
      },
    };
  });
