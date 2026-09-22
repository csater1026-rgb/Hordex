// Hordex server — hosts the live dashboard, mounts the demo target, and runs
// scans, streaming every bot event to connected clients over WebSocket.
//
// REST:
//   POST /api/scan  { target, bots, authorized }  -> starts a scan
//   POST /api/stop                                  -> stops the running scan
//   GET  /api/report                                -> last finished report
//   (the bundled buggy demo target runs on its own port, PORT+1)
// WS:   /ws  -> live event stream (run:start, roster, state, act, finding, stats, run:done)
import express from "express";
import { WebSocketServer } from "ws";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Orchestrator, targetAllowed } from "./orchestrator.js";
import { createDemoApp } from "../demo-target/app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DEMO_PORT = Number(process.env.HORDEX_DEMO_PORT || PORT + 1);
const DEMO_ORIGIN = `http://localhost:${DEMO_PORT}`;

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
  let { target, bots = 6, authorized = false } = req.body || {};
  if (!target) return res.status(400).json({ error: "target is required" });
  // Convenience: a bare "demo" scans our bundled buggy target (its own origin).
  if (target === "demo") target = DEMO_ORIGIN + "/";
  const gate = targetAllowed(target);
  if (!gate.ok) return res.status(403).json({ error: gate.why });
  if (!authorized) return res.status(403).json({ error: "You must confirm you own or are authorized to test this target." });

  res.json({ ok: true, target, bots });
  const orch = new Orchestrator({
    target, bots, authorized,
    dbPath: path.join(__dirname, "..", "data", "hordex.sqlite"),
    emit: broadcast,
  });
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
