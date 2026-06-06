import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      provider: z.enum(["health_connect", "garmin"]),
    })
  )
  .mutation(async ({ ctx, input }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const { data, error } = await ctx.supabase
      .from("wearable_provider_config")
      .select("display_name, status, is_enabled")
      .eq("provider", input.provider)
      .maybeSingle();

    if (error) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "This wearable integration is being prepared and cannot be connected yet.",
      });
    }

    if (!data?.is_enabled || data.status !== "available") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `${data?.display_name || "This integration"} is coming soon to RunNation.`,
      });
    }

    throw new TRPCError({
      code: "NOT_IMPLEMENTED",
      message: "Provider authorization will be enabled after API credentials and compliance approval are configured.",
    });
  });
