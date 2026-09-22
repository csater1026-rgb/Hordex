// Hordex runtime config — resolves the Chromium binary and reads env knobs.
//
// In this managed container Playwright's own browser download is skipped and a
// prebuilt Chromium lives at /opt/pw-browsers/chromium. Everywhere else we let
// Playwright find its own. Override with HORDEX_CHROMIUM if needed.
import fs from "node:fs";

function resolveChromium() {
  const explicit = process.env.HORDEX_CHROMIUM;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const managed = "/opt/pw-browsers/chromium";
  if (fs.existsSync(managed)) return managed;
  return undefined; // let Playwright resolve its bundled browser
}

export const CHROMIUM_PATH = resolveChromium();

// Claude API — the bot "brain". Absent key => deterministic heuristic fallback,
// so the swarm still runs (and the self-test is reproducible offline).
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
export const ANTHROPIC_MODEL = process.env.HORDEX_MODEL || "claude-sonnet-5";

// Safety rails.
export const SCAN_HARD_CAP_MS = Number(process.env.HORDEX_SCAN_CAP_MS || 120000);
export const MAX_BOTS = Number(process.env.HORDEX_MAX_BOTS || 20);
