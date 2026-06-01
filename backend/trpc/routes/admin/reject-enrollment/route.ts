import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

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

    console.log('[rejectEnrollment] Rejecting enrollment:', input.enrollmentId);

    const { data: enrollment, error: fetchError } = await ctx.supabase
      .from("event_enrollments")
      .select("event_enrollment_id, event_id, registration_id, status")
      .eq("event_enrollment_id", input.enrollmentId)
      .in("status", ["pending", "awaiting_payment"])
      .maybeSingle();

    if (fetchError) {
      console.error("[rejectEnrollment] Error fetching enrollment:", fetchError);
      throw new Error(`Failed to fetch enrollment: ${fetchError.message}`);
    }

    if (!enrollment) {
      throw new Error("Enrollment not found or already processed");
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
        throw new Error("You can only reject enrollments for your organizer-owned events.");
      }
    }

    const { error } = await ctx.supabase
      .from("event_enrollments")
      .delete()
      .eq("event_enrollment_id", input.enrollmentId);

    if (error) {
      console.error('[rejectEnrollment] Error rejecting enrollment:', error);
      throw new Error(`Failed to reject enrollment: ${error.message}`);
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      actionType: "reject_enrollment",
      metadata: {
        enrollmentId: input.enrollmentId,
        eventId: enrollment.event_id,
        registrationId: enrollment.registration_id,
        previousStatus: enrollment.status,
      },
    });

    console.log('[rejectEnrollment] Enrollment rejected successfully');
    return { success: true };
  });



