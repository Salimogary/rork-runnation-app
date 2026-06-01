import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

const DELETE_ACTION_TYPES = ["social_post_deleted", "social_comment_deleted"];

export default publicProcedure.query(async ({ ctx }) => {
  await requireAdminPermission(ctx, {
    allowSuperAdmin: true,
    allowChatRoomAdministrator: true,
  });

  const { data: logs, error } = await ctx.supabase
    .from("admin_action_logs")
    .select("log_id, actor_user_id, action_type, metadata, created_at")
    .in("action_type", DELETE_ACTION_TYPES)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message || "Could not load deleted chat logs.");
  }

  const actorIds = [...new Set((logs ?? []).map((log: any) => log.actor_user_id).filter(Boolean))];
  const ownerIds = [
    ...new Set((logs ?? []).map((log: any) => log.metadata?.ownerRegistrationId).filter(Boolean)),
  ];

  const { data: actors } = actorIds.length
    ? await ctx.supabase
        .from("profiles")
        .select("profile_id, username, display_name")
        .in("profile_id", actorIds)
    : { data: [] };

  const { data: owners } = ownerIds.length
    ? await ctx.supabase
        .from("registrations")
        .select("registration_id, first_name, other_names, username")
        .in("registration_id", ownerIds)
    : { data: [] };

  const actorMap = new Map((actors ?? []).map((actor: any) => [actor.profile_id, actor]));
  const ownerMap = new Map((owners ?? []).map((owner: any) => [owner.registration_id, owner]));

  return (logs ?? []).map((log: any) => {
    const metadata = log.metadata ?? {};
    const actor = log.actor_user_id ? actorMap.get(log.actor_user_id) : null;
    const owner = metadata.ownerRegistrationId ? ownerMap.get(metadata.ownerRegistrationId) : null;

    return {
      logId: log.log_id,
      createdAt: log.created_at,
      contentType: metadata.contentType ?? (log.action_type === "social_comment_deleted" ? "comment" : "post"),
      contentId: metadata.contentId ?? null,
      postId: metadata.postId ?? null,
      reportId: metadata.reportId ?? null,
      deletionSource: metadata.deletionSource ?? "chatroom",
      deletedByRole: metadata.deletedByRole ?? "Admin",
      deletedByName: actor?.display_name ?? actor?.username ?? log.actor_user_id ?? "Unknown admin",
      deletedByUsername: actor?.username ?? null,
      ownerName: owner ? [owner.first_name, owner.other_names].filter(Boolean).join(" ") || owner.username : null,
      ownerUsername: owner?.username ?? null,
      ownerRegistrationId: metadata.ownerRegistrationId ?? null,
      contentPreview: metadata.contentPreview ?? "",
      hadPhoto: metadata.hadPhoto === true,
    };
  });
});

