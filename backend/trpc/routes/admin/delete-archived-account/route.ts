import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";
import { WORLD_COUNTRIES } from "../../../countries";

function normalizeCountry(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  const country = WORLD_COUNTRIES.find(
    (item) =>
      item.iso_alpha2.toLowerCase() === normalized.toLowerCase() ||
      item.name.toLowerCase() === normalized.toLowerCase()
  );
  return (country?.iso_alpha2 || normalized).toLowerCase();
}

export default publicProcedure
  .input(z.object({ registrationId: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryCoordinator: true,
    });

    const { data: archived, error } = await ctx.supabase
      .from("user_account_archives")
      .select("registration_id, country")
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (error) throw new Error(error.message || "Could not verify archived account.");
    if (!archived) throw new Error("This account is not in the archive.");

    const allowedCountries = new Set(
      actor.roles
        .filter((role) => role.roleName === "country_coordinator" && role.countryCode)
        .map((role) => normalizeCountry(role.countryCode))
    );

    if (!actor.isSuperAdmin && !allowedCountries.has(normalizeCountry(archived.country))) {
      throw new Error("You can only delete archived accounts from your assigned country.");
    }

    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("profile_id")
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    const { error: purgeError } = await ctx.supabase.rpc("purge_archived_account", {
      target_registration_id: input.registrationId,
    });
    if (purgeError) throw new Error(purgeError.message || "Could not delete archived account.");

    if (profile?.profile_id) {
      const { error: authError } = await ctx.supabase.auth.admin.deleteUser(profile.profile_id);
      if (authError) {
        console.warn("[Archive] Data deleted but auth user removal failed:", authError.message);
      }
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "archived_account_deleted",
      targetUserId: profile?.profile_id ?? null,
      targetCountryCode: archived.country,
      metadata: { country: archived.country },
    });

    return { success: true };
  });
