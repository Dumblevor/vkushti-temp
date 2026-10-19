# Spotter

**The European dating app for people who train.** Bumble-style mechanics (in woman–man matches, she makes the first move within 24 hours), but people are matched on *how they move* — shared sports, overlapping training schedules and goals — instead of looks alone. GDPR-native, multilingual, built for Europe.

> Working name. Check trademark availability before going public — see [docs/PRODUCT.md](docs/PRODUCT.md) for alternatives.

## Try it

Requires Node.js 22.13+ (uses the built-in `node:sqlite`, so there is no database to install).

```bash
npm install
npm run seed      # ~120 demo profiles across 23 European cities + a demo account
npm run dev       # API on :3000, web app on http://localhost:5173
```

Open http://localhost:5173 and press **Try the demo**, or log in as `demo@spotter.eu` / `spotter-demo`. The demo account (Lena, Berlin) arrives with a match in every state: two waiting for her first move (one about to expire), a live chat with a pending workout invite, and one waiting for a reply. A few people have already liked her, and one sent a Spot request. In demo mode the seeded profiles like you back and reply in chat, so you can explore on your own.

Seeded timestamps are relative to when you ran `npm run seed`. Re-run it to reset the demo.

### Production build

```bash
npm run build
NODE_ENV=production DATA_DIR=/var/lib/spotter npm start   # serves API + web app on :3000
```

| Variable    | Default                          | Notes                                           |
| ----------- | -------------------------------- | ----------------------------------------------- |
| `PORT`      | `3000`                           |                                                 |
| `DATA_DIR`  | `./data`                         | SQLite database and uploaded photos             |
| `WEB_DIR`   | `./dist/web`                     | Built front end                                 |
| `DEMO_MODE` | `true` unless `NODE_ENV=production` | Enables the demo login and auto-replying bots |

In production, session cookies are `Secure`, so serve it over HTTPS (behind a reverse proxy is fine).

## What's in it

**Dating mechanics**
- Swipe deck with drag gestures, buttons and arrow keys. Each card shows a **training match** score, shared sports, schedule and goals.
- **Spot requests** are the super-like: three a day, with a note ("Sunday 10k by the river?"). They jump to the top of the other person's deck.
- **First move:** in woman–man matches only she can open, and she has 24 hours. Then he has 24 hours to reply. In every other pairing, either person can start. Each match can be extended once by 24 hours.
- **Workout invites** in chat (activity, place, time) that can be accepted or declined. Answering an opening invite counts as a reply.
- Mutual preferences: both people must want to meet someone like the other, and each must be inside the other's age range. Filters for distance (or **anywhere in Europe**), age and sport. Snooze mode.

**Built for Europe**
- 7 languages (EN, DE, FR, ES, IT, PL, BG) with locale-aware dates, lists and units. Distances are in km and English uses the 24-hour clock.
- 80 cities in 31 countries across the EU, EEA, UK and Switzerland. Location is stored **at city level only**, never as GPS.
- **GDPR:**
  - Explicit art. 9 consent before processing gender and orientation, with an append-only consent log.
  - Withdrawing that consent erases the data.
  - One-click JSON export (art. 15/20).
  - Real account deletion with cascading erase of photos and messages (art. 17).
  - Photo metadata (EXIF/GPS) is stripped in the browser *and* on the server.
- **DSA-style safety:** report with reasons (receipt and reference number, auto-block), block and unmatch.
- Self-hosted fonts (no Google Fonts CDN, which a German court has held to breach GDPR), no third-party scripts and only one strictly necessary cookie, so there's no cookie banner.
- **Security:**
  - scrypt password hashing and hashed session tokens.
  - SameSite cookies plus an origin check on writes.
  - Strict CSP, rate limits on auth, swipes, messages and uploads.
  - Photos only visible to signed-in users.

## Architecture

```
src/
  shared/    catalog (sports, cities, …), API types, matching rules + training-match score
  server/    Fastify API, node:sqlite storage, demo bots, seed script, tests
  web/       React 19 + React Router SPA (Vite), i18n, mobile-first CSS
```

- **API:** Fastify 5 and Zod validation. The rules that matter (first move, expiry, scoring) live in `src/shared/rules.ts` and are unit tested.
- **Storage:** SQLite through `node:sqlite`, with the schema in `src/server/db.ts`. Queries are plain SQL so moving to Postgres is mechanical. Do that before real scale: discovery currently filters candidates in memory, and PostGIS should take over distance.
- **Realtime:** chat polls every 3 seconds. Moving to SSE or WebSockets is a contained change in `pages/Chat.tsx` and one route.
- **Mobile:** the web app is a mobile-first PWA. Wrapping it with Capacitor, or rebuilding the screens in React Native against the same API, are both straightforward next steps.

## Tests

```bash
npm test           # 28 tests: rules, matching lifecycle, discovery filters, safety, GDPR export/erasure, photo sanitising
npm run typecheck
```
