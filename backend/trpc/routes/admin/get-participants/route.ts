import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireAdminPermission } from "../../../rbac";

export default publicProcedure
  .input(
    z.object({
      eventId: z.string().optional(),
    })
  )
  .query(async ({ input, ctx }) => {
    await requireAdminPermission(ctx, {
      allowSuperAdmin: true,
      allowCountryAdmin: true,
      allowCountryCoordinator: true,
      allowClubCoordinator: true,
    });

    console.log('[getParticipants] Fetching participants for eventId:', input.eventId);

    let query = ctx.supabase
      .from("events_participants")
      .select(`
        event_participant_id,
        event_id,
        registration_id,
        registration_date,
        distance_km,
        time_seconds,
        events!events_participants_event_id_fkey(event_name),
        registrations!events_participants_registration_id_fkey(first_name, other_names, sex, city_town_district)
      `);

    if (input.eventId) {
      query = query.eq("event_id", input.eventId);
    }

    query = query.order("registration_date", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('[getParticipants] Error:', error);
      throw new Error(`Failed to fetch participants: ${error.message}`);
    }

    console.log('[getParticipants] Raw data:', JSON.stringify(data, null, 2));

    const formatDuration = (seconds?: number | null) => {
      if (!seconds || seconds <= 0) return "";
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    const participants = (data || []).map((item: any) => ({
      ParticipantID: item.event_participant_id,
      EventID: item.event_id,
      RegistrationID: item.registration_id,
      Registration_Date: item.registration_date,
      Distance_Km: item.distance_km ?? null,
      Time: formatDuration(item.time_seconds),
      Status: "Active",
      Days_Completed: 0,
      eventName: item.events?.event_name || '',
      user: {
        "First Name": item["registrations"]?.first_name || "",
        "Other Names": item["registrations"]?.other_names || "",
        Sex: item["registrations"]?.sex || "",
        Residence: item["registrations"]?.city_town_district || "",
      },
    }));

    console.log('[getParticipants] Processed participants:', participants.length);

    return participants;
  });

