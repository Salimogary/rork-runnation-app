import { z } from "zod";
import { publicProcedure } from "../../../create-context";

const SERVICE_ROLE_LIMITS: Record<string, number> = {
  event_organizer: 50,
  club_coordinator: 50,
  shop_manager: 1,
  country_coordinator: 1,
  junior_runners_club_coordinator: 1,
  golden_age_runners_club_coordinator: 1,
  treadmill_runners_club_coordinator: 1,
  para_runners_club_coordinator: 1,
  magazine_columnist_fitness_coach: 2,
  magazine_columnist_sports_journalist: 2,
  magazine_columnist_motivation_speaker: 2,
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
  "magazine_columnist_fitness_coach",
  "magazine_columnist_sports_journalist",
  "magazine_columnist_motivation_speaker",
]);

const GLOBAL_SERVICE_ROLES = new Set([
  "magazine_columnist_fitness_coach",
  "magazine_columnist_sports_journalist",
  "magazine_columnist_motivation_speaker",
  "junior_runners_club_coordinator",
  "golden_age_runners_club_coordinator",
  "treadmill_runners_club_coordinator",
  "para_runners_club_coordinator",
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

function roleFromRelation(row: any): string | null {
  const roleSource = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  return roleSource?.role_name ?? null;
}

export default publicProcedure
  .input(
    z.object({
      roleName: serviceRoleNameSchema,
      countryCode: z.string().trim().min(2).max(2),
      websiteUrl: optionalLinkSchema,
      linkedinUrl: optionalLinkSchema,
      socialUrl: optionalLinkSchema,
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

    const { data: authUserResult, error: authError } = await ctx.supabase.auth.admin.getUserById(ctx.authUserId);
    const email = authUserResult?.user?.email?.trim().toLowerCase() ?? null;

    if (authError || !email) {
      throw new Error(authError?.message || "Could not resolve your account email.");
    }

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
      .eq("user_id", ctx.authUserId)
      .eq("is_active", true);

    if (superAdminRolesError) {
      throw new Error(superAdminRolesError.message || "Could not check your current role.");
    }

    const isSuperAdminUser = (superAdminRoles ?? []).some((assignment: any) => roleFromRelation(assignment) === "super_admin");

    const { data: activeUserRoles, error: activeUserRolesError } = await ctx.supabase
      .from("user_role_assignments")
      .select("assignment_id, roles(role_name)")
      .eq("user_id", ctx.authUserId)
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

    const { data: invite, error: inviteError } = await ctx.supabase
      .from("admin_invites")
      .insert({
        email,
        role_id: role.role_id,
        country_code: isGlobalRole ? null : countryCode,
        club_id: null,
        organizer_id: null,
        applicant_website_url: isGlobalRole ? input.websiteUrl : null,
        applicant_linkedin_url: isGlobalRole ? input.linkedinUrl : null,
        applicant_social_url: isGlobalRole ? input.socialUrl : null,
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
