import { publicProcedure } from "../../create-context";

export const getSnapshotParticipants = publicProcedure.query(async ({ ctx }) => {
  console.log("[getSnapshotParticipants] Fetching participants from snapshot");

  const { data, error } = await ctx.supabase
    .from("event_participants_snapshot")
    .select("event_name, first_name, other_names, residence, sex")
    .order("event_name", { ascending: true });

  if (error) {
    console.error("[getSnapshotParticipants] Error:", error);
    throw new Error(`Failed to fetch participants: ${error.message}`);
  }

  console.log("[getSnapshotParticipants] Data:", data);

  return data || [];
});
