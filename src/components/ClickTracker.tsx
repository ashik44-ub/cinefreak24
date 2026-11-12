"use client";

import { useEffect } from "react";
import { getVisitorId } from "@/components/ViewTracker";

/**
 * Delegated click tracking for download links and the Watch Online
 * button. Any element carrying `data-track-click` is reported with one
 * fire-and-forget beacon — the click itself is never intercepted, so the
 * link opens in the same moment, exactly as before.
 *
 * Attributes:
 *  data-track-click   "download" | "watch-online"
 *  data-track-slug    movie slug
 *  data-track-quality e.g. "720p"
 *  data-track-host    e.g. "Google Drive"
 *  data-track-season  season number (episode links)
 *  data-track-episode episode number (episode links)
 */
export default function ClickTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(
        "[data-track-click]",
      ) as HTMLElement | null;
      if (!el) return;
      const seasonRaw = el.dataset.trackSeason;
      const episodeRaw = el.dataset.trackEpisode;
      const payload = JSON.stringify({
        slug: el.dataset.trackSlug ?? "",
        type: el.dataset.trackClick ?? "download",
        quality: el.dataset.trackQuality ?? "",
        host: el.dataset.trackHost ?? "",
        season: seasonRaw ? Number(seasonRaw) : null,
        episode: episodeRaw ? Number(episodeRaw) : null,
        vid: getVisitorId(),
      });
      try {
        navigator.sendBeacon(
          "/api/track-click",
          new Blob([payload], { type: "application/json" }),
        );
      } catch {
        // Tracking must never break the click.
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
