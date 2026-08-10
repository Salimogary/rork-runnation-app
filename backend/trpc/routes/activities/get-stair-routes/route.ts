import { publicProcedure } from "../../../create-context";

export default publicProcedure.query(async ({ ctx }) => {
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

  return (data || []).map((route: any) => ({
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
  }));
});
