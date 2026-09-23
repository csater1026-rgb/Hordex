// Hordex server — hosts the live dashboard, mounts the demo target, and runs
// scans, streaming every bot event to connected clients over WebSocket.
//
// REST:
//   POST /api/scan  { target, bots, authorized, scope, appUserId, pro }  -> scan
//   POST /api/stop                                  -> stops the running scan
//   GET  /api/report                                -> last finished report
//   (the bundled buggy demo target runs on its own port, PORT+1)
// WS:   /ws  -> live event stream (run:start, roster, state, act, finding, skip, stats, run:done)
import express from "express";
import { WebSocketServer } from "ws";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Orchestrator, targetAllowed } from "./orchestrator.js";
import { Memory } from "./memory.js";
import { isProUser, proCheckConfigured } from "./entitlements.js";
import { FREE_BOTS, MAX_BOTS } from "./env.js";
import { createDemoApp } from "../demo-target/app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DEMO_PORT = Number(process.env.HORDEX_DEMO_PORT || PORT + 1);
const DEMO_ORIGIN = `http://localhost:${DEMO_PORT}`;
const DB_PATH = path.join(__dirname, "..", "data", "hordex.sqlite");
const OPERATOR_TOKEN = process.env.HORDEX_OPERATOR_TOKEN || "";
// Long-lived handle for the one-time free-scan ledger (shares the DB file).
const ledger = new Memory(DB_PATH);

const app = express();
app.use(express.json());

// CORS — the mobile app (a Capacitor webview on a different origin) calls this
// backend directly. The API exposes no secrets and is gated per-request by the
// ownership confirmation, so a permissive policy is fine here.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "..", "public")));

// Health check for deploy platforms (Railway / Render / Fly).
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "hordex" }));

// Run the deliberately-buggy demo target as its OWN origin, so its root-relative
// links (/search, /dashboard, …) resolve correctly and the swarm crawls it as a
// true black-box target — just like a real external app.
createDemoApp().listen(DEMO_PORT, () => console.log(`Demo target on ${DEMO_ORIGIN}`));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set();
wss.on("connection", (ws) => { clients.add(ws); ws.on("close", () => clients.delete(ws)); });
function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const ws of clients) { if (ws.readyState === 1) ws.send(s); }
}

let current = null; // the running Orchestrator
let lastReport = null;

app.post("/api/scan", async (req, res) => {
  if (current) return res.status(409).json({ error: "A scan is already running." });
  let { target, bots, authorized = false, scope = {}, appUserId = "", operatorToken = "", pro: proClaim = false } = req.body || {};
  if (!target) return res.status(400).json({ error: "target is required" });
  if (target === "demo") target = DEMO_ORIGIN + "/"; // scan the bundled buggy target
  const gate = targetAllowed(target);
  if (!gate.ok) return res.status(403).json({ error: gate.why });
  if (!authorized) return res.status(403).json({ error: "You must confirm you own or are authorized to test this target." });

  // --- Resolve the plan (server is authoritative when RevenueCat is configured) ---
  appUserId = String(appUserId || "").slice(0, 128);
  const operator = OPERATOR_TOKEN && operatorToken === OPERATOR_TOKEN;
  let pro, planReason;
  if (operator) { pro = true; planReason = "operator"; }
  else if (!proCheckConfigured()) { pro = !!proClaim; planReason = "dev (RevenueCat not configured)"; }
  else { const c = await isProUser(appUserId); pro = c.pro; planReason = c.reason; }

  // --- Enforce Free = one demo, Pro = unlimited + bigger swarm ---
  let botCount;
  if (pro) {
    botCount = Math.max(1, Math.min(MAX_BOTS, (bots | 0) || FREE_BOTS));
  } else {
    const uid = appUserId || ("ip-" + (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "anon"));
    if (!operator && ledger.freeScanUsed(uid)) {
      return res.status(402).json({ error: "Your free demo scan has been used. Unlock Pro for unlimited scans and bigger swarms.", code: "free_used" });
    }
    botCount = Math.max(1, Math.min(FREE_BOTS, (bots | 0) || FREE_BOTS));
    ledger.markFreeScan(uid);
  }

  res.json({ ok: true, target, bots: botCount, plan: pro ? "pro" : "free", planReason });
  const orch = new Orchestrator({ target, bots: botCount, authorized, scope, dbPath: DB_PATH, emit: broadcast });
  current = orch;
  try { lastReport = await orch.run(); }
  catch (e) { broadcast({ t: "run:error", error: String(e.message) }); }
  finally { current = null; }
});

app.post("/api/stop", (_req, res) => {
  if (!current) return res.status(404).json({ error: "No scan running." });
  current.stop();
  res.json({ ok: true });
});

app.get("/api/report", (_req, res) => {
  if (!lastReport) return res.status(404).json({ error: "No report yet." });
  res.json(lastReport);
});

server.listen(PORT, () => {
  console.log(`Hordex on http://localhost:${PORT}  ·  demo target at /demo  ·  dashboard at /`);
});
