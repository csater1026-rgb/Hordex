# Shipaton 2026 — Next Gen submission guide (Hordex)

Everything you need to submit Hordex to the **Next Gen Award** (student track).
Next Gen waives the store listing: you submit a **demo video + this open-source
repo**, with **no paid Apple/Google account**.

## The requirements, and how Hordex meets each

| Requirement | Status |
|---|---|
| A mobile app (iOS/iPadOS/macOS/**Android**) | ✅ Android app (`app/`, Capacitor) |
| RevenueCat SDK powering ≥1 in-app purchase | ✅ Pro unlock via RevenueCat **Test Store** (`paywall/`) |
| Open-source code | ✅ this repo |
| Public demo video ≤2 min (real device) | ⬜ you record it (script below) |
| Student eligibility | ⬜ you confirm (see below) |
| Free trial **or** promo code for judges | ✅ Test Store sandbox purchase is free; note it in the submission |

## Before you record

1. **Deploy the backend** → `DEPLOY.md`. Get your `https://…` URL.
2. **Set up RevenueCat Test Store** → `paywall/revenuecat-setup.md`. Get the
   `test_…` key.
3. **Configure the app** → put both into `app/www/config.js`.
4. **Build & run on a device/emulator** → `app/README.md`.
5. Smoke-test: Settings → backend URL → scan `demo` (or your own URL) → watch
   findings → **Unlock Pro** → confirm the sandbox purchase flips it to PRO.

## Demo video script (~110 seconds)

Keep it to essential footage — judges may stop at 2:00.

1. **0:00–0:15 — Hook.** "Apps built fast with AI ship with the same bugs and
   security holes. Hordex sends a swarm of AI bots through your app like
   thousands of real users — before your real users hit the problems."
2. **0:15–0:35 — Start a scan.** On the phone: paste a target, tick "I own
   this", **Release the swarm**. Show bots appearing.
3. **0:35–1:05 — The swarm working (the wow).** Bots moving through the app,
   the live feed scrolling, findings streaming in — call out a couple:
   "exposed secret key… IDOR… a form that silently fails."
4. **1:05–1:25 — The paywall (RevenueCat).** Tap **Unlock Pro** → the paywall →
   complete the purchase → the badge flips to **PRO**, swarm cap jumps to 20,
   the full security sweep + report export appear. Say "in-app purchase powered
   by RevenueCat."
5. **1:25–1:50 — The payoff.** Open a finding: plain-language explanation + the
   fix. Export the report. "Functional bugs and security holes, in one sweep,
   built for apps made with AI tools."

Record on a real device or emulator screen capture. Upload to YouTube/Vimeo,
**public**. No copyrighted music.

## Assets to attach on Devpost

- **App icon 1024×1024** — a swarm/horde mark on the deep-indigo brand
  (`#7c5cff` accent). Not yet in the repo — create one (Figma/any tool).
- **Screenshot 1179×2556, no device frame** — a portrait capture of the app
  mid-scan with findings visible.
- **Text description** — adapt `README.md`'s intro.
- **Repo link** — this GitHub repo (public).
- **Video link** — your YouTube/Vimeo URL.
- **Judge access** — note that Pro is unlockable via the RevenueCat Test Store
  sandbox purchase (free, no card), so judges can test all premium features.

## Student eligibility

Next Gen is for active students. Confirm what proof they accept (the rules
mention a `.edu` / equivalent email "or equivalent") and use an eligible
account. **If you're under 18**, a parent/guardian must consent and agree to
the rules on your behalf (rules §3). Sort this out before the deadline.

## The honest pitch (say this, don't oversell)

Hordex gives far broader, faster coverage than manual QA by combining functional
**and** security testing in one black-box sweep, built specifically for
vibe-coded apps. It does **not** claim to "test everything" — exhaustive testing
is impossible for any real app. That honesty plays well with technical judges.

---

Deadline: **Sep 30, 2026** (submissions close end of day). Give yourself a buffer
for the video + Devpost form.
