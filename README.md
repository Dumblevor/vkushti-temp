# Spotter

**The European dating app for people who train.** Bumble-style mechanics (in woman–man matches, she makes the first move within 24 hours), but people are matched on *how they move* — shared sports, overlapping training schedules and goals — instead of looks alone. GDPR-native, multilingual, built for Europe.

> Working name. Check trademark availability before going public — see [docs/PRODUCT.md](docs/PRODUCT.md) for the product brief and alternatives.

**Stack:** MERN (MongoDB + Mongoose, Express 5, React 19 + Vite, Node 22), with the React app shipped to iOS through **Capacitor 8**. One React codebase serves the web and the iOS app; Android can be added the same way.

```
shared/   types, reference data (sports, 80 cities) and the matching rules — used by both sides
server/   Express API + Mongoose models, demo bots, seed script, tests
client/   React app (Vite) + Capacitor; the Xcode project lives in client/ios
```

## Run it locally

Requires Node.js 22.12+.

```bash
npm install
npm run db        # local MongoDB on :27017, no install needed (or: docker compose up -d)
npm run seed      # ~120 demo profiles across 23 European cities + a demo account
npm run dev       # API on :3000, web app on http://localhost:5173
```

`npm run db` keeps running in its own terminal. To use Atlas or another MongoDB instead, set `MONGODB_URI` in `server/.env` (see `server/.env.example`).

Open http://localhost:5173 and press **Try the demo**, or log in as `demo@spotter.eu` / `spotter-demo`. The demo account (Lena, Berlin) arrives with a match in every state: two waiting for her first move (one about to expire), a live chat with a pending workout invite, and one waiting for a reply. A few people have already liked her, and one sent a Spot request. In demo mode the seeded profiles like you back and reply in chat. Seeded timestamps are relative to when you ran the seed; re-run it to reset.

## iOS app

The Xcode project is committed in `client/ios` and is configured with:
- App icon, plus light and dark launch screens.
- Camera and photo-library permission texts.
- A privacy manifest (`PrivacyInfo.xcprivacy`).
- Export-compliance flag, iPhone only, portrait.

It uses Swift Package Manager, so there's no CocoaPods step.

**You need:** a Mac with Xcode 16+, and an Apple Developer account for real devices and TestFlight.

```bash
cp client/.env.ios.example client/.env.ios   # set VITE_API_URL (see below)
npm run ios                                   # builds the web app, syncs it into Xcode, opens Xcode
```

Then pick a simulator and press Run.

- **Simulator:** `VITE_API_URL=http://localhost:3000` works as is, against `npm run dev` on the same Mac.
- **Real iPhone:**
  - Set your Team under *Signing & Capabilities* and replace the placeholder bundle id `eu.spotter.app`, both there and in `client/capacitor.config.ts`.
  - The API must be reachable from the phone: your Mac's LAN IP for testing, or the deployed `https://` URL.
- **Live reload in the simulator:** run `npm run dev`, then from `client/` run `CAP_SERVER_URL=http://localhost:5173 npx cap run ios`.
- **After changing web code:** run `npm run ios:sync -w client`, then Run in Xcode.
- **TestFlight / App Store:** in Xcode, *Product → Archive → Distribute App*.

How the iOS app differs from the web app (`client/src/native.ts`):
- **Auth:** the web uses an httpOnly cookie. The app runs on `capacitor://localhost`, cross-origin to the API, so it gets a bearer token instead and stores it in the **Keychain**. The API allows that origin through CORS.
- **Photos and data exports** are served from short-lived **signed URLs**, so `<img>` tags and Safari can load them without a session. This also makes them CDN-ready.
- **Native touches:** haptics on like and match, a status bar that follows light/dark mode, the splash screen, keyboard resizing, and no rubber-band bounce or long-press callouts.

**App Store checklist for a dating app** (Apple reviews these closely):
- [x] In-app account deletion (guideline 5.1.1(v)) — Settings → Delete account
- [x] Report, block and unmatch for user-generated content (guideline 1.2)
- [x] Privacy manifest with no tracking; keep the App Store privacy labels consistent with it
- [x] Feels like an app, not a website (guideline 4.2): native haptics, Keychain, splash, photo picker
- [ ] Age rating 18+ in App Store Connect; an App Review test account on the production server (demo mode is off there)
- [ ] Push notifications (APNs) for matches and messages — the next big native feature
- [ ] Sign in with Apple, but only if social logins are added (it's required then)

## Production

```bash
npm run build
NODE_ENV=production APP_SECRET=… MONGODB_URI=… npm start   # serves the API and the web app on :3000
```

Run it behind HTTPS, since session cookies are `Secure` in production. Use a MongoDB in an **EU region**, such as Atlas in Frankfurt, Paris or Ireland.

| Variable       | Default                                           | Notes                                              |
| -------------- | ------------------------------------------------- | -------------------------------------------------- |
| `MONGODB_URI`  | `mongodb://127.0.0.1:27017/spotter`               |                                                    |
| `APP_SECRET`   | dev placeholder (required in production)          | Signs photo and export URLs                        |
| `PORT`         | `3000`                                            |                                                    |
| `CORS_ORIGINS` | `capacitor://localhost,https://localhost,http://localhost:5173` | Origins allowed to call the API cross-origin |
| `DEMO_MODE`    | on unless `NODE_ENV=production`                   | Demo login and auto-replying bots                  |
| `UPLOADS_DIR`  | `server/data/uploads`                             | Move to EU object storage before scaling           |
| `WEB_DIR`      | `client/dist`                                     | Built web app to serve                             |

## What's in it

**Dating mechanics**
- Swipe deck with drag gestures, buttons and arrow keys. Each card shows a **training match** score, shared sports, schedule and goals.
- **Spot requests** are the super-like: three a day, with a note. They jump to the top of the other person's deck.
- **First move:** in woman–man matches only she can open, within 24 hours. Then he has 24 hours to reply. In every other pairing, either person can start. Each match can be extended once.
- **Workout invites** in chat (activity, place, time) that can be accepted or declined. Answering an opening invite counts as a reply.
- Mutual preferences (who wants to meet whom, and age ranges both ways), a distance filter (or **anywhere in Europe**), a sport filter, and snooze mode.

**Built for Europe**
- 7 languages (EN, DE, FR, ES, IT, PL, BG) with locale-aware dates, lists and units, the 24-hour clock and km.
- Location is stored **at city level only**, never as GPS.
- **GDPR:**
  - Explicit art. 9 consent before processing gender and orientation, with an append-only consent log.
  - Withdrawing that consent erases the data.
  - Data export via a signed link (art. 15/20).
  - Real account deletion (art. 17).
  - Photo EXIF/GPS is stripped in the browser and on the server.
- **DSA-style safety:** reports with a receipt reference, plus block and unmatch.
- Self-hosted fonts, no third-party scripts and only one strictly necessary cookie, so no cookie banner.

**Under the hood**
- **Discovery** uses MongoDB `$geoNear` on a 2dsphere index of city centres. Mutual preferences and age ranges are filtered in the query, and scoring happens in `shared/src/rules.ts`.
- **No multi-document transactions needed:** state changes are conditional updates, so two people writing at the same moment can't corrupt the first-move state, and unique indexes make match creation idempotent. Sessions expire through a TTL index.
- **Security:**
  - scrypt password hashing and hashed session tokens.
  - Helmet with a strict CSP, CORS allow-list, origin check on writes and rate limits.
  - IDs are validated before they reach queries.
- **Chat** polls every 3 seconds. Moving to WebSockets is a contained change in `client/src/pages/Chat.tsx` plus one route.

## Tests & CI

```bash
npm test          # 30 tests: matching rules, plus API tests against a real in-memory MongoDB
npm run typecheck
```

`.github/workflows/ci.yml` runs on every push. It runs typecheck, tests and build on Linux, and **compiles the iOS app on a macOS runner** (simulator build, unsigned), so iOS build breakage shows up without a Mac.
