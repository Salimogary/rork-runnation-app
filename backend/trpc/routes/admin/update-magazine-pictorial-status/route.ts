import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

async function publishLiveMagazineEntry(ctx: any, sourceTable: string, sourceId: string, payload: Record<string, unknown>) {
  const { data: existing, error: lookupError } = await ctx.supabase
    .from("live_magazine")
    .select("article_id")
    .eq("source_table", sourceTable)
    .eq("source_id", sourceId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message || "Could not check live magazine entry.");
  }

  if (existing?.article_id) {
    const { error: updateError } = await ctx.supabase
      .from("live_magazine")
      .update(payload)
      .eq("article_id", existing.article_id);

    if (updateError) {
      throw new Error(updateError.message || "Could not update live magazine entry.");
    }
    return;
  }

  const { error: insertError } = await ctx.supabase
    .from("live_magazine")
    .insert(payload);

  if (insertError) {
    throw new Error(insertError.message || "Could not publish live magazine entry.");
  }
}

export default publicProcedure
  .input(
    z.object({
      pictorialId: z.string().uuid(),
      status: z.enum(["submitted", "reviewing", "accepted", "rejected"]),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
    });

    const { data: pictorial, error } = await ctx.supabase
      .from("magazine_pictorial_submissions")
      .update({
        status: input.status,
        reviewed_by: actor.authUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("pictorial_id", input.pictorialId)
      .select("*")
      .maybeSingle();

    if (error || !pictorial) {
      throw new Error(error?.message || "Could not update event pictorial.");
    }

    if (input.status === "accepted") {
      const articleDate = pictorial.event_date || new Date(pictorial.created_at || Date.now()).toISOString().slice(0, 10);
      try {
        await publishLiveMagazineEntry(ctx, "magazine_pictorial_submissions", pictorial.pictorial_id, {
          registration_id: pictorial.registration_id ?? null,
          page: "Gallery",
          author: pictorial.submitter_name || "RunNation Community",
          article_date: articleDate,
          title: pictorial.event_name || "RunNation Gallery",
          body: pictorial.caption,
          picture_link: pictorial.photo_url || pictorial.photo_webp_url || pictorial.photo_avif_url,
          external_link: null,
          source_table: "magazine_pictorial_submissions",
          source_id: pictorial.pictorial_id,
          updated_at: new Date().toISOString(),
        });
      } catch (publishError: any) {
        throw new Error(publishError?.message || "Pictorial accepted, but publishing to live magazine failed.");
      }
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "magazine_pictorial_status_updated",
      metadata: { pictorialId: input.pictorialId, status: input.status },
    });

    return { success: true };
  });

