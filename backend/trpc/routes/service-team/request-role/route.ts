import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { assertServiceTeamRoleAllowedForAge, getApplicantAgeFromAuth } from "../age-eligibility";
import { ensureEventOrganizerForUser } from "../../../event-organizer-profile";

const SERVICE_ROLE_LIMITS: Record<string, number> = {
  event_organizer: 50,
  club_coordinator: 50,
  shop_manager: 1,
  country_coordinator: 1,
  junior_runners_club_coordinator: 1,
  golden_age_runners_club_coordinator: 1,
  treadmill_runners_club_coordinator: 1,
  para_runners_club_coordinator: 1,
  smartfit_club_coordinator: 1,
  magazine_editor: 1,
  chat_room_administrator: 1,
  magazine_columnist_fitness_coach: 1,
  magazine_columnist_sports_journalist: 1,
  magazine_columnist_motivation_speaker: 1,
};

const serviceRoleNameSchema = z.enum([
  "event_organizer",
  "club_coordinator",
  "shop_manager",
  "country_coordinator",
  "junior_runners_club_coordinator",
  "golden_age_runners_club_coordinator",
  "treadmill_runners_club_coordinator",
  "para_runners_club_coordinator",
  "smartfit_club_coordinator",
  "magazine_editor",
  "chat_room_administrator",
  "magazine_columnist_fitness_coach",
  "magazine_columnist_sports_journalist",
  "magazine_columnist_motivation_speaker",
]);

const GLOBAL_SERVICE_ROLES = new Set([
  "magazine_editor",
  "chat_room_administrator",
  "magazine_columnist_fitness_coach",
  "magazine_columnist_sports_journalist",
  "magazine_columnist_motivation_speaker",
  "junior_runners_club_coordinator",
  "golden_age_runners_club_coordinator",
  "treadmill_runners_club_coordinator",
  "para_runners_club_coordinator",
  "smartfit_club_coordinator",
]);

const ROLES_WITHOUT_APPLICANT_LINKS = new Set([
  "event_organizer",
  "club_coordinator",
]);

const optionalLinkSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((value) => {
    const trimmed = String(value ?? "").trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const optionalApplicantStatementSchema = z
  .string()
  .trim()
  .max(3000)
  .optional()
  .nullable()
  .transform((value) => {
    const trimmed = String(value ?? "").trim();
    return trimmed.length > 0 ? trimmed : null;
  })
  .refine((value) => {
    if (!value) return true;
    const wordCount = value.split(/\s+/).filter(Boolean).length;
    return wordCount >= 25 && wordCount <= 250;
  }, "If provided, the role statement must be 25-250 words.");

const proposedProfileFieldSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((value) => {
    const trimmed = String(value ?? "").trim();
    return trimmed.length > 0 ? trimmed : null;
  });

function roleFromRelation(row: any): string | null {
  const roleSource = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  return roleSource?.role_name ?? null;
}

function isGlobalAdminRole(roleName: string | null | undefined): boolean {
  const normalized = roleName?.trim().toLowerCase();
  return normalized === "super_admin" || normalized === "global_admin";
}

export default publicProcedure
  .input(
    z.object({
      roleName: serviceRoleNameSchema,
      countryCode: z.string().trim().min(2).max(2),
      websiteUrl: optionalLinkSchema,
      linkedinUrl: optionalLinkSchema,
      socialUrl: optionalLinkSchema,
      applicantStatement: optionalApplicantStatementSchema,
      contactConsent: z.boolean().optional().default(false),
      contactInstructions: optionalLinkSchema,
      proposedName: proposedProfileFieldSchema,
      proposedLocation: proposedProfileFieldSchema,
      proposedDescription: proposedProfileFieldSchema,
      clubMembershipType: z.enum(["free", "paid"]).optional().default("free"),
      clubVirtualMembershipEnabled: z.boolean().optional().default(false),
      clubMeetingPoint: proposedProfileFieldSchema,
      clubMeetingTime: proposedProfileFieldSchema,
      clubActivityOptions: z.array(z.enum(["walk", "run", "stairs", "cycle", "treadmill"])).max(5).optional().default([]),
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (!ctx.authUserId) {
      throw new Error("Please sign in before requesting a service team role.");
    }

    const countryCode = input.countryCode.trim().toUpperCase();
    const roleName = input.roleName;
    const maxPerCountry = SERVICE_ROLE_LIMITS[roleName];
    const isGlobalRole = GLOBAL_SERVICE_ROLES.has(roleName);
    const allowsApplicantLinks = !ROLES_WITHOUT_APPLICANT_LINKS.has(roleName);
    const needsProposedProfile = roleName === "club_coordinator" || roleName === "event_organizer";

    if (needsProposedProfile && !input.proposedName) {
      throw new Error(roleName === "club_coordinator" ? "Please enter the proposed club name." : "Please enter the event organizer name.");
    }
    if (needsProposedProfile && !input.proposedLocation) {
      throw new Error(roleName === "club_coordinator" ? "Please enter the proposed club location." : "Please enter the organizer base location.");
    }

    const applicantAge = await getApplicantAgeFromAuth(ctx);
    assertServiceTeamRoleAllowedForAge(applicantAge, roleName);

    const { data: authUserResult, error: authError } = await ctx.supabase.auth.admin.getUserById(ctx.authUserId);
    const email = authUserResult?.user?.email?.trim().toLowerCase() ?? null;

    if (authError || !email) {
      throw new Error(authError?.message || "Could not resolve your account email.");
    }

    const { data: authProfile } = await ctx.supabase
      .from("profiles")
      .select("profile_id, registration_id")
      .eq("profile_id", ctx.authUserId)
      .maybeSingle();
    const currentAssignmentUserIds = Array.from(
      new Set([ctx.authUserId, authProfile?.profile_id, authProfile?.registration_id].filter(Boolean))
    );

    const { data: role, error: roleError } = await ctx.supabase
      .from("roles")
      .select("role_id")
      .eq("role_name", roleName)
      .maybeSingle();

    if (roleError || !role) {
      throw new Error(roleError?.message || "This role is not configured yet.");
    }

    const [{ data: country }, clubsResult, organizersResult, assignmentsResult, pendingResult] = await Promise.all([
      ctx.supabase
        .from("countries")
        .select("iso_alpha2")
        .eq("iso_alpha2", countryCode)
        .maybeSingle(),
      ctx.supabase
        .from("clubs")
        .select("club_id")
        .eq("country", countryCode),
      ctx.supabase
        .from("event_organizers")
        .select("organizer_id")
        .eq("country", countryCode)
        .eq("is_active", true),
      ctx.supabase
        .from("user_role_assignments")
        .select("assignment_id, role_id, country_code, club_id, organizer_id, roles(role_name)")
        .eq("is_active", true)
        .eq("role_id", role.role_id),
      ctx.supabase
        .from("admin_invites")
        .select("invite_id")
        .eq("email", email)
        .eq("status", "pending")
        .limit(1),
    ]);

    if (!country) {
      throw new Error("Your country is not configured for service team roles.");
    }
    if (clubsResult.error) {
      throw new Error(clubsResult.error.message || "Could not check country clubs.");
    }
    if (organizersResult.error) {
      throw new Error(organizersResult.error.message || "Could not check country organizers.");
    }
    if (assignmentsResult.error) {
      throw new Error(assignmentsResult.error.message || "Could not check existing role assignments.");
    }
    if (pendingResult.error) {
      throw new Error(pendingResult.error.message || "Could not check existing role requests.");
    }
    if ((pendingResult.data ?? []).length > 0) {
      throw new Error("You already have a pending role request. Please wait for admin review before requesting another role.");
    }

    const { data: superAdminRoles, error: superAdminRolesError } = await ctx.supabase
      .from("user_role_assignments")
      .select("assignment_id, roles(role_name)")
      .in("user_id", currentAssignmentUserIds)
      .eq("is_active", true);

    if (superAdminRolesError) {
      throw new Error(superAdminRolesError.message || "Could not check your current role.");
    }

    const isSuperAdminUser = (superAdminRoles ?? []).some((assignment: any) => isGlobalAdminRole(roleFromRelation(assignment)));

    const { data: activeUserRoles, error: activeUserRolesError } = await ctx.supabase
      .from("user_role_assignments")
      .select("assignment_id, roles(role_name)")
      .in("user_id", currentAssignmentUserIds)
      .eq("is_active", true)
      .eq("is_exclusive_admin_role", true)
      .limit(1);

    if (activeUserRolesError) {
      throw new Error(activeUserRolesError.message || "Could not check your current role.");
    }
    if (!isSuperAdminUser && (activeUserRoles ?? []).length > 0) {
      throw new Error("You already have an active role. Each user can hold only one role at a time.");
    }

    const clubIdsInCountry = new Set((clubsResult.data ?? []).map((club: any) => club.club_id).filter(Boolean));
    const organizerIdsInCountry = new Set((organizersResult.data ?? []).map((organizer: any) => organizer.organizer_id).filter(Boolean));
    const activeCount = (assignmentsResult.data ?? []).filter((assignment: any) => {
      if (roleFromRelation(assignment) !== roleName) return false;
      if (isGlobalRole) return true;
      if (assignment.country_code === countryCode) return true;
      if (roleName === "club_coordinator" && assignment.club_id && clubIdsInCountry.has(assignment.club_id)) return true;
      if (roleName === "event_organizer" && assignment.organizer_id && organizerIdsInCountry.has(assignment.organizer_id)) return true;
      return false;
    }).length;

    if (activeCount >= maxPerCountry) {
      throw new Error(isGlobalRole ? "This role is already filled globally." : "This role is already filled in your country.");
    }

    let organizerId: string | null = null;
    if (roleName === "event_organizer") {
      organizerId = await ensureEventOrganizerForUser(ctx, ctx.authUserId, {
        organizerName: input.proposedName,
        description: [input.proposedDescription, input.proposedLocation ? `Base location: ${input.proposedLocation}` : null]
          .filter(Boolean)
          .join("\n"),
        country: countryCode,
        isActive: false,
      });
    }

    let clubId: string | null = null;
    if (roleName === "club_coordinator") {
      const { data: coordinatorId, error: coordinatorError } = await ctx.supabase.rpc(
        "ensure_coordinator_for_profile",
        { p_user_id: ctx.authUserId }
      );

      if (coordinatorError || !coordinatorId) {
        throw new Error(coordinatorError?.message || "Could not create your coordinator profile.");
      }

      const { data: proposedClub, error: proposedClubError } = await ctx.supabase
        .from("clubs")
        .insert({
          club_name: input.proposedName,
          description: input.proposedDescription,
          location: input.proposedLocation,
          country: countryCode,
          coordinator_id: String(coordinatorId),
          is_active: false,
          membership_type: input.clubMembershipType,
          virtual_membership_enabled: input.clubVirtualMembershipEnabled,
          meeting_point: input.clubMeetingPoint,
          meeting_time: input.clubMeetingTime,
          activity_options: input.clubActivityOptions,
        })
        .select("club_id")
        .maybeSingle();

      if (proposedClubError || !proposedClub?.club_id) {
        throw new Error(proposedClubError?.message || "Could not create the proposed club profile.");
      }

      clubId = String(proposedClub.club_id);
    }

    const { data: invite, error: inviteError } = await ctx.supabase
      .from("admin_invites")
      .insert({
        email,
        role_id: role.role_id,
        country_code: isGlobalRole || roleName === "event_organizer" || roleName === "club_coordinator" ? null : countryCode,
        club_id: clubId,
        organizer_id: organizerId,
        applicant_website_url: allowsApplicantLinks ? input.websiteUrl : null,
        applicant_linkedin_url: allowsApplicantLinks ? input.linkedinUrl : null,
        applicant_social_url: allowsApplicantLinks ? input.socialUrl : null,
        applicant_statement: input.applicantStatement,
        applicant_contact_consent: input.contactConsent,
        applicant_contact_instructions: input.contactConsent ? input.contactInstructions : null,
        invited_by: null,
        status: "pending",
      })
      .select("invite_id")
      .maybeSingle();

    if (inviteError || !invite) {
      throw new Error(inviteError?.message || "Could not submit the role request.");
    }

    return { success: true, inviteId: invite.invite_id };
  });
