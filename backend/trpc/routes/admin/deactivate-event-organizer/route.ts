import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(z.object({ organizerId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
    });

    const { data: organizer, error: organizerError } = await ctx.supabase
      .from("event_organizers")
      .select("organizer_id, organizer_name")
      .eq("organizer_id", input.organizerId)
      .maybeSingle();

    if (organizerError || !organizer) {
      throw new Error(organizerError?.message || "Event organizer not found.");
    }

    const { error } = await ctx.supabase
      .from("event_organizers")
      .update({ is_active: false })
      .eq("organizer_id", input.organizerId);

    if (error) {
      throw new Error(error.message || "Could not deactivate the event organizer.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "event_organizer_deactivated",
      metadata: {
        organizerId: organizer.organizer_id,
        organizerName: organizer.organizer_name,
      },
    });

    return { success: true };
  });

