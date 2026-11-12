/**
 * "Last 24 hours" notifications — the in-site bell panel (cinefreak.net
 * style): movies posted within the last 24 hours collect in the bell.
 *
 * Pure helpers, shared by the API route and the bell component, so the
 * window and the badge math can be tested without a database.
 */

/** How far back the notifications panel looks. */
export const NOTIFICATIONS_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The window in hours, for API responses and copy. */
export const NOTIFICATIONS_WINDOW_HOURS = 24;

/** localStorage key for the last time the visitor opened the panel. */
export const NOTIFICATIONS_LAST_SEEN_KEY =
  "cinefreak:notifications-last-seen";

/** The earliest posted time still inside the window. */
export function notificationsSince(now: Date = new Date()): Date {
  return new Date(now.getTime() - NOTIFICATIONS_WINDOW_MS);
}

/** True when a posted time is inside the last-24-hours window. */
export function isWithinNotificationsWindow(
  createdAt: Date | string | number,
  now: Date = new Date(),
): boolean {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return t >= now.getTime() - NOTIFICATIONS_WINDOW_MS;
}

/**
 * How many of the given movies the visitor has not seen yet: posted after
 * their last panel open. No last-seen time yet (first visit) → all of
 * them count as new.
 */
export function countUnseen(
  movies: { createdAt: Date | string | number }[],
  lastSeenIso: string | null,
): number {
  if (!lastSeenIso) return movies.length;
  const seenAt = new Date(lastSeenIso).getTime();
  if (Number.isNaN(seenAt)) return movies.length;
  return movies.filter(
    (m) => new Date(m.createdAt).getTime() > seenAt,
  ).length;
}
