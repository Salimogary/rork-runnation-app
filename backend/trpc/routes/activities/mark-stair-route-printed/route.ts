import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

const inputSchema = z.object({
  registrationId: z.string(),
  routeId: z.string().uuid(),
});

export default publicProcedure.input(inputSchema).mutation(async ({ ctx, input }) => {
  await requireRegistrationOwner(ctx, input.registrationId, { allowAdmin: true });

  const { data: route, error: routeError } = await ctx.supabase
    .from("stair_routes")
    .select("route_id")
    .eq("route_id", input.routeId)
    .maybeSingle();
  if (routeError) throw new Error(routeError.message || "Could not check stair route.");
  if (!route) throw new Error("Stair route was not found.");

  const { error: printError } = await ctx.supabase
    .from("stair_qr_prints")
    .insert({
      route_id: input.routeId,
      registration_id: input.registrationId,
      printed_by: ctx.authUserId,
      print_source: "app_download",
    });
  if (printError) throw new Error(printError.message || "Could not record QR print.");

  const { error: checkpointError } = await ctx.supabase
    .from("stair_checkpoints")
    .update({ installation_status: "printed" })
    .eq("route_id", input.routeId)
    .in("installation_status", ["generated", "printed"]);
  if (checkpointError) throw new Error(checkpointError.message || "Could not update QR print status.");

  return { success: true };
});
