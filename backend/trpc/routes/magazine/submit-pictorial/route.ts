import { z } from "zod";
import { ensureActionCooldown, ensureNoRecentDuplicateText } from "../../../abuse";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

const MAGAZINE_BUCKET = "magazine";

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().min(1),
      eventName: z.string().trim().min(2).max(120),
      eventDate: z.string().trim().nullable(),
      caption: z.string().trim().min(8).max(500),
      imageBase64: z.string().min(1),
      mimeType: z.string().trim().min(1),
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (!ctx.authUserId) {
      throw new Error("Please sign in before submitting an event pictorial.");
    }
    await requireRegistrationOwner(ctx, input.registrationId);
    await ensureActionCooldown(ctx, {
      table: "magazine_pictorial_submissions",
      filters: [{ column: "registration_id", value: input.registrationId }],
      cooldownSeconds: 3 * 60,
      errorMessage: "Please wait a few minutes before submitting another pictorial.",
    });
    await ensureNoRecentDuplicateText(ctx, {
      table: "magazine_pictorial_submissions",
      filters: [{ column: "registration_id", value: input.registrationId }],
      textColumn: "caption",
      textValue: input.caption,
      windowSeconds: 24 * 60 * 60,
      errorMessage: "That pictorial caption looks like a recent duplicate submission.",
    });

    const [registrationRes, contactRes, clubMembershipRes, profileByRegistrationRes, profileByAuthRes] = await Promise.all([
      ctx.supabase
        .from("registrations")
        .select("registration_id, first_name, other_names, username, country")
        .eq("registration_id", input.registrationId)
        .maybeSingle(),
      ctx.supabase.from("contacts").select("email").eq("registration_id", input.registrationId).maybeSingle(),
      ctx.supabase
        .from("club_membership_request")
        .select("club")
        .eq("registration_id", input.registrationId)
        .order("created_at", { ascending: true })
        .limit(1),
      ctx.supabase
        .from("profiles")
        .select("profile_id, display_name, username, country")
        .eq("registration_id", input.registrationId)
        .maybeSingle(),
      ctx.supabase
        .from("profiles")
        .select("profile_id, display_name, username, country")
        .eq("profile_id", ctx.authUserId)
        .maybeSingle(),
    ]);

    const registration = registrationRes.data as any;
    const contact = contactRes.data as any;
    const clubMembership = Array.isArray(clubMembershipRes.data)
      ? clubMembershipRes.data[0]
      : clubMembershipRes.data as any;
    const profile = (profileByRegistrationRes.data || profileByAuthRes.data) as any;
    const fullName = [registration?.first_name, registration?.other_names].filter(Boolean).join(" ").trim();
    const submitterName =
      profile?.display_name?.trim?.() ||
      fullName ||
      registration?.username?.trim?.() ||
      profile?.username?.trim?.() ||
      "RunNation Runner";
    const email = contact?.email?.trim?.().toLowerCase() || "magazine@runnation.app";
    const country = registration?.country?.trim?.() || profile?.country?.trim?.() || "Unspecified";
    const club = clubMembership?.club?.trim?.() || null;

    const ext = input.mimeType.includes("png") ? "png" : input.mimeType.includes("webp") ? "webp" : "jpg";
    const fileName = `pictorials/${input.registrationId}/${Date.now()}.${ext}`;

    const { data: uploadData, error: uploadError } = await ctx.supabase.storage
      .from(MAGAZINE_BUCKET)
      .upload(fileName, Buffer.from(input.imageBase64, "base64"), {
        contentType: input.mimeType,
        upsert: false,
      });

    if (uploadError || !uploadData) {
      throw new Error(uploadError?.message || "Could not upload pictorial image.");
    }

    const { data: publicUrlData } = ctx.supabase.storage
      .from(MAGAZINE_BUCKET)
      .getPublicUrl(uploadData.path);

    const { data, error } = await ctx.supabase
      .from("magazine_pictorial_submissions")
      .insert({
        registration_id: input.registrationId,
        profile_id: profile?.profile_id ?? ctx.authUserId,
        submitter_name: submitterName,
        email,
        club,
        country,
        event_name: input.eventName.trim(),
        event_date: input.eventDate || null,
        caption: input.caption.trim(),
        photo_url: publicUrlData.publicUrl,
        photo_webp_url: publicUrlData.publicUrl,
        photo_avif_url: publicUrlData.publicUrl,
        photo_path: uploadData.path,
        status: "submitted",
      })
      .select("pictorial_id, status, created_at")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Could not submit event pictorial.");
    }

    return data;
  });
