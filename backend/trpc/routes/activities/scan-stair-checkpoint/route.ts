import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";
import {
  hashCheckpointToken,
  normalizeCheckpointToken,
  secondsBetween,
  summarizeSegmentVerification,
} from "../stair-utils";

const sensorSummarySchema = z.object({
  movementActiveSeconds: z.number().int().min(0).optional(),
  sensorDataCoverage: z.number().min(0).max(1).optional(),
  detectedStepEvents: z.number().int().min(0).optional(),
  barometricElevationChangeM: z.number().optional().nullable(),
}).optional();

const inputSchema = z.object({
  registrationId: z.string(),
  qrToken: z.string().min(8),
  sessionId: z.string().uuid().optional().nullable(),
  selectedAscentType: z.enum(["short", "full"]).default("full"),
  devicePlatform: z.string().optional().nullable(),
  deviceModel: z.string().optional().nullable(),
  availableSensors: z.record(z.string(), z.any()).optional().default({}),
  sensorSummary: sensorSummarySchema,
});

async function fetchSessionTotals(ctx: any, sessionId: string) {
  const { data: laps, error } = await ctx.supabase
    .from("stair_laps")
    .select("awarded_steps, verification_status")
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message || "Could not refresh stair session totals.");

  const acceptedLaps = (laps || []).filter((lap: any) => ["accepted", "partially_verified"].includes(lap.verification_status));
  const verifiedSteps = acceptedLaps.reduce((sum: number, lap: any) => sum + (Number(lap.awarded_steps) || 0), 0);
  return { verifiedSteps, completedAscents: acceptedLaps.length };
}

async function updateSessionTotals(ctx: any, sessionId: string, status: string = "accepted") {
  const totals = await fetchSessionTotals(ctx, sessionId);
  const { error } = await ctx.supabase
    .from("stair_sessions")
    .update({
      verified_ascending_steps: totals.verifiedSteps,
      completed_ascents: totals.completedAscents,
      status,
    })
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message || "Could not update stair session totals.");
  return totals;
}

export default publicProcedure.input(inputSchema).mutation(async ({ ctx, input }) => {
  await requireRegistrationOwner(ctx, input.registrationId, { allowAdmin: true });

  const tokenHash = hashCheckpointToken(normalizeCheckpointToken(input.qrToken));
  const scanTime = new Date().toISOString();
  const { data: checkpoint, error: checkpointError } = await ctx.supabase
    .from("stair_checkpoints")
    .select(`
      checkpoint_id,
      checkpoint_type,
      floor_label,
      is_active,
      route_id,
      stair_routes (
        route_id,
        route_name,
        stairwell_name,
        middle_checkpoint_required,
        bottom_to_middle_steps,
        middle_to_top_steps,
        bottom_to_top_steps,
        minimum_duration_seconds,
        maximum_duration_seconds,
        verification_status,
        stair_buildings (
          building_id,
          building_name,
          city,
          country_code
        )
      )
    `)
    .eq("qr_token_hash", tokenHash)
    .maybeSingle();
  if (checkpointError) throw new Error(checkpointError.message || "Could not read stair checkpoint.");
  if (!checkpoint) throw new Error("Invalid stair QR code.");
  if (!checkpoint.is_active) throw new Error("This stair QR checkpoint is not active.");

  const route = (checkpoint as any).stair_routes;
  if (!route || !["accepted", "verified"].includes(route.verification_status)) {
    throw new Error("This staircase route is not approved for live stair activity yet.");
  }

  let sessionId = input.sessionId || null;
  let session: any = null;
  if (sessionId) {
    const { data, error } = await ctx.supabase
      .from("stair_sessions")
      .select("*")
      .eq("session_id", sessionId)
      .eq("registration_id", input.registrationId)
      .is("ended_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message || "Could not load stair session.");
    session = data;
    if (!session) throw new Error("This stair session is no longer active.");
    if (session.route_id !== checkpoint.route_id) throw new Error("ROUTE_MISMATCH");
  }

  if (!session && checkpoint.checkpoint_type !== "bottom") {
    throw new Error("Scan the bottom staircase QR code to start a stair climb.");
  }

  if (!session) {
    const { data, error } = await ctx.supabase
      .from("stair_sessions")
      .insert({
        registration_id: input.registrationId,
        route_id: checkpoint.route_id,
        started_at: scanTime,
        device_platform: input.devicePlatform || null,
        device_model: input.deviceModel || null,
        available_sensors: input.availableSensors || {},
        status: "pending",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message || "Could not start stair session.");
    session = data;
    sessionId = data.session_id;
  }

  const { data: openLap, error: lapFetchError } = await ctx.supabase
    .from("stair_laps")
    .select("*")
    .eq("session_id", sessionId)
    .eq("verification_status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lapFetchError) throw new Error(lapFetchError.message || "Could not load stair lap.");

  const routeInfo = {
    routeId: route.route_id,
    buildingName: route.stair_buildings?.building_name,
    routeName: route.route_name,
    middleCheckpointRequired: route.middle_checkpoint_required,
    selectedAscentType: input.selectedAscentType,
  };

  if (checkpoint.checkpoint_type === "bottom") {
    if (openLap && !openLap.lap_endpoint) {
      throw new Error("DUPLICATE_SCAN");
    }
    const { data: lap, error } = await ctx.supabase
      .from("stair_laps")
      .insert({
        session_id: sessionId,
        route_id: checkpoint.route_id,
        selected_ascent_type: route.middle_checkpoint_required ? input.selectedAscentType : "full",
        bottom_checkpoint_id: checkpoint.checkpoint_id,
        bottom_scanned_at: scanTime,
        verification_status: "pending",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message || "Could not start stair lap.");

    return {
      success: true,
      action: "lap_started",
      message: route.middle_checkpoint_required
        ? input.selectedAscentType === "short"
          ? "Bottom QR scanned. Climb to the middle checkpoint."
          : "Bottom QR scanned. Climb to the middle checkpoint first, then the top."
        : "Bottom QR scanned. Climb to the top checkpoint.",
      sessionId,
      lapId: lap.lap_id,
      totalSteps: session.verified_ascending_steps || 0,
      completedAscents: session.completed_ascents || 0,
      nextCheckpoint: route.middle_checkpoint_required ? "middle" : "top",
      route: routeInfo,
    };
  }

  if (!openLap || !openLap.bottom_scanned_at) {
    throw new Error("INVALID_QR_ORDER");
  }

  const writeSegment = async (segmentType: "bottom_to_top" | "bottom_to_middle" | "middle_to_top", startId: string, endId: string, startedAt: string) => {
    const durationSeconds = secondsBetween(startedAt, scanTime);
    const result = summarizeSegmentVerification({
      durationSeconds,
      minimumDurationSeconds: route.minimum_duration_seconds,
      maximumDurationSeconds: route.maximum_duration_seconds,
      movementActiveSeconds: input.sensorSummary?.movementActiveSeconds,
      sensorDataCoverage: input.sensorSummary?.sensorDataCoverage,
    });

    const { data: segment, error } = await ctx.supabase
      .from("stair_lap_segments")
      .insert({
        lap_id: openLap.lap_id,
        segment_type: segmentType,
        start_checkpoint_id: startId,
        end_checkpoint_id: endId,
        started_at: startedAt,
        ended_at: scanTime,
        duration_seconds: durationSeconds,
        movement_active_seconds: input.sensorSummary?.movementActiveSeconds ?? durationSeconds,
        movement_ratio: result.movementRatio,
        sensor_data_coverage: result.coverage,
        detected_step_events: input.sensorSummary?.detectedStepEvents ?? null,
        barometric_elevation_change_m: input.sensorSummary?.barometricElevationChangeM ?? null,
        verification_status: result.status,
        rejection_reason: result.reason,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message || "Could not save stair segment.");
    return segment;
  };

  if (checkpoint.checkpoint_type === "middle") {
    if (!route.middle_checkpoint_required) throw new Error("ROUTE_MISMATCH");
    if (openLap.middle_scanned_at) throw new Error("DUPLICATE_SCAN");

    const segment = await writeSegment("bottom_to_middle", openLap.bottom_checkpoint_id, checkpoint.checkpoint_id, openLap.bottom_scanned_at);
    if (segment.verification_status !== "accepted") {
      await ctx.supabase
        .from("stair_laps")
        .update({
          middle_checkpoint_id: checkpoint.checkpoint_id,
          middle_scanned_at: scanTime,
          verification_status: segment.verification_status,
          rejection_reason: segment.rejection_reason,
        })
        .eq("lap_id", openLap.lap_id);
      return { success: true, action: "manual_review", message: "Middle checkpoint scanned, but this segment needs review.", sessionId, lapId: openLap.lap_id, route: routeInfo };
    }

    if (openLap.selected_ascent_type === "short") {
      const awardedSteps = Number(route.bottom_to_middle_steps || 0);
      const durationSeconds = secondsBetween(openLap.bottom_scanned_at, scanTime);
      await ctx.supabase
        .from("stair_laps")
        .update({
          middle_checkpoint_id: checkpoint.checkpoint_id,
          middle_scanned_at: scanTime,
          lap_endpoint: "middle",
          duration_seconds: durationSeconds,
          awarded_steps: awardedSteps,
          verification_status: "accepted",
        })
        .eq("lap_id", openLap.lap_id);
      const totals = await updateSessionTotals(ctx, sessionId!, "accepted");
      return {
        success: true,
        action: "ascent_completed",
        message: `Short ascent accepted. ${awardedSteps.toLocaleString()} stair steps added.`,
        sessionId,
        lapId: openLap.lap_id,
        awardedSteps,
        totalSteps: totals.verifiedSteps,
        completedAscents: totals.completedAscents,
        nextCheckpoint: "bottom",
        route: routeInfo,
      };
    }

    await ctx.supabase
      .from("stair_laps")
      .update({
        middle_checkpoint_id: checkpoint.checkpoint_id,
        middle_scanned_at: scanTime,
      })
      .eq("lap_id", openLap.lap_id);

    return {
      success: true,
      action: "middle_confirmed",
      message: "Middle checkpoint accepted. Continue to the top checkpoint.",
      sessionId,
      lapId: openLap.lap_id,
      totalSteps: session.verified_ascending_steps || 0,
      completedAscents: session.completed_ascents || 0,
      nextCheckpoint: "top",
      route: routeInfo,
    };
  }

  if (checkpoint.checkpoint_type !== "top") {
    throw new Error("INVALID_QR_ORDER");
  }

  if (route.middle_checkpoint_required && !openLap.middle_scanned_at) {
    throw new Error("INVALID_QR_ORDER");
  }

  const segmentType = route.middle_checkpoint_required ? "middle_to_top" : "bottom_to_top";
  const startCheckpointId = route.middle_checkpoint_required ? openLap.middle_checkpoint_id : openLap.bottom_checkpoint_id;
  const segmentStartedAt = route.middle_checkpoint_required ? openLap.middle_scanned_at : openLap.bottom_scanned_at;
  const segment = await writeSegment(segmentType, startCheckpointId, checkpoint.checkpoint_id, segmentStartedAt);

  let awardedSteps = 0;
  let lapStatus = segment.verification_status;
  let rejectionReason = segment.rejection_reason;
  if (segment.verification_status === "accepted") {
    awardedSteps = Number(route.bottom_to_top_steps || 0);
    lapStatus = "accepted";
    rejectionReason = null;
  } else if (route.middle_checkpoint_required && openLap.middle_scanned_at) {
    awardedSteps = Number(route.bottom_to_middle_steps || 0);
    lapStatus = awardedSteps > 0 ? "partially_verified" : segment.verification_status;
  }

  const durationSeconds = secondsBetween(openLap.bottom_scanned_at, scanTime);
  await ctx.supabase
    .from("stair_laps")
    .update({
      top_checkpoint_id: checkpoint.checkpoint_id,
      top_scanned_at: scanTime,
      lap_endpoint: "top",
      duration_seconds: durationSeconds,
      awarded_steps: awardedSteps,
      verification_status: lapStatus,
      rejection_reason: rejectionReason,
    })
    .eq("lap_id", openLap.lap_id);

  const totals = await updateSessionTotals(ctx, sessionId!, lapStatus === "accepted" ? "accepted" : lapStatus);
  return {
    success: true,
    action: lapStatus === "accepted" ? "ascent_completed" : lapStatus,
    message: lapStatus === "accepted"
      ? `Full ascent accepted. ${awardedSteps.toLocaleString()} stair steps added.`
      : `Top checkpoint scanned. ${awardedSteps.toLocaleString()} verified steps were added and the rest needs review.`,
    sessionId,
    lapId: openLap.lap_id,
    awardedSteps,
    totalSteps: totals.verifiedSteps,
    completedAscents: totals.completedAscents,
    nextCheckpoint: "bottom",
    route: routeInfo,
  };
});
