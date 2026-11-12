import { connectDB } from "@/lib/db";
import { Movie } from "@/models/Movie";
import {
  NOTIFICATIONS_WINDOW_HOURS,
  notificationsSince,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications — movies posted in the last 24 hours, newest
 * first, for the header bell panel.
 *
 * This project has no quality/status fields on the Movie model — quality
 * badges are derived from the movie's download links instead.
 *
 * If the database is unreachable, returns an empty list with
 * dbConfigured: false and HTTP 200 — never a crash or 500.
 */
export async function GET() {
  try {
    await connectDB();
    const since = notificationsSince();
    const movies = await Movie.find({ createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("title slug poster mediaType year genres downloadLinks createdAt")
      .lean();
    return Response.json({
      dbConfigured: true,
      total: movies.length,
      windowHours: NOTIFICATIONS_WINDOW_HOURS,
      generatedAt: new Date().toISOString(),
      movies: movies.map((m) => {
        const qualities: string[] = [];
        for (const link of m.downloadLinks ?? []) {
          const q = (link?.quality ?? "").trim();
          if (q && !qualities.includes(q)) qualities.push(q);
          if (qualities.length >= 3) break;
        }
        return {
          title: m.title,
          slug: m.slug,
          poster: m.poster ?? "",
          mediaType: m.mediaType ?? "movie",
          year: m.year ?? null,
          genres: m.genres ?? [],
          qualities,
          createdAt: m.createdAt
            ? new Date(m.createdAt).toISOString()
            : null,
        };
      }),
    });
  } catch (err) {
    console.error("GET /api/notifications failed", err);
    return Response.json({
      dbConfigured: false,
      total: 0,
      windowHours: NOTIFICATIONS_WINDOW_HOURS,
      generatedAt: new Date().toISOString(),
      movies: [],
    });
  }
}
