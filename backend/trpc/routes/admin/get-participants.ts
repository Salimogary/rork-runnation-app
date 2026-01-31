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
      .from("Event Participants")
      .select(`
        eventParticipantId,
        eventId,
        RegistrationID,
        Registration_Date,
        Events!inner(eventName),
        Registration Sample!inner(First Name, Other Names, Sex, Residence)
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
      ParticipantID: item.eventParticipantId,
      EventID: item.eventId,
      RegistrationID: item.RegistrationID,
      Registration_Date: item.Registration_Date,
      Status: "Active",
      Days_Completed: 0,
      user: {
        "First Name": item["Registration Sample"]?.["First Name"] || "",
        "Other Names": item["Registration Sample"]?.["Other Names"] || "",
        Sex: item["Registration Sample"]?.Sex || "",
        Residence: item["Registration Sample"]?.Residence || "",
      },
    }));

    console.log("[getParticipants] Processed participants:", participants);

    return participants;
  });
