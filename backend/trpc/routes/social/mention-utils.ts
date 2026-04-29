const USERNAME_PATTERN = /(^|\s)@([a-zA-Z0-9._]+)/g;

export function extractMentionUsernames(input?: string | null): string[] {
  if (!input) return [];

  const matches = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = USERNAME_PATTERN.exec(input)) !== null) {
    const username = match[2]?.trim().toLowerCase();
    if (username) {
      matches.add(username);
    }
  }

  return [...matches];
}

export async function createMentionsForText(params: {
  supabase: any;
  socialPostId: string;
  socialCommentId?: string | null;
  mentionedByRegistrationId: string;
  text?: string | null;
}) {
  const usernames = extractMentionUsernames(params.text);
  if (usernames.length === 0) return;

  const registrationResults = await Promise.all(
    usernames.map(async (username) => {
      const { data, error } = await params.supabase
        .from("registrations")
        .select("registration_id, username")
        .ilike("username", username)
        .limit(1);

      if (error) {
        console.warn("Mention lookup warning:", error.message);
        return [];
      }

      return data || [];
    })
  );

  const registrations = registrationResults.flat();
  if (!registrations.length) {
    return;
  }

  const mentions = registrations
    .filter((registration: any) => registration.registration_id !== params.mentionedByRegistrationId)
    .map((registration: any) => ({
      social_post_id: params.socialPostId,
      social_comment_id: params.socialCommentId ?? null,
      mentioned_registration_id: registration.registration_id,
      mentioned_by_registration_id: params.mentionedByRegistrationId,
    }));

  if (mentions.length === 0) return;

  await params.supabase.from("social_mentions").insert(mentions);
}
