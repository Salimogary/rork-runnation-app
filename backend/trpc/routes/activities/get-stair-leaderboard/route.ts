import { publicProcedure } from "../../../create-context";

export default publicProcedure.query(async ({ ctx }) => {
  const { data, error } = await ctx.supabase
    .from("stair_sessions")
    .select(`
      registration_id,
      route_id,
      verified_ascending_steps,
      completed_ascents,
      total_duration_seconds,
      status,
      stair_routes (
        route_id,
        route_name,
        stair_buildings (
          building_id,
          building_name
        )
      )
    `)
    .in("status", ["accepted", "partially_verified"])
    .gt("verified_ascending_steps", 0);
  if (error) throw new Error(error.message || "Could not load stair leaderboard.");

  const byUser = new Map<string, {
    registrationId: string;
    steps: number;
    ascents: number;
    durationSeconds: number;
    buildings: Map<string, { buildingName: string; steps: number }>;
  }>();
  (data || []).forEach((row: any) => {
    const existing = byUser.get(row.registration_id) || {
      registrationId: row.registration_id,
      steps: 0,
      ascents: 0,
      durationSeconds: 0,
      buildings: new Map<string, { buildingName: string; steps: number }>(),
    };
    const steps = Number(row.verified_ascending_steps) || 0;
    existing.steps += steps;
    existing.ascents += Number(row.completed_ascents) || 0;
    existing.durationSeconds += Number(row.total_duration_seconds) || 0;
    const route = Array.isArray(row.stair_routes) ? row.stair_routes[0] : row.stair_routes;
    const building = Array.isArray(route?.stair_buildings) ? route.stair_buildings[0] : route?.stair_buildings;
    const buildingKey = building?.building_id || route?.route_id || row.route_id || "unknown";
    const buildingName = building?.building_name || route?.route_name || "Building";
    const currentBuilding = existing.buildings.get(buildingKey) || { buildingName, steps: 0 };
    currentBuilding.steps += steps;
    existing.buildings.set(buildingKey, currentBuilding);
    byUser.set(row.registration_id, existing);
  });

  const registrationIds = Array.from(byUser.keys()).filter(Boolean);
  const { data: registrations, error: registrationError } = registrationIds.length > 0
    ? await ctx.supabase
        .from("registrations")
        .select("registration_id, first_name, other_names, sex")
        .in("registration_id", registrationIds)
    : { data: [], error: null };

  if (registrationError) {
    throw new Error(registrationError.message || "Could not load stair leaderboard runners.");
  }

  const registrationMap = new Map(
    (registrations || []).map((registration: any) => [registration.registration_id, registration])
  );

  return Array.from(byUser.values())
    .sort((a, b) => b.steps - a.steps || b.ascents - a.ascents || a.durationSeconds - b.durationSeconds)
    .slice(0, 100)
    .map((row, index) => {
      const registration = registrationMap.get(row.registrationId) as any;
      const name = [registration?.first_name, registration?.other_names]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(" ") || "Runner";
      const topBuilding = Array.from(row.buildings.values()).sort((a, b) => b.steps - a.steps)[0];

      return {
        rank: index + 1,
        registrationId: row.registrationId,
        name,
        sex: registration?.sex || "-",
        building: topBuilding?.buildingName || "Building",
        steps: row.steps,
        ascents: row.ascents,
        durationSeconds: row.durationSeconds,
      };
    });
});
