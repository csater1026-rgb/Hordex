// Hordex recon — the AI pre-scan.
//
// Before the swarm launches, Claude reads the app's entry page and works out
// what the app is and the main things a real user would come to DO. Those goals
// are then handed to the bots so they test with intent (complete a journey)
// instead of only clicking around — which is what surfaces broken multi-step
// flows, not just broken individual controls.
//
// Uses the same raw Messages API shape as brain.js (no SDK dependency in this
// zero-build server). Returns null when no ANTHROPIC_API_KEY is set, so the
// swarm still runs (just without goal-steering) and the offline self-test is
// unaffected.
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } from "./env.js";

export async function reconApp(info) {
  if (!ANTHROPIC_API_KEY) return null;
  const sys =
    "You are planning user-simulation testing of a web app the user OWNS. From its landing page, infer what the app is and the main things a REAL user would come to accomplish. " +
    'Reply ONLY with JSON: {"summary":"<one sentence>","appType":"<short category>","goals":[{"title":"<imperative user goal>","hint":"<how a user would attempt it>"}]}. ' +
    "Give 3–6 goals, most important first. Goals are ordinary user journeys (e.g. sign up, create and save an item, search, upgrade) — never destructive actions.";
  const user = JSON.stringify({
    url: info.url, title: info.title,
    text: String(info.text || "").slice(0, 3500),
    links: (info.links || []).slice(0, 40),
    forms: (info.forms || []).slice(0, 20),
    buttons: (info.buttons || []).slice(0, 30),
  });

  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: sys,
        messages: [{ role: "user", content: user }],
      }),
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const data = await res.json();
    const out = (data.content || []).map((c) => c.text || "").join("");
    const brief = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    brief.summary = String(brief.summary || "").slice(0, 240);
    brief.appType = String(brief.appType || "").slice(0, 60);
    brief.goals = (Array.isArray(brief.goals) ? brief.goals : []).slice(0, 6).map((g, i) => ({
      id: `goal-${i + 1}`,
      title: String(g.title || "").slice(0, 90),
      hint: String(g.hint || "").slice(0, 200),
    })).filter((g) => g.title);
    return brief;
  } catch (e) {
    return { error: String(e.message) };
  }
}

// Extracted in the page during recon — a light snapshot for the model to read.
export const RECON_EXTRACT = `() => {
  const txt = (document.body ? document.body.innerText : "").replace(/\\s+/g, " ").trim();
  const links = [...document.querySelectorAll('a[href]')].map(a => (a.textContent||"").trim()).filter(Boolean);
  const buttons = [...document.querySelectorAll('button,input[type=submit],[role=button]')].map(b => (b.textContent||b.value||"").trim()).filter(Boolean);
  const forms = [...document.querySelectorAll('form')].map(f => { const b=f.querySelector('button,input[type=submit]'); return (b?(b.textContent||b.value):"").trim() || (f.getAttribute('action')||"form"); });
  return { title: document.title, text: txt, links: [...new Set(links)], buttons: [...new Set(buttons)], forms };
}`;
