import { publicProcedure } from "../../../create-context";
import { z } from "zod";
import { isMagazineImageUrl } from "../../../magazine-image";

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
      .select("article_id, registration_id, page, author, article_date, title, body, picture_link, external_link, created_at, source_table, source_id")
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

    const liveArticles = (data ?? [])
      .map((article: any) => ({
        ...article,
        picture_link: isMagazineImageUrl(article.picture_link) ? article.picture_link : null,
      }))
      .filter((article: any) => article.page !== "Gallery" || article.picture_link);

    if (input?.page && input.page !== "Gallery") {
      return liveArticles;
    }

    const publishedPictorialIds = new Set(
      liveArticles
        .filter((article: any) => article.source_table === "magazine_pictorial_submissions" && article.source_id)
        .map((article: any) => String(article.source_id))
    );

    const { data: acceptedPictorials, error: pictorialError } = await ctx.supabase
      .from("magazine_pictorial_submissions")
      .select("pictorial_id, registration_id, submitter_name, event_date, event_name, caption, photo_url, photo_webp_url, photo_avif_url, created_at")
      .eq("status", "accepted")
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(input?.limit ?? 60);

    if (pictorialError) {
      throw new Error(pictorialError.message || "Could not load gallery pictorials.");
    }

    const fallbackGalleryArticles = (acceptedPictorials ?? [])
      .filter((pictorial: any) => !publishedPictorialIds.has(String(pictorial.pictorial_id)))
      .map((pictorial: any) => ({
        pictorial,
        pictureLink: [pictorial.photo_url, pictorial.photo_webp_url, pictorial.photo_avif_url].find((url) =>
          isMagazineImageUrl(url)
        ),
      }))
      .filter((item: any) => item.pictureLink)
      .map(({ pictorial, pictureLink }: any) => ({
          article_id: `pictorial-${pictorial.pictorial_id}`,
          registration_id: pictorial.registration_id ?? null,
          page: "Gallery",
          author: pictorial.submitter_name || "RunNation Community",
          article_date: pictorial.event_date || pictorial.created_at,
          title: pictorial.event_name || "RunNation Gallery",
          body: pictorial.caption || "",
          picture_link: pictureLink,
          external_link: null,
          created_at: pictorial.created_at,
          source_table: "magazine_pictorial_submissions",
          source_id: pictorial.pictorial_id,
        }));

    return [...liveArticles, ...fallbackGalleryArticles]
      .sort((a: any, b: any) => {
        const aTime = new Date(a.article_date || a.created_at || 0).getTime();
        const bTime = new Date(b.article_date || b.created_at || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, input?.limit ?? 60);
  });
