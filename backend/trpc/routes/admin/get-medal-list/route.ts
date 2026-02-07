import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { Surreal } from "surrealdb";

const dbEndpoint = process.env.EXPO_PUBLIC_RORK_DB_ENDPOINT;
const dbNamespace = process.env.EXPO_PUBLIC_RORK_DB_NAMESPACE;
const dbToken = process.env.EXPO_PUBLIC_RORK_DB_TOKEN;

const getMedalList = publicProcedure
  .input(
    z.object({
      eventId: z.string().optional(),
    })
  )
  .query(async ({ input }) => {
    console.log("[getMedalList] Starting query with input:", input);
    
    const db = new Surreal();

    try {
      await db.connect(`${dbEndpoint}/rpc`, {
        namespace: dbNamespace,
        database: dbNamespace,
        auth: { token: dbToken },
      });

      let query = `
        SELECT 
          ep."ParticipantID" as participantId,
          ep."RegistrationID" as registrationId,
          ep."EventID" as eventId,
          rs."First_Name" as firstName,
          rs."Other_Names" as otherNames,
          rs."Country" as country,
          rs."Residence" as residence,
          e."eventName" as eventName,
          e."medal_min_daily_distance" as medalMinDailyDistance,
          e."medal_min_cumulative_distance" as medalMinCumulativeDistance,
          e."medal_date_start" as medalDateStart,
          e."medal_date_end" as medalDateEnd
        FROM "Events Participants" as ep
        INNER JOIN "Registration Sample" as rs ON ep."RegistrationID" = rs."RegistrationID"
        INNER JOIN "Events" as e ON ep."EventID" = e."eventId"
        WHERE 1=1
      `;

      if (input.eventId) {
        query += ` AND ep."EventID" = '${input.eventId}'`;
      }

      const result = await db.query(query);
      console.log("[getMedalList] Raw query result:", JSON.stringify(result, null, 2));

      if (!result || result.length === 0) {
        console.log("[getMedalList] No data found");
        return [];
      }

      const participants = result[0] || [];
      console.log("[getMedalList] Participants count:", participants.length);

      const qualifiedParticipants = await Promise.all(
        participants.map(async (participant: any) => {
          const { 
            registrationId, 
            eventId,
            medalMinDailyDistance, 
            medalMinCumulativeDistance,
            medalDateStart,
            medalDateEnd 
          } = participant;

          if (!medalDateStart || !medalDateEnd) {
            return null;
          }

          const startDate = new Date(medalDateStart);
          const endDate = new Date(medalDateEnd);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const actualEndDate = endDate > today ? today : endDate;

          const activityQuery = `
            SELECT 
              "Activity_Date" as activityDate,
              "Distance_km" as distanceKm
            FROM "Activity Sample"
            WHERE "RegistrationID" = '${registrationId}'
              AND "Activity_Date" >= '${medalDateStart}'
              AND "Activity_Date" <= '${actualEndDate.toISOString().split('T')[0]}'
            ORDER BY "Activity_Date" ASC
          `;

          const activityResult = await db.query(activityQuery);
          const activities = activityResult[0] || [];

          let totalDistance = 0;
          const activitiesByDate = new Map<string, number>();

          activities.forEach((activity: any) => {
            const dateKey = new Date(activity.activityDate).toISOString().split('T')[0];
            const currentDistance = activitiesByDate.get(dateKey) || 0;
            activitiesByDate.set(dateKey, currentDistance + activity.distanceKm);
            totalDistance += activity.distanceKm;
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
            ...participant,
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
    } finally {
      await db.close();
    }
  });

export default getMedalList;
