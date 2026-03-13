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
        ParticipantID,
        eventId,
        RegistrationID,
        Registration_Date,
        events!events_participants_eventId_fkey(eventName),
        registrations!events_participants_RegistrationID_fkey(first_name, other_names, sex, "city / town / district")
      `);

    if (input.eventId) {
      query = query.eq("eventId", input.eventId);
    }

    query = query.order("Registration_Date", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("[getParticipants] Error:", error);
      throw new Error(`Failed to fetch participants: ${error.message}`);
    }

    console.log("[getParticipants] Raw data:", data);

    const participants = (data || []).map((item: any) => ({
      ParticipantID: item.ParticipantID,
      EventID: item.eventId,
      RegistrationID: item.RegistrationID,
      Registration_Date: item.Registration_Date,
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
