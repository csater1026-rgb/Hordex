# Deploying the Hordex swarm backend

The swarm runs a pool of headless Chromium browsers, so it needs a normal
long-running container with a browser — not a serverless function. Any of
Railway, Render, or Fly.io works; a `Dockerfile` and `render.yaml` are included.

Pick **one** of the following. You want an instance with at least **~1 GB RAM**
(headless Chromium is memory-hungry; the free/hobby tiers usually suffice for a
demo swarm of a handful of bots).

## Railway (fastest)

1. Push this repo to GitHub (done).
2. On [railway.app](https://railway.app): **New Project → Deploy from GitHub repo**
   → pick `Hordex`.
3. Railway detects the `Dockerfile` and builds it. No extra config needed.
4. (Optional) **Variables → New Variable** → `ANTHROPIC_API_KEY` = your key, to
   have Claude drive the bots. Without it, the heuristic brain runs the swarm.
5. When it's live, open **Settings → Networking → Generate Domain**. Copy that
   `https://…up.railway.app` URL — that's your backend URL for the app.

## Render

1. On [render.com](https://render.com): **New → Web Service → Build from a repo**
   → pick `Hordex`. It reads `render.yaml` (Docker runtime, health check at
   `/api/health`).
2. Optionally add `ANTHROPIC_API_KEY` under **Environment**.
3. Copy the service's `https://…onrender.com` URL.

## Fly.io

`fly launch` (it detects the Dockerfile) → `fly deploy`. Give the machine ≥1 GB
RAM (`fly scale memory 1024`). Use the `https://…fly.dev` URL.

## After deploying

- Sanity check: open `https://<your-url>/` — you'll see the **web dashboard**.
  Tick "I own this", target `demo`, and release the swarm against the bundled
  buggy app to confirm everything works end-to-end in the cloud.
- Health: `GET /api/health` → `{"ok":true,...}`.
- Put that same `https://<your-url>` into the **mobile app's Settings** (or
  `app/www/config.js` `BACKEND_URL`) so the phone app drives this backend.

## Notes

- The bundled demo target runs **inside** the container on `PORT+1`, bound to
  localhost, and is reachable only via the `demo` shortcut — it is never exposed
  publicly.
- The authorization gate blocks public targets unless `HORDEX_ALLOW_PUBLIC=1`.
  For a hosted service you actually operate, you'd set that and enforce
  ownership/verification per user; for the hackathon demo, leave it off and scan
  `demo` or your own dev URLs.
- API keys (if you set `ANTHROPIC_API_KEY`) stay server-side only — the browser
  and the mobile app never see them.
