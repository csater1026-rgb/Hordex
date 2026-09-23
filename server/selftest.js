// Hordex self-test — proof the swarm works, offline and headless.
//
// Boots the deliberately-buggy demo target (see demo-target/app.js), runs the
// swarm against it, and asserts:
//   • every planted FUNCTIONAL bug is found,
//   • the no-go scope is honoured — destructive routes are never triggered and
//     /admin is never visited,
//   • findings dedupe, and memory carries across runs (before-vs-after).
// Exit code 0 = all good; non-zero = a regression.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createDemoApp } from "../demo-target/app.js";
import { Orchestrator } from "./orchestrator.js";

const EXPECT_FUNCTIONAL = ["JavaScript error", "Server error", "Broken flow", "Broken link"];
const DESTRUCTIVE = ["/account/delete", "/account/logout", "/account/wipe"]; // must never be hit
const SCOPE = { noGoPaths: ["/admin"] }; // actions (delete/log out) come from defaults

function startDemo() {
  return new Promise((resolve) => {
    const server = http.createServer(createDemoApp());
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  const { server, port } = await startDemo();
  const target = `http://127.0.0.1:${port}/`;
  const dbPath = path.join(os.tmpdir(), `hordex-selftest-${Date.now()}.sqlite`);

  console.log(`▶ Scanning demo target ${target} with the swarm…\n`);
  const t0 = Date.now();
  const report = await new Orchestrator({ target, bots: 6, authorized: true, dbPath, scope: SCOPE }).run();
  const ms = Date.now() - t0;

  const foundCats = new Set(report.findings.map((f) => f.category));
  const s = report.summary;
  console.log(`Explored ${s.statesExplored} pages · ${s.findings} findings · ${s.skipped} skipped (no-go) in ${ms}ms\n`);
  for (const f of report.findings) console.log(`  [${f.severityLabel.padEnd(8)}] ${f.title}  ·  ${f.category}  ·  ${f.foundBy}/${f.persona}`);
  console.log("\n  Skipped by scope:");
  for (const k of report.skipped) console.log(`   🚫 ${k.label || k.url}  ·  ${k.reason}`);

  // --- Assertions ---
  const missFn = EXPECT_FUNCTIONAL.filter((c) => !foundCats.has(c));
  const hitDestructive = report.findings.filter((f) => DESTRUCTIVE.some((d) => (f.url || "").includes(d)));
  const visitedAdmin = report.statesExplored.filter((st) => (st.url || "").replace(/\/$/, "").endsWith("/admin"));
  const skippedDelete = report.skipped.some((k) => /delete account/i.test(k.label || ""));
  const skippedLogout = report.skipped.some((k) => /log out/i.test(k.label || ""));
  const skippedTagged = report.skipped.some((k) => /data-hordex-skip/i.test(k.reason || ""));
  const skippedAdmin = report.skipped.some((k) => (k.url || "").includes("/admin"));
  const sigs = report.findings.map((f) => f.category + "|" + f.url);
  const deduped = sigs.length === new Set(sigs).size;

  // Trained memory: a second scan must know the origin from the first.
  const ev2 = [];
  await new Orchestrator({ target, bots: 4, authorized: true, dbPath, scope: SCOPE, emit: (e) => ev2.push(e) }).run();
  const learned = ev2.find((e) => e.t === "run:start")?.prior?.states > 0;

  server.close();
  for (const ext of ["", "-wal", "-shm"]) { try { fs.rmSync(dbPath + ext, { force: true }); } catch {} }

  const checks = [
    [missFn.length === 0, `functional bugs found${missFn.length ? " — MISSING: " + missFn.join(", ") : ""}`],
    [hitDestructive.length === 0, `no destructive route triggered${hitDestructive.length ? " — HIT: " + hitDestructive.map((f) => f.url).join(", ") : ""}`],
    [visitedAdmin.length === 0, `no-go page /admin never visited`],
    [skippedDelete, `"Delete account" link skipped (no-go action)`],
    [skippedLogout, `"Log out" button skipped (no-go action)`],
    [skippedTagged, `data-hordex-skip element skipped`],
    [skippedAdmin, `/admin link skipped (no-go page)`],
    [deduped, `findings deduped by shared memory`],
    [learned, `trained memory carried into re-scan`],
  ];
  console.log("\n── Checks ──");
  for (const [ok, label] of checks) console.log(`${ok ? "✓" : "✗"} ${label}`);

  const allOk = checks.every(([ok]) => ok);
  console.log(`\n${allOk ? "✅ PASS" : "❌ FAIL"} — Hordex swarm self-test\n`);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error("self-test crashed:", e); process.exit(1); });
