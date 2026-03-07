export interface Badge {
  id: string;
  type: "distance" | "activity_count";
  title: string;
  description: string;
  milestone: number;
  icon: string;
  earned: boolean;
}

const DISTANCE_MILESTONES = [10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const ACTIVITY_INTERVAL = 10;
const MAX_ACTIVITY_BADGES = 100;

export function getDistanceBadges(totalDistanceKm: number): Badge[] {
  return DISTANCE_MILESTONES.map((km) => ({
    id: `dist_${km}`,
    type: "distance" as const,
    title: `${km} km`,
    description: `Completed ${km} kilometers total`,
    milestone: km,
    icon: km >= 500 ? "🏆" : km >= 100 ? "🥇" : km >= 50 ? "🥈" : "🥉",
    earned: totalDistanceKm >= km,
  }));
}

export function getActivityCountBadges(totalActivities: number): Badge[] {
  const badges: Badge[] = [];
  for (let i = ACTIVITY_INTERVAL; i <= MAX_ACTIVITY_BADGES; i += ACTIVITY_INTERVAL) {
    if (i > totalActivities + ACTIVITY_INTERVAL * 3 && i > 30) break;
    badges.push({
      id: `act_${i}`,
      type: "activity_count",
      title: `${i} Activities`,
      description: `Completed ${i} activities`,
      milestone: i,
      icon: i >= 50 ? "⭐" : i >= 30 ? "🔥" : "💪",
      earned: totalActivities >= i,
    });
  }
  return badges;
}

export function getAllBadges(totalDistanceKm: number, totalActivities: number): Badge[] {
  return [
    ...getDistanceBadges(totalDistanceKm),
    ...getActivityCountBadges(totalActivities),
  ];
}

export function getEarnedBadgeCount(totalDistanceKm: number, totalActivities: number): number {
  const distanceEarned = DISTANCE_MILESTONES.filter((km) => totalDistanceKm >= km).length;
  let activityEarned = 0;
  for (let i = ACTIVITY_INTERVAL; i <= MAX_ACTIVITY_BADGES; i += ACTIVITY_INTERVAL) {
    if (totalActivities >= i) activityEarned++;
    else break;
  }
  return distanceEarned + activityEarned;
}
