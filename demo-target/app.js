// ---------------------------------------------------------------------------
// Buggd — a deliberately broken demo web app for Hordex to hunt through.
//
// This is a stand-in for the kind of "vibe-coded" app Hordex is built to test:
// shipped fast, full of the exact recurring mistakes AI-built apps make. Every
// flaw below is INTENTIONAL and documented, so the swarm has real things to
// find on camera. It is black-box: Hordex only ever hits it over HTTP, the same
// way a real visitor (or attacker) would.
//
// Planted issues (id => how the swarm catches it):
//   SEC exposed-env      GET /.env leaks secrets            (path probe)
//   SEC secret-in-js     live API keys inlined in the page  (body scan)
//   SEC idor             GET /api/users/:id, no auth        (id fuzzing)
//   SEC no-rate-limit    POST /api/login never throttles    (repeat probe)
//   SEC reflected-xss    /search?q= echoed unescaped        (payload + reflect)
//   SEC token-in-storage JWT dropped into localStorage      (storage scan)
//   SEC missing-headers  no CSP / XFO / HSTS                (header scan)
//   SEC client-only-gate "Pro" enforced only in JS          (DOM scan)
//   FUNC broken-link     nav points at a 404                (nav + status)
//   FUNC js-crash        button calls an undefined function (pageerror)
//   FUNC failed-api      /api/stats returns 500             (response status)
//   FUNC broken-form     newsletter 400s on everything      (response status)
// ---------------------------------------------------------------------------
import express from "express";

// Fake, non-functional demo "secrets". They're assembled from fragments so this
// SOURCE file contains no contiguous provider-key literal (GitHub push
// protection would block the repo otherwise) — while the SERVED page/response
// still shows the full strings for the swarm to detect. These are planted bugs.
const DEMO = {
  stripe: "sk_" + "live_51QR001HordexDEMOxxYc7bBpN2mZ0kQel8fJ9aQwZ3rTvU",
  google: "AIza" + "SyD-DEMO-9fJ2kL0pQwErTyUiOpAsDfGhJkLzX",
  serviceRole: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." + "demo.service_role",
};

const PAGE = /* html */ `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nimbus Notes — capture everything</title>
<style>
  :root{--bg:#0f1220;--card:#181c2e;--ink:#e9ecf5;--mut:#9aa3c0;--accent:#7c5cff;--line:#2a3050}
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}
  header{display:flex;align-items:center;gap:16px;padding:14px 22px;border-bottom:1px solid var(--line);background:#12162a;position:sticky;top:0}
  header b{font-size:18px} nav{display:flex;gap:16px;margin-left:auto;flex-wrap:wrap}
  nav a{color:var(--mut);text-decoration:none} nav a:hover{color:var(--ink)}
  main{max-width:840px;margin:0 auto;padding:26px 20px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin:16px 0}
  h1{font-size:26px;margin:.2em 0} h2{font-size:18px;margin:.2em 0 .6em}
  input,button{font:inherit;border-radius:9px;border:1px solid var(--line)}
  input{background:#0c0f1c;color:var(--ink);padding:9px 12px;width:100%}
  button{background:var(--accent);color:#fff;border:0;padding:10px 16px;cursor:pointer;font-weight:600}
  button.ghost{background:#242a45;color:var(--ink)}
  .row{display:flex;gap:10px;flex-wrap:wrap} .row>*{flex:1;min-width:160px}
  .muted{color:var(--mut);font-size:13px} .pill{display:inline-block;padding:2px 9px;border-radius:99px;background:#242a45;font-size:12px}
  #out{white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px;color:#b9c2e6}
</style></head>
<body>
<header>
  <b>☁ Nimbus Notes</b>
  <nav>
    <a href="/">Home</a>
    <a href="/search">Search</a>
    <a href="/dashboard">Dashboard</a>
    <a href="/pricing">Pricing</a>            <!-- BUG: real route is /plans -> 404 -->
    <a href="/login">Log in</a>
  </nav>
</header>
<main>
  <div class="card">
    <h1>Capture everything. Find it later.</h1>
    <p class="muted">The fastest place to jot, clip and organize your notes. Free to start.</p>
    <div class="row">
      <button id="try">Try the demo</button>
      <button class="ghost" id="surprise">Surprise me ✨</button>   <!-- BUG: js-crash -->
    </div>
    <p id="out"></p>
  </div>

  <div class="card">
    <h2>Search your notes</h2>
    <form action="/search" method="get">
      <div class="row"><input name="q" placeholder="Search…" aria-label="Search">
      <button>Search</button></div>
    </form>
  </div>

  <div class="card">
    <h2>Get the newsletter</h2>
    <form id="news">
      <div class="row"><input name="email" type="email" placeholder="you@email.com" aria-label="Email">
      <button>Subscribe</button></div>       <!-- BUG: broken-form, /api/subscribe 400s -->
    </form>
    <p class="muted" id="newsmsg"></p>
  </div>
</main>

<script>
  // BUG (secret-in-js): real-looking secret keys shipped to the browser.
  const CONFIG = {
    STRIPE_KEY: "${DEMO.stripe}",
    GOOGLE_API_KEY: "${DEMO.google}",
    SUPABASE_SERVICE_ROLE: "${DEMO.serviceRole}"
  };
  // BUG (token-in-storage): auth token persisted where any script/XSS can read it.
  try { localStorage.setItem("nimbus_jwt", "eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOjF9.DEMOsig"); } catch(e){}
  // BUG (client-only-gate): "Pro" unlocked purely client-side.
  window.isPro = false;
  function unlockPro(){ if (window.isPro) document.body.dataset.pro = "1"; }
  unlockPro();

  document.getElementById("try").onclick = () => {
    document.getElementById("out").textContent = "Loaded 3 sample notes ✓";
  };
  // BUG (js-crash): calls a function that doesn't exist -> uncaught ReferenceError.
  document.getElementById("surprise").onclick = () => { renderSurprise(); };

  // BUG (broken-form): every subscribe attempt fails server-side.
  document.getElementById("news").onsubmit = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const r = await fetch("/api/subscribe", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email})});
    document.getElementById("newsmsg").textContent = r.ok ? "Subscribed!" : "Something went wrong ("+r.status+").";
  };
</script>
</body></html>`;

const DASHBOARD = /* html */ `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard — Nimbus Notes</title>
<style>body{margin:0;font:15px system-ui,sans-serif;background:#0f1220;color:#e9ecf5}
main{max-width:760px;margin:0 auto;padding:26px 20px}.card{background:#181c2e;border:1px solid #2a3050;border-radius:14px;padding:20px;margin:16px 0}
button{font:inherit;background:#7c5cff;color:#fff;border:0;border-radius:9px;padding:10px 16px;cursor:pointer}
[data-pro] #prodata{display:block}#prodata{display:none}.muted{color:#9aa3c0}</style></head>
<body><main>
  <div class="card"><h1>Your dashboard</h1><p class="muted" id="who">Loading…</p></div>
  <div class="card">
    <h2>Usage</h2><p id="stats" class="muted">Loading stats…</p>   <!-- BUG: failed-api /api/stats 500 -->
  </div>
  <div class="card">
    <h2>Pro analytics <span class="muted">(paid)</span></h2>
    <button id="pro">Unlock Pro</button>
    <div id="prodata"><p>📈 Secret Pro-only analytics for everyone who flips a boolean.</p></div>
  </div>
<script>
  try{ document.getElementById("who").textContent = "Signed in — token: " + (localStorage.getItem("nimbus_jwt")||"none"); }catch(e){}
  // BUG (client-only-gate): clicking just sets a flag the client checks itself.
  document.getElementById("pro").onclick = () => { window.isPro = true; document.body.dataset.pro = "1"; };
  fetch("/api/stats").then(r=>r.json()).then(s=>{document.getElementById("stats").textContent = s.notes+" notes";})
    .catch(()=>{document.getElementById("stats").textContent = "Couldn't load stats.";});
</script></main></body></html>`;

function searchPage(q) {
  // BUG (reflected-xss): user input echoed into HTML with no escaping.
  return /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Search — Nimbus Notes</title>
<style>body{margin:0;font:15px system-ui,sans-serif;background:#0f1220;color:#e9ecf5}
main{max-width:760px;margin:0 auto;padding:26px 20px}.card{background:#181c2e;border:1px solid #2a3050;border-radius:14px;padding:20px}
input{background:#0c0f1c;color:#e9ecf5;border:1px solid #2a3050;border-radius:9px;padding:9px 12px;width:70%}
button{font:inherit;background:#7c5cff;color:#fff;border:0;border-radius:9px;padding:10px 16px}</style></head>
<body><main><div class="card"><h1>Search</h1>
<form action="/search" method="get"><input name="q" value="${q}" aria-label="Search"> <button>Search</button></form>
<p>Results for: ${q}</p>
<p class="muted">No notes matched your search.</p>
</div></main></body></html>`;
}

const LOGIN = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Log in — Nimbus Notes</title>
<style>body{margin:0;font:15px system-ui,sans-serif;background:#0f1220;color:#e9ecf5}
main{max-width:420px;margin:40px auto;padding:20px}.card{background:#181c2e;border:1px solid #2a3050;border-radius:14px;padding:22px}
input{background:#0c0f1c;color:#e9ecf5;border:1px solid #2a3050;border-radius:9px;padding:10px 12px;width:100%;margin:6px 0}
button{font:inherit;background:#7c5cff;color:#fff;border:0;border-radius:9px;padding:11px 16px;width:100%;margin-top:8px}</style></head>
<body><main><div class="card"><h1>Log in</h1>
<form id="f"><input name="email" type="email" placeholder="Email"><input name="password" type="password" placeholder="Password"><button>Log in</button></form>
<p class="muted" id="m"></p></div></main>
<script>document.getElementById("f").onsubmit=async e=>{e.preventDefault();
const b={email:e.target.email.value,password:e.target.password.value};
const r=await fetch("/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)});
const j=await r.json();document.getElementById("m").textContent=j.ok?"Welcome back!":"Invalid credentials";};</script>
</body></html>`;

// Fake user records — the IDOR endpoint hands these out to anyone.
const USERS = {
  1: { id: 1, name: "Demo User", email: "demo@nimbus.app", plan: "free" },
  2: { id: 2, name: "Ava Lin", email: "ava@nimbus.app", plan: "pro", phone: "+1-555-0104" },
  3: { id: 3, name: "Site Admin", email: "admin@nimbus.app", plan: "admin", ssn: "REDACTED-000-00-0000" },
};

export function createDemoApp() {
  const app = express();
  app.use(express.json());

  // Deliberately DO NOT set security headers (CSP / X-Frame-Options / HSTS).
  app.get("/", (_req, res) => res.type("html").send(PAGE));
  app.get("/dashboard", (_req, res) => res.type("html").send(DASHBOARD));
  app.get("/login", (_req, res) => res.type("html").send(LOGIN));
  app.get("/plans", (_req, res) => res.type("html").send(`<h1>Plans</h1><p>Free / Pro</p>`));
  app.get("/search", (req, res) => res.type("html").send(searchPage(String(req.query.q || ""))));

  // BUG (exposed-env): secrets served straight off the web root.
  app.get("/.env", (_req, res) =>
    res.type("text/plain").send(
      "STRIPE_SECRET=" + DEMO.stripe + "\n" +
      "DATABASE_URL=postgres://admin:hunter2@db.nimbus.internal:5432/prod\n" +
      "JWT_SECRET=supersecret\n"));

  // BUG (idor): any id, no auth, returns full PII.
  app.get("/api/users/:id", (req, res) => {
    const u = USERS[req.params.id];
    if (!u) return res.status(404).json({ error: "not found" });
    res.json(u);
  });

  // BUG (no-rate-limit): unlimited attempts, always answers.
  app.post("/api/login", (req, res) => {
    const ok = req.body && req.body.email === "demo@nimbus.app" && req.body.password === "password";
    res.json({ ok: !!ok });
  });

  // BUG (failed-api): dashboard stats always 500.
  app.get("/api/stats", (_req, res) => res.status(500).json({ error: "stats service unavailable" }));

  // BUG (broken-form): subscribe always rejects.
  app.post("/api/subscribe", (_req, res) => res.status(400).json({ error: "subscription service misconfigured" }));

  return app;
}

// Allow running the demo target on its own: `node demo-target/app.js [port]`
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] || 4100);
  createDemoApp().listen(port, () => console.log(`Buggd demo target on http://localhost:${port}`));
}
