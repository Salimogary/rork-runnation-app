import { publicProcedure } from "../../../create-context";
import { z } from "zod";

const pageSchema = z.enum(["News", "Events", "Community", "Columns", "Gallery"]);

export default publicProcedure
  .input(
    z
      .object({
        page: pageSchema.optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .optional()
  )
  .query(async ({ input, ctx }) => {
    let query = ctx.supabase
      .from("live_magazine")
      .select("article_id, registration_id, page, author, article_date, title, body, picture_link, external_link, created_at")
      .order("article_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(input?.limit ?? 60);

    if (input?.page) {
      query = query.eq("page", input.page);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message || "Could not load magazine articles.");
    }

    return data ?? [];
  });
