import { z } from "zod";
import { publicProcedure } from "../../../create-context";

const getMedalList = publicProcedure
  .input(
    z.object({
      eventId: z.string().optional(),
    })
  )
  .query(async ({ input, ctx }) => {
    console.log("[getMedalList] Starting query with input:", input);

    try {
      let participantsQuery = ctx.supabase
        .from("Event Participants")
        .select(`
          eventParticipantId,
          eventId,
          RegistrationID,
          Events!inner(
            eventName,
            medal_min_daily_distance,
            medal_min_cumulative_distance,
            medal_date_start,
            medal_date_end
          ),
          Registration Sample!inner(First Name, Other Names, Country, Residence)
        `);

      if (input.eventId) {
        participantsQuery = participantsQuery.eq("eventId", input.eventId);
      }

      const { data: participants, error: participantsError } = await participantsQuery;

      if (participantsError) {
        console.error("[getMedalList] Error fetching participants:", participantsError);
        throw new Error(`Failed to fetch participants: ${participantsError.message}`);
      }

      if (!participants || participants.length === 0) {
        console.log("[getMedalList] No participants found");
        return [];
      }

      console.log("[getMedalList] Participants count:", participants.length);

      const qualifiedParticipants = await Promise.all(
        participants.map(async (participant: any) => {
          const event = participant.Events;
          const registration = participant["Registration Sample"];

          if (!event) return null;

          const medalDateStart = event.medal_date_start;
          const medalDateEnd = event.medal_date_end;
          const medalMinDailyDistance = event.medal_min_daily_distance;
          const medalMinCumulativeDistance = event.medal_min_cumulative_distance;

          if (!medalDateStart || !medalDateEnd) {
            return null;
          }

          const startDate = new Date(medalDateStart);
          const endDate = new Date(medalDateEnd);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const actualEndDate = endDate > today ? today : endDate;
          const actualEndStr = actualEndDate.toISOString().split('T')[0];

          const { data: activities, error: actError } = await ctx.supabase
            .from("Activity Sample")
            .select("Activity_Date, Distance_km")
            .eq("RegistrationID", participant.RegistrationID)
            .gte("Activity_Date", medalDateStart)
            .lte("Activity_Date", actualEndStr)
            .order("Activity_Date", { ascending: true });

          if (actError) {
            console.error("[getMedalList] Error fetching activities:", actError);
            return null;
          }

          let totalDistance = 0;
          const activitiesByDate = new Map<string, number>();

          (activities || []).forEach((activity: any) => {
            const dateKey = new Date(activity.Activity_Date).toISOString().split('T')[0];
            const currentDistance = activitiesByDate.get(dateKey) || 0;
            activitiesByDate.set(dateKey, currentDistance + (activity.Distance_km || 0));
            totalDistance += (activity.Distance_km || 0);
          });

          let qualifiedDays = 0;
          let isQualified = true;

          if (medalMinDailyDistance && medalMinDailyDistance > 0) {
            const currentDate = new Date(startDate);
            while (currentDate <= actualEndDate) {
              const dateKey = currentDate.toISOString().split('T')[0];
              const dayDistance = activitiesByDate.get(dateKey) || 0;
              if (dayDistance >= medalMinDailyDistance) {
                qualifiedDays++;
              } else {
                isQualified = false;
              }
              currentDate.setDate(currentDate.getDate() + 1);
            }
          } else {
            qualifiedDays = activitiesByDate.size;
          }

          if (medalMinCumulativeDistance && medalMinCumulativeDistance > 0) {
            if (totalDistance < medalMinCumulativeDistance) {
              isQualified = false;
            }
          }

          if (!isQualified) {
            return null;
          }

          return {
            participantId: participant.eventParticipantId,
            registrationId: participant.RegistrationID,
            eventId: participant.eventId,
            firstName: registration?.["First Name"] || "",
            otherNames: registration?.["Other Names"] || "",
            country: registration?.Country || "",
            residence: registration?.Residence || "",
            eventName: event.eventName || "",
            medalMinDailyDistance,
            medalMinCumulativeDistance,
            medalDateStart,
            medalDateEnd,
            qualifiedDays,
            totalDistance: parseFloat(totalDistance.toFixed(2)),
          };
        })
      );

      const filtered = qualifiedParticipants.filter((p): p is NonNullable<typeof p> => p !== null);
      console.log("[getMedalList] Qualified participants:", filtered.length);

      return filtered;
    } catch (error: any) {
      console.error("[getMedalList] Error:", error);
      throw new Error(`Failed to get medal list: ${error.message}`);
    }
  });

export default getMedalList;
