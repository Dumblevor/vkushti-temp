# Spotter — product brief

## One line

The dating app for people who train: matched on how you move, women make the first move, built and hosted in Europe.

## Why this can win

Tinder and Bumble are generic and US-owned. Their product decisions (aggressive paywalls, engagement-maximising design, data practices) increasingly clash with European regulation and European users' expectations. Niche apps win when the niche is large, identifiable and underserved. "People who train" is all three:

- **Large:** gym membership, run clubs, padel and HYROX-style fitness racing have all been growing across Europe for years, and Europe has tens of millions of gym members.
- **Identifiable:** these people already gather in gyms, clubs, races and fitness-class aggregators. That gives cheap, high-intent acquisition channels that generic apps can't own.
- **Underserved:** "fit" on a mainstream app means body photos. A shared routine (6 a.m. runs, Sunday climbs) is a far better predictor of fitting into each other's lives, and no big app models it.

## Positioning

|                     | Tinder              | Bumble                     | **Spotter**                                          |
| ------------------- | ------------------- | -------------------------- | ---------------------------------------------------- |
| What you match on   | Photos              | Photos + prompts           | **Sports, schedule, goals** (+ photos)               |
| Who starts          | Anyone              | Women (M/W)                | Women (M/W), plus **workout invites** as openers     |
| First date          | Drinks              | Drinks                     | **A run, a climb, a padel game** in a public place   |
| Data                | US company          | US company                 | **EU-hosted, GDPR-native, city-level location only** |
| Languages           | Many                | Many                       | Built multilingual from day one                      |

**Deliberate no's:** no body stats (weight, body fat, "fitness level" rankings), no precise location, no ad tracking, no fake "someone liked you" notifications.

## Core mechanics (built in this prototype)

1. **Training match score.** Shared sports (weighted by how close your levels are), overlapping training times, similar frequency and shared goals. It's shown on every card and explained in plain words ("You both do running and climbing").
2. **First move.** In woman–man matches she has 24 hours to open, then he has 24 hours to reply. In any other pairing, either person can open. Each match can be extended once.
3. **Spot requests.** Three a day, with a note, and they jump to the top of the recipient's deck. This is the one scarce signal of strong interest.
4. **Workout invites.** A structured invite (activity, place, time) inside the chat that can be accepted or declined. It can be the opening move, which lowers the "what do I even say" barrier.
5. **Safety.** Report with reasons (with a reference number), block, unmatch, snooze, and safety tips on invites.

## Built for Europe

- **Languages:** EN, DE, FR, ES, IT, PL, BG at launch. Add NL, PT, SV, RO and CS next.
- **Local conventions:** km, 24-hour time, local date formats, local city names (München, Praha, София).
- **"Anywhere in Europe" mode** for people who travel for races or training camps, or who are moving cities.
- **Compliance as a feature:** the privacy story is part of the marketing ("Your data stays in the EU").

### Compliance checklist (verify with counsel before launch)

- [ ] **DPIA (GDPR art. 35):** large-scale processing of special-category data (sexual orientation is revealed by gender and preferences) almost certainly requires one.
- [ ] **DPO (art. 37):** core activity involves large-scale special-category processing, so a DPO is likely required.
- [x] Explicit consent for gender and orientation, separate from the terms, withdrawable, with erasure on withdrawal. *(built)*
- [x] Access/portability export and real erasure. *(built; also needs backup retention policy)*
- [x] Data minimisation: city-level location, EXIF stripping, no body metrics. *(built)*
- [ ] **Processors:** EU-hosted infrastructure, email, push and object storage, with DPAs signed. Avoid transfers outside the EEA, or document safeguards.
- [ ] **DSA (online platform obligations):**
  - [x] Notice-and-action with confirmation of receipt *(built)*
  - [ ] Statements of reasons for moderation decisions
  - [ ] Internal complaint handling and appeals
  - [ ] Out-of-court dispute settlement info
  - [ ] Transparency reports
  - [ ] No dark patterns
- [ ] **Age assurance:** 18+ is self-declared today. Plan for document or selfie verification, and the EU age-verification app / EUDI Wallet as it rolls out.
- [ ] **Consumer law for subscriptions:**
  - [ ] Clear pricing in EUR incl. VAT
  - [ ] 14-day withdrawal right
  - [ ] Easy online cancellation (Germany's statutory "cancel contract" button, §312k BGB)
  - [ ] No auto-renewal traps
- [ ] **European Accessibility Act (applies since June 2025):** the purchase flow and core app need to meet accessibility requirements. The prototype already uses semantic HTML, labels, keyboard support and reduced-motion support.
- [x] ePrivacy: only a strictly necessary session cookie and no trackers, so no consent banner needed. *(built — keep it that way)*
- [ ] Trademark search for the name in EUIPO and target national registers.

## Business model

Freemium, with a premium tier that never paywalls basic decency (safety features, seeing your matches, messaging) and never sells data.

- **Spotter Plus** (indicative: €9.99/month, €49.99/6 months):
  - See who liked you
  - More Spot requests
  - Unlimited extends
  - Travel mode (set a city ahead of a race or trip)
  - Advanced filters (level, schedule)
  - Rematch expired matches
- **Events (B2B2C):** "Spotter Socials", group runs, climbs and padel mixers co-hosted with gyms and clubs. Ticketed, which also makes good content and builds the community flywheel.
- **Partnerships:** gyms, studio chains and fitness-class aggregators get co-marketing and in-gym QR posters. Members get a discount on Plus.
- **Not doing:** selling or sharing data, programmatic ads.

## Go-to-market

1. **Launch city density beats country breadth.** Start with 2–3 cities that have strong training cultures and international, English-tolerant populations: **Berlin, Amsterdam, Barcelona**. Then Munich, Vienna, Copenhagen, Lisbon, Warsaw, Sofia.
2. **Supply the women's side first.** The women-first mechanic, safety-first invites and no body-rating are the pitch. Recruit via women's run clubs, climbing gyms and yoga/pilates studios, and track the gender ratio per city weekly.
3. **Own the moments where people train.** Race expos, HYROX-style events, marathon training groups, gym QR codes ("Who else trains here at 6 a.m.?").
4. **Content:** "Training date ideas in Berlin", partner-workout guides, and race-day meetups.
5. **Waitlist per city:** open a city once the waitlist reaches critical mass, and never launch an empty deck.

## Metrics that matter

- Weekly matches per active user and **% of matches with a first message** (the first-move rule must not kill conversations)
- **Workout invites sent and accepted** per 100 matches (our differentiator)
- Gender ratio and **women's 4-week retention** per city
- Time to first match for new users; deck exhaustion rate (density health)
- Report rate per 1,000 users; median moderation time

## Risks

- **Cold start and density:** mitigated by city-by-city launches and waitlists. Dating networks are local.
- **Niche ceiling:** "people who train" is broad (walkers to marathoners), and the brand must feel welcoming to beginners, not elitist. Levels exist so beginners match with beginners.
- **Body-image toxicity:** fitness culture can tip into it. Hence no body metrics, strict photo moderation, and copy that celebrates habits, not physiques.
- **Big-app copycats:** Bumble or Tinder could add a "fitness" filter. Our defence is community (events and partners), a European trust brand and focus.

## Roadmap after the prototype

1. Ship the iOS app (the Capacitor project is in `client/ios`) to TestFlight, then the App Store. Add push notifications (APNs) and an Android build from the same code.
2. Photo verification (selfie liveness check), moderation queue and admin tools, and DSA statements of reasons and appeals.
3. MongoDB Atlas in an EU region, photos in EU object storage behind a CDN (URLs are already signed), WebSockets for chat, and email verification.
4. Payments (Plus) with EU-compliant subscription flows. Events and ticketing.
5. Opt-in integrations (Strava, Garmin, Apple Health) to auto-fill sports and schedule, never to show performance data publicly.
6. More languages; travel mode.

## Name

"Spotter" (*someone who spots you*) is the working name. Alternatives worth a trademark check:
- **Pulse**
- **Cadence**
- **Rally**
- **Endorfin**
- **Sweatheart** (playful)
- **Kinetic**
