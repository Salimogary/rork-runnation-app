import { z } from "zod";
import QRCode from "qrcode";
import { publicProcedure } from "../../../create-context";
import { getActorRoleSession } from "../../../rbac";
import { createCheckpointToken, hashCheckpointToken, qrPayloadForToken } from "../stair-utils";

const inputSchema = z.object({
  registrationId: z.string(),
  buildingName: z.string().min(2),
  countryCode: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  addressDescription: z.string().optional().nullable(),
  accessType: z.enum(["public", "private", "club", "corporate", "residential", "other"]).default("public"),
  companyOrPropertyName: z.string().optional().nullable(),
  qrTagType: z.enum(["permanent_tag", "removable_tag", "sticker", "other"]).default("permanent_tag"),
  qrCustodianName: z.string().optional().nullable(),
  qrCustodianPhone: z.string().optional().nullable(),
  qrCustodianEmail: z.string().optional().nullable(),
  routeName: z.string().min(2),
  stairwellName: z.string().optional().nullable(),
  bottomFloorLabel: z.string().min(1),
  middleFloorLabel: z.string().optional().nullable(),
  topFloorLabel: z.string().min(1),
  floorSegments: z.number().int().positive(),
  bottomToMiddleSteps: z.number().int().positive().optional().nullable(),
  middleToTopSteps: z.number().int().positive().optional().nullable(),
  bottomToTopSteps: z.number().int().positive(),
  minimumDurationSeconds: z.number().int().positive().default(20),
  maximumDurationSeconds: z.number().int().positive().default(7200),
  measurementMethod: z.string().optional().nullable(),
  activateCheckpoints: z.boolean().default(false),
});

export default publicProcedure.input(inputSchema).mutation(async ({ ctx, input }) => {
  if (!ctx.authUserId) {
    throw new Error("You must be logged in to register a staircase.");
  }

  const actor = await getActorRoleSession(ctx);
  const canActivate = actor.hasAdminAccess || actor.isClubCoordinator || actor.isCountryCoordinator;
  if (input.activateCheckpoints && !canActivate) {
    throw new Error("Only an admin or coordinator can activate stair QR checkpoints.");
  }

  const middleRequired = input.floorSegments > 7;
  if (input.floorSegments < 3) {
    throw new Error("A building needs at least 3 floors, including basement floors where applicable, to qualify for Stair Climb QR setup.");
  }
  if (middleRequired) {
    if (!input.middleFloorLabel || !input.bottomToMiddleSteps || !input.middleToTopSteps) {
      throw new Error("Routes above seven floors require middle floor label and both segment step counts.");
    }
    if (input.bottomToTopSteps !== input.bottomToMiddleSteps + input.middleToTopSteps) {
      throw new Error("Bottom-to-top steps must equal bottom-to-middle plus middle-to-top steps.");
    }
  }

  const { data: building, error: buildingError } = await ctx.supabase
    .from("stair_buildings")
    .insert({
      building_name: input.buildingName.trim(),
      country_code: input.countryCode || null,
      city: input.city || null,
      address_description: input.addressDescription || null,
      access_type: input.accessType,
      company_or_property_name: input.companyOrPropertyName || null,
      qr_tag_type: input.qrTagType,
      qr_custodian_name: input.qrCustodianName || null,
      qr_custodian_phone: input.qrCustodianPhone || null,
      qr_custodian_email: input.qrCustodianEmail || null,
      verification_status: input.activateCheckpoints ? "accepted" : "pending",
      created_by: input.registrationId,
      approved_by: input.activateCheckpoints ? ctx.authUserId : null,
    })
    .select("building_id, building_name")
    .single();
  if (buildingError) throw new Error(buildingError.message || "Could not register stair building.");

  const { data: route, error: routeError } = await ctx.supabase
    .from("stair_routes")
    .insert({
      building_id: building.building_id,
      route_name: input.routeName.trim(),
      stairwell_name: input.stairwellName || null,
      bottom_floor_label: input.bottomFloorLabel,
      middle_floor_label: middleRequired ? input.middleFloorLabel : null,
      top_floor_label: input.topFloorLabel,
      floor_segments: input.floorSegments,
      middle_checkpoint_required: middleRequired,
      bottom_to_middle_steps: middleRequired ? input.bottomToMiddleSteps : null,
      middle_to_top_steps: middleRequired ? input.middleToTopSteps : null,
      bottom_to_top_steps: input.bottomToTopSteps,
      minimum_duration_seconds: input.minimumDurationSeconds,
      maximum_duration_seconds: input.maximumDurationSeconds,
      verification_status: input.activateCheckpoints ? "accepted" : "pending",
      measurement_method: input.measurementMethod || null,
      measured_by: input.registrationId,
      verified_by: input.activateCheckpoints ? ctx.authUserId : null,
    })
    .select("route_id, route_name")
    .single();
  if (routeError) throw new Error(routeError.message || "Could not register stair route.");

  const checkpointTypes = middleRequired ? ["bottom", "middle", "top"] as const : ["bottom", "top"] as const;
  const checkpointRows = checkpointTypes.map((type) => {
    const token = createCheckpointToken();
    return {
      token,
      payload: qrPayloadForToken(token),
      row: {
        route_id: route.route_id,
        checkpoint_type: type,
        floor_label: type === "bottom" ? input.bottomFloorLabel : type === "middle" ? input.middleFloorLabel : input.topFloorLabel,
        qr_token_hash: hashCheckpointToken(token),
        qr_version: 1,
        installation_status: input.activateCheckpoints ? "installed" : "generated",
        is_active: input.activateCheckpoints,
        installed_by: input.activateCheckpoints ? ctx.authUserId : null,
        installed_at: input.activateCheckpoints ? new Date().toISOString() : null,
        activated_by: input.activateCheckpoints ? ctx.authUserId : null,
        activated_at: input.activateCheckpoints ? new Date().toISOString() : null,
      },
    };
  });

  const { data: checkpoints, error: checkpointError } = await ctx.supabase
    .from("stair_checkpoints")
    .insert(checkpointRows.map((checkpoint) => checkpoint.row))
    .select("checkpoint_id, checkpoint_type, floor_label, qr_version");
  if (checkpointError) throw new Error(checkpointError.message || "Could not generate stair QR checkpoints.");

  const printableStickers = await Promise.all((checkpoints || []).map(async (checkpoint: any) => {
    const generated = checkpointRows.find((row) => row.row.checkpoint_type === checkpoint.checkpoint_type);
    const qrDataUrl = await QRCode.toDataURL(generated?.payload || "", { margin: 1, width: 320 });
    return {
      checkpointId: checkpoint.checkpoint_id,
      checkpointType: checkpoint.checkpoint_type,
      floorLabel: checkpoint.floor_label,
      qrVersion: checkpoint.qr_version,
      qrPayload: generated?.payload,
      qrDataUrl,
      label: `${building.building_name} - ${route.route_name} - ${String(checkpoint.checkpoint_type).toUpperCase()}`,
    };
  }));

  return {
    success: true,
    building: { buildingId: building.building_id, buildingName: building.building_name },
    route: { routeId: route.route_id, routeName: route.route_name, middleCheckpointRequired: middleRequired },
    printableStickers,
  };
});
