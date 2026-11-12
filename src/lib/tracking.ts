import crypto from "node:crypto";
import { connectDB } from "@/lib/db";
import { DailyStat, ViewDedupe } from "@/models/SiteStat";
import { DailyClickStat, ClickDedupe } from "@/models/ClickStat";
import { Movie } from "@/models/Movie";

/**
 * Privacy-first analytics: page views + link clicks, stored as daily
 * aggregates. Visitors are identified only by a random id generated in
 * their own browser (localStorage `cf-vid`); the server only ever stores
 * a SHA-256 hash of (salt + visitor id + what + time bucket). Raw IPs and
 * user-agents are never stored.
 */

export const VIEW_WINDOW_MS = 30 * 60 * 1000; // same visitor+page = 1 view / 30 min
export const CLICK_WINDOW_MS = 10 * 1000; // same visitor+link = 1 click / 10 s

const BOT_RE =
  /bot|spider|crawl|slurp|headless|phantom|preview|facebookexternal|twitterbot|linkedinbot|whatsapp|telegram|googlebot|bingbot|yandex|baidu|duckduck|sogou|exabot|facebot|ia_archiver|semrush|ahrefs|mj12bot|dotbot|petalbot|monitor|uptime|pingdom/i;

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return BOT_RE.test(userAgent);
}

function salt(): string {
  return process.env.AUTH_SECRET ?? "cinefreak-tracking-salt";
}

function hashScope(vid: string, scope: string, bucket: number): string {
  return crypto
    .createHash("sha256")
    .update(`${salt()}:${vid}:${scope}:${bucket}`)
    .digest("hex");
}

/** UTC date string "YYYY-MM-DD". */
export function todayStr(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Increment one entry of an array field on a daily doc (upsert-safe). */
async function incArrayEntry(
  model: {
    updateOne: (filter: object, update: object, options?: object) => Promise<{ matchedCount?: number }>;
  },
  date: string,
  arrayField: string,
  keyField: string,
  keyValue: string,
  entry: Record<string, unknown>,
): Promise<void> {
  const res = await model.updateOne(
    { date, [`${arrayField}.${keyField}`]: keyValue },
    { $inc: { [`${arrayField}.$.count`]: 1 } },
  );
  if ((res.matchedCount ?? 0) === 0) {
    await model.updateOne(
      { date },
      { $push: { [arrayField]: { ...entry, count: 1 } } },
      { upsert: true },
    );
  }
}

export interface TrackViewInput {
  path: string;
  vid: string;
  userAgent: string | null;
}

/**
 * Record one public page view. Returns true when the view was counted,
 * false when it was skipped (duplicate in the 30-min window, bot,
 * admin/api/internal path). Never throws — callers must not break a page
 * because tracking failed.
 */
export async function recordView({
  path,
  vid,
  userAgent,
}: TrackViewInput): Promise<boolean> {
  try {
    if (!path || !path.startsWith("/")) return false;
    if (
      path.startsWith("/admin") ||
      path.startsWith("/api") ||
      path.startsWith("/_next") ||
      path === "/favicon.ico"
    ) {
      return false;
    }
    if (isBot(userAgent)) return false;

    const bucket = Math.floor(Date.now() / VIEW_WINDOW_MS);
    const hash = hashScope(vid || "anon", `view:${path}`, bucket);

    await connectDB();
    const dedupe = await ViewDedupe.updateOne(
      { hash },
      { $setOnInsert: { hash, path, createdAt: new Date() } },
      { upsert: true },
    );
    // upsertedCount === 1 means this is the first sighting in the window.
    if ((dedupe as { upsertedCount?: number }).upsertedCount !== 1) {
      return false;
    }

    const date = todayStr();
    await DailyStat.updateOne(
      { date },
      { $inc: { total: 1 } },
      { upsert: true },
    );
    await incArrayEntry(DailyStat, date, "paths", "path", path, { path });

    if (path.startsWith("/movie/")) {
      const slug = decodeURIComponent(path.split("/")[2] ?? "");
      if (slug) {
        const movie = await Movie.findOne({ slug })
          .select("title slug")
          .lean();
        if (movie) {
          await incArrayEntry(DailyStat, date, "movies", "slug", slug, {
            slug,
            title: movie.title ?? slug,
          });
          await Movie.updateOne({ slug }, { $inc: { views: 1 } });
        }
      }
    }
    return true;
  } catch (err) {
    console.error("recordView failed", err);
    return false;
  }
}

/** Stable key for one clickable link, used in both the click store and admin. */
export function linkClickKey(input: {
  slug: string;
  type: string;
  quality: string;
  host: string;
  season: number | null;
  episode: number | null;
}): string {
  return [
    input.slug,
    input.type,
    input.quality,
    input.host,
    input.season ?? "",
    input.episode ?? "",
  ].join("|");
}

export interface TrackClickInput {
  slug: string;
  type: string;
  quality: string;
  host: string;
  season: number | null;
  episode: number | null;
  vid: string;
  userAgent: string | null;
}

/**
 * Record one link click (download link or Watch Online button). Returns
 * true when counted, false when skipped (duplicate inside the 10-second
 * window, bot, bad input). Never throws.
 */
export async function recordClick({
  slug,
  type,
  quality,
  host,
  season,
  episode,
  vid,
  userAgent,
}: TrackClickInput): Promise<boolean> {
  try {
    const cleanSlug = (slug ?? "").trim();
    const cleanType = type === "watch-online" ? "watch-online" : "download";
    if (!cleanSlug) return false;
    if (isBot(userAgent)) return false;

    const key = linkClickKey({
      slug: cleanSlug,
      type: cleanType,
      quality: (quality ?? "").trim(),
      host: (host ?? "").trim(),
      season: typeof season === "number" ? season : null,
      episode: typeof episode === "number" ? episode : null,
    });
    const bucket = Math.floor(Date.now() / CLICK_WINDOW_MS);
    const hash = hashScope(vid || "anon", `click:${key}`, bucket);

    await connectDB();
    const dedupe = await ClickDedupe.updateOne(
      { hash },
      { $setOnInsert: { hash, createdAt: new Date() } },
      { upsert: true },
    );
    if ((dedupe as { upsertedCount?: number }).upsertedCount !== 1) {
      return false;
    }

    const date = todayStr();
    await DailyClickStat.updateOne(
      { date },
      { $inc: { total: 1 } },
      { upsert: true },
    );
    const movie = await Movie.findOne({ slug: cleanSlug })
      .select("title slug")
      .lean();
    await incArrayEntry(DailyClickStat, date, "links", "key", key, {
      key,
      slug: cleanSlug,
      title: movie?.title ?? cleanSlug,
      type: cleanType,
      quality: (quality ?? "").trim(),
      host: (host ?? "").trim(),
      season: typeof season === "number" ? season : null,
      episode: typeof episode === "number" ? episode : null,
    });
    return true;
  } catch (err) {
    console.error("recordClick failed", err);
    return false;
  }
}
