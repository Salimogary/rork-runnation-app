import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

const PROVIDER_DEFAULTS = [
  {
    provider: "health_connect",
    displayName: "Health Connect",
    status: "coming_soon",
    platform: "android",
    capabilities: ["exercise", "distance", "steps", "heart_rate", "sleep", "oxygen_saturation"],
    isEnabled: false,
    connectionStatus: "not_connected",
    lastSyncedAt: null,
  },
  {
    provider: "garmin",
    displayName: "Garmin",
    status: "coming_soon",
    platform: "all",
    capabilities: ["activities", "distance", "steps", "heart_rate", "sleep", "oxygen_saturation"],
    isEnabled: false,
    connectionStatus: "not_connected",
    lastSyncedAt: null,
  },
] as const;

function isMissingSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("does not exist") || message.includes("relation") || message.includes("schema cache");
}

export default publicProcedure
  .input(z.object({ registrationId: z.string().min(1) }))
  .query(async ({ ctx, input }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    const [{ data: providerRows, error: providerError }, { data: connectionRows, error: connectionError }] =
      await Promise.all([
        ctx.supabase
          .from("wearable_provider_config")
          .select("provider, display_name, status, platform, capabilities, is_enabled"),
        ctx.supabase
          .from("wearable_connections")
          .select("provider, connection_status, last_synced_at")
          .eq("registration_id", input.registrationId),
      ]);

    if ((providerError && !isMissingSchemaError(providerError)) || (connectionError && !isMissingSchemaError(connectionError))) {
      throw new Error(providerError?.message || connectionError?.message || "Could not load wearable integrations.");
    }

    if (providerError || connectionError) {
      return PROVIDER_DEFAULTS;
    }

    const connectionByProvider = new Map(
      (connectionRows || []).map((row: any) => [row.provider, row])
    );
    const configuredByProvider = new Map(
      (providerRows || []).map((row: any) => [row.provider, row])
    );

    return PROVIDER_DEFAULTS.map((fallback) => {
      const configured = configuredByProvider.get(fallback.provider);
      const connection = connectionByProvider.get(fallback.provider);

      return {
        provider: fallback.provider,
        displayName: configured?.display_name || fallback.displayName,
        status: configured?.status || fallback.status,
        platform: configured?.platform || fallback.platform,
        capabilities: configured?.capabilities || fallback.capabilities,
        isEnabled: configured?.is_enabled === true,
        connectionStatus: connection?.connection_status || fallback.connectionStatus,
        lastSyncedAt: connection?.last_synced_at || null,
      };
    });
  });
