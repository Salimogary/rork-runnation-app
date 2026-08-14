export const GOAL_DISPLAY_LABELS: Record<string, string> = {
  "keep active": "Meet my exercise goals",
  "just want to run": "Meet my exercise goals",
  "daily run": "Meet my exercise goals",
  "meet my exercise goals": "Meet my exercise goals",
  "weight loss": "Loose some weight",
  "improve fitness": "Work on my pace",
  "general health": "Monitor my health",
  "compete in community": "Be part in the community",
  "earn medals": "Get medals",
  "have planned runs": "Follow an exercise plan",
  "run window": "Set exercise time",
  "manage exercise time": "Set exercise time",
  "set exercise time": "Set exercise time",
  "running budget": "Manage running Expenditure",
};

export const GOAL_DISPLAY_DESCRIPTIONS: Record<string, string> = {
  "keep active": "Set a date range and target percentage, then measure whether your completed exercise days meet that goal.",
  "just want to run": "Set a date range and target percentage, then measure whether your completed exercise days meet that goal.",
  "daily run": "Set a date range and target percentage, then measure whether your completed exercise days meet that goal.",
  "meet my exercise goals": "Set a date range and target percentage, then measure whether your completed exercise days meet that goal.",
  "weight loss": "Track your target weight and log progress as your running supports healthy weight change.",
  "improve fitness": "Set pace targets for different distances and compare each run against your target.",
  "general health": "Use smartwatch-style health readings such as steps, sleep, heart rate, and SpO2 to monitor wellness.",
  "compete in community": "Follow your ranking across family, club, and community leaderboards as your activities grow.",
  "earn medals": "Set a medal target for a date range and track approved internal and external race medals.",
  "have planned runs": "Declare planned running commitments and check whether completed runs match your plan.",
  "run window": "Set one goal duration and one regular exercise time.",
  "manage exercise time": "Set one goal duration and one regular exercise time.",
  "set exercise time": "Set one goal duration and one regular exercise time.",
  "running budget": "Set a duration, three category targets, and a grand total for Event expenses, Gear, and Registrations.",
};

export const getGoalDisplayLabel = (goal?: string | null): string => {
  const normalized = String(goal || "").trim().toLowerCase();
  return GOAL_DISPLAY_LABELS[normalized] || String(goal || "").trim();
};

export const getGoalDisplayDescription = (goal?: string | null, fallback?: string | null): string => {
  const normalized = String(goal || "").trim().toLowerCase();
  return GOAL_DISPLAY_DESCRIPTIONS[normalized] || String(fallback || "").trim();
};
