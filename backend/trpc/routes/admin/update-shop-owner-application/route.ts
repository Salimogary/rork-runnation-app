import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { getActorRoleSession, logAdminAction } from "../../../rbac";

const statusSchema = z.enum(["approved", "rejected", "suspended"]);

export default publicProcedure
  .input(
    z.object({
      applicationId: z.string().uuid(),
      status: statusSchema,
      rejectionReason: z.string().trim().max(500).optional().nullable(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await getActorRoleSession(ctx);
    const { data: application, error: applicationError } = await ctx.supabase
      .from("shop_owner_applications")
      .select("*")
      .eq("application_id", input.applicationId)
      .maybeSingle();

    if (applicationError || !application) {
      throw new Error(applicationError?.message || "Shop application was not found.");
    }

    const applicationCountry = String(application.country_code || "").toUpperCase();
    const canReview =
      actor.isSuperAdmin ||
      actor.roles.some(
        (role) => role.roleName === "shop_manager" && String(role.countryCode || "").toUpperCase() === applicationCountry
      );

    if (!canReview) {
      throw new Error("You can review shop applications only for your country.");
    }

    const nowIso = new Date().toISOString();
    const updatePayload = {
      status: input.status,
      rejection_reason: input.status === "rejected" ? input.rejectionReason?.trim() || null : null,
      approved_by: input.status === "approved" ? actor.authUserId : null,
      approved_at: input.status === "approved" ? nowIso : null,
      updated_at: nowIso,
    };

    const { data, error } = await ctx.supabase
      .from("shop_owner_applications")
      .update(updatePayload)
      .eq("application_id", input.applicationId)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Could not update shop application.");
    }

    await logAdminAction(ctx, {
      actionType: "review_shop_owner_application",
      targetCountryCode: applicationCountry,
      metadata: {
        applicationId: input.applicationId,
        registrationId: application.registration_id,
        shopName: application.shop_name,
        status: input.status,
        countryCode: applicationCountry,
      },
    });

    return data;
  });
