import { publicProcedure } from "../../create-context";
import { z } from "zod";

export const getParticipants = publicProcedure
  .input(
    z.object({
      eventId: z.string().optional(),
    })
  )
  .query(async ({ input, ctx }) => {
    console.log("[getParticipants] Fetching participants for eventId:", input.eventId);

    let query = ctx.supabase
      .from("events_participants")
      .select(`
        event_participant_id,
        event_id,
        registration_id,
        registration_date,
        events!events_participants_event_id_fkey(event_name),
        registrations!events_participants_registration_id_fkey(first_name, other_names, sex, "city / town / district")
      `);

    if (input.eventId) {
      query = query.eq("event_id", input.eventId);
    }

    query = query.order("registration_date", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("[getParticipants] Error:", error);
      throw new Error(`Failed to fetch participants: ${error.message}`);
    }

    console.log("[getParticipants] Raw data:", data);

    const participants = (data || []).map((item: any) => ({
      ParticipantID: item.event_participant_id,
      EventID: item.event_id,
      RegistrationID: item.registration_id,
      Registration_Date: item.registration_date,
      Status: "Active",
      Days_Completed: 0,
      user: {
        "First Name": item["registrations"]?.first_name || "",
        "Other Names": item["registrations"]?.other_names || "",
        Sex: item["registrations"]?.sex || "",
        Residence: item["registrations"]?.["city / town / district"] || "",
      },
    }));

    console.log("[getParticipants] Processed participants:", participants);

    return participants;
  });
