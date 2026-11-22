# Operations

Speed Run Heaven runs itself on GitHub. Pages hosts it, and Actions runs every recurring job. The game is static: no server, no database, no accounts. Players' saves stay in their own browsers. Nothing here needs a person for the site to keep working.

- **Live:** https://theguysaccount.github.io/speed-run-heaven-civic-game/
- **Repo:** https://github.com/theguysaccount/speed-run-heaven-civic-game
- **Indexed:** yes. There is no other live copy of this game: kingdomspeedrun.com, heavenstate.org and heavenlystate.com showed Namecheap parking pages when checked on 2026-11-10.

## Automated jobs

| Job | Workflow | When | What it does | How it fails safe |
|---|---|---|---|---|
| Deploy | `pages.yml` | Every push to `main` that touches the game, or by hand. The self-test also calls it when the live site falls behind `main`. | Type check, unit tests (rules, saves, a scripted player on four play styles), build, rendered-HTML tests, a full scripted playthrough in headless Chrome, deploy. Then it waits for the new build to be live, checks it, plays it through again, and pings IndexNow. | Any failed check stops the run before the deploy, so the last good site stays live. IndexNow problems are warnings, never failures. Re-running is always safe. |
| Weekly self-test | `selftest.yml` | Wednesdays 07:43 UTC, or by hand. GitHub often starts this account's schedules hours late; nothing depends on the exact time. | Unit tests, rendered-HTML tests and the scripted playthrough on a fresh build of `main`; a health check and the playthrough on the **live** site; a staleness check that asks `pages.yml` for a fresh deploy if the live build is older than the last change to the game. | Read-only, apart from that one dispatch. On failure it opens or updates one `ops-alert` issue, and GitHub emails the repository owner. A later pass closes the issue. |
| Keep-alive | `selftest.yml` → `scripts/keepalive.sh` | Weekly, even when the self-test fails | Re-enables every scheduled workflow through the API. Pushes an empty `[skip ci]` commit when the last commit is 45 or more days old. | GitHub disables schedules after 60 days without repository activity; this keeps the weekly test alive. |

### What each check means

- `scripts/check-live.mjs`: every sitemap page answers 200 with its own canonical and the right robots tag; the script, stylesheet, share image, robots.txt, IndexNow key file and the 404 page are served. With `--expect-build`, it first waits until `build.json` reports the commit that was just deployed.
- `scripts/e2e.mjs`: a scripted player clicks the real buttons from a blank save to the finish, with game time fast-forwarded. It then checks the share card and challenge link, reload, replay bonus, an hour of offline progress, save codes (good and broken), the reading pages, the phone layout, the 404 page and the browser console.
- `tests/engine.test.ts`: the game rules. Expected values come from the game data, so rebalancing only fails a test when it breaks something a player relies on. One example: every play style must still finish inside two hours.
- `tests/rendered-html.test.mjs`: the built pages, links, structured data, sitemap and key file. It also does two extra builds: a custom-domain build and a staged build.

## What to watch

| Signal | Where | Healthy |
|---|---|---|
| Open `ops-alert` issues | Issues tab; GitHub's failure emails | None open |
| Weekly self-test | Actions → Weekly self-test | Green every week (often a few hours after 07:43 UTC on Wednesdays) |
| Completions and shares (once analytics is on) | GoatCounter events `run_start`, `phase_02` … `phase_08`, `run_complete` (activation), `share_native` / `share_download` / `share_copy`, `next_timeline` | Shares per completion is the swing factor |

## Run anything by hand

```bash
npm ci --ignore-scripts
npm test                                  # type check, unit tests, build, rendered-HTML tests
npm run e2e                               # scripted playthrough of dist/ in headless Chrome
node scripts/e2e.mjs https://theguysaccount.github.io/speed-run-heaven-civic-game/
node scripts/check-live.mjs https://theguysaccount.github.io/speed-run-heaven-civic-game
npm run screens                           # docs/screens/*.png at desktop and phone widths
~/.local/bin/gh workflow run pages.yml -R theguysaccount/speed-run-heaven-civic-game
~/.local/bin/gh workflow run selftest.yml -R theguysaccount/speed-run-heaven-civic-game
```

## Keys Jack can turn later

None of these are needed for the game to work.

### 1. Custom domain (the base address is one setting: `SITE_URL`)

Candidates from the 2026-08-30 portfolio:
- `kingdomspeedrun.com` is the best fit. Since 2026-11-22 it serves another site, a speedrun split calculator. Under the build-on-top rule, this game takes a subdomain: `play.kingdomspeedrun.com`. Leave the apex alone.
- `heavenstate.org` and `heavenlystate.com` are listed as redirects. Both still showed Namecheap parking pages on 2026-11-22.

DNS is managed at Namecheap (Domain List → domain → Advanced DNS). The "domain rollout" session sets domains up; nothing here changes DNS.

Steps, in this order, so canonicals never point at an address that does not answer yet:

1. **DNS at Namecheap.** Add one record, `CNAME play → theguysaccount.github.io.`, in the kingdomspeedrun.com zone, and change no other record.

   Only if Jack chooses a parked domain's apex instead (for example heavenstate.org), replace that host's parking records with:
   - `A @` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `AAAA @` → `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - `CNAME www` → `theguysaccount.github.io.`
2. **Tell Pages the domain:**
   `~/.local/bin/gh api -X PUT repos/theguysaccount/speed-run-heaven-civic-game/pages -f cname=play.kingdomspeedrun.com`
   You can also do this in Settings → Pages → Custom domain. The site deploys from a workflow, so a CNAME file is not used.
3. **Turn on HTTPS.** Wait until the certificate is issued (Settings → Pages shows it), then run:
   `~/.local/bin/gh api -X PUT repos/theguysaccount/speed-run-heaven-civic-game/pages -F https_enforced=true`
4. **Switch the address:**
   `~/.local/bin/gh variable set SITE_URL -b https://play.kingdomspeedrun.com -R theguysaccount/speed-run-heaven-civic-game`
   Then `~/.local/bin/gh workflow run pages.yml -R theguysaccount/speed-run-heaven-civic-game`. Canonicals, sitemap, share card, challenge links, structured data, the health checks and IndexNow all follow `SITE_URL`.
5. **Afterwards.** The github.io address redirects to the domain by itself. Point the redirect domains at the same place with a Namecheap URL redirect (301).

   Saves belong to the browser's address. Players who started on github.io can carry a run across with the footer's save code (COPY SAVE CODE, then paste on the new domain).

Optional: verify the domain for the account (GitHub → Settings → Pages → Add a domain, which adds a TXT record). This prevents takeover if the CNAME is ever removed.

### 2. Money: one support link

GitHub Pages is non-commercial, so the game sells nothing itself. The slot is a footer link, hidden until it is set. The evaluator's cheapest test was a pay-what-you-want itch.io page.

1. Create the itch.io page (it needs an itch.io account). See key 4 for the upload.
2. Set the link and its label:
   - `~/.local/bin/gh variable set SUPPORT_URL -b https://<you>.itch.io/speed-run-heaven -R theguysaccount/speed-run-heaven-civic-game`
   - Optionally, `~/.local/bin/gh variable set SUPPORT_LABEL -b "PAY WHAT YOU WANT" -R …`
3. Redeploy: `gh workflow run pages.yml`. Only https links are accepted.

### 3. Analytics: the activation metric

Off by default. The game loads no analytics, and the About page says so.

1. Create a free GoatCounter site.
2. Run `~/.local/bin/gh variable set GOATCOUNTER_URL -b https://<code>.goatcounter.com/count -R theguysaccount/speed-run-heaven-civic-game`, then redeploy.

The events are already in the code (see "What to watch"). The About page's privacy text switches automatically. GoatCounter is cookieless, and automated browsers are never counted.

### 4. itch.io release (needs an account)

1. Build with the canonical address, then zip the output:
   `SITE_URL=https://theguysaccount.github.io/speed-run-heaven-civic-game npm run build && (cd dist && zip -r ../speed-run-heaven-itch.zip .)`
2. On itch.io, create a new project with kind "HTML", upload the zip, and set "This file will be played in the browser".
   - Viewport: 1280×800, with "Mobile friendly" and "Fullscreen button" ticked.
   - Every path in the build is relative, so it runs inside itch's frame. Saves stay per browser, as on the website.

### 5. Search Console

Verifying a github.io project path in Google Search Console needs a DNS or HTML-file check on the host, so do it after key 1. Then submit `/sitemap.xml`. Bing and other IndexNow engines are already pinged on every deploy.

### 6. Optional balance routine (Claude, quarterly, after key 3)

Nothing in the game needs new content. Once analytics has a month of data, a quarterly Claude Code routine could tune pacing. Run it in a checkout of this repo with this prompt:

> Pull main. Read the GoatCounter export for the last 90 days (events `run_start`, `phase_02` … `phase_08`, `run_complete`). If more than half of the runs that reach a phase stop before the next one, lower that phase's engine costs or unlock thresholds in `src/engine.ts` by at most 15%. Run `npm test` and `npm run e2e`. Commit with the numbers that justified the change, then push. Do not post anywhere.

## Safety and privacy rules the code keeps

- The game is framed as fiction on the first screen, in the footer, on the About page, on the share card, and in the description and structured data. It is not affiliated with any party, candidate, campaign or government. It takes no donations, collects no sign-ups and contacts no voters.
- No cookies and no accounts. The save is in localStorage, the share card is drawn on the device, and a challenge link carries one number (the finish time in seconds).
- Analytics stay off until key 3. When on, automated browsers are never counted.
