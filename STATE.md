# State (rebuild of 2026-11-22)

**Original (iCloud `New project/speed-run-heaven`, last touched 2026-07-15).** A vinext/React app for ChatGPT Sites / Cloudflare Workers. It was never deployed: no URL, no domain and no traction exist. It had an unused D1/Drizzle scaffold and a ChatGPT auth stub.

**What worked and was kept.** The whole game in `app/SpeedRunGame.tsx`, unchanged in substance:
- 9 engines, 6 guarantees and 8 phases;
- the 25,000,000-power finish and the 1.62 cost growth;
- 2 hours of offline progress, the +25% replay bonus;
- the save key `speed-run-heaven-save-v1`;
- the original stylesheet, the US map (CC0) and the share illustration.

**What was broken or missing, and is fixed:**
- The clock started at page load, so reading the intro cost time. It now starts on the first move.
- Production ran at rate/4 per tick, so throttled background tabs fell behind. It now uses real elapsed time.
- The last moves were lost if the tab closed within 80 ms of them. The save is now written on pagehide.
- There was no share card, no SEO, no fiction disclaimer, and a broken OG URL (`localhost`).
- Damaged saves were trusted. They are now sanitized and can be moved with a save code.

**Not carried over.** The Worker, D1/Drizzle, ChatGPT auth, `.openai/hosting.json` (a project ID) and the starter SVGs.

**Now.** A static site on GitHub Pages: React prerendered at build time, hydrated in the browser, with no server. 17 unit tests, 10 page tests, a 45-check scripted playthrough and weekly live checks.
