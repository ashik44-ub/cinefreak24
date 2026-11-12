import { NextRequest, after } from "next/server";
import { recordClick } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * POST /api/track-click — fire-and-forget link-click beacon from the
 * browser. Body: { slug, type ("download" | "watch-online"), quality,
 * host, season, episode, vid }. Always answers 200 quickly; the database
 * write runs in `after()` so tracking can never delay or break a click.
 */
export async function POST(req: NextRequest) {
  let body: {
    slug?: unknown;
    type?: unknown;
    quality?: unknown;
    host?: unknown;
    season?: unknown;
    episode?: unknown;
    vid?: unknown;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Empty / malformed body — still answer 200, nothing to record.
  }
  const slug = typeof body.slug === "string" ? body.slug : "";
  const type = body.type === "watch-online" ? "watch-online" : "download";
  const quality = typeof body.quality === "string" ? body.quality : "";
  const host = typeof body.host === "string" ? body.host : "";
  const season =
    typeof body.season === "number" && Number.isFinite(body.season)
      ? body.season
      : null;
  const episode =
    typeof body.episode === "number" && Number.isFinite(body.episode)
      ? body.episode
      : null;
  const vid = typeof body.vid === "string" ? body.vid : "anon";
  const userAgent = req.headers.get("user-agent");

  after(async () => {
    await recordClick({
      slug,
      type,
      quality,
      host,
      season,
      episode,
      vid,
      userAgent,
    });
  });

  return Response.json({ ok: true });
}
