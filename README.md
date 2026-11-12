# CineFreak — Movie Download Platform

A DooPlay-style movie download site rebuilt from scratch with **Next.js 16
(App Router, TypeScript, Tailwind CSS v4)** and **MongoDB (Mongoose)**. Movie
details are fetched automatically from **TMDB** when an admin pastes an IMDb
link. No proprietary theme code is used — the layout and styling are original.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

## Configuration

Copy your credentials into `.env.local` (already created for this project):

- `MONGODB_URI` — MongoDB Atlas connection string
- `AUTH_SECRET` — NextAuth secret
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — admin login
- `TMDB_API_KEY` / `TMDB_ACCESS_TOKEN` — TMDB API access
- `NEXT_PUBLIC_SITE_URL` — public site URL

`.env.local` is git-ignored. Never commit it.

## Live site

- Live URL: **https://cinefreak24.vercel.app**
- On Vercel, set these in **Settings → Environment Variables** (`.env.local`
  is not deployed): `NEXT_PUBLIC_SITE_URL` and `NEXTAUTH_URL` both to the
  live URL above, then **Redeploy**.

## Admin panel

- URL: **https://cinefreak24.vercel.app/admin** (locally: http://localhost:3000/admin)
- Sign in with the admin email/password from `.env.local`.
- **Add Movie**: paste an IMDb URL (e.g. `https://www.imdb.com/title/tt0111161/`)
  or a bare id (`tt0111161`) → **Fetch Details** pulls title, overview, poster,
  backdrop, release date, runtime, rating, genres, cast and trailer from TMDB →
  review → save. Manual add/edit is also supported.
- **TV series**: pasting a series IMDb link (e.g. `https://www.imdb.com/title/tt0944947/`
  for Game of Thrones) imports it as a series — all seasons with their full
  episode lists. The detail page shows a Seasons & Episodes section; a
  download link can be attached to a whole series, one season, or one episode
  (set Season / Episode on the link row, blank = whole title).
- **Admin list**: 10 movies per page with prev/next + page numbers, and a
  search box (title or IMDb id, server-side).
- **Download Links**: in the movie form, add any number of links, each with
  quality (480p / 720p / 1080p / 4K...), file size, host/label and URL. Links
  open in a new tab on the movie page, grouped by quality.
- **Watch Online URL (optional)**: in the movie form, paste a watch/stream
  URL to show a "Watch Online" button on the movie page. Clicks on it are
  counted like download-link clicks.

## Site Views & Link Clicks

- **What is counted**: every public page view (home, browse, genre pages,
  movie/series pages) and every click on a download link or the Watch
  Online button. Counts are stored as daily aggregates in MongoDB
  (`DailyStat` / `DailyClickStat` collections), plus a `views` counter on
  each movie document.
- **Where to see it**: **Admin → 👁 Site Views** (`/admin/views`) — total
  views, today / last 7 days / last 30 days, a 30-day daily bar chart, Top
  10 most-viewed movies, most-viewed pages; and a Link Clicks section with
  total clicks, top-clicked links (movie + quality + host + episode),
  clicks by quality (480p / 720p / 1080p / 4K) and clicks per movie. The
  admin dashboard also shows a views summary card, the movie list has a
  Views column, and each download link row in the movie edit form shows
  its click count.
- **Honest counts**: the same visitor viewing the same page again within
  30 minutes counts once; the same link clicked again within 10 seconds
  counts once. Visitors are identified only by a random id generated in
  their own browser — no IPs or personal data are stored. Admin pages and
  bots are never counted. Tracking is fire-and-forget (a small beacon) and
  can never slow a page or break a download.

## Notifications — last 24 hours

- **What it is**: a bell in the site header. Movies posted in the last
  24 hours collect there — poster, title, quality badges, and relative
  time ("2 hours ago"). A row opens the movie page; the footer links to
  `/browse` (newest first).
- **Badge**: the red number counts movies posted since the bell was last
  opened (remembered in the visitor's own browser). Opening the panel
  clears it; it comes back when a newer movie is posted.
- **Auto-refresh**: the bell re-checks on every route change, when the
  tab regains focus / becomes visible, and every 60s while visible — so
  a movie uploaded in `/admin` shows up in the badge without a manual
  page reload (the header stays mounted across client-side navigation).
  A mount-only fetch would never see it; that was the Nov 12 bug fix.
- **Source of truth**: `GET /api/notifications` — movies with `createdAt`
  inside the last 24 hours, newest first, max 50. `createdAt` is set
  automatically by Mongoose timestamps whenever a movie is created or
  imported in admin, so no manual step is needed. If nothing was posted
  in the last 24 hours the panel shows "No new movies in the last 24
  hours." — an empty panel is correct, not a bug.
- **Files**: `src/lib/notifications.ts` (window + badge math),
  `src/app/api/notifications/route.ts`,
  `src/components/NotificationsBell.tsx` (wired into `Header.tsx`).

## Favicon

- Custom CineFreak favicon: `src/app/favicon.ico` (16/32/48 px, dark
  rounded square with a bold gold "CF" in the site accent `#f5c518`) and
  `src/app/apple-icon.png` (180×180, same design) for iOS home-screen
  icons. Next.js serves both automatically; no config needed.

## Homepage

- **Trending Now** auto-scrolls: one card every 2 seconds, looping back to the
  start; hovering pauses it.
- **Latest Movies** shows the 24 newest titles; **View all** opens `/browse`,
  which lists every title with pagination (24 per page).

## Seeding

```bash
node scripts/seed.mjs                 # Shawshank, Dark Knight, Inception
node scripts/seed.mjs tt0111161       # specific IMDb ids
```

Seeded movies have **no download links** — the admin adds real links in the
panel. No fake download URLs are ever created.

## API routes

- `GET /api/movies?q=&genre=&sort=&page=` — public list/search
- `GET /api/movies/[id]` — public detail (by Mongo id or slug)
- `GET /api/genres` — distinct genres
- `POST /api/admin/import` — admin only; `{ imdbUrl }` → TMDB preview (no save)
- `GET/POST /api/admin/movies` — admin only
- `PUT/DELETE /api/admin/movies/[id]` — admin only
- `GET/POST /api/auth/[...nextauth]` — NextAuth (credentials provider)

## Project structure

```
src/
  app/            pages: home, /browse, /genre/[slug], /movie/[slug], /admin/*
  app/api/        public + admin API routes, NextAuth handler
  components/     Header, MovieCard, MovieForm, DeleteMovieButton, SignOutButton
  lib/            db (Mongoose), tmdb, auth, admin-guard, utils
  models/         Movie (Mongoose schema)
scripts/seed.mjs  TMDB import seeder
```

- **Ads (Adsterra):** the Adsterra script lives in `src/app/layout.tsx`,
  just before `</body>` (after the footer). Do not remove it in a rebuild —
  it is the site-wide Popunder + Social Bar, and it is also on GitHub main.
  (Note: the Smartlink that was placed under the Download buttons on the
  movie page on 2026-11-08 is NOT in the GitHub repo, so it is not in this
  copy — re-add it from the Adsterra dashboard if it is still wanted.)

## Notes

- **TMDB auth:** the supplied TMDB bearer access token returns 401
  ("Invalid API key"), so the app authenticates TMDB with the
  `TMDB_API_KEY` query parameter instead. If you regenerate the access
  token in TMDB settings, the bearer-token path works again as a fallback.
- **MongoDB URI:** `.env.local` uses the standard (non-SRV) form of the
  same Atlas connection string — same cluster, user and database. The
  `mongodb+srv://` form works identically on a normal machine; the standard
  form was used because this sandbox's DNS refuses SRV lookups.
- **Sandbox-only tunnel:** `scripts/mongo-tunnel.mjs` + the
  `MONGO_TUNNEL=1` DNS patch in `src/instrumentation.ts` exist only so this
  sandboxed VM can reach Atlas through its egress proxy. They do nothing
  unless `MONGO_TUNNEL=1` is set — on your PC or Vercel, run normally
  without them.
#   c i n e f r e a k 2 4  
 