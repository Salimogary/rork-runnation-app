export const ADMIN_TERMS_VERSION = "2026-05-09";

export type AdminTermsSection = {
  title: string;
  body: string[];
};

export type AdminTermsDocReference = {
  indexDoc: string;
  roleDoc: string;
};

export type AdminTermsRole =
  | "global_admin"
  | "country_admin"
  | "country_coordinator"
  | "club_coordinator"
  | "event_organizer"
  | "magazine_columnist";

const SHARED_SECTIONS: AdminTermsSection[] = [
  {
    title: "Purpose",
    body: [
      "Admin access exists to support real RunNation operations including events, enrollments, uploads, order handling, moderation, magazine review, role approvals, special clubs, and scoped club or country administration.",
      "Admin tools must never be used for curiosity, personal advantage, intimidation, unofficial data extraction, or any action outside legitimate RunNation work.",
    ],
  },
  {
    title: "Operational Rules",
    body: [
      "Always act within your assigned scope. Country-scoped admins must stay within their country, club coordinators must stay within their assigned club, and event organizers must only manage their organizer-owned events.",
      "Organizer-created events are submitted for review and must be approved by an authorised admin before they are treated as live public events. If an event includes a linked magazine article, the magazine submission must be reviewed before final event approval.",
      "Same-day, recurring, and multiday events must have accurate dates, recurrence rules, minimum distance requirements where enabled, entry type, country, organizer, poster, and payment information.",
      "Workout imports from smart watches or other sports apps may count for event credit only after club or organizer approval. Treadmill records count for workouts and goals, but not for event credit.",
      "If an event charges a fee, make sure payment details are accurate, visible, and communicated in a way that allows RunNation to track and remit bulk-collected funds to the relevant club or independent event manager.",
      "Role requests must follow the one-active-admin-role rule unless the user is a Super Admin. Rejected role, club, organizer, event, magazine, or activity decisions should remain visible to other admins and should not be re-actioned without a proper new submission.",
      "Special clubs must follow their eligibility rules: Junior Runners is for ages 8 to 15, Golden Age Runners is for ages 60 and above, and Treadmill Runners Club and Para Runners Club are optional global clubs.",
      "Chat and social reports must be reviewed fairly. Remove abusive, hateful, pornographic, divisive, sectarian, threatening, disrespectful, or unsafe content when justified, and use user flags or bans only where the evidence supports it.",
      "Do not share screenshots, files, exports, personal data, or internal notes outside approved RunNation channels.",
      "Do not impersonate another admin, bypass role restrictions, or approve data you cannot reasonably verify.",
      "Use deletion sparingly. Where a reversible status change exists, prefer that workflow over destructive removal.",
    ],
  },
  {
    title: "Privacy and Security",
    body: [
      "Admin data access is logged for accountability. Actions performed through the portal may be reviewed by Global Admins.",
      "Admins must protect their device, keep credentials private, and sign out when access is no longer needed.",
      "Any suspected misuse, leaked access, or mistaken approval should be reported immediately to RunNation leadership or the Global Admin team.",
    ],
  },
  {
    title: "Acceptance",
    body: [
      "By accepting these terms, you confirm that you understand your role scope, will use admin tools responsibly, and agree that misuse may result in removal of access or further action.",
      "If you reject these terms, you should not proceed into the Admin portal.",
    ],
  },
];

const ROLE_ACCESS_BY_ROLE: Record<AdminTermsRole, string[]> = {
  global_admin: [
    "Global Admin: Full dashboard access across all countries and clubs, including role management, audit logs, archive tools, and all operational sections.",
  ],
  country_admin: [
    "Country Admin: Access limited to Orders, Stock, Events, Enrollments, Club Requests, Uploads, External, and Magazine within the assigned country scope.",
  ],
  country_coordinator: [
    "Country Coordinator: Access limited to Treadmill, Events, Enrollments, Club Requests, Uploads, External, and Magazine within the assigned country scope.",
  ],
  club_coordinator: [
    "Club Coordinator: Access limited to Treadmill, Events, Enrollments, Club Requests, Uploads, External, and Magazine within the assigned club scope.",
  ],
  event_organizer: [
    "Event Organizer: Access is limited to organizer-owned events, organizer-scoped enrollment decisions where approval is required, and acceptance of the applicable admin terms.",
  ],
  magazine_columnist: [
    "Magazine Columnist: Access is limited to approved writing and editorial submissions for the assigned columnist category. Columnists do not receive general admin dashboard rights unless separately approved.",
  ],
};

const FUNCTION_GUIDE_BY_ROLE: Record<AdminTermsRole, string[]> = {
  global_admin: [
    "Orders: Review shop orders and delivery progress. Update status only when there is a real fulfilment or delivery change.",
    "Stock: Adjust catalogue stock counts to reflect actual inventory. Do not use stock changes for testing in production.",
    "Treadmill: Review treadmill activity evidence and approve only genuine submissions.",
    "Events: Create, edit, and manage event records, dates, posters, entry type, medal settings, and payment instructions within your scope.",
    "Enrollments: Review participant enrollment status and manage approval, rejection, or payment confirmation where the workflow allows it. Event organizers may only act on organizer-owned events.",
    "Club Requests: Review requests to join or start club membership within the allowed scope.",
    "Uploads: Access uploaded activity support files and handle them only for verification or operations.",
    "External: Review external activity submissions and accept only supported, verifiable entries.",
    "Magazine: Review article submissions, event-linked articles, pictorials, and publishing workflow items in line with RunNation editorial standards. Do not approve an event that requires magazine review until its magazine part is acceptable.",
    "Chat Reports: Review reported posts, comments, screenshots, and descriptions. Remove offending content and flag or ban repeat offenders only where justified.",
    "Roles: Create role requests, approve or reject pending requests, edit active assignments, and remove access when needed.",
    "Audit Log: Review role-based admin activity for accountability and operational tracing.",
    "Archive: Move inactive historical data using caution and only when records meet archive criteria.",
  ],
  country_admin: [
    "Orders: Review shop orders and delivery progress. Update status only when there is a real fulfilment or delivery change.",
    "Stock: Adjust catalogue stock counts to reflect actual inventory. Do not use stock changes for testing in production.",
    "Events: Create, edit, and manage same-day, recurring, and multiday event records, dates, recurrence rules, posters, entry type, minimum-distance settings, medal settings, and payment instructions within your scope.",
    "Enrollments: Review participant enrollment status and manage approval, rejection, or payment confirmation where the workflow allows it within your assigned country.",
    "Club Requests: Review requests to join or start club membership within the allowed country scope.",
    "Uploads: Access uploaded activity support files and handle them only for verification or operations.",
    "External: Review external activity submissions and accept only supported, verifiable entries.",
    "Magazine: Review article submissions, event-linked articles, pictorials, and publishing workflow items in line with RunNation editorial standards. Do not approve an event that requires magazine review until its magazine part is acceptable.",
    "Chat Reports: Review reported posts, comments, screenshots, and descriptions within your scope and escalate serious or repeat abuse.",
  ],
  country_coordinator: [
    "Treadmill: Review treadmill activity evidence and approve only genuine submissions.",
    "Events: Create, edit, and manage same-day, recurring, and multiday event records, dates, recurrence rules, posters, entry type, minimum-distance settings, medal settings, and payment instructions within your scope.",
    "Enrollments: Review participant enrollment status and manage approval, rejection, or payment confirmation where the workflow allows it within your assigned country.",
    "Club Requests: Review requests to join or start club membership within the allowed country scope.",
    "Uploads: Access uploaded activity support files and handle them only for verification or operations.",
    "External: Review external activity submissions and accept only supported, verifiable entries.",
    "Magazine: Review article submissions, event-linked articles, pictorials, and publishing workflow items in line with RunNation editorial standards. Do not approve an event that requires magazine review until its magazine part is acceptable.",
    "Chat Reports: Review reported posts, comments, screenshots, and descriptions within your scope and escalate serious or repeat abuse.",
  ],
  club_coordinator: [
    "Treadmill: Review treadmill activity evidence and approve only genuine submissions.",
    "Events: Create, edit, and manage same-day, recurring, and multiday event records, dates, recurrence rules, posters, entry type, minimum-distance settings, medal settings, and payment instructions within your scope.",
    "Enrollments: Review participant enrollment status and manage approval, rejection, or payment confirmation where the workflow allows it within your assigned club.",
    "Club Requests: Review requests to join or start club membership within the allowed club scope.",
    "Uploads: Access uploaded activity support files and handle them only for verification or operations.",
    "External: Review external activity submissions and accept only supported, verifiable entries.",
    "Magazine: Review article submissions, event-linked articles, pictorials, and publishing workflow items in line with RunNation editorial standards. Do not approve an event that requires magazine review until its magazine part is acceptable.",
    "Chat Reports: Review reported posts, comments, screenshots, and descriptions within your scope and escalate serious or repeat abuse.",
  ],
  event_organizer: [
    "Events and Enrollments: Create and update your organizer-owned same-day, recurring, and multiday events, provide accurate event details and payment instructions, include required magazine article and photo information, and review event enrollment approvals, rejections, or payment confirmations only for events that belong to your organizer profile.",
  ],
  magazine_columnist: [
    "Magazine: Submit or maintain approved column content in your assigned category. Use only original work or properly credited source material, avoid medical claims outside your expertise, and respect editorial review decisions.",
  ],
};

const TERMS_LABEL_BY_ROLE: Record<AdminTermsRole, string> = {
  global_admin: "Global Admin Terms",
  country_admin: "Country Admin Terms",
  country_coordinator: "Country Coordinator Terms",
  club_coordinator: "Club Coordinator Terms",
  event_organizer: "Organizer Terms",
  magazine_columnist: "Magazine Columnist Terms",
};

const TERMS_DOC_BY_ROLE: Record<AdminTermsRole, string> = {
  global_admin: "admin-terms-and-conditions.md",
  country_admin: "country-admin-terms-and-conditions.md",
  country_coordinator: "country-coordinator-terms-and-conditions.md",
  club_coordinator: "club-coordinator-terms-and-conditions.md",
  event_organizer: "event-organizer-terms-and-conditions.md",
  magazine_columnist: "magazine-columnist-terms-and-conditions.md",
};

export function getAdminTermsSections(role: AdminTermsRole): AdminTermsSection[] {
  return [
    SHARED_SECTIONS[0],
    {
      title: "Role Access",
      body: ROLE_ACCESS_BY_ROLE[role],
    },
    {
      title: "Function Guide",
      body: FUNCTION_GUIDE_BY_ROLE[role],
    },
    ...SHARED_SECTIONS.slice(1),
  ];
}

export function getAdminTermsRoleLabel(role: AdminTermsRole): string {
  return TERMS_LABEL_BY_ROLE[role];
}

export function getAdminTermsDocReference(role: AdminTermsRole): AdminTermsDocReference {
  return {
    indexDoc: "terms-and-conditions-index.md",
    roleDoc: TERMS_DOC_BY_ROLE[role],
  };
}
