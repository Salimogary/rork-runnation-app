import { publicProcedure } from "../../../create-context";

const DEFAULT_FAQS = [
  {
    faq_id: "default-1",
    question: "How do events, approvals, and event payments work?",
    answer:
      "Events may be free, approval-based, paid, virtual, local, recurring, one-day, or multiday. Your enrollment may be confirmed immediately, sent to an admin or club coordinator for review, or held until payment is confirmed.",
    display_order: 10,
  },
  {
    faq_id: "default-2",
    question: "Why can't I join some events or shop in some countries?",
    answer:
      "Some events and shop items are country-specific. Travel settings may temporarily open eligible events in another country, while paid events, shop orders, and delivery remain subject to country, currency, and admin processing rules.",
    display_order: 20,
  },
  {
    faq_id: "default-3",
    question: "How do activity uploads and treadmill activities get approved?",
    answer:
      "Manual, smart watch, sports-app, and treadmill submissions can enter an admin review queue when proof or event credit is needed. Treadmill activity counts for workouts and goals but not event credit unless a future event specifically allows it.",
    display_order: 30,
  },
  {
    faq_id: "default-4",
    question: "How does Stair Climb work?",
    answer:
      "Stair Climb is a building-stairs workout. Approved buildings use QR tags at staircase checkpoints, and each accepted scan sequence adds the building's fixed, verified stair count to your activity while the phone records time and movement evidence.",
    display_order: 35,
  },
  {
    faq_id: "default-5",
    question: "How do clubs and special clubs work?",
    answer:
      "A user may have one normal club plus any number of eligible special clubs. Normal club membership requires approval by the relevant coordinator, while eligible special clubs may be added automatically from profile and goal criteria.",
    display_order: 40,
  },
  {
    faq_id: "default-6",
    question: "How do I join my club WhatsApp group?",
    answer:
      "Go to Profile > My Clubs and look for the WhatsApp column or Join button beside your club. The button appears only for clubs you belong to after a club coordinator or admin has saved that club's WhatsApp invite link.",
    display_order: 45,
  },
  {
    faq_id: "default-7",
    question: "Who can join each special club?",
    answer:
      "Junior Runners is for users aged 8 to 15. Golden Age Runners is for users aged 60 and above. Para Runners is available when your profile says you have a disability, with an extra equipment question for wheelchair, handcycle, prosthetic blades, or other gear. Treadmill Runners is available when your profile says you do indoor workouts. SmartFit Club is available when your profile says you use a smart watch to record workouts and you have selected Monitor my health as one of your goals.",
    display_order: 50,
  },
  {
    faq_id: "default-8",
    question: "How does RunNation support special running groups?",
    answer:
      "RunNation is intentionally built for inclusion. Juniors compete within their own running community rather than adult/general rankings. Para users who use equipment stay in Para club leaderboards for exercise and appear in separate Para athlete event sections; para users with no gear can also appear in general community leaderboards. Golden Age, Treadmill, and SmartFit users also get relevant reports and club views.",
    display_order: 60,
  },
  {
    faq_id: "default-9",
    question: "Why does profile completion matter?",
    answer:
      "Profile fields drive important eligibility and safety rules, including age groups, country, clubs, SmartFit eligibility, Para and Treadmill options, goals, reports, rankings, service roles, and admin visibility. Missing fields can hide features that depend on those inputs.",
    display_order: 70,
  },
  {
    faq_id: "default-10",
    question: "How do goals, scorecards, and special club rankings connect?",
    answer:
      "Goal pages show the goals you selected. Related special club ranks may appear where relevant, such as SmartFit rank inside Monitor my health. Unselected goals may be shown separately as inactive options rather than mixed into your active scorecard.",
    display_order: 80,
  },
  {
    faq_id: "default-11",
    question: "What does Private Mode do?",
    answer:
      "Private Mode hides your data from public leaderboards and community-style views where the app supports that setting. You can still use your core account features normally.",
    display_order: 90,
  },
  {
    faq_id: "default-12",
    question: "How do admin and service team roles work?",
    answer:
      "Eligible users can apply through Join Service Team for roles such as club coordinator, country coordinator, event organizer, shop manager, special club coordinator, or approved magazine roles. Requests may include optional suitability notes, links, and contact instructions. Most users may hold only one active service role at a time.",
    display_order: 100,
  },
  {
    faq_id: "default-13",
    question: "Can under-18 users hold service roles?",
    answer:
      "Under-18 users generally cannot hold service roles. The exceptional case is the Junior Runners Club Coordinator role, because that role exists specifically to support the junior community under the app's safeguards.",
    display_order: 110,
  },
  {
    faq_id: "default-14",
    question: "What happens when an admin resigns or a role is deleted?",
    answer:
      "Non-Global Admins can submit a resignation request with a reason. The request stays pending for 12 hours unless a Global Admin acts sooner. Before admin access is deleted, RunNation stores a summarized resigned-admin audit log for accountability.",
    display_order: 120,
  },
  {
    faq_id: "default-15",
    question: "Can a club coordinator delete a club?",
    answer:
      "A club coordinator may request deletion for a club they created. If the club has no members it may be deleted immediately; if it has members, deletion stays pending for 12 hours and remains subject to the admin approval leg.",
    display_order: 130,
  },
  {
    faq_id: "default-16",
    question: "How do donations work on RunNation?",
    answer:
      "RunNation accepts voluntary donations to help support the app's operational costs, development, and community mission as a growing startup platform. The app may record donation details such as donation intent, amount, payment option, country, and optional remarks.",
    display_order: 140,
  },
  {
    faq_id: "default-17",
    question: "How does the RunNation reward system work?",
    answer:
      "RunNation may recognize and reward users for outstanding participation and contribution within the community. Rewards may be based on independent community polls on the chat page, recommendations from admins, or special recognition by Management for exceptional contributions such as community support, suggestions, leadership, or engagement. Rewards may include running gear, merchandise, or complimentary subscription periods.",
    display_order: 141,
  },
  {
    faq_id: "default-18",
    question: "How are community content, magazine submissions, and reports moderated?",
    answer:
      "Admins may review chat reports, screenshots, social content, magazine articles, pictorials, activity uploads, and event-related submissions. Abusive, hateful, pornographic, divisive, sectarian, misleading, unsafe, or spam content may be rejected, restricted, removed, or escalated.",
    display_order: 150,
  },
  {
    faq_id: "default-19",
    question: "Why might submissions or uploads be temporarily limited?",
    answer:
      "RunNation uses backend rate limits, input checks, file-type validation, role checks, and moderation logs to reduce spam, duplicate submissions, and abuse. If you submit many items quickly, wait a short time and try again.",
    display_order: 160,
  },
];

const CURATED_FAQ_QUESTIONS = new Set(
  DEFAULT_FAQS.map((faq) => faq.question.trim().toLowerCase())
);

function isMissingSchemaError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error);
  return message.includes("does not exist") || message.includes("schema cache");
}

function normalizeFaqRows(rows: any[] | null | undefined) {
  return (rows ?? [])
    .filter((row) => row?.question && row?.answer && row?.is_active !== false)
    .filter((row) => CURATED_FAQ_QUESTIONS.has(String(row.question).trim().toLowerCase()))
    .map((row) => ({
      faq_id: row.faq_id,
      question: String(row.question),
      answer: String(row.answer),
      display_order: Number(row.display_order ?? 0),
    }))
    .sort((a, b) => {
      if (a.display_order !== b.display_order) {
        return a.display_order - b.display_order;
      }
      return String(a.faq_id).localeCompare(String(b.faq_id));
    });
}

function mergeRequiredDefaultFaqs(rows: ReturnType<typeof normalizeFaqRows>) {
  const existingQuestions = new Set(rows.map((row) => row.question.trim().toLowerCase()));
  const missingDefaults = DEFAULT_FAQS.filter(
    (defaultFaq) => !existingQuestions.has(defaultFaq.question.trim().toLowerCase())
  );

  return [...rows, ...missingDefaults].sort((a, b) => {
    if (a.display_order !== b.display_order) {
      return a.display_order - b.display_order;
    }
    return String(a.faq_id).localeCompare(String(b.faq_id));
  });
}

export default publicProcedure.query(async ({ ctx }) => {
  const { data, error } = await ctx.supabase
    .from("faq_entries")
    .select("faq_id, question, answer, display_order, is_active")
    .order("display_order", { ascending: true })
    .order("faq_id", { ascending: true });

  if (error) {
    if (!isMissingSchemaError(error)) {
      throw new Error(error.message || "Could not load FAQ entries.");
    }

    const { data: fallbackData, error: fallbackError } = await ctx.supabase
      .from("faq_entries")
      .select("faq_id, question, answer, display_order")
      .order("display_order", { ascending: true })
      .order("faq_id", { ascending: true });

    if (fallbackError) {
      return DEFAULT_FAQS;
    }

    const fallbackRows = normalizeFaqRows(fallbackData);
    return fallbackRows.length ? mergeRequiredDefaultFaqs(fallbackRows) : DEFAULT_FAQS;
  }

  const rows = normalizeFaqRows(data);
  if (rows.length === 0) {
    return DEFAULT_FAQS;
  }

  return mergeRequiredDefaultFaqs(rows);
});
