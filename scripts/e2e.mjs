// End-to-end playthrough in headless Chrome: a scripted player clicks the real buttons from a blank save
// to the finish, then checks the share card, saving, offline progress, replay, the reading pages and the
// phone layout.
//   node scripts/e2e.mjs                         serve dist/ and test it
//   node scripts/e2e.mjs https://host/path/      test a deployed site
// Game time is fast-forwarded with an injected clock, so a twenty-minute run takes a few seconds.
import { FAKE_CLOCK, launchChrome } from "./lib/cdp.mjs";
import { startServer } from "./serve.mjs";
import { ENGINES, GUARANTEES, OFFLINE_CAP_SECONDS, STAGES, STORAGE_KEY, formatTime, outcomesFor } from "../src/engine.ts";

const target = process.argv[2];
const local = target ? null : await startServer({ basePath: "/speed-run-heaven-civic-game/" });
const base = (target || local.url).replace(/\/*$/, "/");
const failures = [];
const check = (condition, message) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${message}`);
  if (!condition) failures.push(message);
};

// Runs inside the page: play until the run is complete, pressing only what a player can press.
const PLAY = `(async () => {
  const q = (selector) => document.querySelector(selector);
  const clock = window.__testClock;
  let seconds = 0;
  const complete = () => q('[data-testid="finale"]').classList.contains("complete");
  while (!complete() && seconds < 3 * 60 * 60) {
    const main = q('[data-testid="main-action"]');
    for (let i = 0; i < 4 && !main.disabled; i += 1) main.click();
    for (let guard = 0; guard < 40; guard += 1) {
      let moved = false;
      for (const button of document.querySelectorAll("[data-guarantee]:not(:disabled)")) { button.click(); moved = true; }
      const quick = q("[data-engine-quick]:not(:disabled)");
      if (quick) { quick.click(); moved = true; }
      if (!moved) break;
      await clock.macrotask();
    }
    clock.advance(1000);
    seconds += 1;
    await clock.macrotask();
  }
  await clock.macrotask();
  return { seconds, complete: complete() };
})()`;

const text = (selector) => `(document.querySelector(${JSON.stringify(selector)})?.textContent || "").trim()`;
const overflow = "document.documentElement.scrollWidth - window.innerWidth";

const browser = await launchChrome();
try {
  const page = await browser.newPage({ width: 1280, height: 900, preload: FAKE_CLOCK });
  await page.goto(base);

  // ---- A blank save ----
  check((await page.eval("document.title")).includes("Speed Run Heaven"), "the game page loads with its title");
  check((await page.eval(text('[data-testid="run-clock"]'))) === "00:00", "a new run shows 00:00 on the clock");
  check((await page.eval(text('[data-testid="power-value"]'))) === "0", "a new run starts with no power");
  check((await page.eval(text('[data-testid="fiction-note"]'))).toLowerCase().includes("fiction"), "the fiction note is on the first screen");
  check(await page.eval('document.querySelector("[data-engine-quick]").disabled'), "the upgrade button is locked before any power exists");
  await page.eval("window.__testClock.advance(5000); window.__testClock.macrotask()");
  check((await page.eval(text('[data-testid="run-clock"]'))) === "00:00", "the clock does not run before the first move");

  // ---- First moves ----
  await page.eval('document.querySelector(\'[data-testid="main-action"]\').click(); window.__testClock.macrotask()');
  check(Number(await page.eval(text('[data-testid="power-value"]'))) >= 1, "one click makes power");
  const beforeDock = Number(await page.eval(text('[data-testid="power-value"]')));
  await page.eval('document.querySelector(\'[data-testid="dock-action"]\').click(); window.__testClock.macrotask()');
  check(Number(await page.eval(text('[data-testid="power-value"]'))) > beforeDock, "the always-visible dock button also makes power");
  await page.eval("window.__testClock.advance(3000); window.__testClock.macrotask()");
  check((await page.eval(text('[data-testid="run-clock"]'))) === "00:03", "the clock starts on the first move");

  // ---- The whole run ----
  const started = Date.now();
  const run = await page.eval(PLAY);
  console.log(`     scripted run: ${formatTime(run.seconds * 1000)} of game time in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  check(run.complete, "the scripted player finishes the run");
  check(run.seconds > 60 && run.seconds < 2 * 60 * 60, "the run takes between one minute and two hours of game time");
  check((await page.eval(text('[data-testid="phase-name"]'))) === STAGES[STAGES.length - 1].name, "the last phase is reached");
  const finished = JSON.parse(await page.eval(`localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`));
  check(finished.completedAt > finished.runStartedAt && finished.bestTimeMs === finished.completedAt - finished.runStartedAt, "the finished run and best time are saved at once");
  check((await page.eval(text('[data-testid="guarantee-count"]'))) === `${finished.guarantees.length}/${GUARANTEES.length}`, `the guarantee count matches the save (${finished.guarantees.length} enshrined)`);
  check((await page.eval(text('[data-testid="heaven-score"]'))) === String(outcomesFor(finished).heavenScore), `the Heaven score matches the rules (${outcomesFor(finished).heavenScore})`);
  check(await page.eval('document.querySelector(\'[data-testid="main-action"]\').disabled'), "the main button stops at the finish");
  check(await page.eval('Boolean(document.querySelector(\'[data-testid="dock-share"]\'))'), "the dock points to the share card after the finish");

  // ---- Share card ----
  await page.eval("new Promise((resolve) => setTimeout(resolve, 0)); window.__testClock.macrotask()");
  for (let wait = 0; wait < 40; wait += 1) {
    if ((await page.eval('document.querySelector(\'[data-testid="share-card"]\')?.dataset.drawn')) === "yes") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const clockText = await page.eval(text('[data-testid="run-clock"]'));
  const shareTime = await page.eval(text('[data-testid="share-time"]'));
  check(shareTime === clockText && /^\d+:\d\d(:\d\d)?$/.test(shareTime), `the share panel shows the finish time (${shareTime})`);
  const colours = await page.eval(`(() => {
    const canvas = document.querySelector('[data-testid="share-card"]');
    if (!canvas || canvas.dataset.drawn !== "yes") return 0;
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4 * 97) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return seen.size;
  })()`);
  check(colours > 20, `the share card is drawn (${colours} colours sampled)`);
  const shareLink = await page.eval('document.querySelector(\'[data-testid="share-link"]\')?.href || ""');
  const beat = Number(new URL(shareLink || "http://x/").searchParams.get("beat"));
  check(beat > 0 && formatTime(beat * 1000) === shareTime, "the challenge link carries the finish time");

  // ---- Reload, challenge link, replay ----
  await page.goto(base);
  check((await page.eval(text('[data-testid="share-time"]'))) === shareTime, "a reload restores the finished run");
  await page.goto(`${base}?beat=${beat + 60}`);
  const banner = await page.eval(text('[data-testid="challenge-banner"]'));
  check(banner.includes(formatTime((beat + 60) * 1000)) && banner.toLowerCase().includes("beat"), "a challenge link shows the time to beat");
  await page.eval('document.querySelector(\'[data-testid="next-timeline"]\').click(); window.__testClock.macrotask()');
  await page.eval("window.__testClock.macrotask()");
  check((await page.eval(text('[data-testid="boost-value"]'))) === "×1.25", "a new timeline starts with the 25% replay bonus");
  check((await page.eval(text('[data-testid="run-clock"]'))) === "00:00" && (await page.eval(text('[data-testid="power-value"]'))) === "0", "a new timeline starts from zero");

  // ---- Offline progress ----
  await page.eval(`(async () => {
    const main = document.querySelector('[data-testid="main-action"]');
    for (let i = 0; i < 12; i += 1) main.click();
    await window.__testClock.macrotask();
    document.querySelector("[data-engine-quick]").click();
    await window.__testClock.macrotask();
    window.__testClock.advance(1000);
    await window.__testClock.macrotask();
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.__testClock.advance(200);
    await window.__testClock.macrotask();
  })()`);
  const before = JSON.parse(await page.eval(`localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`));
  check(before.levels[ENGINES[0].id] === 1, "the first engine is bought and saved");
  await page.eval("window.__testClock.away(60 * 60 * 1000)");
  await page.goto(base);
  const after = JSON.parse(await page.eval(`localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`));
  const expected = ENGINES[0].baseRate * 1.25 * 3600;
  const gained = after.totalPower - before.totalPower;
  check(Math.abs(gained - expected) / expected < 0.02, `an hour away earns an hour of production (${gained.toFixed(0)} power)`);
  check((await page.eval(text('[data-testid="notice"]'))).includes("While you were away"), "the game says what was earned while away");
  check(OFFLINE_CAP_SECONDS >= 3600, "the offline cap covers the hour tested");

  // ---- Save codes ----
  const code = "SRH1." + Buffer.from(JSON.stringify({ ...after, power: 4321, totalPower: 5000 })).toString("base64");
  await page.eval(`(async () => {
    document.querySelector(".save-tools").open = true;
    const area = document.querySelector('[data-testid="save-code"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(area, ${JSON.stringify(code)});
    area.dispatchEvent(new Event("input", { bubbles: true }));
    await window.__testClock.macrotask();
    document.querySelector('[data-testid="load-save"]').click();
    await window.__testClock.macrotask();
  })()`);
  check((await page.eval(text('[data-testid="power-value"]'))).startsWith("4.3K"), "a pasted save code loads the run");
  await page.eval(`(async () => {
    const area = document.querySelector('[data-testid="save-code"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(area, "SRH1.not-a-save");
    area.dispatchEvent(new Event("input", { bubbles: true }));
    await window.__testClock.macrotask();
    document.querySelector('[data-testid="load-save"]').click();
    await window.__testClock.macrotask();
  })()`);
  check((await page.eval(text('[data-testid="notice"]'))).includes("could not be read"), "a broken save code is refused without losing the run");
  check((await page.eval(text('[data-testid="power-value"]'))).startsWith("4.3K"), "the run is unchanged after a broken code");
  check((await page.eval(overflow)) <= 1, "the game has no sideways scroll at desktop width");
  check(page.problems.length === 0, `no console errors on the game page${page.problems.length ? ": " + page.problems.slice(0, 3).join(" | ") : ""}`);
  await page.close();

  // ---- Reading pages, 404, phone layout ----
  const phone = await browser.newPage({ width: 390, height: 844, mobile: true });
  await phone.goto(base);
  check((await phone.eval(overflow)) <= 1, "the game has no sideways scroll at phone width");
  const mainBox = await phone.eval(`(() => { const r = document.querySelector('[data-testid="main-action"]').getBoundingClientRect(); return { w: r.width, left: r.left, right: r.right }; })()`);
  check(mainBox.w >= 120 && mainBox.left >= 0 && mainBox.right <= 391, "the main button fits a phone screen");
  await phone.goto(`${base}guide/`);
  check((await phone.eval(text("h1"))).length > 10, "the guide loads");
  check((await phone.eval('document.querySelectorAll(".doc-table")[0].querySelectorAll("tbody tr").length')) === ENGINES.length, "the guide lists every engine");
  check((await phone.eval(overflow)) <= 1, "the guide has no sideways scroll at phone width");
  check((await phone.eval('[...document.querySelectorAll("script[type=\\"application/ld+json\\"]")].some((s) => JSON.parse(s.textContent)["@type"] === "FAQPage")')), "the guide carries FAQ structured data");
  await phone.goto(`${base}about/`);
  check((await phone.eval(text("#fiction + p"))).includes("not"), "the about page states that the game is fiction");
  check((await phone.eval(overflow)) <= 1, "the about page has no sideways scroll at phone width");
  check(phone.problems.length === 0, `no console errors on the reading pages${phone.problems.length ? ": " + phone.problems.slice(0, 3).join(" | ") : ""}`);
  await phone.close();

  const missing = await fetch(`${base}this-page-does-not-exist/`);
  check(missing.status === 404 && (await missing.text()).includes("PLAY SPEED RUN HEAVEN"), "unknown addresses get the 404 page with a way back");
} finally {
  await browser.close();
  if (local) await local.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`\nall checks passed for ${base}`);
