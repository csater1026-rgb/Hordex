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
// Crawl bounds so a large site can't grow the frontier without limit.
export const MAX_PAGES = Number(process.env.HORDEX_MAX_PAGES || 80);
export const MAX_DEPTH = Number(process.env.HORDEX_MAX_DEPTH || 6);

// Free tier: one demo scan, this many bots. Pro lifts both.
export const FREE_BOTS = Number(process.env.HORDEX_FREE_BOTS || 5);
// RevenueCat server-side entitlement check (v1 secret key). When unset, the
// backend runs "unverified" (dev/demo) and trusts the client's Pro claim.
export const REVENUECAT_SECRET_KEY = process.env.REVENUECAT_SECRET_KEY || "";
export const REVENUECAT_ENTITLEMENT = process.env.HORDEX_ENTITLEMENT || "pro";
