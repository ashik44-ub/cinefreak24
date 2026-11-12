import Link from "next/link";
import type { PipelineStage } from "mongoose";
import { connectDB } from "@/lib/db";
import { DailyStat } from "@/models/SiteStat";
import { DailyClickStat } from "@/models/ClickStat";
import { Movie } from "@/models/Movie";
import { requireAdminPage } from "@/lib/require-admin-page";

export const dynamic = "force-dynamic";

/** UTC date string "YYYY-MM-DD" for `daysAgo` days before today. */
function dateStr(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  return iso.slice(5); // "MM-DD"
}

async function sumTotal(
  model: {
    aggregate: (
      pipeline: PipelineStage[],
    ) => PromiseLike<{ total?: number }[]>;
  },
  since?: string,
): Promise<number> {
  const match = since ? [{ $match: { date: { $gte: since } } }] : [];
  const res = await model.aggregate([
    ...match,
    { $group: { _id: null, total: { $sum: "$total" } } },
  ]);
  return res[0]?.total ?? 0;
}

export default async function AdminViewsPage() {
  await requireAdminPage();
  await connectDB();

  const today = dateStr(0);
  const d7 = dateStr(6);
  const d30 = dateStr(29);

  // ---- Views ----
  const [totalViews, todayViews, views7, views30] = await Promise.all([
    sumTotal(DailyStat),
    sumTotal(DailyStat, today),
    sumTotal(DailyStat, d7),
    sumTotal(DailyStat, d30),
  ]);
  const dailyDocs = await DailyStat.find({ date: { $gte: d30 } })
    .select("date total")
    .lean();
  const dailyMap = new Map(dailyDocs.map((d) => [d.date, d.total]));
  const daily30: { date: string; total: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = dateStr(i);
    daily30.push({ date, total: dailyMap.get(date) ?? 0 });
  }
  const maxDay = Math.max(1, ...daily30.map((d) => d.total));

  const topMovies = await Movie.find({ views: { $gt: 0 } })
    .sort({ views: -1 })
    .limit(10)
    .select("title slug views mediaType")
    .lean();
  const topPages = await DailyStat.aggregate([
    { $unwind: "$paths" },
    {
      $group: {
        _id: "$paths.path",
        views: { $sum: "$paths.count" },
      },
    },
    { $sort: { views: -1 } },
    { $limit: 10 },
  ]);

  // ---- Link clicks ----
  const [totalClicks, todayClicks, clicks7, clicks30] = await Promise.all([
    sumTotal(DailyClickStat),
    sumTotal(DailyClickStat, today),
    sumTotal(DailyClickStat, d7),
    sumTotal(DailyClickStat, d30),
  ]);
  const topLinks = await DailyClickStat.aggregate([
    { $unwind: "$links" },
    {
      $group: {
        _id: "$links.key",
        title: { $first: "$links.title" },
        slug: { $first: "$links.slug" },
        type: { $first: "$links.type" },
        quality: { $first: "$links.quality" },
        host: { $first: "$links.host" },
        season: { $first: "$links.season" },
        episode: { $first: "$links.episode" },
        clicks: { $sum: "$links.count" },
      },
    },
    { $sort: { clicks: -1 } },
    { $limit: 10 },
  ]);
  const clicksByQuality = await DailyClickStat.aggregate([
    { $unwind: "$links" },
    { $match: { "links.type": "download" } },
    {
      $group: {
        _id: "$links.quality",
        clicks: { $sum: "$links.count" },
      },
    },
    { $sort: { clicks: -1 } },
  ]);
  const clicksPerMovie = await DailyClickStat.aggregate([
    { $unwind: "$links" },
    {
      $group: {
        _id: "$links.slug",
        title: { $first: "$links.title" },
        clicks: { $sum: "$links.count" },
      },
    },
    { $sort: { clicks: -1 } },
    { $limit: 10 },
  ]);
  const watchClicks = await DailyClickStat.aggregate([
    { $unwind: "$links" },
    { $match: { "links.type": "watch-online" } },
    { $group: { _id: null, clicks: { $sum: "$links.count" } } },
  ]);
  const totalWatchClicks = watchClicks[0]?.clicks ?? 0;

  const statCard = (label: string, value: number) => (
    <div className="rounded-lg border border-line bg-panel p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-black">{value.toLocaleString()}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">
            Site <span className="text-accent">Views</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Public page views and link clicks. Same visitor + same page counts
            once per 30 minutes; same link click counts once per 10 seconds.
            Admin pages and bots are never counted.
          </p>
        </div>
        <Link
          href="/admin"
          className="rounded-md border border-line px-4 py-2 text-sm font-semibold hover:border-accent"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* ---- Views summary ---- */}
      <h2 className="mt-8 text-lg font-bold">Page Views</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {statCard("Total views (all time)", totalViews)}
        {statCard("Views today", todayViews)}
        {statCard("Views last 7 days", views7)}
        {statCard("Views last 30 days", views30)}
      </div>

      {/* ---- 30-day chart ---- */}
      <div className="mt-6 rounded-lg border border-line bg-panel p-4">
        <p className="text-sm font-bold">Views per day — last 30 days</p>
        {views30 === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            No views recorded yet. Views appear here once visitors browse the
            site.
          </p>
        ) : (
          <>
            <div className="mt-4 flex h-40 items-end gap-1">
              {daily30.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.total} view${d.total === 1 ? "" : "s"}`}
                  className="flex-1 rounded-t bg-accent/80 hover:bg-accent"
                  style={{
                    height: `${d.total === 0 ? 1 : Math.max(2, (d.total / maxDay) * 100)}%`,
                  }}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-zinc-500">
              <span>{shortDate(daily30[0].date)}</span>
              <span>{shortDate(daily30[9].date)}</span>
              <span>{shortDate(daily30[19].date)}</span>
              <span>{shortDate(daily30[29].date)}</span>
            </div>
          </>
        )}
      </div>

      {/* ---- Top movies + top pages ---- */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-panel p-4">
          <p className="text-sm font-bold">Top 10 most-viewed movies</p>
          {topMovies.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No movie views yet.</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-zinc-400">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Movie</th>
                  <th className="py-2 text-right">Views</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {topMovies.map((m, i) => (
                  <tr key={String(m._id)}>
                    <td className="py-2 pr-2 text-zinc-500">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <a
                        href={`/movie/${m.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold hover:text-accent"
                      >
                        {m.title}
                      </a>
                      {m.mediaType === "tv" && (
                        <span className="ml-2 rounded bg-accent px-1 py-px text-[10px] font-black uppercase text-black">
                          TV
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right font-bold">
                      {(m.views ?? 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-line bg-panel p-4">
          <p className="text-sm font-bold">Most-viewed pages</p>
          {topPages.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No page views yet.</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-zinc-400">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Page</th>
                  <th className="py-2 text-right">Views</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {topPages.map(
                  (p: { _id: string; views: number }, i: number) => (
                    <tr key={p._id}>
                      <td className="py-2 pr-2 text-zinc-500">{i + 1}</td>
                      <td className="max-w-0 truncate py-2 pr-2 font-mono text-xs">
                        <a
                          href={p._id}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-accent"
                        >
                          {p._id}
                        </a>
                      </td>
                      <td className="py-2 text-right font-bold">
                        {p.views.toLocaleString()}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ---- Link clicks ---- */}
      <h2 className="mt-10 text-lg font-bold">
        Link Clicks <span className="text-zinc-500 text-sm font-normal">— download links &amp; Watch Online</span>
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {statCard("Total clicks (all time)", totalClicks)}
        {statCard("Clicks today", todayClicks)}
        {statCard("Clicks last 7 days", clicks7)}
        {statCard("Clicks last 30 days", clicks30)}
      </div>
      <p className="mt-3 text-sm text-zinc-400">
        Watch Online clicks: <span className="font-bold text-zinc-200">{totalWatchClicks.toLocaleString()}</span> all time ·{" "}
        Download clicks:{" "}
        <span className="font-bold text-zinc-200">
          {(totalClicks - totalWatchClicks).toLocaleString()}
        </span>
      </p>

      {/* Clicks by quality */}
      <div className="mt-6 rounded-lg border border-line bg-panel p-4">
        <p className="text-sm font-bold">Download clicks by quality</p>
        {clicksByQuality.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            No download clicks yet.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {clicksByQuality.map((q: { _id: string; clicks: number }) => (
              <span
                key={q._id || "unknown"}
                className="rounded-full border border-line bg-panel-2 px-3 py-1.5 text-sm"
              >
                <span className="font-bold">{q._id || "—"}</span>
                <span className="ml-2 text-zinc-400">
                  {q.clicks.toLocaleString()} click
                  {q.clicks === 1 ? "" : "s"}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Top clicked links + clicks per movie */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-panel p-4">
          <p className="text-sm font-bold">Top 10 clicked links</p>
          {topLinks.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No link clicks yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-zinc-400">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Link</th>
                    <th className="py-2 text-right">Clicks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {topLinks.map(
                    (
                      l: {
                        _id: string;
                        title: string;
                        slug: string;
                        type: string;
                        quality: string;
                        host: string;
                        season: number | null;
                        episode: number | null;
                        clicks: number;
                      },
                      i: number,
                    ) => (
                      <tr key={l._id}>
                        <td className="py-2 pr-2 text-zinc-500">{i + 1}</td>
                        <td className="py-2 pr-2">
                          <a
                            href={`/movie/${l.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold hover:text-accent"
                          >
                            {l.title}
                          </a>
                          <span className="block text-xs text-zinc-500">
                            {l.type === "watch-online"
                              ? "Watch Online"
                              : `${l.quality || "Download"}${l.host ? ` · ${l.host}` : ""}`}
                            {l.season != null &&
                              ` · S${l.season}${l.episode != null ? `E${l.episode}` : ""}`}
                          </span>
                        </td>
                        <td className="py-2 text-right font-bold">
                          {l.clicks.toLocaleString()}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-line bg-panel p-4">
          <p className="text-sm font-bold">Clicks per movie</p>
          {clicksPerMovie.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No link clicks yet.</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-zinc-400">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Movie</th>
                  <th className="py-2 text-right">Clicks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {clicksPerMovie.map(
                  (
                    m: { _id: string; title: string; clicks: number },
                    i: number,
                  ) => (
                    <tr key={m._id}>
                      <td className="py-2 pr-2 text-zinc-500">{i + 1}</td>
                      <td className="py-2 pr-2">
                        <a
                          href={`/movie/${m._id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold hover:text-accent"
                        >
                          {m.title}
                        </a>
                      </td>
                      <td className="py-2 text-right font-bold">
                        {m.clicks.toLocaleString()}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
