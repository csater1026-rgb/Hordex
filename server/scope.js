// Hordex scope — the "no-go" list that keeps the swarm safe on a real app.
//
// Once bots act like real users, they'll also do the damaging things real users
// can do: delete an account, pay, send invites, log themselves out. Scope is how
// you fence that off. It is enforced inside the bots (blocked pages never enter
// the queue; blocked controls are removed before the bot decides what to do), so
// the swarm can't wander into them. Scope is a safety feature — never paywalled.
//
// Three levers:
//   noGoPaths   — URL path prefixes the bots never visit (e.g. "/admin", "/billing")
//   noGoActions — words in a button/link that mean "don't click" (defaults below)
//   includeOnly — if set, bots ONLY visit paths starting with one of these
// Plus a developer can tag any element `data-hordex-skip` in their own code.

// Genuinely destructive, irreversible, or money-spending actions. The bias is
// safety: it's fine to skip something harmless, but never to click something
// that deletes or charges. We deliberately leave out common SAFE verbs
// (subscribe, send, save, submit, search) so normal flows still get tested —
// users can add their own words for anything specific to their app.
export const DEFAULT_NO_GO_ACTIONS = [
  "delete", "destroy", "erase", "wipe",
  "log out", "logout", "sign out", "log off",
  "pay", "purchase", "buy now", "checkout", "place order", "confirm order", "complete purchase",
  "unsubscribe", "cancel subscription", "cancel plan", "cancel membership",
  "deactivate", "close account", "delete account", "remove account",
  "transfer funds", "withdraw",
];

export function normalizeScope(s = {}) {
  const clean = (arr) => (Array.isArray(arr) ? arr : [])
    .map((x) => String(x || "").trim().toLowerCase()).filter(Boolean);
  // The destructive defaults ALWAYS apply; user-supplied words are additive, so
  // the delete/pay/log-out guards can never be accidentally switched off.
  return {
    noGoPaths: clean(s.noGoPaths),
    noGoActions: [...new Set([...DEFAULT_NO_GO_ACTIONS, ...clean(s.noGoActions)])],
    includeOnly: clean(s.includeOnly),
  };
}

// Is this URL path off-limits? (blocked prefix, or outside an include-only list)
export function pathBlocked(pathname, scope) {
  const p = String(pathname || "/").toLowerCase();
  if (scope.includeOnly.length && !scope.includeOnly.some((inc) => p.startsWith(inc))) return true;
  return scope.noGoPaths.some((ng) => ng && p.startsWith(ng));
}

// Does this button/link text (or href) name a no-go action?
export function actionBlocked(text, scope) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  return scope.noGoActions.some((a) => a && t.includes(a));
}

// A short reason string for the live feed / report, or "" if allowed.
export function blockReason(pathname, text, scope) {
  if (pathBlocked(pathname, scope)) {
    if (scope.includeOnly.length) return "outside the allowed scope";
    return "no-go page";
  }
  if (actionBlocked(text, scope)) return "no-go action";
  return "";
}
