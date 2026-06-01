import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";
import { randomUUID } from "crypto";

function normalizeCountryCode(country?: string | null) {
  const value = String(country || "").trim().toLowerCase();
  if (!value) return "";
  if (["ug", "uga", "uganda"].includes(value)) return "UG";
  return value.slice(0, 2).toUpperCase();
}

function normalizeEventEntry(entry?: string | null): "free" | "club_approved" | "paid" {
  const value = String(entry || "").trim().toLowerCase();
  if (value === "paid") return "paid";
  if (value === "club_approved") return "club_approved";
  return "free";
}

async function ensureEventCapacity(ctx: any, eventId: string, participantLimit?: number | null) {
  if (typeof participantLimit !== "number" || !Number.isFinite(participantLimit)) {
    return;
  }

  const { count, error } = await ctx.supabase
    .from("events_participants")
    .select("event_participant_id", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (error) {
    throw new Error(error.message || "Could not verify event participant limit.");
  }

  if ((count ?? 0) >= participantLimit) {
    throw new Error("This event has reached its participant limit.");
  }
}

export default publicProcedure
  .input(
    z.object({
      eventId: z.string(),
      registrationId: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    await requireRegistrationOwner(ctx, input.registrationId, { allowAdmin: true });

    let resolvedRegistrationId = input.registrationId;
    let authProfileIdForRepair = ctx.authUserId;
    let authEmail: string | null = null;

    console.log("[enrollEvent] Starting enrollment resolution", {
      inputRegistrationId: input.registrationId,
      authUserId: ctx.authUserId,
    });

    if (ctx.authUserId) {
      const { data: authUserResult, error: authUserError } = await ctx.supabase.auth.admin.getUserById(ctx.authUserId);

      if (authUserError) {
        throw new Error(authUserError.message || "Could not load your account details.");
      }

      authEmail = authUserResult?.user?.email?.trim().toLowerCase() ?? null;
      console.log("[enrollEvent] Loaded auth user", {
        authUserId: ctx.authUserId,
        authEmail,
      });
    }

    if (ctx.authUserId) {
      const { data: authProfileLink, error: authProfileLookupError } = await ctx.supabase
        .from("profiles")
        .select("profile_id, registration_id")
        .eq("profile_id", ctx.authUserId)
        .maybeSingle();

      if (authProfileLookupError) {
        throw new Error(authProfileLookupError.message || "Could not resolve your linked registration profile.");
      }

      authProfileIdForRepair = authProfileLink?.profile_id ?? ctx.authUserId;
      console.log("[enrollEvent] Profile lookup by auth user", {
        authUserId: ctx.authUserId,
        profileId: authProfileLink?.profile_id ?? null,
        profileRegistrationId: authProfileLink?.registration_id ?? null,
      });

      if (authProfileLink?.registration_id) {
        resolvedRegistrationId = authProfileLink.registration_id;
      }
    }

    const { data: registrationExists, error: registrationLookupError } = await ctx.supabase
      .from("registrations")
      .select("registration_id")
      .eq("registration_id", resolvedRegistrationId)
      .maybeSingle();

    if (registrationLookupError) {
      throw new Error(registrationLookupError.message || "Could not verify your registration profile.");
    }

    console.log("[enrollEvent] Registration existence check", {
      resolvedRegistrationId,
      exists: Boolean(registrationExists),
    });

    if (!registrationExists) {
      const { data: profileLink, error: profileLookupError } = await ctx.supabase
        .from("profiles")
        .select("registration_id")
        .eq("profile_id", input.registrationId)
        .maybeSingle();

      if (profileLookupError) {
        throw new Error(profileLookupError.message || "Could not resolve your linked registration profile.");
      }

      if (!profileLink?.registration_id) {
        if (authEmail) {
          const { data: contactLink, error: contactLookupError } = await ctx.supabase
            .from("contacts")
            .select("registration_id")
            .eq("email", authEmail)
            .maybeSingle();

          if (contactLookupError) {
            throw new Error(contactLookupError.message || "Could not resolve your linked registration contact.");
          }

          if (contactLink?.registration_id) {
            resolvedRegistrationId = contactLink.registration_id;
            console.log("[enrollEvent] Resolved registration via contact email:", resolvedRegistrationId);
          } else {
            console.log("[enrollEvent] No contacts row matched auth email", { authEmail });
          }
        }

        if ((!resolvedRegistrationId || resolvedRegistrationId === input.registrationId) && authEmail) {
          const { data: registrationByEmail, error: registrationByEmailError } = await ctx.supabase
            .from("registrations")
            .select("registration_id")
            .eq("email", authEmail)
            .maybeSingle();

          if (registrationByEmailError) {
            throw new Error(registrationByEmailError.message || "Could not resolve your registration email profile.");
          }

          if (registrationByEmail?.registration_id) {
            resolvedRegistrationId = registrationByEmail.registration_id;
            console.log("[enrollEvent] Resolved registration via registrations.email:", resolvedRegistrationId);
          } else {
            console.log("[enrollEvent] No registrations.email row matched auth email", { authEmail });
          }
        }

        if (!resolvedRegistrationId || resolvedRegistrationId === input.registrationId) {
          console.error("[enrollEvent] Could not resolve registration from any source", {
            inputRegistrationId: input.registrationId,
            authUserId: ctx.authUserId,
            authEmail,
          });
          throw new Error("User profile not found");
        }
      }

      if (profileLink?.registration_id) {
        resolvedRegistrationId = profileLink.registration_id;
        console.log("[enrollEvent] Resolved auth/profile id to registration id:", resolvedRegistrationId);
      }

      if (resolvedRegistrationId && authProfileIdForRepair) {
        const { error: repairError } = await ctx.supabase
          .from("profiles")
          .update({ registration_id: resolvedRegistrationId })
          .eq("profile_id", authProfileIdForRepair);

        if (repairError) {
          console.warn("[enrollEvent] Could not repair profile registration link:", repairError.message);
        }
      }

      const { data: retryRegistrationExists, error: retryRegistrationLookupError } = await ctx.supabase
        .from("registrations")
        .select("registration_id")
        .eq("registration_id", resolvedRegistrationId)
        .maybeSingle();

      if (retryRegistrationLookupError) {
        throw new Error(retryRegistrationLookupError.message || "Could not verify your registration profile.");
      }

      if (!retryRegistrationExists) {
        console.error("[enrollEvent] Resolved registration id has no registrations row:", resolvedRegistrationId);
        throw new Error("User profile not found");
      }
    }

    const { data: existingPendingEnrollment } = await ctx.supabase
      .from("event_enrollments")
      .select("event_enrollment_id, status")
      .eq("event_id", input.eventId)
      .eq("registration_id", resolvedRegistrationId)
      .maybeSingle();

    if (existingPendingEnrollment) {
      console.log('[enrollEvent] User already has enrollment in queue');
      throw new Error(
        existingPendingEnrollment.status === "awaiting_payment"
          ? "Your payment request for this event is already awaiting confirmation"
          : "You already have a pending enrollment for this event"
      );
    }

    const { data: existingParticipant } = await ctx.supabase
      .from("events_participants")
      .select("*")
      .eq("event_id", input.eventId)
      .eq("registration_id", resolvedRegistrationId)
      .maybeSingle();

    if (existingParticipant) {
      console.log('[enrollEvent] User already approved as participant');
      throw new Error('You are already enrolled in this event');
    }

    const { data: event } = await ctx.supabase
      .from("events")
      .select("event_id, country, country_code, is_virtual, entry, payment_details, organizer_payment_link, runnation_payment_link_enabled, registration_closes_at, participant_limit")
      .eq("event_id", input.eventId)
      .maybeSingle();

    if (!event) {
      throw new Error("Event not found");
    }

    const registrationCloseDate = String(event.registration_closes_at || "").slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    if (registrationCloseDate && today > registrationCloseDate) {
      throw new Error("Registration for this event is closed.");
    }

    const { data: userProfile, error: userProfileError } = await ctx.supabase
      .from("registrations")
      .select("first_name, other_names, country")
      .eq("registration_id", resolvedRegistrationId)
      .maybeSingle();

    if (userProfileError) {
      console.error("[enrollEvent] Could not load registration row after resolution", {
        resolvedRegistrationId,
        error: userProfileError,
      });
      throw new Error(userProfileError.message || "Could not load your event registration profile.");
    }

    const { data: contactProfile, error: contactProfileError } = await ctx.supabase
      .from("contacts")
      .select("email")
      .eq("registration_id", resolvedRegistrationId)
      .maybeSingle();

    if (contactProfileError) {
      console.warn("[enrollEvent] Could not load contact email for enrollment", {
        resolvedRegistrationId,
        error: contactProfileError,
      });
    }

    if (!userProfile) {
      console.error("[enrollEvent] User profile not found after successful registration resolution", {
        resolvedRegistrationId,
        authUserId: ctx.authUserId,
        authEmail,
      });
      throw new Error('User profile not found');
    }

    const userCountry = normalizeCountryCode(userProfile.country);
    const eventCountry = normalizeCountryCode(event.country_code || event.country);
    const isVirtual = event.is_virtual === true;

    if (!userCountry) {
      throw new Error("Please add your country to your profile before enrolling in events.");
    }

    if (!isVirtual && eventCountry && userCountry !== eventCountry) {
      throw new Error("You can only enroll in local non-virtual events for your registered country.");
    }

    const entryMode = normalizeEventEntry(event.entry);
    await ensureEventCapacity(ctx, input.eventId, event.participant_limit);

    if (entryMode === "free") {
      const { data, error } = await ctx.supabase
        .from("events_participants")
        .insert({
          event_participant_id: randomUUID(),
          event_id: input.eventId,
          registration_id: resolvedRegistrationId,
          registration_date: new Date().toISOString().split("T")[0],
        })
        .select()
        .single();

      if (error) {
        console.error("[enrollEvent] Error adding participant:", error);
        throw new Error(`Failed to join event: ${error.message}`);
      }

      return {
        success: true,
        mode: "participant",
        message: "You have been added to the participant list.",
        participant: data,
      };
    }

    const enrollmentStatus = entryMode === "paid" ? "awaiting_payment" : "pending";
    const { data, error } = await ctx.supabase
      .from("event_enrollments")
      .insert({
        event_id: input.eventId,
        registration_id: resolvedRegistrationId,
        first_name: userProfile.first_name,
        other_names: userProfile.other_names || "",
        email: contactProfile?.email || authEmail || "",
        status: enrollmentStatus,
      })
      .select()
      .single();

    if (error) {
      console.error('[enrollEvent] Error enrolling:', error);
      throw new Error(`Failed to enroll: ${error.message}`);
    }

    if (entryMode === "paid") {
      console.log("[enrollEvent] Enrollment queued for payment confirmation:", data);
      return {
        success: true,
        mode: "payment_required",
        message: "Your event payment will be reviewed before you are added to the participant list.",
        paymentDetails: event.payment_details || null,
        organizerPaymentLink: event.organizer_payment_link || null,
        runnationPaymentLinkEnabled: event.runnation_payment_link_enabled === true,
        enrollment: data,
      };
    }

    console.log("[enrollEvent] Enrollment submitted for approval:", data);
    return {
      success: true,
      mode: "approval_queue",
      message: "Your participation request has been sent for approval.",
      enrollment: data,
    };
  });

