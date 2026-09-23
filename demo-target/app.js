// ---------------------------------------------------------------------------
// Nimbus Notes — a deliberately broken demo web app for Hordex to test.
//
// A stand-in for the kind of "vibe-coded" app Hordex is built for: shipped fast,
// full of the everyday breakage real users hit. Every flaw is INTENTIONAL, so
// the swarm has real things to find on camera. Black-box: Hordex only ever hits
// it over HTTP, like a real visitor.
//
// Functional bugs (how the swarm catches each):
//   js-crash       "Surprise me" calls an undefined function   (pageerror)
//   failed-api     /api/stats returns 500                       (5xx response)
//   broken-form    newsletter 400s on every submit              (POST 4xx)
//   broken-link    nav points at /pricing, the route is /plans  (nav 404)
//
// No-go demonstration (the swarm must AVOID these):
//   "Delete account" link  -> matches a no-go action word, never clicked
//   "Log out" button       -> matches a no-go action word, never clicked
//   data-hordex-skip button-> explicitly marked off-limits by the developer
//   /admin (when in noGoPaths) -> never visited
//   Each avoided item routes to something destructive (a 500) that the swarm
//   therefore never triggers — proof the no-go list works.
// ---------------------------------------------------------------------------
import express from "express";

const NAV = `<nav>
  <a href="/">Home</a> ·
  <a href="/search">Search</a> ·
  <a href="/dashboard">Dashboard</a> ·
  <a href="/pricing">Pricing</a> ·        <!-- BUG: real route is /plans -> 404 -->
  <a href="/account">Account</a> ·
  <a href="/admin">Admin</a>
</nav>`;

const STYLE = `<style>
  :root{--bg:#0f1220;--card:#181c2e;--ink:#e9ecf5;--mut:#9aa3c0;--accent:#7c5cff;--line:#2a3050}
  *{box-sizing:border-box} body{margin:0;font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}
  header{padding:14px 22px;border-bottom:1px solid var(--line);background:#12162a;position:sticky;top:0}
  nav a{color:var(--mut);text-decoration:none} nav a:hover{color:var(--ink)}
  main{max-width:820px;margin:0 auto;padding:24px 20px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin:16px 0}
  h1{font-size:25px;margin:.2em 0} h2{font-size:18px;margin:.2em 0 .6em}
  input{background:#0c0f1c;color:var(--ink);border:1px solid var(--line);border-radius:9px;padding:9px 12px;width:100%}
  button{font:inherit;background:var(--accent);color:#fff;border:0;border-radius:9px;padding:10px 16px;cursor:pointer;font-weight:600}
  button.ghost{background:#242a45;color:var(--ink)} button.danger{background:#5a2130;color:#ff9fb0}
  .row{display:flex;gap:10px;flex-wrap:wrap}.row>*{flex:1;min-width:160px}
  .muted{color:var(--mut);font-size:13px} a.btnlink{color:#ff9fb0;text-decoration:none;font-weight:600}
</style>`;

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${STYLE}</head>
<body><header>☁ Nimbus Notes ${NAV}</header><main>${body}</main></body></html>`;

const HOME = page("Nimbus Notes — capture everything", `
  <div class="card">
    <h1>Capture everything. Find it later.</h1>
    <p class="muted">The fastest place to jot, clip and organize your notes.</p>
    <div class="row">
      <button id="try">Try the demo</button>
      <button class="ghost" id="surprise">Surprise me ✨</button>   <!-- BUG: js-crash -->
    </div>
    <p id="out"></p>
  </div>
  <div class="card">
    <h2>Search your notes</h2>
    <form action="/search" method="get"><div class="row"><input name="q" placeholder="Search…" aria-label="Search"><button>Search</button></div></form>
  </div>
  <div class="card">
    <h2>Get the newsletter</h2>
    <form id="news"><div class="row"><input name="email" type="email" placeholder="you@email.com" aria-label="Email"><button>Subscribe</button></div></form>
    <p class="muted" id="newsmsg"></p>
  </div>
  <script>
    document.getElementById("try").onclick = () => document.getElementById("out").textContent = "Loaded 3 sample notes ✓";
    document.getElementById("surprise").onclick = () => { renderSurprise(); };   // BUG: undefined fn -> pageerror
    document.getElementById("news").onsubmit = async (e) => {
      e.preventDefault();
      const r = await fetch("/api/subscribe", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:e.target.email.value})});
      document.getElementById("newsmsg").textContent = r.ok ? "Subscribed!" : "Something went wrong ("+r.status+").";
    };
  </script>`);

const DASHBOARD = page("Dashboard — Nimbus Notes", `
  <div class="card"><h1>Your dashboard</h1><p class="muted">Welcome back.</p></div>
  <div class="card"><h2>Usage</h2><p id="stats" class="muted">Loading stats…</p></div>
  <script>
    fetch("/api/stats").then(r=>r.json()).then(s=>{document.getElementById("stats").textContent = s.notes+" notes";})
      .catch(()=>{document.getElementById("stats").textContent = "Couldn't load stats.";});   // BUG: /api/stats 500
  </script>`);

const ACCOUNT = page("Account — Nimbus Notes", `
  <div class="card"><h1>Account</h1><p class="muted">Manage your Nimbus Notes account.</p>
    <div class="row">
      <button class="ghost" id="save">Save changes</button>
      <button class="ghost" id="logout">Log out</button>                 <!-- NO-GO: "log out" -->
    </div>
  </div>
  <div class="card">
    <h2>Danger zone</h2>
    <p class="muted">Deleting your account is permanent.</p>
    <a class="btnlink" href="/account/delete">Delete account</a>          <!-- NO-GO: "delete account" -->
    <div style="margin-top:10px" data-hordex-skip>
      <button class="danger" id="wipe">Wipe all notes</button>            <!-- NO-GO: data-hordex-skip -->
    </div>
  </div>
  <script>
    document.getElementById("save").onclick = () => alert("Saved");
    document.getElementById("logout").onclick = () => { location.href = "/account/logout"; };
    document.getElementById("wipe").onclick = () => { location.href = "/account/wipe"; };
  </script>`);

const SEARCH = (q) => page("Search — Nimbus Notes", `
  <div class="card"><h1>Search</h1>
    <form action="/search" method="get"><div class="row"><input name="q" value="${String(q).replace(/[<>"]/g, "")}" aria-label="Search"><button>Search</button></div></form>
    <p class="muted">No notes matched your search.</p>
  </div>`);

export function createDemoApp() {
  const app = express();
  app.use(express.json());

  app.get("/", (_q, res) => res.type("html").send(HOME));
  app.get("/dashboard", (_q, res) => res.type("html").send(DASHBOARD));
  app.get("/account", (_q, res) => res.type("html").send(ACCOUNT));
  app.get("/search", (req, res) => res.type("html").send(SEARCH(req.query.q || "")));
  app.get("/plans", (_q, res) => res.type("html").send(page("Plans", `<div class="card"><h1>Plans</h1><p>Free / Pro</p></div>`)));
  app.get("/admin", (_q, res) => res.type("html").send(page("Admin", `<div class="card"><h1>Admin</h1><p>Internal tools.</p></div>`)));

  // Destructive routes the swarm must never reach (guarded by the no-go list).
  // They 500 on purpose: if the swarm ever hit one, it would show up as a bug.
  app.get(["/account/delete", "/account/logout", "/account/wipe"], (_q, res) =>
    res.status(500).send("This should never have been reached by an automated test."));

  app.get("/api/stats", (_q, res) => res.status(500).json({ error: "stats service unavailable" }));   // BUG: failed-api
  app.post("/api/subscribe", (_q, res) => res.status(400).json({ error: "subscription service misconfigured" })); // BUG: broken-form

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] || 4100);
  createDemoApp().listen(port, () => console.log(`Nimbus Notes demo target on http://localhost:${port}`));
}
