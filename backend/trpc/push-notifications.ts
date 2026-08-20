type ActivityApprovalPushInput = {
  registrationId: string;
  activityId: string;
  sourceLabel: string;
};

type NewEventAlertInput = {
  eventId: string;
  eventName: string;
  date: string;
  location: string;
  countryCode: string;
  countryName?: string | null;
};

export async function sendActivityApprovalPush(ctx: any, input: ActivityApprovalPushInput): Promise<boolean> {
  try {
    const { data: tokenRows, error } = await ctx.supabase
      .from("device_push_tokens")
      .select("push_token")
      .eq("registration_id", input.registrationId);

    if (error) {
      console.error("[Push] Could not load device tokens:", error);
      return false;
    }

    const tokens = Array.from(new Set((tokenRows || []).map((row: any) => row.push_token).filter(Boolean)));
    if (tokens.length === 0) return false;

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tokens.map((to) => ({
        to,
        sound: "default",
        title: "Workout approved",
        body: `Your ${input.sourceLabel} workout has been approved. Tap to view your completed activity.`,
        data: {
          type: "activity_approved",
          activityId: input.activityId,
        },
        channelId: "default",
      }))),
    });

    if (!response.ok) {
      console.error("[Push] Expo rejected activity approval push:", response.status, await response.text());
      return false;
    }

    const result = await response.json() as any;
    const tickets = Array.isArray(result?.data) ? result.data : [result?.data].filter(Boolean);
    return tickets.some((ticket: any) => ticket?.status === "ok");
  } catch (error) {
    console.error("[Push] Activity approval push failed:", error);
    return false;
  }
}

export async function sendNewEventAlertPush(ctx: any, input: NewEventAlertInput): Promise<boolean> {
  try {
    const countryFilters = [`country_code.eq.${input.countryCode}`, `country.eq.${input.countryCode}`];
    if (input.countryName) {
      countryFilters.push(`country.eq.${input.countryName}`);
    }

    const { data: registrations, error: registrationError } = await ctx.supabase
      .from("registrations")
      .select("registration_id")
      .or(countryFilters.join(","));

    if (registrationError) {
      console.error("[Push] Could not load event-country registrations:", registrationError);
      return false;
    }

    const registrationIds = Array.from(
      new Set((registrations || []).map((row: any) => row.registration_id).filter(Boolean))
    );
    if (registrationIds.length === 0) return false;

    const { data: tokenRows, error: tokenError } = await ctx.supabase
      .from("device_push_tokens")
      .select("push_token")
      .in("registration_id", registrationIds);

    if (tokenError) {
      console.error("[Push] Could not load event alert tokens:", tokenError);
      return false;
    }

    const tokens = Array.from(new Set((tokenRows || []).map((row: any) => row.push_token).filter(Boolean)));
    if (tokens.length === 0) return false;

    const body = `New Event Alert: ${input.eventName} on ${input.date} at ${input.location}`;
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tokens.map((to) => ({
        to,
        sound: "default",
        title: "New Event Alert",
        body,
        data: {
          type: "new_event",
          eventId: input.eventId,
        },
        channelId: "default",
      }))),
    });

    if (!response.ok) {
      console.error("[Push] Expo rejected new event alert:", response.status, await response.text());
      return false;
    }

    const result = await response.json() as any;
    const tickets = Array.isArray(result?.data) ? result.data : [result?.data].filter(Boolean);
    return tickets.some((ticket: any) => ticket?.status === "ok");
  } catch (error) {
    console.error("[Push] New event alert failed:", error);
    return false;
  }
}
