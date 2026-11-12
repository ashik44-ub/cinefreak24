"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Random visitor id kept in the visitor's own browser (localStorage). */
export function getVisitorId(): string {
  try {
    let vid = localStorage.getItem("cf-vid");
    if (!vid) {
      vid = crypto.randomUUID();
      localStorage.setItem("cf-vid", vid);
    }
    return vid;
  } catch {
    return "anon";
  }
}

/**
 * Fires one view beacon per public page (navigator.sendBeacon, so the
 * page never waits for it). Admin pages are never tracked. Rendered
 * as null — it only listens for route changes.
 */
export default function ViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return;
    try {
      const payload = JSON.stringify({
        path: pathname,
        vid: getVisitorId(),
      });
      navigator.sendBeacon(
        "/api/track",
        new Blob([payload], { type: "application/json" }),
      );
    } catch {
      // Tracking must never break the page.
    }
  }, [pathname]);

  return null;
}
