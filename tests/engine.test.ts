// Unit tests for the game rules. Expectations are derived from the game data, never typed-in launch values,
// so a rebalance only fails a test when it breaks a rule a player relies on.
import assert from "node:assert/strict";
import test from "node:test";
import {
  COST_GROWTH,
  ENGINES,
  GUARANTEES,
  LEGACY_BONUS_PER_RUN,
  OFFLINE_CAP_SECONDS,
  STAGES,
  VICTORY_THRESHOLD,
  applyOffline,
  buyEngine,
  canBuyEngine,
  canEnshrine,
  challengeQuery,
  click,
  decodeSave,
  elapsedMs,
  encodeSave,
  enshrine,
  featuredEngineFor,
  formatTime,
  freshState,
  guaranteeMultiplier,
  legacyMultiplier,
  maxPurchase,
  outcomesFor,
  parseChallenge,
  purchaseCost,
  rateForState,
  resetRun,
  sanitizeSave,
  stageFor,
  startNextTimeline,
  tick,
  unitCost,
} from "../src/engine.ts";
import type { SaveState } from "../src/engine.ts";
import { simulateRun } from "../src/bot.ts";

const T0 = 1_700_000_000_000;

function rich(state: SaveState, power: number): SaveState {
  return { ...state, power, totalPower: Math.max(state.totalPower, power) };
}

test("game data is well formed", () => {
  for (const list of [ENGINES, GUARANTEES]) {
    const ids = list.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length, "ids are unique");
  }
  for (const engine of ENGINES) {
    assert.ok(engine.baseCost > 0 && engine.baseRate > 0, `${engine.id} has a cost and an output`);
    assert.ok(engine.unlock < engine.baseCost * 10, `${engine.id} is reachable soon after it unlocks`);
  }
  for (let index = 1; index < ENGINES.length; index += 1) {
    assert.ok(ENGINES[index].unlock >= ENGINES[index - 1].unlock, "engines unlock in list order");
  }
  for (const guarantee of GUARANTEES) {
    assert.ok(guarantee.boost > 1, `${guarantee.id} multiplies output`);
    assert.ok(guarantee.cost > 0 && guarantee.unlock <= guarantee.cost, `${guarantee.id} is visible before it is affordable`);
  }
  assert.equal(STAGES[0].threshold, 0, "the first phase starts at zero");
  for (let index = 1; index < STAGES.length; index += 1) {
    assert.ok(STAGES[index].threshold > STAGES[index - 1].threshold, "phase thresholds rise");
  }
  assert.equal(STAGES[STAGES.length - 1].threshold, VICTORY_THRESHOLD, "the last phase is the finish line");
});

test("prices grow by the cost factor and bulk prices add up", () => {
  for (const engine of ENGINES) {
    assert.equal(unitCost(engine, 0), Math.floor(engine.baseCost));
    assert.ok(unitCost(engine, 5) > unitCost(engine, 4));
    const exact = engine.baseCost * COST_GROWTH ** 3;
    assert.ok(unitCost(engine, 3) <= exact && unitCost(engine, 3) > exact - 1, "prices are the exact price rounded down");
    let sum = 0;
    for (let level = 2; level < 12; level += 1) sum += unitCost(engine, level);
    assert.equal(purchaseCost(engine, 2, 10), sum);
  }
});

test("MAX never spends more than the player has", () => {
  for (const engine of ENGINES) {
    for (const budget of [0, engine.baseCost - 1, engine.baseCost, engine.baseCost * 37.5, engine.baseCost * 1e4]) {
      const plan = maxPurchase(engine, 3, budget);
      assert.ok(plan.cost <= budget);
      assert.equal(plan.cost, purchaseCost(engine, 3, plan.count));
      if (plan.count < 100) assert.ok(plan.cost + unitCost(engine, 3 + plan.count) > budget, "MAX buys as many as it can");
    }
  }
});

test("buying an engine respects unlocks, price and completion", () => {
  const start = freshState(T0);
  const [first, second] = ENGINES;
  assert.equal(canBuyEngine(start, first.id, 1), false, "nothing is affordable with no power");
  const funded = rich(start, first.baseCost);
  assert.equal(canBuyEngine(funded, first.id, 1), true);
  const bought = buyEngine(funded, first.id, 1, T0);
  assert.equal(bought.levels[first.id], 1);
  assert.equal(bought.power, funded.power - unitCost(first, 0));
  assert.equal(rateForState(bought), first.baseRate);
  const locked = { ...start, power: second.baseCost * 100, totalPower: Math.max(0, second.unlock - 1) };
  if (second.unlock > 0) assert.equal(canBuyEngine(locked, second.id, 1), false, "locked engines cannot be bought");
  assert.equal(canBuyEngine(funded, "no-such-engine", 1), false);
  assert.equal(canBuyEngine(funded, first.id, 0), false);
  assert.equal(canBuyEngine(funded, first.id, 1.5), false);
  assert.equal(buyEngine(start, first.id, 1, T0), start, "a refused purchase returns the same state");
});

test("guarantees are bought once and multiply everything", () => {
  const all = GUARANTEES.map((guarantee) => guarantee.id);
  const product = GUARANTEES.reduce((total, guarantee) => total * guarantee.boost, 1);
  assert.ok(Math.abs(guaranteeMultiplier(all) - product) < 1e-9);
  const guarantee = GUARANTEES[0];
  const funded = rich(freshState(T0), guarantee.cost);
  assert.equal(canEnshrine(funded, guarantee.id), true);
  const once = enshrine(funded, guarantee.id, T0);
  assert.deepEqual(once.guarantees, [guarantee.id]);
  assert.equal(once.power, funded.power - guarantee.cost);
  const again = enshrine(rich(once, guarantee.cost * 2), guarantee.id, T0);
  assert.deepEqual(again.guarantees, [guarantee.id], "a guarantee cannot be bought twice");
  const withEngine = { ...once, levels: { [ENGINES[0].id]: 2 } };
  assert.ok(Math.abs(rateForState(withEngine) - ENGINES[0].baseRate * 2 * guarantee.boost) < 1e-9);
});

test("the run clock starts at the first move, not at page load", () => {
  const start = freshState(T0);
  assert.equal(elapsedMs(start, T0 + 60_000), 0);
  const moved = click(start, T0 + 60_000);
  assert.equal(moved.runStartedAt, T0 + 60_000);
  assert.equal(elapsedMs(moved, T0 + 65_000), 5_000);
  const later = click(moved, T0 + 70_000);
  assert.equal(later.runStartedAt, T0 + 60_000, "later clicks do not restart the clock");
});

test("clicks get stronger with phases, guarantees and replays", () => {
  const start = freshState(T0);
  const first = click(start, T0).power;
  assert.ok(first >= 1);
  const later = click({ ...start, totalPower: STAGES[3].threshold, power: 0 }, T0).power;
  assert.ok(later > first);
  const replay = click(freshState(T0, { run: 3, bestTimeMs: null }), T0).power;
  assert.ok(Math.abs(replay - first * legacyMultiplier(3)) < 1e-9);
});

test("crossing the finish line ends the run and records the best time", () => {
  const started = click(freshState(T0), T0);
  const nearly = { ...started, levels: { [ENGINES[ENGINES.length - 1].id]: 1 }, totalPower: VICTORY_THRESHOLD - 1, power: 0 };
  const done = tick(nearly, 1, T0 + 600_000);
  assert.equal(done.completedAt, T0 + 600_000);
  assert.equal(done.bestTimeMs, 600_000);
  assert.equal(stageFor(done.totalPower), STAGES.length - 1);
  assert.equal(tick(done, 10, T0 + 700_000), done, "a finished run stops producing");
  assert.equal(click(done, T0 + 700_000), done, "a finished run ignores clicks");
  assert.equal(elapsedMs(done, T0 + 9_999_999), 600_000, "the clock stops at the finish");
  const next = startNextTimeline(done, T0 + 800_000);
  assert.equal(next.run, done.run + 1);
  assert.equal(next.bestTimeMs, 600_000);
  assert.equal(next.totalPower, 0);
  const slower = tick({ ...click(next, T0 + 800_000), totalPower: VICTORY_THRESHOLD - 1, levels: nearly.levels }, 1, T0 + 2_000_000);
  assert.equal(slower.bestTimeMs, 600_000, "a slower run keeps the better best time");
  assert.equal(startNextTimeline(next, T0), next, "a new timeline needs a finished one");
  const reset = resetRun(slower, T0);
  assert.equal(reset.run, slower.run);
  assert.equal(reset.bestTimeMs, 600_000);
});

test("replays add the legacy bonus per finished timeline", () => {
  assert.equal(legacyMultiplier(1), 1);
  assert.ok(Math.abs(legacyMultiplier(2) - (1 + LEGACY_BONUS_PER_RUN)) < 1e-12);
  assert.ok(legacyMultiplier(5) > legacyMultiplier(4));
});

test("time away earns production up to the cap", () => {
  const owner = { ...freshState(T0), levels: { [ENGINES[0].id]: 4 }, actions: 1, totalPower: 100, power: 50 };
  const rate = rateForState(owner);
  const hour = applyOffline(owner, T0 + 3_600_000);
  assert.ok(Math.abs(hour.gain - rate * 3600) < 1e-6);
  const week = applyOffline(owner, T0 + 7 * 86_400_000);
  assert.ok(Math.abs(week.gain - rate * OFFLINE_CAP_SECONDS) < 1e-6, "away time is capped");
  const finished = { ...owner, completedAt: T0 };
  assert.equal(applyOffline(finished, T0 + 3_600_000).gain, 0, "finished runs do not earn");
  const backwards = applyOffline({ ...owner, lastSavedAt: T0 + 10_000 }, T0);
  assert.equal(backwards.gain, 0, "a clock that went backwards earns nothing");
});

test("damaged saves are repaired or refused, never trusted", () => {
  assert.equal(sanitizeSave(null, T0), null);
  assert.equal(sanitizeSave("text", T0), null);
  assert.equal(sanitizeSave([1, 2], T0), null);
  const clean = sanitizeSave(
    {
      power: -5,
      totalPower: Number.NaN,
      actions: 3.7,
      levels: { friend: 2, ghost: 9, kitchen: -1, ledger: "4", stewards: 1e9 },
      guarantees: ["receipts", "receipts", "bogus"],
      run: 0,
      runStartedAt: T0 + 50_000,
      completedAt: T0 - 1,
      bestTimeMs: "fast",
      lastSavedAt: T0 + 99_999_999,
    },
    T0 + 100_000,
  )!;
  assert.equal(clean.power, 0);
  assert.equal(clean.totalPower, 0);
  assert.equal(clean.actions, 3);
  assert.deepEqual(Object.keys(clean.levels).sort(), ["friend", "stewards"]);
  assert.ok(clean.levels.stewards <= 500);
  assert.deepEqual(clean.guarantees, ["receipts"]);
  assert.equal(clean.run, 1);
  assert.ok(clean.completedAt === null || clean.completedAt >= clean.runStartedAt);
  assert.equal(clean.bestTimeMs, 0);
  assert.ok(clean.lastSavedAt <= T0 + 100_000, "timestamps from the future are pulled back");
});

test("save codes round-trip and reject anything else", () => {
  let state = click(freshState(T0), T0);
  state = { ...state, levels: { friend: 3 }, guarantees: ["receipts"], power: 1234.5, totalPower: 5678 };
  const code = encodeSave(state);
  assert.match(code, /^SRH1\./);
  assert.deepEqual(decodeSave(code, T0 + 1), state);
  assert.deepEqual(decodeSave(`  ${code}\n`, T0 + 1), state, "surrounding whitespace is ignored");
  assert.equal(decodeSave("SRH1.%%%", T0), null);
  assert.equal(decodeSave("hello", T0), null);
  assert.equal(decodeSave("SRH1." + "A".repeat(30_000), T0), null);
});

test("challenge links carry whole seconds within bounds", () => {
  assert.equal(parseChallenge("?beat=1337"), 1337);
  assert.equal(parseChallenge("?x=1&beat=90&y=2"), 90);
  assert.equal(parseChallenge("?beat=0"), null);
  assert.equal(parseChallenge("?beat=-5"), null);
  assert.equal(parseChallenge("?beat=999999"), null);
  assert.equal(parseChallenge("?beat=12abc"), null);
  assert.equal(parseChallenge(""), null);
  assert.equal(challengeQuery(83_999), "?beat=83", "rounded down like the clock");
  assert.equal(formatTime(83_999), "01:23");
  assert.equal(parseChallenge(challengeQuery(5 * 3_600_000)), 5 * 3600);
});

test("the clock reads mm:ss, then h:mm:ss past an hour", () => {
  assert.equal(formatTime(null), "--:--");
  assert.equal(formatTime(0), "00:00");
  assert.equal(formatTime(59_999), "00:59");
  assert.equal(formatTime(61_000), "01:01");
  assert.equal(formatTime(3_600_000 + 62_000), "1:01:02");
});

test("the scoreboard stays inside its ranges", () => {
  for (const total of [0, 1, STAGES[3].threshold, STAGES[6].threshold, VICTORY_THRESHOLD, VICTORY_THRESHOLD * 4]) {
    const state = { ...freshState(T0), totalPower: total, actions: 1, guarantees: GUARANTEES.map((g) => g.id) };
    const result = outcomesFor(state);
    for (const value of [result.needsMet, result.cleanEnergy, result.civicAgency, result.heavenScore, result.mapProgressPercent]) {
      assert.ok(value >= 0 && value <= 100, `value ${value} is a percentage at total ${total}`);
    }
    assert.ok(result.consent <= 98);
  }
  const full = outcomesFor({ ...freshState(T0), totalPower: VICTORY_THRESHOLD, guarantees: GUARANTEES.map((g) => g.id) });
  assert.equal(full.heavenScore, 100, "a finished run with every guarantee scores 100");
});

test("the next-upgrade button always offers the cheapest unlocked engine", () => {
  const state: SaveState = { ...freshState(T0), totalPower: VICTORY_THRESHOLD, levels: { friend: 30, kitchen: 2 } };
  const featured = featuredEngineFor(state);
  const cheapest = Math.min(...ENGINES.map((engine) => unitCost(engine, state.levels[engine.id] || 0)));
  assert.equal(unitCost(featured, state.levels[featured.id] || 0), cheapest);
});

test("every play style can finish, and routing beats the lit button", () => {
  const styles = [
    { clicksPerSecond: 1, strategy: "cheapest" as const },
    { clicksPerSecond: 4, strategy: "cheapest" as const },
    { clicksPerSecond: 1, strategy: "payback" as const },
    { clicksPerSecond: 4, strategy: "payback" as const },
  ];
  const results = styles.map((style) => simulateRun(style));
  for (const [index, result] of results.entries()) {
    assert.ok(result.completed, `style ${index} finishes`);
    assert.ok(result.seconds < 2 * 3600, `style ${index} finishes inside two hours`);
    assert.ok(result.seconds > 60, `style ${index} is not over in a minute`);
    assert.equal(result.phaseSeconds.length, STAGES.length - 1, "every phase is crossed");
  }
  assert.ok(results[3].seconds < results[1].seconds, "buying by payback is faster than pressing the lit button");
  const replay = simulateRun({ clicksPerSecond: 4, strategy: "payback", run: 2 });
  assert.ok(replay.seconds < results[3].seconds, "a replay is faster");
});
