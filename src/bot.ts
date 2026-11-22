// A scripted player. The tests use it to prove a run can always be finished, and the guide uses it to
// publish route times that are computed from the live game data instead of typed in by hand.
import {
  ENGINES,
  GUARANTEES,
  STAGES,
  buyEngine,
  canBuyEngine,
  canEnshrine,
  click,
  enshrine,
  featuredEngineFor,
  freshState,
  stageFor,
  tick,
  unitCost,
} from "./engine.ts";
import type { SaveState } from "./engine.ts";

export type Strategy = "cheapest" | "payback";

export type RunResult = {
  completed: boolean;
  seconds: number;
  actions: number;
  phaseSeconds: number[]; // when each phase after the first was reached
  state: SaveState;
};

// "cheapest" presses the game's own "next upgrade" button whenever it lights up.
// "payback" buys whichever unlocked engine returns its cost fastest.
function pickEngine(state: SaveState, strategy: Strategy) {
  if (strategy === "cheapest") return featuredEngineFor(state);
  let best = ENGINES[0];
  let bestPayback = Infinity;
  for (const engine of ENGINES) {
    if (state.totalPower < engine.unlock) continue;
    const payback = unitCost(engine, state.levels[engine.id] || 0) / engine.baseRate;
    if (payback < bestPayback) {
      best = engine;
      bestPayback = payback;
    }
  }
  return best;
}

export function simulateRun({
  clicksPerSecond,
  strategy,
  run = 1,
  maxSeconds = 12 * 60 * 60,
}: {
  clicksPerSecond: number;
  strategy: Strategy;
  run?: number;
  maxSeconds?: number;
}): RunResult {
  const step = 0.25;
  let now = 1_000_000;
  let state = freshState(now, { run, bestTimeMs: null });
  let seconds = 0;
  let clickDebt = 1; // the first click lands at once and starts the clock
  let lastStage = 0;
  const phaseSeconds: number[] = [];
  while (!state.completedAt && seconds < maxSeconds) {
    while (clickDebt >= 1 && !state.completedAt) {
      state = click(state, now);
      clickDebt -= 1;
    }
    for (let guard = 0; guard < 500; guard += 1) {
      let moved = false;
      for (const guarantee of GUARANTEES) {
        if (canEnshrine(state, guarantee.id)) {
          state = enshrine(state, guarantee.id, now);
          moved = true;
        }
      }
      const engine = pickEngine(state, strategy);
      if (canBuyEngine(state, engine.id, 1)) {
        state = buyEngine(state, engine.id, 1, now);
        moved = true;
      }
      if (!moved) break;
    }
    seconds += step;
    now += step * 1000;
    state = tick(state, step, now);
    clickDebt += clicksPerSecond * step;
    const stage = stageFor(state.totalPower);
    while (lastStage < stage) {
      lastStage += 1;
      phaseSeconds.push(seconds);
    }
  }
  return { completed: Boolean(state.completedAt), seconds, actions: state.actions, phaseSeconds, state };
}

export const PHASE_COUNT = STAGES.length;
