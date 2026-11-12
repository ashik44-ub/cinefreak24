"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import SafeImage from "@/components/SafeImage";
import { timeAgo } from "@/lib/utils";
import {
  NOTIFICATIONS_LAST_SEEN_KEY,
  countUnseen,
} from "@/lib/notifications";

interface RecentMovie {
  title: string;
  slug: string;
  poster: string;
  mediaType: string;
  year: number | null;
  genres: string[];
  qualities: string[];
  createdAt: string | null;
}

/**
 * Header bell: movies posted in the last 24 hours collect here
 * (cinefreak.net style).
 *
 * - Badge = movies newer than the last time the panel was opened
 *   (remembered in localStorage). Opening the panel clears it; it
 *   reappears when a newer movie is posted.
 * - The bell re-checks for new movies on every route change, when the
 *   tab regains focus / becomes visible, and every 60s while visible —
 *   the header lives in the root layout and stays mounted across
 *   client-side navigation, so a mount-only fetch would never see a
 *   movie uploaded in /admin until a full page reload.
 * - Clicking opens the panel: poster thumbnail, title, quality badges
 *   (derived from the movie's download links), year/genres and relative
 *   time per row; a row opens the movie page.
 * - Panel footer: "View all new movies" (browse, newest first).
 * - Renders even when the database is unreachable — this is an in-site
 *   list, not push.
 */
export default function NotificationsBell() {
  const pathname = usePathname();
  const [movies, setMovies] = useState<RecentMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const readLastSeen = useCallback(() => {
    try {
      setLastSeen(
        window.localStorage.getItem(NOTIFICATIONS_LAST_SEEN_KEY),
      );
    } catch {
      // private mode etc. — badge just counts everything as new
    }
  }, []);

  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMovies(Array.isArray(data.movies) ? data.movies : []);
      setError(false);
    } catch (err) {
      console.error("Failed to load notifications", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-read last-seen (another tab may have opened the panel) and
  // re-fetch the list — one refresh used by every trigger below.
  const refresh = useCallback(() => {
    readLastSeen();
    fetchRecent();
  }, [readLastSeen, fetchRecent]);

  // Initial load + every client-side route change. The header never
  // remounts when navigating (e.g. /admin -> / after an upload), so the
  // pathname is the signal that a fresh list is needed.
  useEffect(() => {
    refresh();
  }, [pathname, refresh]);

  // A movie uploaded in another tab (or in /admin in this same tab)
  // shows up without a manual reload: refetch on focus / when the tab
  // becomes visible, and poll every 60s while the tab is visible.
  useEffect(() => {
    function onFocus() {
      refresh();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open ]);

  function togglePanel() {
    if (open) {
      setOpen(false);
      return;
    }
    // Opening clears the badge: remember "now" as last seen.
    const now = new Date().toISOString();
    try {
      window.localStorage.setItem(NOTIFICATIONS_LAST_SEEN_KEY, now);
    } catch {
      // ignore storage failures — the badge just stays until next open
    }
    setLastSeen(now);
    setOpen(true);
    fetchRecent();
  }

  const unseen = countUnseen(
    movies.map((m) => ({ createdAt: m.createdAt ?? "" })),
    lastSeen,
  );

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={togglePanel}
        aria-label={
          unseen > 0
            ? `${unseen} new movies in the last 24 hours — open notifications`
            : "Notifications — new movies in the last 24 hours"
        }
        aria-expanded={open}
        aria-haspopup="true"
        title="New movies in the last 24 hours"
        className="relative flex items-center justify-center rounded-md border border-line bg-panel px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:border-accent hover:text-accent"
      >
        <span aria-hidden="true">🔔</span>
        {/* Badge is always rendered (hidden at 0) so it exists in SSR HTML. */}
        <span
          className={`absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-black text-white ${
            unseen > 0 ? "" : "hidden"
          }`}
        >
          {unseen > 99 ? "99+" : unseen}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="New movies in the last 24 hours"
          className="absolute right-0 top-full z-50 mt-2 w-[calc(100vw-2.5rem)] max-w-md overflow-hidden rounded-lg border border-line bg-panel shadow-xl shadow-black/50 sm:w-[26rem]"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-bold">
              New in the last 24 hours
              {movies.length > 0 && (
                <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-black text-black">
                  {movies.length}
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
              className="rounded px-2 py-1 text-sm text-zinc-400 hover:bg-panel-2 hover:text-zinc-100"
            >
              ✕
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-400">
                Loading…
              </p>
            ) : error ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-400">
                Couldn&apos;t load new movies — try again.
              </p>
            ) : movies.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-400">
                No new movies in the last 24 hours.
              </p>
            ) : (
              <ul>
                {movies.map((m) => (
                  <li key={m.slug} className="border-b border-line last:border-b-0">
                    <Link
                      href={`/movie/${m.slug}`}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 px-4 py-3 transition hover:bg-panel-2"
                    >
                      <span className="relative h-16 w-12 shrink-0 overflow-hidden rounded bg-panel-2">
                        {m.poster ? (
                          <SafeImage
                            src={m.poster}
                            alt={m.title}
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="flex h-full items-center justify-center px-1 text-center text-[10px] text-zinc-500">
                            {m.title}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 block text-sm font-semibold leading-snug">
                          {m.title}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          {m.mediaType === "tv" && (
                            <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-black uppercase text-black">
                              TV
                            </span>
                          )}
                          {m.qualities.map((q) => (
                            <span
                              key={q}
                              className="rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
                            >
                              {q}
                            </span>
                          ))}
                        </span>
                        <span className="mt-1 block text-[11px] text-zinc-500">
                          {m.year ?? "—"}
                          {m.genres?.length
                            ? ` · ${m.genres.slice(0, 2).join(", ")}`
                            : ""}
                          {m.createdAt ? ` · ${timeAgo(m.createdAt)}` : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-line bg-panel-2 px-4 py-3">
            <Link
              href="/browse"
              onClick={() => setOpen(false)}
              className="text-sm font-semibold text-accent hover:underline"
            >
              View all new movies →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
