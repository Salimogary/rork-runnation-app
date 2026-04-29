export interface CompletionItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface ProfileCompletionData {
  percentage: number;
  items: CompletionItem[];
  completedCount: number;
  totalCount: number;
}

export interface ProfileCompletionInputs {
  allFieldsFilled: boolean;
  hasProfilePhoto: boolean;
  hasGoal: boolean;
  hasClub: boolean;
  hasFiveActivities: boolean;
  hasSubscription: boolean;
  hasTargets: boolean;
  hasEventEnrollment: boolean;
  hasVerifiedEmail: boolean;
  hasAtLeastOneBadge: boolean;
  requiresAdminTerms?: boolean;
  hasAcceptedAdminTerms?: boolean;
}

export function calculateProfileCompletion(inputs: ProfileCompletionInputs): ProfileCompletionData {
  const items: CompletionItem[] = [
    { id: "bio", label: "All fields filled (Bio)", completed: inputs.allFieldsFilled },
    { id: "photo", label: "Profile photo", completed: inputs.hasProfilePhoto },
    { id: "goal", label: "At least 1 goal set", completed: inputs.hasGoal },
    { id: "club", label: "Has a club", completed: inputs.hasClub },
    { id: "activities", label: "5 activities (run, walk or treadmill)", completed: inputs.hasFiveActivities },
    { id: "subscription", label: "Has subscription", completed: inputs.hasSubscription },
    { id: "targets", label: "Loaded targets for at least 1 goal", completed: inputs.hasTargets },
    { id: "event", label: "Enrolled for at least 1 event", completed: inputs.hasEventEnrollment },
    { id: "email", label: "Verified email", completed: inputs.hasVerifiedEmail },
    { id: "badge", label: "At least one badge", completed: inputs.hasAtLeastOneBadge },
  ];

  if (inputs.requiresAdminTerms) {
    items.push({
      id: "admin_terms",
      label: "Accepted admin terms",
      completed: !!inputs.hasAcceptedAdminTerms,
    });
  }

  const completedCount = items.filter((i) => i.completed).length;
  const totalCount = items.length;
  const percentage = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return { percentage, items, completedCount, totalCount };
}
