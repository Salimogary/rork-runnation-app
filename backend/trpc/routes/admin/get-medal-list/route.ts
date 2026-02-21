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
        .from("events_participants")
        .select("ParticipantID, eventId, RegistrationID");

      if (input.eventId) {
        participantsQuery = participantsQuery.eq("eventId", input.eventId);
      }

      const { data: participants, error: participantsError } = await participantsQuery;

      if (participantsError) {
        console.error("[getMedalList] Error fetching participants:", participantsError);
        if (
          participantsError.message.includes("schema cache") ||
          participantsError.message.includes("does not exist") ||
          participantsError.message.includes("relation")
        ) {
          console.warn("[getMedalList] Table 'events_participants' not found or not cached. Returning empty list.");
          return [];
        }
        throw new Error(`Failed to fetch participants: ${participantsError.message}`);
      }

      if (!participants || participants.length === 0) {
        console.log("[getMedalList] No participants found");
        return [];
      }

      console.log("[getMedalList] Participants count:", participants.length);

      const eventIds = [...new Set(participants.map((p: any) => p.eventId))];
      const regIds = [...new Set(participants.map((p: any) => p.RegistrationID))];

      const { data: events, error: eventsError } = await ctx.supabase
        .from("Events")
        .select("eventId, eventName, medal_min_daily_distance, medal_min_cumulative_distance, medal_date_start, medal_date_end")
        .in("eventId", eventIds);

      if (eventsError) {
        console.error("[getMedalList] Error fetching events:", eventsError);
        throw new Error(`Failed to fetch events: ${eventsError.message}`);
      }

      const eventsMap = new Map((events || []).map((e: any) => [e.eventId, e]));

      const { data: registrations, error: regError } = await ctx.supabase
        .from("Registration Sample")
        .select('"RegistrationID", "First Name", "Other Names", "Country", "Residence"')
        .in("RegistrationID", regIds);

      if (regError) {
        console.error("[getMedalList] Error fetching registrations:", regError);
        throw new Error(`Failed to fetch registrations: ${regError.message}`);
      }

      const regMap = new Map((registrations || []).map((r: any) => [r.RegistrationID, r]));

      const qualifiedParticipants = await Promise.all(
        participants.map(async (participant: any) => {
          const event = eventsMap.get(participant.eventId);
          const registration = regMap.get(participant.RegistrationID);

          if (!event) return null;

          const medalDateStart = event.medal_date_start;
          const medalDateEnd = event.medal_date_end;
          const medalMinDailyDistance = event.medal_min_daily_distance;
          const medalMinCumulativeDistance = event.medal_min_cumulative_distance;

          if (!medalDateStart || !medalDateEnd) {
            return null;
          }

          const now = new Date();
          const todayStr = now.toISOString().split('T')[0];
          const yesterday = new Date(now);
          yesterday.setUTCDate(yesterday.getUTCDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];

          const cutoffStr = medalDateEnd <= yesterdayStr ? medalDateEnd : yesterdayStr;

          if (cutoffStr < medalDateStart) {
            console.log('[getMedalList] Medal period has not had a full day yet, skipping participant:', regId);
            return null;
          }

          console.log('[getMedalList] Date range for participant:', { regId, medalDateStart, medalDateEnd, todayStr, yesterdayStr, cutoffStr });

          const regId = participant.RegistrationID;

          const { data: activities, error: actError } = await ctx.supabase
            .from("Activity Sample")
            .select("Activity_Date, Distance_km")
            .eq("RegistrationID", regId)
            .gte("Activity_Date", medalDateStart)
            .lte("Activity_Date", cutoffStr)
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
          let totalDaysChecked = 0;
          let isQualified = true;

          if (medalMinDailyDistance && medalMinDailyDistance > 0) {
            const currentDate = new Date(medalDateStart + 'T00:00:00Z');
            while (true) {
              const dateKey = currentDate.toISOString().split('T')[0];
              if (dateKey > cutoffStr) break;
              totalDaysChecked++;
              const dayDistance = activitiesByDate.get(dateKey) || 0;
              if (dayDistance >= medalMinDailyDistance) {
                qualifiedDays++;
              } else {
                console.log('[getMedalList] Day failed for', regId, ':', dateKey, 'distance:', dayDistance, 'required:', medalMinDailyDistance);
                isQualified = false;
              }
              currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            }
            console.log('[getMedalList] Daily check for', regId, ':', { totalDaysChecked, qualifiedDays, isQualified });
          } else {
            qualifiedDays = activitiesByDate.size;
          }

          if (medalMinCumulativeDistance && medalMinCumulativeDistance > 0) {
            if (totalDistance < medalMinCumulativeDistance) {
              isQualified = false;
            }
          }

          console.log('[getMedalList] Final check for', regId, ':', { isQualified, totalDistance, qualifiedDays });

          if (!isQualified) {
            return null;
          }

          return {
            participantId: participant.ParticipantID,
            registrationId: participant.RegistrationID,
            eventId: participant.eventId,
            firstName: registration?.["First Name"] || "",
            otherNames: registration?.["Other Names"] || "",
            country: registration?.Country ?? registration?.country ?? "",
            residence: registration?.Residence ?? registration?.residence ?? "",
            eventName: event?.eventName || "",
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
