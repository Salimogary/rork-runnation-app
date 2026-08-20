import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { getActorRoleSession } from "../../../rbac";

const statusSchema = z.enum(["pending", "approved", "rejected", "suspended"]);

export default publicProcedure
  .input(
    z.object({
      countryCode: z.string().trim().length(2).optional().nullable(),
      status: statusSchema.optional().nullable(),
    }).optional()
  )
  .query(async ({ input, ctx }) => {
    const actor = await getActorRoleSession(ctx);
    const requestedCountry = input?.countryCode?.trim().toUpperCase() || null;
    const shopManagerCountries = actor.roles
      .filter((role) => role.roleName === "shop_manager" && role.countryCode)
      .map((role) => String(role.countryCode).toUpperCase());

    if (!actor.isSuperAdmin && shopManagerCountries.length === 0) {
      throw new Error("You do not have permission to review shop applications.");
    }

    let query = ctx.supabase
      .from("shop_owner_applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (input?.status) {
      query = query.eq("status", input.status);
    }

    if (actor.isSuperAdmin) {
      if (requestedCountry) {
        query = query.eq("country_code", requestedCountry);
      }
    } else if (requestedCountry) {
      if (!shopManagerCountries.includes(requestedCountry)) {
        throw new Error("You can review shop applications only for your country.");
      }
      query = query.eq("country_code", requestedCountry);
    } else {
      query = query.in("country_code", shopManagerCountries);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message || "Could not load shop applications.");
    }

    return data ?? [];
  });
