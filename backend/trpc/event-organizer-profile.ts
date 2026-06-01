interface EventOrganizerProfileInput {
  organizerName?: string | null;
  description?: string | null;
  country?: string | null;
  isActive?: boolean;
}

export async function ensureEventOrganizerForUser(
  ctx: any,
  userId: string,
  input: EventOrganizerProfileInput = {}
): Promise<string> {
  const { data: profile, error: profileError } = await ctx.supabase
    .from("profiles")
    .select("profile_id, registration_id, display_name, username, country_code")
    .eq("profile_id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message || "Could not load the event organizer profile.");
  }
  if (!profile?.registration_id) {
    throw new Error("Could not resolve registration for this user.");
  }

  const registrationId = String(profile.registration_id);
  const { data: existingOrganizer, error: existingOrganizerError } = await ctx.supabase
    .from("event_organizers")
    .select("organizer_id")
    .eq("registration_id", registrationId)
    .maybeSingle();

  if (existingOrganizerError) {
    throw new Error(existingOrganizerError.message || "Could not check the event organizer profile.");
  }
  if (existingOrganizer?.organizer_id) {
    const updates: Record<string, unknown> = {};
    if (input.organizerName?.trim()) updates.organizer_name = input.organizerName.trim();
    if (input.description !== undefined) updates.description = input.description?.trim() || null;
    if (input.country?.trim()) updates.country = input.country.trim().toUpperCase();
    if (input.isActive !== undefined) updates.is_active = input.isActive;

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await ctx.supabase
        .from("event_organizers")
        .update(updates)
        .eq("organizer_id", existingOrganizer.organizer_id);

      if (updateError) {
        throw new Error(updateError.message || "Could not update the event organizer profile.");
      }
    }

    return String(existingOrganizer.organizer_id);
  }

  const [{ data: registration }, { data: authUserResult }] = await Promise.all([
    ctx.supabase
      .from("registrations")
      .select("first_name, other_names, username, country")
      .eq("registration_id", registrationId)
      .maybeSingle(),
    ctx.supabase.auth.admin.getUserById(userId),
  ]);

  const fullName = [registration?.first_name, registration?.other_names].filter(Boolean).join(" ").trim();
  const organizerName =
    String(input.organizerName || "").trim() ||
    String(profile.display_name || "").trim() ||
    fullName ||
    String(profile.username || registration?.username || "").trim() ||
    String(authUserResult?.user?.email || "").split("@")[0] ||
    "RunNation Event Organizer";
  const country = String(input.country || profile.country_code || registration?.country || "").trim() || null;

  const { data: createdOrganizer, error: createOrganizerError } = await ctx.supabase
    .from("event_organizers")
    .insert({
      organizer_name: organizerName,
      description: input.description?.trim() || "Independent event organizer account",
      registration_id: registrationId,
      country: country ? country.toUpperCase() : null,
      is_active: input.isActive ?? true,
    })
    .select("organizer_id")
    .maybeSingle();

  if (createOrganizerError || !createdOrganizer?.organizer_id) {
    if (createOrganizerError?.code === "23505") {
      const { data: racedOrganizer, error: racedOrganizerError } = await ctx.supabase
        .from("event_organizers")
        .select("organizer_id")
        .eq("registration_id", registrationId)
        .maybeSingle();

      if (!racedOrganizerError && racedOrganizer?.organizer_id) {
        return String(racedOrganizer.organizer_id);
      }
    }

    throw new Error(createOrganizerError?.message || "Could not create the event organizer profile.");
  }

  return String(createdOrganizer.organizer_id);
}
