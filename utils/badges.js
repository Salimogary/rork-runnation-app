"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDistanceBadges = getDistanceBadges;
exports.getActivityCountBadges = getActivityCountBadges;
exports.getProfileCompleteBadge = getProfileCompleteBadge;
exports.getAllBadges = getAllBadges;
exports.getEarnedBadgeCount = getEarnedBadgeCount;
const DISTANCE_MILESTONES = [10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const ACTIVITY_INTERVAL = 10;
const MAX_ACTIVITY_BADGES = 100;
function getDistanceBadges(totalDistanceKm) {
    return DISTANCE_MILESTONES.map((km) => ({
        id: `dist_${km}`,
        type: "distance",
        title: `${km} km`,
        description: `Completed ${km} kilometers total`,
        milestone: km,
        icon: km >= 500 ? "🏆" : km >= 100 ? "🥇" : km >= 50 ? "🥈" : "🥉",
        earned: totalDistanceKm >= km,
    }));
}
function getActivityCountBadges(totalActivities) {
    const badges = [];
    for (let i = ACTIVITY_INTERVAL; i <= MAX_ACTIVITY_BADGES; i += ACTIVITY_INTERVAL) {
        if (i > totalActivities + ACTIVITY_INTERVAL * 3 && i > 30)
            break;
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
function getProfileCompleteBadge(completionPercentage) {
    return {
        id: "profile_complete_100",
        type: "profile_complete",
        title: "100% Complete",
        description: "Completed 100% of your registration profile",
        milestone: 100,
        icon: "🎓",
        earned: completionPercentage >= 100,
    };
}
function getAllBadges(totalDistanceKm, totalActivities, completionPercentage = 0) {
    return [
        getProfileCompleteBadge(completionPercentage),
        ...getDistanceBadges(totalDistanceKm),
        ...getActivityCountBadges(totalActivities),
    ];
}
function getEarnedBadgeCount(totalDistanceKm, totalActivities, completionPercentage = 0) {
    const profileEarned = completionPercentage >= 100 ? 1 : 0;
    const distanceEarned = DISTANCE_MILESTONES.filter((km) => totalDistanceKm >= km).length;
    let activityEarned = 0;
    for (let i = ACTIVITY_INTERVAL; i <= MAX_ACTIVITY_BADGES; i += ACTIVITY_INTERVAL) {
        if (totalActivities >= i)
            activityEarned++;
        else
            break;
    }
    return profileEarned + distanceEarned + activityEarned;
}
