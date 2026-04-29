import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { logAdminAction, requireAdminPermission } from "../../../rbac";

function normalizeClubName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeCountryValue(
  value: string | null | undefined,
  countryMap: Map<string, string>
): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (countryMap.has(upper)) return upper;
  const byName = [...countryMap.entries()].find(([, name]) => name.toLowerCase() === raw.toLowerCase());
  return byName?.[0] ?? null;
}

export default publicProcedure
  .input(
    z.object({
      registrationId: z.string().uuid(),
      status: z.enum(["approved", "rejected"]),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const actor = await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
    });

    const { data: request, error: requestError } = await ctx.supabase
      .from("club_membership_request")
      .select("*")
      .eq("registration_id", input.registrationId)
      .maybeSingle();

    if (requestError) {
      throw new Error(requestError.message || "Could not load membership request.");
    }

    if (!request) {
      throw new Error("Membership request was not found.");
    }

    const coordinatorClubIds = actor.roles
      .filter((role) => role.roleName === "club_coordinator" && role.clubId)
      .map((role) => role.clubId as string);
    const countryCodes = actor.roles
      .filter((role) => (role.roleName === "country_admin" || role.roleName === "country_coordinator") && role.countryCode)
      .map((role) => role.countryCode as string);
    const countryAdminCodes = actor.roles
      .filter((role) => role.roleName === "country_admin" && role.countryCode)
      .map((role) => role.countryCode as string);

    const { data: countries } = await ctx.supabase
      .from("countries")
      .select("iso_alpha2, name");

    const countryMap = new Map(
      (countries ?? []).map((country: any) => [String(country.iso_alpha2).toUpperCase(), String(country.name)])
    );

    let clubsQuery = ctx.supabase
      .from("clubs")
      .select("club_id, club_name, country");

    if (!actor.isSuperAdmin) {
      if (coordinatorClubIds.length > 0) {
        clubsQuery = clubsQuery.in("club_id", coordinatorClubIds);
      } else if (countryCodes.length > 0) {
        clubsQuery = clubsQuery.in("country", countryCodes);
      } else {
        throw new Error("You do not have permission to review this membership request.");
      }
    }

    const { data: clubs, error: clubsError } = await clubsQuery;

    if (clubsError) {
      throw new Error(clubsError.message || "Could not verify club permissions.");
    }

    const visibleClubIds = new Set((clubs ?? []).map((club: any) => club.club_id).filter(Boolean));
    const visibleClubNames = new Set((clubs ?? []).map((club: any) => normalizeClubName(club.club_name)).filter(Boolean));
    const matchedClub = (clubs ?? []).find((club: any) =>
      (request.club_id && club.club_id === request.club_id) ||
      normalizeClubName(club.club_name) === normalizeClubName(request.club)
    );

    const startClubCountry = normalizeCountryValue(request.proposed_country, countryMap);
    const canReview =
      actor.isSuperAdmin ||
      (request.request_type === "event_organizer"
        ? !!(startClubCountry && countryAdminCodes.includes(startClubCountry))
        : request.request_type === "start_club"
        ? !!(startClubCountry && countryCodes.includes(startClubCountry))
        : (request.club_id && visibleClubIds.has(request.club_id)) ||
          visibleClubNames.has(normalizeClubName(request.club)));

    if (!canReview) {
      throw new Error("You do not have permission to review this membership request.");
    }

    let approvedOrganizerId: string | null = null;
    let approvedOrganizerProfileId: string | null = null;

    if (request.request_type === "event_organizer" && input.status === "approved") {
      const organizerName = (request.proposed_club_name ?? request.club ?? "").trim();
      if (!organizerName) {
        throw new Error("Organizer name is missing from this request.");
      }

      const organizerCountry = request.proposed_country?.trim() || null;
      const organizerDescription = request.proposed_description?.trim() || null;

      const { data: organizerRow, error: organizerError } = await ctx.supabase
        .from("event_organizers")
        .upsert(
          {
            registration_id: input.registrationId,
            organizer_name: organizerName,
            description: organizerDescription,
            country: organizerCountry,
            is_active: true,
          },
          {
            onConflict: "registration_id",
          }
        )
        .select("organizer_id")
        .maybeSingle();

      if (organizerError || !organizerRow?.organizer_id) {
        throw new Error(organizerError?.message || "Could not create the event organizer record.");
      }

      approvedOrganizerId = organizerRow.organizer_id;

      const [{ data: profile }, { data: eventOrganizerRole }] = await Promise.all([
        ctx.supabase
          .from("profiles")
          .select("profile_id")
          .eq("registration_id", input.registrationId)
          .maybeSingle(),
        ctx.supabase
          .from("roles")
          .select("role_id")
          .eq("role_name", "event_organizer")
          .maybeSingle(),
      ]);

      approvedOrganizerProfileId = profile?.profile_id ?? null;

      if (approvedOrganizerProfileId && eventOrganizerRole?.role_id) {
        const { error: assignmentError } = await ctx.supabase
          .from("user_role_assignments")
          .upsert(
            {
              user_id: approvedOrganizerProfileId,
              role_id: eventOrganizerRole.role_id,
              country_code: null,
              club_id: null,
              organizer_id: approvedOrganizerId,
              assigned_by: actor.authUserId,
              is_active: true,
            },
            {
              onConflict: "user_id,role_id,country_code,club_id,organizer_id",
            }
          );

        if (assignmentError) {
          throw new Error(assignmentError.message || "Organizer was created, but role access could not be assigned.");
        }
      }
    }

    const { error: updateError } = await ctx.supabase
      .from("club_membership_request")
      .update({
        status: input.status,
        club: request.request_type === "start_club" || request.request_type === "event_organizer"
          ? request.proposed_club_name ?? request.club ?? null
          : request.club,
        club_id:
          request.request_type === "start_club" || request.request_type === "event_organizer"
            ? null
            : request.club_id ?? matchedClub?.club_id ?? null,
        reviewed_by: actor.authUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("registration_id", input.registrationId);

    if (updateError) {
      throw new Error(updateError.message || "Could not update membership request.");
    }

    await logAdminAction(ctx, {
      actorUserId: actor.authUserId,
      targetUserId: approvedOrganizerProfileId,
      actionType:
        request.request_type === "event_organizer"
          ? `event_organizer_request_${input.status}`
          : `club_membership_${input.status}`,
      targetClubId: request.club_id ?? matchedClub?.club_id ?? null,
      metadata: {
        registrationId: input.registrationId,
        club: request.club,
        requestType: request.request_type ?? "membership",
        proposedClubName: request.proposed_club_name ?? null,
        organizerId: approvedOrganizerId,
        status: input.status,
      },
    });

    return {
      success: true,
      requestType: request.request_type ?? "membership",
      organizerCreated: Boolean(approvedOrganizerId),
      roleAssigned: Boolean(approvedOrganizerProfileId && approvedOrganizerId),
    };
  });
