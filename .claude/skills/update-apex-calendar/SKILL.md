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

6. **Verify the live site picked it up** (Pages takes ~1 min):
   ```bash
   curl -s "https://chriswiles.github.io/apex-podplay-helper/events.json?ts=$(date +%s)" \
     | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);console.log('live generatedAt:',j.generatedAt,'count:',j.count)}catch(e){}})"
   ```
   Confirm `generatedAt` advanced to roughly now. It can lag a minute — re-check
   once if it still shows the old timestamp.

## Report

State plainly: events scraped, whether a commit/push happened (or "no change"),
and the live `generatedAt` after deploy. If any step aborted, say which and why.

## Notes

- No external dependencies; needs Node 18+ and network access.
- If auth or the events endpoint changes upstream, `npm run fetch` will fail
  loudly (non-zero) rather than deploy bad data — investigate `scripts/fetch-events.mjs`.
