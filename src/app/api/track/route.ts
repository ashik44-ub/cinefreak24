import { NextRequest, after } from "next/server";
import { recordView } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * POST /api/track — fire-and-forget page-view beacon from the browser.
 * Body: { path: string, vid: string }. Always answers 200 quickly; the
 * database write runs in `after()` so tracking can never slow a page.
 */
export async function POST(req: NextRequest) {
  let body: { path?: unknown; vid?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Empty / malformed body — still answer 200, nothing to record.
  }
  const path = typeof body.path === "string" ? body.path : "";
  const vid = typeof body.vid === "string" ? body.vid : "anon";
  const userAgent = req.headers.get("user-agent");

  after(async () => {
    await recordView({ path, vid, userAgent });
  });

  return Response.json({ ok: true });
}
