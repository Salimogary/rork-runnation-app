import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

function formatSnapshotTime(timestamp: number) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OfflineSnapshotBanner() {
  const queryClient = useQueryClient();
  const [snapshotTimestamp, setSnapshotTimestamp] = useState(0);

  useEffect(() => {
    const updateSnapshotState = () => {
      const queries = queryClient.getQueryCache().getAll();
      const failedWithCachedData = queries.filter(
        (query) => query.state.status === "error" && query.state.data !== undefined
      );
      const latestDataAt = failedWithCachedData.reduce(
        (latest, query) => Math.max(latest, query.state.dataUpdatedAt || 0),
        0
      );
      setSnapshotTimestamp(latestDataAt);
    };

    updateSnapshotState();
    return queryClient.getQueryCache().subscribe(updateSnapshotState);
  }, [queryClient]);

  if (!snapshotTimestamp) return null;

  return (
    <View pointerEvents="none" style={styles.banner}>
      <Text style={styles.text}>Showing saved data from {formatSnapshotTime(snapshotTimestamp)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 10,
    zIndex: 1000,
    borderRadius: 8,
    backgroundColor: "rgba(17, 24, 39, 0.88)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: "center",
  },
  text: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
});
