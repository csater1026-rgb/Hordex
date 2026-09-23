// Hordex entitlements — server-side Pro verification via RevenueCat.
//
// The paywall must be enforced here, not just in the app: otherwise anyone could
// call the API directly and skip it. We ask RevenueCat's REST API whether a given
// app-user-id actually holds the Pro entitlement, using the project's v1 SECRET
// key (never shipped to the client).
//
// When no secret key is configured, the backend runs in "dev" mode: it can't
// verify, so it trusts the client's Pro claim. That keeps local development and
// the offline self-test working; production sets the key and is authoritative.
import { REVENUECAT_SECRET_KEY, REVENUECAT_ENTITLEMENT } from "./env.js";

export function proCheckConfigured() { return !!REVENUECAT_SECRET_KEY; }

// Resolve whether this request is Pro. Returns {pro, verified, reason}.
export async function isProUser(appUserId) {
  if (!REVENUECAT_SECRET_KEY) return { pro: false, verified: false, reason: "no RevenueCat secret key (dev mode)" };
  if (!appUserId) return { pro: false, verified: true, reason: "no app user id" };
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${REVENUECAT_SECRET_KEY}` },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return { pro: false, verified: false, reason: `revenuecat ${r.status}` };
    const data = await r.json();
    const ent = data?.subscriber?.entitlements?.[REVENUECAT_ENTITLEMENT];
    const active = !!ent && (!ent.expires_date || new Date(ent.expires_date).getTime() > Date.now());
    return { pro: active, verified: true, reason: active ? "entitlement active" : "entitlement not active" };
  } catch (e) {
    return { pro: false, verified: false, reason: String(e.message) };
  }
}
