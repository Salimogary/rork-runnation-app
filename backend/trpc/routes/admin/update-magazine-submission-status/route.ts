import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";
import { isMagazineImageUrl } from "../../../magazine-image";
import { canAccessMagazineRow, getScopedMagazineAccess } from "../magazine-scope";

function normalizeMagazinePage(category?: string | null): "News" | "Events" | "Community" | "Columns" | "Gallery" {
  const value = String(category || "").trim().toLowerCase();
  if (value.includes("event")) return "Events";
  if (value.includes("news")) return "News";
  if (value.includes("column") || value.includes("coach") || value.includes("journalist") || value.includes("motivation")) return "Columns";
  if (value.includes("gallery") || value.includes("pictorial")) return "Gallery";
  return "Community";
}

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

function isLiveMagazinePageConstraintError(error: any): boolean {
  return String(error?.message || error || "").includes("live_magazine_page_check");
}

export default publicProcedure
  .input(
    z.object({
      submissionId: z.string().uuid(),
      status: z.enum(["submitted", "reviewing", "accepted", "rejected"]),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
      allowSpecialClubCoordinator: true,
      allowMagazineEditor: true,
    });

    const { data: submission, error } = await ctx.supabase
      .from("magazine_article_submissions")
      .update({
        status: input.status,
        reviewed_by: actor.authUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("submission_id", input.submissionId)
      .select("*")
      .maybeSingle();

    if (error || !submission) {
      throw new Error(error?.message || "Could not update magazine submission.");
    }

    const scope = await getScopedMagazineAccess(ctx, actor);
    if (!canAccessMagazineRow(submission, scope)) {
      throw new Error("You can only review magazine submissions linked to your own club or organizer profile.");
    }

    if (input.status === "accepted") {
      const pictureLink = isMagazineImageUrl(submission.magazine_photo_url)
        ? submission.magazine_photo_url
        : isMagazineImageUrl(submission.attachment_url)
        ? submission.attachment_url
        : null;
      const articleDate = new Date(submission.created_at || Date.now()).toISOString().slice(0, 10);

      try {
        await publishLiveMagazineEntry(ctx, "magazine_article_submissions", submission.submission_id, {
          registration_id: submission.registration_id ?? null,
          page: normalizeMagazinePage(submission.category),
          author: submission.article_writer_name || submission.author_name || "RunNation Writer",
          article_date: articleDate,
          title: submission.title,
          body: submission.body,
          picture_link: pictureLink,
          external_link: submission.external_link ?? null,
          source_table: "magazine_article_submissions",
          source_id: submission.submission_id,
          updated_at: new Date().toISOString(),
        });
      } catch (publishError: any) {
        if (isLiveMagazinePageConstraintError(publishError)) {
          console.warn(
            "[Magazine] Submission accepted but live_magazine page constraint needs migration:",
            publishError?.message || publishError
          );
        } else {
          throw new Error(publishError?.message || "Magazine submission accepted, but publishing to live magazine failed.");
        }
      }
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "magazine_submission_status_updated",
      metadata: { submissionId: input.submissionId, status: input.status },
    });

    return { success: true };
  });


