// Screenshots of the key screens at desktop (1280 px) and phone (390 px, real mobile emulation) into
// docs/screens/. Saves are seeded through localStorage, so the mid-run and finished screens are real states.
//   node scripts/screens.mjs                    from dist/, served locally
//   node scripts/screens.mjs https://host/path/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChrome } from "./lib/cdp.mjs";
import { startServer } from "./serve.mjs";
import { ENGINES, GUARANTEES, STAGES, STORAGE_KEY, VICTORY_THRESHOLD, freshState } from "../src/engine.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "screens");
const target = process.argv[2];
const local = target ? null : await startServer({ basePath: "/speed-run-heaven-civic-game/" });
const base = (target || local.url).replace(/\/*$/, "/");

const now = Date.now();
const midRun = {
  ...freshState(now - 9 * 60_000),
  actions: 640,
  power: 41_250,
  totalPower: STAGES[3].threshold + 22_000,
  levels: { friend: 14, kitchen: 11, ledger: 9, stewards: 6, coalition: 3, ballot: 1 },
  guarantees: GUARANTEES.slice(0, 2).map((guarantee) => guarantee.id),
  lastSavedAt: now,
};
const finished = {
  ...freshState(now - 23 * 60_000),
  actions: 2_918,
  power: 1_200_000,
  totalPower: VICTORY_THRESHOLD + 10,
  levels: Object.fromEntries(ENGINES.map((engine, index) => [engine.id, Math.max(3, 24 - index * 2)])),
  guarantees: GUARANTEES.map((guarantee) => guarantee.id),
  completedAt: now - 60_000,
  bestTimeMs: 22 * 60_000 + 17_000,
  lastSavedAt: now,
};
finished.bestTimeMs = finished.completedAt - finished.runStartedAt;

// [file name, page, extra query, hash, save, width, height, phone?, scroll to the share panel?]
const shots = [
  ["home-desktop", "", "", "", null, 1280, 900, false],
  ["home-phone", "", "", "", null, 390, 844, true],
  ["midrun-desktop", "", "", "", midRun, 1280, 900, false],
  ["midrun-phone", "", "", "#build", midRun, 390, 844, true],
  ["finish-desktop", "", "", "", finished, 1280, 1100, false, true],
  ["finish-phone", "", "", "", finished, 390, 844, true, true],
  ["challenge-phone", "", "&beat=1337", "", null, 390, 844, true],
  ["guide-desktop", "guide/", "", "", null, 1280, 1000, false],
  ["about-phone", "about/", "", "", null, 390, 844, true],
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await launchChrome();
const overflow = [];
try {
  for (const [name, pagePath, query, hash, save, width, height, mobile, scrollToShare] of shots) {
    const page = await browser.newPage({ width, height, mobile });
    // Seed the save from a page without the game on it: the game writes its own state when it closes.
    await page.goto(`${base}about/`);
    await page.eval(save ? `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(save))})` : "localStorage.clear()");
    await page.goto(`${base}${pagePath}?shot=${name}${query}${hash}`, { settle: 900 });
    if (scrollToShare) {
      await page.eval(`(() => {
        const finale = document.querySelector('[data-testid="finale"]');
        if (finale) window.scrollTo({ top: finale.getBoundingClientRect().top + window.scrollY - 80, behavior: "instant" });
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const wide = await page.eval("document.documentElement.scrollWidth - window.innerWidth");
    if (wide > 1) overflow.push(`${name}: ${wide}px wider than the screen`);
    await page.screenshot(path.join(OUT, `${name}.png`));
    console.log(`saved docs/screens/${name}.png`);
    await page.close();
  }
  // The share card itself, as a player would save it.
  const page = await browser.newPage({ width: 1280, height: 900 });
  await page.goto(`${base}about/`);
  await page.eval(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(finished))})`);
  await page.goto(`${base}?shot=card`, { settle: 1200 });
  const png = await page.eval(`document.querySelector('[data-testid="share-card"]')?.toDataURL("image/png") || ""`);
  if (png.startsWith("data:image/png;base64,")) {
    fs.writeFileSync(path.join(OUT, "share-card.png"), Buffer.from(png.split(",")[1], "base64"));
    console.log("saved docs/screens/share-card.png");
  }
  await page.close();
} finally {
  await browser.close();
  if (local) await local.close();
}
if (overflow.length) {
  console.log(`SIDEWAYS SCROLL:\n  ${overflow.join("\n  ")}`);
  process.exitCode = 1;
}
