import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

const SOCIAL_BUCKET = "social_uploads";

const extractStoragePath = (value?: string | null): string | null => {
  if (!value) return null;
  if (!value.startsWith("http")) return value;
  const marker = `/object/public/${SOCIAL_BUCKET}/`;
  const index = value.indexOf(marker);
  if (index < 0) return null;
  return value.slice(index + marker.length).split("?")[0];
};

export default publicProcedure
  .input(
    z.object({
      reportId: z.string().uuid(),
      action: z.enum(["remove_content", "dismiss", "ban_user"]),
      adminNotes: z.string().trim().max(1000).nullable().optional(),
      suspensionUntil: z.string().trim().nullable().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowChatRoomAdministrator: true,
    });

    const isSuspensionRequest = input.action === "ban_user" && !actor.isSuperAdmin;
    const suspensionUntil = input.suspensionUntil ? new Date(input.suspensionUntil) : null;
    if (input.action === "ban_user" && (!suspensionUntil || Number.isNaN(suspensionUntil.getTime()) || suspensionUntil.getTime() <= Date.now())) {
      throw new Error("Please provide a future suspension end date.");
    }

    const { data: report, error: reportError } = await ctx.supabase
      .from("chat_moderation_reports")
      .select("report_id, reported_registration_id, social_post_id, comment_id, status")
      .eq("report_id", input.reportId)
      .maybeSingle();

    if (reportError || !report) {
      throw new Error(reportError?.message || "Report was not found.");
    }
    if (report.status !== "pending" && input.action !== "ban_user") {
      throw new Error("This report has already been reviewed.");
    }

    if (input.action === "remove_content" || input.action === "ban_user") {
      if (report.comment_id) {
        const { error: commentDeleteError } = await ctx.supabase
          .from("social_comments")
          .delete()
          .eq("comment_id", report.comment_id);

        if (commentDeleteError) {
          throw new Error(commentDeleteError.message || "Could not remove reported comment.");
        }
      } else if (report.social_post_id) {
        const { data: post } = await ctx.supabase
          .from("social_posts")
          .select("photo_url")
          .eq("social_post_id", report.social_post_id)
          .maybeSingle();

        const storagePath = extractStoragePath(post?.photo_url);
        if (storagePath) {
          await ctx.supabase.storage.from(SOCIAL_BUCKET).remove([storagePath]);
        }

        const { error: postDeleteError } = await ctx.supabase
          .from("social_posts")
          .delete()
          .eq("social_post_id", report.social_post_id);

        if (postDeleteError) {
          throw new Error(postDeleteError.message || "Could not remove reported post.");
        }
      }
    }

    if (report.reported_registration_id) {
      const { data: existingFlag } = await ctx.supabase
        .from("user_moderation_flags")
        .select("confirmed_flags, dismissed_reports")
        .eq("registration_id", report.reported_registration_id)
        .maybeSingle();

      const nextConfirmed = (existingFlag?.confirmed_flags ?? 0) + (input.action === "dismiss" ? 0 : 1);
      const nextDismissed = (existingFlag?.dismissed_reports ?? 0) + (input.action === "dismiss" ? 1 : 0);

      const flagUpdate: Record<string, unknown> = {
        registration_id: report.reported_registration_id,
        confirmed_flags: nextConfirmed,
        dismissed_reports: nextDismissed,
        updated_at: new Date().toISOString(),
      };

      if (input.action === "ban_user" && actor.isSuperAdmin) {
        flagUpdate.is_banned = true;
        flagUpdate.banned_at = new Date().toISOString();
        flagUpdate.banned_by = actor.authUserId;
        flagUpdate.ban_reason = input.adminNotes || "Repeated or severe chat offence.";
        flagUpdate.suspended_until = suspensionUntil?.toISOString() ?? null;
        flagUpdate.suspension_status = "approved";
        flagUpdate.suspension_approved_by = actor.authUserId;
        flagUpdate.suspension_approved_at = new Date().toISOString();
      } else if (isSuspensionRequest) {
        flagUpdate.is_banned = false;
        flagUpdate.ban_reason = input.adminNotes || "Chat suspension requested after moderation review.";
        flagUpdate.suspended_until = suspensionUntil?.toISOString() ?? null;
        flagUpdate.suspension_status = "pending";
        flagUpdate.suspension_requested_by = actor.authUserId;
        flagUpdate.suspension_requested_at = new Date().toISOString();
      }

      await ctx.supabase.from("user_moderation_flags").upsert(flagUpdate, { onConflict: "registration_id" });
    }

    const status =
      input.action === "dismiss"
        ? "dismissed"
        : input.action === "ban_user" && actor.isSuperAdmin
        ? "user_banned"
        : "content_removed";

    const { error: updateError } = await ctx.supabase
      .from("chat_moderation_reports")
      .update({
        status,
        admin_notes: input.adminNotes ?? null,
        reviewed_by: actor.authUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("report_id", input.reportId);

    if (updateError) {
      throw new Error(updateError.message || "Could not update report status.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: `chat_report_${status}`,
      metadata: {
        reportId: input.reportId,
        postId: report.social_post_id,
        commentId: report.comment_id,
        reportedRegistrationId: report.reported_registration_id,
      },
    });

    if (input.action === "remove_content") {
      await logAdminAction(ctx, {
        actorUserId: actor.authUserId,
        actionType: report.comment_id ? "social_comment_deleted" : "social_post_deleted",
        metadata: {
          contentType: report.comment_id ? "comment" : "post",
          contentId: report.comment_id || report.social_post_id,
          postId: report.social_post_id,
          reportId: input.reportId,
          ownerRegistrationId: report.reported_registration_id,
          deletedByRole: actor.isSuperAdmin ? "Global Admin" : "Chat Room Administrator",
          deletionSource: "chat_report_review",
          contentPreview: input.adminNotes || "Content removed after moderation review.",
        },
      });
    }

    return { success: true };
  });

