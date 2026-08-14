import { publicProcedure } from "../../../create-context";
import { z } from "zod";

const inputSchema = z.object({
  registrationId: z.string().optional().nullable(),
}).optional();

export default publicProcedure.input(inputSchema).query(async ({ ctx, input }) => {
  const { data, error } = await ctx.supabase
    .from("stair_routes")
    .select(`
      route_id,
      route_name,
      stairwell_name,
      bottom_floor_label,
      middle_floor_label,
      top_floor_label,
      floor_segments,
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
        country_code,
        city,
        address_description,
        access_type,
        qr_tag_type,
        qr_custodian_name,
        qr_custodian_phone,
        qr_custodian_email,
        verification_status
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Could not load stair routes.");
  }

  const routeIds = (data || []).map((route: any) => route.route_id).filter(Boolean);
  const checkpointCounts = new Map<string, { total: number; printed: number; active: number }>();
  const printCounts = new Map<string, number>();
  const mySessionCounts = new Map<string, number>();

  if (routeIds.length > 0) {
    const { data: checkpoints, error: checkpointError } = await ctx.supabase
      .from("stair_checkpoints")
      .select("route_id, installation_status, is_active")
      .in("route_id", routeIds);
    if (checkpointError) throw new Error(checkpointError.message || "Could not load stair QR checkpoints.");

    (checkpoints || []).forEach((checkpoint: any) => {
      const current = checkpointCounts.get(checkpoint.route_id) || { total: 0, printed: 0, active: 0 };
      current.total += 1;
      if (["printed", "installed"].includes(checkpoint.installation_status)) current.printed += 1;
      if (checkpoint.is_active) current.active += 1;
      checkpointCounts.set(checkpoint.route_id, current);
    });

    const { data: prints, error: printError } = await ctx.supabase
      .from("stair_qr_prints")
      .select("route_id")
      .in("route_id", routeIds);
    if (printError && !String(printError.message || "").includes("stair_qr_prints") && !String((printError as any).code || "").includes("42P01")) {
      throw new Error(printError.message || "Could not load stair QR print records.");
    }

    (prints || []).forEach((print: any) => {
      printCounts.set(print.route_id, (printCounts.get(print.route_id) || 0) + 1);
    });

    if (input?.registrationId) {
      const { data: sessions, error: sessionsError } = await ctx.supabase
        .from("stair_sessions")
        .select("route_id")
        .eq("registration_id", input.registrationId)
        .in("route_id", routeIds);
      if (sessionsError) throw new Error(sessionsError.message || "Could not load your stair workout spots.");
      (sessions || []).forEach((session: any) => {
        mySessionCounts.set(session.route_id, (mySessionCounts.get(session.route_id) || 0) + 1);
      });
    }
  }

  return (data || []).map((route: any) => {
    const checkpointSummary = checkpointCounts.get(route.route_id) || { total: 0, printed: 0, active: 0 };
    const printRecordCount = printCounts.get(route.route_id) || 0;
    return ({
    routeId: route.route_id,
    routeName: route.route_name,
    stairwellName: route.stairwell_name,
    bottomFloorLabel: route.bottom_floor_label,
    middleFloorLabel: route.middle_floor_label,
    topFloorLabel: route.top_floor_label,
    floorSegments: route.floor_segments,
    middleCheckpointRequired: route.middle_checkpoint_required,
    bottomToMiddleSteps: route.bottom_to_middle_steps,
    middleToTopSteps: route.middle_to_top_steps,
    bottomToTopSteps: route.bottom_to_top_steps,
    minimumDurationSeconds: route.minimum_duration_seconds,
    maximumDurationSeconds: route.maximum_duration_seconds,
    verificationStatus: route.verification_status,
    qrCheckpointCount: checkpointSummary.total,
    printedCheckpointCount: checkpointSummary.printed,
    activeCheckpointCount: checkpointSummary.active,
    qrPrintRecordCount: printRecordCount,
    mySessionCount: mySessionCounts.get(route.route_id) || 0,
    hasPrintableQrs: checkpointSummary.total >= (route.middle_checkpoint_required ? 3 : 2),
    hasPrintedQrs: printRecordCount > 0 || (checkpointSummary.total > 0 && checkpointSummary.printed >= checkpointSummary.total),
    building: {
      buildingId: route.stair_buildings?.building_id,
      buildingName: route.stair_buildings?.building_name,
      countryCode: route.stair_buildings?.country_code,
      city: route.stair_buildings?.city,
      addressDescription: route.stair_buildings?.address_description,
      accessType: route.stair_buildings?.access_type,
      qrTagType: route.stair_buildings?.qr_tag_type,
      qrCustodianName: route.stair_buildings?.qr_custodian_name,
      qrCustodianPhone: route.stair_buildings?.qr_custodian_phone,
      qrCustodianEmail: route.stair_buildings?.qr_custodian_email,
      verificationStatus: route.stair_buildings?.verification_status,
    },
  });
  });
});
