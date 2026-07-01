#!/usr/bin/env node
/**
 * Fetches the public Apex Pickleball Clubs session catalog from the PodPlay API
 * and writes a slim events.json the static site consumes.
 *
 * PodPlay's API requires a Firebase auth token, so we mint an anonymous one the
 * same way the web app does (the API key is the public client key shipped in
 * their bundle). We only read public, listed events.
 *
 * No dependencies — uses Node 18+ global fetch. Run: `node scripts/fetch-events.mjs`
 */

const FIREBASE_KEY = "AIzaSyBlx8IDFiOEXeTEAuXLpvIn4FeOxEfBUxY";
const HOST = "https://apexpbclubs.podplay.app";
const API = `${HOST}/apis/v2`;
const DAYS_AHEAD = 120;         // how far forward to pull (API caps at its own booking window)
const SANITY_FLOOR = 50;        // fewer than this ⇒ assume a broken scrape and abort (don't overwrite good data)
const OUT = new URL("../events.json", import.meta.url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch JSON with a few retries + backoff; throws on repeated failure so a
// transient blip never silently produces a truncated events.json.
async function fetchJson(url, opts = {}, label = "request") {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, opts);
      if (!r.ok) throw new Error(`${label} failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
      return await r.json();
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await sleep(attempt * 800);
    }
  }
  throw lastErr;
}

async function getToken() {
  const j = await fetchJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_KEY}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) },
    "Firebase signUp",
  );
  if (!j.idToken) throw new Error("No idToken returned from Firebase");
  return j.idToken;
}

async function fetchAllEvents(token) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + DAYS_AHEAD * 86400000);
  const base =
    `startTime=${start.toISOString()}&endTime=${end.toISOString()}` +
    `&excludeUnlisted=true&excludeClosedSeries=true&sort=startTime&ipp=100`;

  const items = [];
  for (let page = 1; page <= 30; page++) {
    const j = await fetchJson(
      `${API}/events?${base}&page=${page}`,
      { headers: { accept: "application/json", authorization: `Bearer ${token}` } },
      `events page ${page}`,
    );
    const batch = j.items || [];
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

function slim(e) {
  const pod = (e.pods?.items || [])[0] || {};
  const cap = (e.totalTeams || 0) * (e.teamSize || 1);
  // earliest moment ANY tier can register — used to hide sessions beyond the sign-up window.
  const ad = e.admissionDate || {};
  const openDates = [ad.regular, ad.member, ad.membersDefault, ...((ad.memberships?.items) || []).map((m) => m.date)].filter(Boolean);
  const signupOpen = openDates.length ? openDates.slice().sort()[0] : null; // ISO strings sort chronologically
  return {
    id: e.id,
    name: (e.name || "").trim(),
    start: e.startTime,
    end: e.endTime,
    customType: e.customType,
    tags: e.tags || [],
    minRating: e.admissionRating?.minRating ?? null,
    maxRating: e.admissionRating?.maxRating ?? null,
    regular: e.admissionRate?.regular ?? null,
    member: e.admissionRate?.member ?? null,
    capacity: cap || null,
    signedUp: e.signups?._total ?? null,
    signupOpen,
    podName: pod.displayName || null,
    podAddress: pod.address?.displayName || null,
  };
}

async function main() {
  const token = await getToken();
  const raw = await fetchAllEvents(token);
  const events = raw
    .filter((e) => !e.isCanceled && e.startTime)
    .map(slim)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  if (events.length < SANITY_FLOOR) {
    throw new Error(
      `Only ${events.length} events scraped (< ${SANITY_FLOOR}). Assuming a broken/blocked ` +
        `response; refusing to overwrite events.json.`,
    );
  }

  const payload = { generatedAt: new Date().toISOString(), count: events.length, events };
  await (await import("node:fs/promises")).writeFile(OUT, JSON.stringify(payload));
  console.log(`Wrote ${events.length} events to events.json (generated ${payload.generatedAt})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
