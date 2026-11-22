# Decisions

1. **Static GitHub Pages instead of the original Cloudflare Worker.** Pages serves files only. The vinext Worker build needed a runtime that machine-run ventures here do not have. The same React components now render to HTML at build time (esbuild plus `react-dom/server`) and hydrate in the browser, so search engines and link previews see the whole game. Kept: React and the design. Dropped: vinext, Next, Tailwind's compiler (its reset is inlined), D1/Drizzle, ChatGPT auth.
2. **Game rules moved into `src/engine.ts` as pure functions.** One source of truth for the UI, the unit tests, the scripted player and the guide's numbers. No values were rebalanced.
3. **The run clock starts on the first move.** The original started it at page load, which penalised reading the intro and made speedrun times unfair. Offline time and idle time still count, as before.
4. **Real elapsed time per tick, and a save written on pagehide.** These fix two bugs: production slowed in background tabs, and the last moves were lost on close.
5. **Challenge links instead of a global leaderboard.** `?beat=<seconds>` carries the bragging loop with no server and no personal data. A leaderboard would need hosting off Pages, accounts or moderation, and anti-cheat work. Recorded as a possible later key, not built.
6. **Fiction framing everywhere, and no real-world call to action.** The prompt flags political-content and campaign-law risk. The game says it is fiction on the first screen, in the footer, on the About page and on the share card. The end screen offers sharing and a replay. Default answer to "what should a player do after Heaven?": share, then replay.
7. **Launched indexed on github.io.** kingdomspeedrun.com, heavenstate.org and heavenlystate.com showed Namecheap parking pages on 2026-11-10, and the game was never deployed anywhere. So nothing duplicates it, and noindex is not needed. `SITE_URL` is the single address setting, and the domain rollout session moves it (OPERATIONS.md, key 1).
8. **Analytics off by default.** A cookieless GoatCounter switch is wired with the activation events. Until someone creates the account, the site promises and does nothing.
9. **Fonts self-hosted** (Geist and Geist Mono, OFL) so that no page makes third-party requests.
10. **One games line.** The footer and About page list the sister games (PRES2028: Citizen and Coagulation Corp) once they are live, as separate repos and sites.

## Open questions for Jack (defaults chosen; nothing blocks)

- Connected to the pres2028 citizen game? Default: sister games, cross-linked, with separate sites.
- Which domain? Default: github.io now; `play.kingdomspeedrun.com` or the apex, whichever the domain rollout session prefers.
- After "Heaven is a metric": join, donate, subscribe? Default: share and replay only.
- Free or supporter tier? Default: free, plus an optional pay-what-you-want link (key 2).
