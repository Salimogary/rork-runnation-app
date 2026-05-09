import { publicProcedure } from "../../../create-context";

const DEFAULT_FAQS = [
  {
    faq_id: "default-1",
    question: "How do I join an event?",
    answer:
      "Open Events, choose an event that matches your country or is marked virtual, then tap Participate. Free events add you straight to participants, club-approved events go to review, and paid events wait for payment confirmation.",
    display_order: 10,
  },
  {
    faq_id: "default-2",
    question: "Why can't I join some events?",
    answer:
      "Some non-virtual events are limited to your registered country. You may also need club approval or payment before your slot is confirmed.",
    display_order: 20,
  },
  {
    faq_id: "default-3",
    question: "What does Private Mode do?",
    answer:
      "Private Mode hides your data from public leaderboards and community-style views where the app supports that setting. You can still use your core account features normally.",
    display_order: 30,
  },
  {
    faq_id: "default-4",
    question: "How are treadmill activities approved?",
    answer:
      "Treadmill sessions go to the admin review queue with the proof photo you submit. An admin checks the evidence before the activity is accepted into your records.",
    display_order: 40,
  },
  {
    faq_id: "default-5",
    question: "Why does my profile completion matter?",
    answer:
      "Profile completion helps unlock a cleaner app experience by making sure your core details, goals, verification state, and admin requirements are properly set up.",
    display_order: 50,
  },
  {
    faq_id: "default-6",
    question: "How do payments work in RunNation?",
    answer:
      "Subscriptions, paid events, and any approved payment-based workflows may require confirmation before access is granted. Where a fee applies, the app or the responsible admin should communicate the payment instructions clearly.",
    display_order: 60,
  },
  {
    faq_id: "default-7",
    question: "How do I contact an admin quickly?",
    answer:
      "Go to Settings > Help. You will find admin contacts there with quick WhatsApp and email actions where contact details are available.",
    display_order: 70,
  },
  {
    faq_id: "default-8",
    question: "Can I submit suggestions or report a problem?",
    answer:
      "Yes. Use Settings > Suggestions to send feedback. Choose the category that best matches your issue so the team can route it faster.",
    display_order: 80,
  },
  {
    faq_id: "default-9",
    question: "How do I edit my profile details?",
    answer:
      "Open Profile to update your personal details, country, photo, goals, and other account information. Keeping your profile current helps the app match you to the right events and community views.",
    display_order: 90,
  },
  {
    faq_id: "default-10",
    question: "Why is my email verification important?",
    answer:
      "A verified email helps with account recovery, trust, and profile completion. If you signed in with Google or Apple, the app may already recognise that email as verified.",
    display_order: 100,
  },
  {
    faq_id: "default-11",
    question: "What happens after I submit an external activity?",
    answer:
      "External activities go into a review flow so an admin can confirm the submission before it appears in your main activity records.",
    display_order: 110,
  },
  {
    faq_id: "default-12",
    question: "How do club requests work?",
    answer:
      "When you request to join a club, the request goes to the relevant admin or coordinator for review. You should see the club reflected in your account once the request is approved.",
    display_order: 120,
  },
  {
    faq_id: "default-13",
    question: "Why is an event marked view only?",
    answer:
      "An event may be view only if it is outside your registered country and is not virtual, or if the app is showing it for visibility but not for direct enrollment.",
    display_order: 130,
  },
  {
    faq_id: "default-14",
    question: "How do medals work for events?",
    answer:
      "Some events include medal tracking. When that happens, the event may define daily or cumulative distance targets and a medal date range that determine who qualifies.",
    display_order: 140,
  },
  {
    faq_id: "default-15",
    question: "Can I change my country later?",
    answer:
      "Yes, but changing country can affect local events, club matching, shop availability, and admin contact suggestions. It is best to keep it aligned with where you actually participate.",
    display_order: 150,
  },
  {
    faq_id: "default-16",
    question: "Where do I find support if something looks wrong?",
    answer:
      "Start with Settings > Help for admin contacts, then use Suggestions if you want to report a bug, ask for a feature, or explain a support issue in more detail.",
    display_order: 160,
  },
  {
    faq_id: "default-17",
    question: "Can I hold more than one role at a time?",
    answer: "No.",
    display_order: 170,
  },
];

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
    return fallbackRows.length ? fallbackRows : DEFAULT_FAQS;
  }

  const rows = normalizeFaqRows(data);
  if (rows.length === 0) {
    return DEFAULT_FAQS;
  }

  return rows;
});
