import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";
import { randomUUID } from "crypto";

async function ensureEventCapacity(ctx: any, eventId: string) {
  const { data: event, error: eventError } = await ctx.supabase
    .from("events")
    .select("event_id, participant_limit")
    .eq("event_id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    throw new Error(eventError?.message || "Could not load the event capacity.");
  }

  if (typeof event.participant_limit !== "number" || !Number.isFinite(event.participant_limit)) {
    return;
  }

  const { count, error } = await ctx.supabase
    .from("events_participants")
    .select("event_participant_id", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (error) {
    throw new Error(error.message || "Could not verify event participant limit.");
  }

  if ((count ?? 0) >= event.participant_limit) {
    throw new Error("This event has reached its participant limit.");
  }
}

export default publicProcedure
  .input(
    z.object({
      enrollmentId: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
      allowSpecialClubCoordinator: true,
      allowEventOrganizer: true,
    });

    console.log('[approveEnrollment] Approving enrollment:', input.enrollmentId);

    const { data: enrollment, error: fetchError } = await ctx.supabase
      .from("event_enrollments")
      .select("*")
      .eq("event_enrollment_id", input.enrollmentId)
      .eq("status", "pending")
      .maybeSingle();

    if (fetchError) {
      console.error('[approveEnrollment] Error fetching enrollment:', fetchError);
      throw new Error(`Failed to fetch enrollment: ${fetchError.message}`);
    }

    if (!enrollment) {
      console.error('[approveEnrollment] Enrollment not found or already processed');
      throw new Error('Enrollment not found or already processed');
    }

    const organizerScopes = actor.roles
      .filter((role) => role.roleName === "event_organizer" && role.organizerId)
      .map((role) => role.organizerId as string);
    const isOrganizerOnly =
      actor.isEventOrganizer &&
      !actor.isSuperAdmin &&
      !actor.isCountryAdmin &&
      !actor.isCountryCoordinator &&
      !actor.isClubCoordinator &&
      !actor.isSpecialClubCoordinator;

    if (isOrganizerOnly) {
      const { data: event, error: eventError } = await ctx.supabase
        .from("events")
        .select("event_id, organizer")
        .eq("event_id", enrollment.event_id)
        .maybeSingle();

      if (eventError || !event) {
        throw new Error(eventError?.message || "Could not load the event for this enrollment.");
      }

      if (!event.organizer || !organizerScopes.includes(event.organizer)) {
        throw new Error("You can only approve enrollments for your organizer-owned events.");
      }
    }

    await ensureEventCapacity(ctx, enrollment.event_id);

    const { data: participant, error: insertError } = await ctx.supabase
      .from("events_participants")
      .insert({
        event_participant_id: randomUUID(),
        event_id: enrollment.event_id,
        registration_id: enrollment.registration_id,
        registration_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (insertError) {
      console.error('[approveEnrollment] Error creating participant:', insertError);
      throw new Error(`Failed to create participant: ${insertError.message}`);
    }

    const { error: deleteError } = await ctx.supabase
      .from("event_enrollments")
      .delete()
      .eq("event_enrollment_id", input.enrollmentId);

    if (deleteError) {
      console.error('[approveEnrollment] Error deleting enrollment:', deleteError);
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "approve_enrollment",
      metadata: {
        enrollmentId: input.enrollmentId,
        eventId: enrollment.event_id,
        registrationId: enrollment.registration_id,
        participantId: participant?.event_participant_id ?? null,
      },
    });

    console.log('[approveEnrollment] Enrollment approved successfully:', participant);
    return { success: true, participant };
  });



