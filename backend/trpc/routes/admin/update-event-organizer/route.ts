import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      organizerId: z.string().uuid(),
      organizerName: z.string().min(2),
      description: z.string().optional().nullable(),
      country: z.string().optional().nullable(),
      isActive: z.boolean().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
    });

    const { data, error } = await ctx.supabase
      .from("event_organizers")
      .update({
        organizer_name: input.organizerName.trim(),
        description: input.description?.trim() || null,
        country: input.country?.trim() || null,
        is_active: input.isActive ?? true,
      })
      .eq("organizer_id", input.organizerId)
      .select("organizer_id, organizer_name, country, is_active")
      .maybeSingle();

    if (error || !data) {
      throw new Error(error?.message || "Could not update the event organizer.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "event_organizer_updated",
      metadata: {
        organizerId: data.organizer_id,
        organizerName: data.organizer_name,
        country: data.country,
        isActive: data.is_active,
      },
    });

    return data;
  });

