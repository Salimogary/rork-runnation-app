export const ADMIN_TERMS_VERSION = "2026-05-25";

export type AdminTermsSection = {
  title: string;
  body: string[];
};

export type AdminTermsRole =
  | "global_admin"
  | "country_admin"
  | "country_coordinator"
  | "club_coordinator"
  | "special_club_coordinator"
  | "junior_runners_club_coordinator"
  | "golden_age_runners_club_coordinator"
  | "treadmill_runners_club_coordinator"
  | "para_runners_club_coordinator"
  | "smartfit_club_coordinator"
  | "event_organizer"
  | "magazine_editor"
  | "chat_room_administrator"
  | "magazine_columnist";

const TERMS_LABEL_BY_ROLE: Record<AdminTermsRole, string> = {
  global_admin: "Global Admin Terms",
  country_admin: "Country Admin Terms",
  country_coordinator: "Country Coordinator Terms",
  club_coordinator: "Club Coordinator Terms",
  special_club_coordinator: "Special Club Coordinator Terms",
  junior_runners_club_coordinator: "Junior Runners Club Coordinator Terms",
  golden_age_runners_club_coordinator: "Golden Age Runners Club Coordinator Terms",
  treadmill_runners_club_coordinator: "Treadmill Runners Club Coordinator Terms",
  para_runners_club_coordinator: "Para Runners Club Coordinator Terms",
  smartfit_club_coordinator: "SmartFit Club Coordinator Terms",
  event_organizer: "Event Organizer Terms",
  magazine_editor: "Magazine Editor Terms",
  chat_room_administrator: "Chat Room Administrator Terms",
  magazine_columnist: "Magazine Columnist Terms",
};

const VALUES_SECTION: AdminTermsSection = {
  title: "Core Values",
  body: [
    "Integrity: Admin decisions must be honest, evidence-based, and free from favoritism, retaliation, or personal advantage.",
    "Safety: Admins must protect users from abuse, unsafe content, misleading information, and careless handling of personal data.",
    "Service: Admin access must be used to support runners, clubs, events, magazine contributors, and the wider RunNation community.",
    "Accountability: Admin actions may be logged and reviewed, and misuse of access may lead to removal of the role or further action.",
  ],
};

const COPYRIGHT_DISCLAIMER_SECTION: AdminTermsSection = {
  title: "Copyright and Content Responsibility",
  body: [
    "When publishing, approving, forwarding, or displaying articles, photographs, videos, screenshots, posters, captions, external links, or other media, you must take reasonable steps to ensure the material is original, properly licensed, appropriately credited, or otherwise lawful to use.",
    "You must not knowingly publish or approve content that infringes another person's copyright, privacy, image rights, safety, dignity, or lawful interests.",
    "Where there is a credible concern about copyright, consent, privacy, harmful content, or misleading information, you must pause publication or action and escalate the matter for review.",
  ],
};

const ROLE_MISSION_BY_ROLE: Record<AdminTermsRole, string[]> = {
  global_admin: [
    "RunNation exists to connect runners, clubs, organizers, families, writers, and community leaders through safe events, trusted records, inclusive communities, responsible communication, and inspiring stories.",
    "The role of a Global Admin is to protect platform integrity across RunNation, supervise role access, keep operational records healthy, support country and club teams, and make high-level decisions fairly and transparently.",
  ],
  country_admin: [
    "RunNation exists to connect runners, clubs, organizers, families, writers, and community leaders through safe events, trusted records, inclusive communities, responsible communication, and inspiring stories.",
    "The former Country Admin role exists only where legacy access remains. Its country-level responsibilities are being carried by Country Coordinators, and any remaining access must be used only for assigned-country operations.",
  ],
  country_coordinator: [
    "RunNation exists to connect runners, clubs, organizers, families, writers, and community leaders through safe events, trusted records, inclusive communities, responsible communication, and inspiring stories.",
    "The role of a Country Coordinator is to grow and supervise RunNation activity within an assigned country, support clubs and event organizers, approve country-level work, and escalate issues that need Global Admin authority.",
  ],
  club_coordinator: [
    "RunNation exists to connect runners, clubs, organizers, families, writers, and community leaders through safe events, trusted records, inclusive communities, responsible communication, and inspiring stories.",
    "The role of a Club Coordinator is to build and administer an assigned club, support members, manage club activities, verify eligible records, and represent RunNation values within the club community.",
  ],
  special_club_coordinator: [
    "RunNation exists to connect runners, clubs, organizers, families, writers, and community leaders through safe events, trusted records, inclusive communities, responsible communication, and inspiring stories.",
    "This coordinator role must be linked to a named RunNation club. If you see this generic version, contact Global Admin so the correct club-specific terms can be assigned.",
  ],
  junior_runners_club_coordinator: [
    "RunNation exists to connect runners, clubs, organizers, families, writers, and community leaders through safe events, trusted records, inclusive communities, responsible communication, and inspiring stories.",
    "The role of a Junior Runners Club Coordinator is to support young runners aged 8 to 15, encourage healthy participation, protect junior wellbeing, involve parents or guardians where appropriate, and represent RunNation values within the junior running community.",
  ],
  golden_age_runners_club_coordinator: [
    "RunNation exists to connect runners, clubs, organizers, families, writers, and community leaders through safe events, trusted records, inclusive communities, responsible communication, and inspiring stories.",
    "The role of a Golden Age Runners Club Coordinator is to support older runners aged 60 and above with respectful, age-aware activities, social connection, safe participation, recognition, and practical encouragement that protects dignity and independence.",
  ],
  treadmill_runners_club_coordinator: [
    "RunNation exists to connect runners, clubs, organizers, families, writers, and community leaders through safe events, trusted records, inclusive communities, responsible communication, and inspiring stories.",
    "The role of a Treadmill Runners Club Coordinator is to support indoor runners, verify treadmill and indoor activity records responsibly, encourage consistent training, and make sure treadmill-based participation is treated fairly within RunNation.",
  ],
  para_runners_club_coordinator: [
    "RunNation exists to connect runners, clubs, organizers, families, writers, and community leaders through safe events, trusted records, inclusive communities, responsible communication, and inspiring stories.",
    "The role of a Para Runners Club Coordinator is to support runners with disabilities, protect dignity and accessibility, respect declared equipment categories, and help RunNation provide fair participation pathways for para athletes.",
  ],
  smartfit_club_coordinator: [
    "RunNation exists to connect runners, clubs, organizers, families, writers, and community leaders through safe events, trusted records, inclusive communities, responsible communication, and inspiring stories.",
    "The role of a SmartFit Club Coordinator is to support members who use smart watches and general health tracking, encourage responsible use of wearable data, and help members connect everyday health habits with running participation.",
  ],
  event_organizer: [
    "RunNation exists to connect runners, clubs, organizers, families, writers, and community leaders through safe events, trusted records, inclusive communities, responsible communication, and inspiring stories.",
    "The role of an Event Organizer is to create and manage accurate, safe, and well-presented events, support participant registration, maintain event readiness, and provide the information admins need before approval.",
  ],
  magazine_editor: [
    "RunNation exists to connect runners, clubs, organizers, families, writers, and community leaders through safe events, trusted records, inclusive communities, responsible communication, and inspiring stories.",
    "The role of the Magazine Editor is to lead The Running Post with editorial judgment, protect publication quality, review submissions responsibly, and shape a trustworthy magazine voice for the RunNation community.",
  ],
  chat_room_administrator: [
    "RunNation exists to connect runners, clubs, organizers, families, writers, and community leaders through safe events, trusted records, inclusive communities, responsible communication, and inspiring stories.",
    "The role of a Chat Room Administrator is to help keep RunNation conversations safe, respectful, and usable by reviewing abuse reports, acting on harmful content, and documenting moderation decisions responsibly.",
  ],
  magazine_columnist: [
    "RunNation exists to connect runners, clubs, organizers, families, writers, and community leaders through safe events, trusted records, inclusive communities, responsible communication, and inspiring stories.",
    "The role of a Magazine Columnist is to contribute original, accurate, useful, and inspiring stories within the writer's approved specialty and to strengthen The Running Post through consistent editorial contribution.",
  ],
};

const ROLE_TERMS_BY_ROLE: Record<AdminTermsRole, string[]> = {
  global_admin: [
    "Role access and service team governance: review, approve, reject, suspend, or remove service roles including Country Coordinators, Club Coordinators, Special Club Coordinators, Event Organizers, Magazine Editor, Chat Room Administrator, and approved columnist roles.",
    "Platform data health: monitor account integrity, repair justified account-link issues, review profile problems, and protect backend data from unnecessary exposure.",
    "Audit and accountability: review admin actions, investigate misuse, maintain deletion logs, and keep sensitive audit information within approved RunNation leadership channels.",
    "Events and participation: approve or reject events across countries and clubs, review readiness, participant limits, payment instructions, dates, posters, medal settings, distances, and event safety concerns.",
    "Clubs and country operations: oversee club creation, inactive club flags, membership requests, treadmill approvals, activity uploads, other-source runs, WhatsApp group links, and country-level escalations.",
    "Magazine and publication: supervise The Running Post, event stories, community submissions, pictorials, columnist work, publication decisions, and editorial escalations.",
    "Chat and social safety: review abuse reports, delete harmful posts or comments, approve or apply username-based chat suspensions, and keep moderation evidence proportionate and confidential.",
    "Operational records: manage milestones, reports, suggestions, ratings, archive records, orders, stock, payments, fulfilment, recognition, and other records needed for platform management.",
  ],
  country_admin: [
    "Legacy access: use Country Admin privileges only where RunNation has not yet migrated a task to Country Coordinator access.",
    "Assigned-country operations: support orders, stock, delivery updates, events, enrollments, payments, club administration, and club or organizer requests with accurate records.",
    "Country review duties: review activity uploads, other-source runs, magazine items, WhatsApp group matters, and reports only where they belong to the assigned country.",
    "Escalation: refer role disputes, safety concerns, abuse, payment risks, inactive club deletion, data repair, or platform-wide issues to Global Admin.",
  ],
  country_coordinator: [
    "Country growth: attract, guide, and support clubs and event organizers in the assigned country, subject to RunNation limits and approval rules.",
    "Role and portfolio review: help assess Club Coordinator and Event Organizer requests by checking applicant details, club or organizer names, country fit, and basic readiness.",
    "Country events: review and approve country events where permitted, including event dates, poster suitability, distances, medal settings, location, fees, payment instructions, and organizer readiness.",
    "Membership and records: supervise country-level enrollments, membership approvals, treadmill reviews, activity uploads, other-source runs, and reports using clear evidence.",
    "Inactive clubs: review inactive club flags and support appropriate follow-up, including escalation for deletion where the club meets RunNation inactivity rules.",
    "Country communications: support WhatsApp group oversight, country team coordination, and accurate communication between clubs, organizers, members, and Global Admin.",
    "Limits of authority: act only within the assigned country and escalate safety, abuse, payment, role, data, or cross-country concerns that require Global Admin authority.",
  ],
  club_coordinator: [
    "Club profile and identity: maintain accurate club name, description, location, presence towns, membership expectations, and other approved club details.",
    "Club activities and events: plan, organize, and promote club runs, walks, training sessions, and approved club events in a safe and responsible manner.",
    "Membership support: welcome members, review club membership requests, help members understand expectations, and promote participation, sportsmanship, inclusion, and positive club culture.",
    "Activity verification: review eligible activity records from external sources, smart watches, running apps, treadmill workouts, or manual uploads; reject or request clarification for records that appear inaccurate, incomplete, duplicated, or inconsistent.",
    "Payments and reports: manage club-related payment records, reports, and administrative follow-up only where the tool grants that authority.",
    "Club communications: manage official club communication channels such as WhatsApp group links, encourage respectful discussion, and address content or behavior that harms members or the club's reputation.",
    "Club stories and recognition: submit club-related articles, event summaries, member achievements, and feature stories that are accurate, respectful, and suitable for RunNation.",
    "Limits of authority: do not manage members, events, payments, records, or requests belonging to another club, organizer, country, or peer coordinator.",
  ],
  special_club_coordinator: [
    "This is a fallback version only. The coordinator should normally receive terms for Junior Runners Club, Golden Age Runners Club, Para Runners Club, Treadmill Runners Club, or SmartFit Club.",
    "Use this access only within the named club shown in your approved role assignment.",
    "Contact Global Admin if the terms do not name the actual club you coordinate.",
  ],
  junior_runners_club_coordinator: [
    "Safeguarding first: prioritize the wellbeing, privacy, dignity, and safety of junior members in all club activities, communications, rankings, reports, and stories.",
    "Parent and guardian awareness: support appropriate parent, guardian, school, or responsible adult involvement where junior participation, communication, travel, activities, or publication of images is concerned.",
    "Club activities: plan, organize, and promote age-appropriate club runs, walks, training sessions, challenges, and approved events that are safe, inclusive, and realistic for young runners.",
    "Activity verification: review junior activity records from smart watches, fitness trackers, running apps, treadmill workouts, or external sources; reject or request clarification for records that appear inaccurate, incomplete, duplicated, unsafe, or inconsistent.",
    "Communication standards: manage official Junior Runners communication channels in a respectful, child-safe manner, remove inappropriate content, and escalate concerning behavior promptly.",
    "Recognition and stories: publish junior achievements, event summaries, and club stories only when they are accurate, positive, suitable for young members, and respectful of privacy and consent.",
    "Limits of authority: do not use junior coordinator access for personal gain, private contact outside approved channels, political activity, harassment, or any activity that may harm young members or RunNation.",
  ],
  golden_age_runners_club_coordinator: [
    "Dignity and respect: support older runners as capable members of the RunNation community and avoid language, decisions, or activities that stereotype, patronize, or exclude them.",
    "Age-aware participation: promote safe, realistic runs, walks, mobility-friendly activities, social sessions, and events that consider recovery, pacing, accessibility, and member comfort.",
    "Member support: welcome Golden Age members, encourage consistency, reduce isolation, and help members understand club activities, rankings, reports, and event options.",
    "Activity verification: review submitted activity records fairly while recognizing that pace, distance, device access, and training patterns may differ among older runners.",
    "Communication standards: keep Golden Age communication channels respectful, calm, inclusive, and free from scams, pressure, mockery, or unsafe advice.",
    "Health and safety boundaries: encourage members to seek qualified medical advice for health concerns and do not present personal running advice as medical instruction.",
    "Recognition and stories: highlight older runners' milestones, comeback stories, consistency, leadership, volunteering, and community contributions with consent and respect.",
  ],
  treadmill_runners_club_coordinator: [
    "Indoor running fairness: support treadmill runners as full RunNation participants and help ensure indoor efforts are recorded and reviewed consistently.",
    "Activity verification: review treadmill and indoor-workout records carefully, including date, distance, duration, screenshots, device source, duplicate signs, and consistency with RunNation rules.",
    "Evidence standards: reject or request clarification for treadmill records that are unclear, incomplete, suspicious, duplicated, or missing the required details.",
    "Training support: encourage safe indoor training habits, consistency, hydration, ventilation, gradual progression, and responsible use of equipment.",
    "Community inclusion: help treadmill runners participate in reports, rankings, stories, challenges, and events without being treated as less legitimate than outdoor runners.",
    "Communication standards: keep club channels focused on support, motivation, practical guidance, and respectful discussion of indoor training.",
    "Limits of authority: do not approve records outside the Treadmill Runners Club scope unless a separate approved role grants that authority.",
  ],
  para_runners_club_coordinator: [
    "Dignity and accessibility: support para runners with respect, person-first judgment, privacy, and awareness that disability experiences and access needs vary widely.",
    "Equipment fairness: respect declared equipment categories such as wheelchair, handcycle, prosthetic blades, or other gear, and support fair grouping where RunNation separates para participation.",
    "Activity and event support: help para runners access suitable club activities, event information, reports, rankings, and stories without unnecessary barriers.",
    "Activity verification: review records fairly while considering declared equipment and the relevant RunNation rules for para participation.",
    "Privacy boundaries: do not ask members to disclose unnecessary medical details and do not share disability-related information outside approved RunNation workflows.",
    "Communication standards: remove mocking, stigma, harassment, invasive questioning, or exclusionary content from club channels and escalate serious concerns.",
    "Recognition and stories: highlight para runners' achievements, equipment-aware participation, leadership, and community contribution only with respectful wording and appropriate consent.",
  ],
  smartfit_club_coordinator: [
    "Wearable data responsibility: support members who use smart watches or health tracking tools while treating steps, sleep, activity, and health-score data as personal information.",
    "Eligibility and ranking: follow SmartFit eligibility rules and help members understand how general health goals, wearable use, age groups, steps, activity, sleep, and health scores affect SmartFit ranking.",
    "Data quality: encourage members to keep device data accurate, avoid duplicate or misleading entries, and correct obvious errors before relying on rankings or reports.",
    "Health boundaries: do not treat wearable readings as medical diagnosis, and encourage members to seek qualified medical advice for health concerns.",
    "Member support: promote balanced habits, consistency, recovery, sleep, walking, running, and general wellness without shaming members for low scores or missed targets.",
    "Communication standards: keep SmartFit channels practical, evidence-aware, respectful, and free from unsafe health claims or pressure.",
    "Limits of authority: use SmartFit coordinator access only for SmartFit Club activities, reports, rankings, stories, and approved RunNation workflows.",
  ],
  event_organizer: [
    "Organizer profile: keep the organizer name, description, country, contact details, and event portfolio accurate and suitable for admin review.",
    "Event creation: provide accurate event name, start date, end date, registration close date, event type, recurrence, location or virtual details, poster, distances, medal settings, fees, payment instructions, participant limits, and any safety notes.",
    "Event readiness: ensure the event is lawful, realistic, clearly described, and ready for review before requesting approval.",
    "Participant management: review enrollments, payment records, participant reports, and event-specific questions only for events belonging to the approved organizer profile.",
    "Event updates: keep changes accurate and timely; edits to already approved events must not mislead participants or bypass admin approval rules.",
    "Magazine story support: provide event story and magazine photo details where RunNation requires event-related magazine content before approval or publication.",
    "Limits of authority: do not manage another organizer's events, registrations, payments, participants, reports, or posters.",
  ],
  magazine_editor: [
    "Editorial review: review submissions for grammar, clarity, tone, accuracy, consistency, copyright risk, privacy concerns, and publication readiness before they appear in The Running Post.",
    "Submission workflow: manage article submissions, event stories, community articles, journalist pieces, fitness coach content, empowerment coach content, columnist work, pictorials, captions, photos, and publication status.",
    "Publication decisions: approve, reject, return, edit, or delete magazine content according to RunNation editorial standards and the limits of the available workflow.",
    "Breaking news and updates: quickly prepare, update, or publish suitable time-sensitive stories while maintaining accuracy and fairness.",
    "Editorial vision: shape the magazine's identity, tone, themes, content calendar, and long-term growth strategy.",
    "Sponsored content: coordinate sponsored or advertiser-supported content only where editorial integrity, transparency, and reader trust are maintained.",
    "Editor-authored news: the Magazine Editor may write News articles, but the editor's own News articles must be approved by Global Admin before publication.",
    "Contributor care: guide writers constructively and avoid publishing private, harmful, misleading, plagiarized, or unfair material.",
  ],
  chat_room_administrator: [
    "Report review: screen Chat Abuse Reports alongside Global Admin, including reported posts, comments, screenshots, usernames, dates, offensive content, and report descriptions.",
    "Evidence standards: act on clear evidence and avoid relying on rumor, personal dislike, or incomplete screenshots where key details are missing.",
    "Content moderation: trace and delete harmful posts or comments when evidence confirms abuse, hate, pornography, spam, divisive, sectarian, threatening, misleading, unsafe, or privacy-violating content.",
    "Feedback to reporters: support user-specific feedback so reporters can see the status or outcome of their own complaints where the feature allows it.",
    "Suspension requests: request username-based chat suspension with a clear reason and end date; suspensions require Global Admin approval before they become active unless actioned directly by Global Admin.",
    "Privacy and restraint: keep report details confidential, use deletion powers only for legitimate moderation, and avoid unnecessary exposure of user data.",
  ],
  magazine_columnist: [
    "Submission frequency: submit at least one article per week and no more than five articles per week unless RunNation gives prior editorial approval.",
    "Approved specialty: keep topics within the approved specialty, such as Fitness Coach, Empowerment Coach, or Sports Journalist.",
    "Fitness Coach: provide practical, safe, evidence-aware running, training, recovery, consistency, strength, mobility, and habit-building advice without making medical claims beyond competence.",
    "Empowerment Coach: write motivational and personal-development content that encourages confidence, discipline, resilience, participation, and positive community behavior.",
    "Sports Journalist: cover sporting events, races, tournaments, charity runs, community fitness initiatives, athlete achievements, club stories, upcoming events, transfers, controversies, and wider sports culture across all sports, not only athletics.",
    "Reporting standards: verify names, dates, locations, claims, event facts, and sources; report fairly, accurately, responsibly, and with respect for privacy and professional ethics.",
    "Relationships and independence: build professional relationships with athletes, clubs, event organizers, sponsors, and community leaders to access stories without compromising editorial independence.",
    "Originality: submit original work or properly credited lawful material, and do not copy protected work, images, or captions without permission.",
    "Links and contact: provide website, LinkedIn, social, email, or external links only when safe, relevant, and suitable for RunNation readers.",
  ],
};

export function getAdminTermsSections(role: AdminTermsRole): AdminTermsSection[] {
  return [
    {
      title: "Mission",
      body: ROLE_MISSION_BY_ROLE[role],
    },
    VALUES_SECTION,
    {
      title: "Role Responsibilities",
      body: ROLE_TERMS_BY_ROLE[role],
    },
    COPYRIGHT_DISCLAIMER_SECTION,
    {
      title: "Acceptance",
      body: [
        `By accepting, you agree to carry out ${TERMS_LABEL_BY_ROLE[role].replace(" Terms", "")} responsibilities only within your assigned scope and only for legitimate RunNation work.`,
      ],
    },
  ];
}

export function getAdminTermsRoleLabel(role: AdminTermsRole): string {
  return TERMS_LABEL_BY_ROLE[role];
}
