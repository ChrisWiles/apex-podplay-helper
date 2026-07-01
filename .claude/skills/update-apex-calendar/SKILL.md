---
name: update-apex-calendar
description: Re-scrape Apex Pickleball Clubs sessions from PodPlay, refresh events.json, and redeploy the static GitHub Pages site. Use when asked to "update apex calendar", "refresh podplay data", "redeploy apex", or when running a scheduled /loop to keep the live site current.
---

# Update Apex Calendar

Refreshes the session data behind the Apex PodPlay Helper site and redeploys it.
The site is static (GitHub Pages from `main` root, **no GitHub Actions**), so
"deploy" means: regenerate `events.json`, commit it, and push.

**Repo:** `/Users/wiles/Documents/GitHub/apex-podplay-helper`
**Live:** https://chriswiles.github.io/apex-podplay-helper/

A user `/loop` may invoke this skill on a cadence. This skill itself schedules
nothing — one invocation = one refresh-and-deploy.

## Steps

Run from the repo root.

1. **Record the current count** (to detect suspicious drops):
   ```bash
   cd /Users/wiles/Documents/GitHub/apex-podplay-helper
   OLD=$(node -e "try{console.log(require('./events.json').count)}catch(e){console.log(0)}")
   ```

2. **Scrape + rewrite `events.json`:**
   ```bash
   npm run fetch
   ```
   The scraper (`scripts/fetch-events.mjs`) mints an anonymous PodPlay token,
   paginates the events API, retries transient failures, and **throws (exit
   non-zero) if it scrapes fewer than 50 events** — so a broken run aborts
   without touching good data. If this command fails, **stop**: do not commit,
   report the error.

3. **Sanity-check the new count** vs the old one:
   ```bash
   NEW=$(node -e "console.log(require('./events.json').count)")
   echo "old=$OLD new=$NEW"
   ```
   If `NEW` is 0, or dropped by more than ~40% from a non-zero `OLD`, treat it
   as suspicious: `git checkout -- events.json` to restore, and report instead
   of deploying. (A real week-over-week roll-off is gradual; a big cliff usually
   means an upstream change.)

4. **Commit only if the data changed:**
   ```bash
   git add events.json
   git diff --cached --quiet && echo "No change — nothing to deploy." || \
     git commit -m "chore(data): refresh sessions ($NEW events)"
   ```

5. **Deploy (push to `main`):**
   ```bash
   git push
   ```
   > Pushing is the deploy. If a `/loop` runs this unattended, that is the
   > standing authorization to push **this repo**. Never force-push.

6. **Verify the live site picked it up** — optional. This repo's GitHub Pages
   (legacy branch builder) lags **~7–8 minutes** behind a push, so a fresh deploy
   won't show immediately; that's expected, not a failure.
   ```bash
   curl -s "https://chriswiles.github.io/apex-podplay-helper/events.json?ts=$(date +%s)" \
     | python3 -c "import sys,json; j=json.load(sys.stdin); print('live generatedAt:', j['generatedAt'], 'count:', j['count'])"
   ```
   Confirm `generatedAt` advanced to roughly now. **When running unattended via
   `/loop`, skip this wait** — the push *is* the deploy, and blocking ~8 minutes
   every cycle isn't worth it. Only verify manually if a deploy seems stuck.

## Report

State plainly: events scraped, whether a commit/push happened (or "no change"),
and the live `generatedAt` after deploy. If any step aborted, say which and why.

## Notes

- No external dependencies; needs Node 18+ and network access.
- `events.json` holds the **full scrape** (~900 events, `count`). The live site
  deliberately shows far fewer — the client hides sessions whose PodPlay sign-up
  window hasn't opened yet (regular +7d / member +14d). So the `count` guard in
  steps 1&3 tracks *scrape health*, not visible sessions; don't be alarmed that
  the site shows a few hundred while `count` is ~900.
- If auth or the events endpoint changes upstream, `npm run fetch` will fail
  loudly (non-zero) rather than deploy bad data — investigate `scripts/fetch-events.mjs`.
