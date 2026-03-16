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
        .select("*");

      if (input.eventId) {
        participantsQuery = participantsQuery.eq("event_id", input.eventId);
      }

      const { data: participants, error: participantsError } = await participantsQuery;

      if (participantsError) {
        console.error("[getMedalList] Error fetching participants:", participantsError);
        throw new Error(`Failed to fetch participants: ${participantsError.message}`);
      }

      if (!participants || participants.length === 0) {
        console.log("[getMedalList] No participants found in events_participants table");
        return [];
      }

      console.log("[getMedalList] Participants found:", participants.length, JSON.stringify(participants));

      const eventIds = [...new Set(participants.map((p: any) => p.event_id))];
      const regIds = [...new Set(participants.map((p: any) => p.registration_id))];

      console.log("[getMedalList] Event IDs:", eventIds, "Registration IDs:", regIds);

      const { data: events, error: eventsError } = await ctx.supabase
        .from("events")
        .select("event_id, event_name, medal_min_daily_distance, medal_min_cumulative_distance, medal_date_start, medal_date_end")
        .in("event_id", eventIds);

      if (eventsError) {
        console.error("[getMedalList] Error fetching events:", eventsError);
        throw new Error(`Failed to fetch events: ${eventsError.message}`);
      }

      console.log("[getMedalList] Events found:", JSON.stringify(events));

      const eventsMap = new Map((events || []).map((e: any) => [e.event_id, e]));

      const { data: registrations, error: regError } = await ctx.supabase
        .from("registrations")
        .select('registration_id, first_name, other_names, country, "city / town / district"')
        .in("registration_id", regIds);

      if (regError) {
        console.error("[getMedalList] Error fetching registrations:", regError);
        throw new Error(`Failed to fetch registrations: ${regError.message}`);
      }

      console.log("[getMedalList] Registrations found:", registrations?.length);

      const regMap = new Map((registrations || []).map((r: any) => [r.registration_id, r]));

      const qualifiedParticipants = await Promise.all(
        participants.map(async (participant: any) => {
          const event = eventsMap.get(participant.event_id);
          const registration = regMap.get(participant.registration_id);

          if (!event) {
            console.log('[getMedalList] No event found for event_id:', participant.event_id);
            return null;
          }

          const medalDateStart = event.medal_date_start;
          const medalDateEnd = event.medal_date_end;
          const medalMinDailyDistance = event.medal_min_daily_distance;
          const medalMinCumulativeDistance = event.medal_min_cumulative_distance;

          console.log('[getMedalList] Event medal config:', {
            eventId: participant.event_id,
            eventName: event.event_name,
            medalDateStart,
            medalDateEnd,
            medalMinDailyDistance,
            medalMinCumulativeDistance,
          });

          if (!medalDateStart || !medalDateEnd) {
            console.log('[getMedalList] No medal date range set for event, skipping');
            return null;
          }

          const regId = participant.registration_id;

          const now = new Date();
          const yesterdayDate = new Date(now);
          yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
          const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
          const todayStr = now.toISOString().split('T')[0];

          const cutoffStr = medalDateEnd < todayStr ? medalDateEnd : yesterdayStr;

          console.log('[getMedalList] Date calculation:', { regId, medalDateStart, medalDateEnd, todayStr, yesterdayStr, cutoffStr });

          if (cutoffStr < medalDateStart) {
            console.log('[getMedalList] Cutoff is before medal start, skipping participant:', regId);
            return null;
          }

          const { data: activities, error: actError } = await ctx.supabase
            .from("activities")
            .select("activity_date, distance_km")
            .eq("registration_id", regId)
            .gte("activity_date", medalDateStart)
            .lte("activity_date", cutoffStr)
            .order("activity_date", { ascending: true });

          if (actError) {
            console.error("[getMedalList] Error fetching activities for", regId, ":", actError);
            return null;
          }

          console.log('[getMedalList] Activities for', regId, ':', activities?.length, 'records');

          let totalDistance = 0;
          const activitiesByDate = new Map<string, number>();

          (activities || []).forEach((activity: any) => {
            const rawDate = activity.activity_date;
            const dateKey = rawDate ? rawDate.split('T')[0] : rawDate;
            const dist = activity.distance_km || 0;
            const currentDistance = activitiesByDate.get(dateKey) || 0;
            activitiesByDate.set(dateKey, currentDistance + dist);
            totalDistance += dist;
          });

          console.log('[getMedalList] Activities by date for', regId, ':', Object.fromEntries(activitiesByDate), 'total:', totalDistance);

          let qualifiedDays = 0;
          let totalDaysChecked = 0;
          let isQualified = true;

          if (medalMinDailyDistance && medalMinDailyDistance > 0) {
            const currentDate = new Date(medalDateStart + 'T00:00:00Z');
            const cutoffDate = new Date(cutoffStr + 'T00:00:00Z');
            while (currentDate <= cutoffDate) {
              const dateKey = currentDate.toISOString().split('T')[0];
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
            console.log('[getMedalList] No daily minimum set, qualifiedDays =', qualifiedDays);
          }

          if (medalMinCumulativeDistance && medalMinCumulativeDistance > 0) {
            if (totalDistance < medalMinCumulativeDistance) {
              console.log('[getMedalList] Cumulative distance failed for', regId, ':', totalDistance, '<', medalMinCumulativeDistance);
              isQualified = false;
            }
          }

          if (!medalMinDailyDistance && !medalMinCumulativeDistance) {
            console.log('[getMedalList] No medal criteria set, participant qualifies by default');
            isQualified = true;
          }

          console.log('[getMedalList] FINAL result for', regId, ':', { isQualified, totalDistance, qualifiedDays, totalDaysChecked });

          if (!isQualified) {
            return null;
          }

          return {
            participantId: participant.event_participant_id || '',
            registrationId: participant.registration_id,
            eventId: participant.event_id,
            firstName: registration?.first_name || "",
            otherNames: registration?.other_names || "",
            country: registration?.country ?? "",
            residence: registration?.["city / town / district"] ?? "",
            eventName: event?.event_name || "",
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
      console.log("[getMedalList] Qualified participants:", filtered.length, JSON.stringify(filtered));

      return filtered;
    } catch (error: any) {
      console.error("[getMedalList] Error:", error);
      throw new Error(`Failed to get medal list: ${error.message}`);
    }
  });

export default getMedalList;
