// Speed Run Heaven: the whole game as data and pure functions. No DOM, no React, no clock of its own.
// The UI (SpeedRunGame.tsx), the unit tests and the scripted playthrough all run on this one module.

export type LevelMap = Record<string, number>;

export type SaveState = {
  power: number;
  totalPower: number;
  actions: number;
  levels: LevelMap;
  guarantees: string[];
  run: number;
  runStartedAt: number;
  completedAt: number | null;
  bestTimeMs: number | null;
  lastSavedAt: number;
};

export type Engine = {
  id: string;
  code: string;
  name: string;
  verb: string;
  detail: string;
  baseCost: number;
  baseRate: number;
  unlock: number;
  era: string;
};

export type Guarantee = {
  id: string;
  number: string;
  name: string;
  promise: string;
  detail: string;
  cost: number;
  unlock: number;
  boost: number;
};

export type Stage = {
  number: string;
  threshold: number;
  name: string;
  short: string;
  copy: string;
};

export const STORAGE_KEY = "speed-run-heaven-save-v1";
export const VICTORY_THRESHOLD = 25_000_000;
export const COST_GROWTH = 1.62;
export const OFFLINE_CAP_SECONDS = 60 * 60 * 2;
export const LEGACY_BONUS_PER_RUN = 0.25;
export const TICKS_PER_SECOND = 4;
export const MAX_HOURS_RETURNED = 31.5;

export const ENGINES: Engine[] = [
  {
    id: "friend",
    code: "CIV-01",
    name: "Text one friend",
    verb: "ONE PERSON MAKES THE NEXT CALL",
    detail: "A future becomes plausible the moment two people can point at the same plan.",
    baseCost: 10,
    baseRate: 0.65,
    unlock: 0,
    era: "CITIZEN",
  },
  {
    id: "kitchen",
    code: "CIV-02",
    name: "Host kitchen tables",
    verb: "SMALL ROOMS, HONEST QUESTIONS",
    detail: "Turn private agreement into common knowledge without turning it into a cult.",
    baseCost: 70,
    baseRate: 3.2,
    unlock: 40,
    era: "NEIGHBORHOOD",
  },
  {
    id: "ledger",
    code: "CIV-03",
    name: "Publish the ledger",
    verb: "EVERY CLAIM SHOWS ITS WORK",
    detail: "Open costs, models, votes, and mistakes. Trust compounds when doubt is allowed.",
    baseCost: 440,
    baseRate: 15,
    unlock: 250,
    era: "TRUST",
  },
  {
    id: "stewards",
    code: "CIV-04",
    name: "Train local stewards",
    verb: "LEADERSHIP WITHOUT A MASCOT",
    detail: "Give thousands of ordinary people a repeatable way to listen, verify, and act.",
    baseCost: 2_400,
    baseRate: 70,
    unlock: 1_400,
    era: "MOVEMENT",
  },
  {
    id: "coalition",
    code: "CIV-05",
    name: "Link all 50 states",
    verb: "A COALITION AROUND OUTCOMES",
    detail: "Different lives, one scorecard: lower costs, more time, more agency, cleaner air.",
    baseCost: 12_500,
    baseRate: 330,
    unlock: 8_000,
    era: "NATIONAL",
  },
  {
    id: "ballot",
    code: "CIV-06",
    name: "Win the public mandate",
    verb: "BALLOTS, CONSENT, A PEACEFUL TRANSFER",
    detail: "The program interviews the candidates. The public can fire anyone who breaks it.",
    baseCost: 65_000,
    baseRate: 1_450,
    unlock: 40_000,
    era: "DEMOCRACY",
  },
  {
    id: "public-ai",
    code: "SYS-01",
    name: "Deploy public AI",
    verb: "INTELLIGENCE AS INFRASTRUCTURE",
    detail: "Automate forms, research, logistics, and tutoring while every decision stays appealable.",
    baseCost: 310_000,
    baseRate: 7_000,
    unlock: 220_000,
    era: "INTELLIGENCE",
  },
  {
    id: "robot-corps",
    code: "SYS-02",
    name: "Launch the Robot Corps",
    verb: "PUBLIC MACHINES DO PUBLIC WORK",
    detail: "Build homes, restore land, move goods, and maintain the physical world at cost.",
    baseCost: 1_500_000,
    baseRate: 35_000,
    unlock: 1_000_000,
    era: "ROBOTICS",
  },
  {
    id: "abundance",
    code: "SYS-03",
    name: "Close the cost-of-living loop",
    verb: "AUTOMATION PAYS EVERYONE",
    detail: "When society owns part of the stack, productivity becomes time and freedom for all.",
    baseCost: 7_200_000,
    baseRate: 180_000,
    unlock: 5_000_000,
    era: "ABUNDANCE",
  },
];

export const GUARANTEES: Guarantee[] = [
  {
    id: "receipts",
    number: "G-01",
    name: "Radical receipts",
    promise: "The system must show its work.",
    detail: "Budgets, models, contracts, failures, and performance stay legible to the public.",
    cost: 250,
    unlock: 125,
    boost: 1.15,
  },
  {
    id: "public-code",
    number: "G-02",
    name: "Public code",
    promise: "No black-box sovereign.",
    detail: "Core public models are inspectable, contestable, and forkable by independent teams.",
    cost: 5_000,
    unlock: 4_000,
    boost: 1.25,
  },
  {
    id: "rights",
    number: "G-03",
    name: "A bill of digital rights",
    promise: "People are ends, never inputs.",
    detail: "Privacy, due process, explanation, exit, and equal protection survive automation.",
    cost: 80_000,
    unlock: 60_000,
    boost: 1.4,
  },
  {
    id: "appeal",
    number: "G-04",
    name: "Human appeal",
    promise: "Every machine decision can be challenged.",
    detail: "Fast independent review turns public AI from a ruler into an accountable tool.",
    cost: 500_000,
    unlock: 400_000,
    boost: 1.6,
  },
  {
    id: "dividend",
    number: "G-05",
    name: "Universal dividend",
    promise: "Automation pays the public first.",
    detail: "A share of machine productivity lands with every person, not one owner.",
    cost: 3_000_000,
    unlock: 2_000_000,
    boost: 1.8,
  },
  {
    id: "earth",
    number: "G-06",
    name: "Earth budget",
    promise: "Abundance stays inside a living world.",
    detail: "Energy, material, water, and habitat limits are hard constraints, not suggestions.",
    cost: 12_000_000,
    unlock: 8_000_000,
    boost: 2,
  },
];

export const STAGES: Stage[] = [
  {
    number: "01",
    threshold: 0,
    name: "One citizen",
    short: "SAY IT",
    copy: "You notice the obvious: the largest resource allocator in the country is public power. So you write down what it should do.",
  },
  {
    number: "02",
    threshold: 125,
    name: "Common knowledge",
    short: "SHARE IT",
    copy: "People stop wondering whether they are alone. The plan spreads because it is concrete enough to criticize.",
  },
  {
    number: "03",
    threshold: 4_000,
    name: "A national network",
    short: "LINK IT",
    copy: "A movement appears without surrendering itself to a personality. Outcomes are the organizing object.",
  },
  {
    number: "04",
    threshold: 60_000,
    name: "The public mandate",
    short: "WIN IT",
    copy: "Candidates compete to execute a transparent program. Every route to power runs through voters.",
  },
  {
    number: "05",
    threshold: 400_000,
    name: "Peaceful transfer",
    short: "GOVERN IT",
    copy: "You take office constitutionally. The movement becomes accountable public machinery—and can be voted out.",
  },
  {
    number: "06",
    threshold: 2_000_000,
    name: "Public intelligence",
    short: "AUTOMATE IT",
    copy: "AI removes administrative scarcity first. Benefits arrive as shorter lines, better services, and hours returned.",
  },
  {
    number: "07",
    threshold: 8_000_000,
    name: "Robotic abundance",
    short: "BUILD IT",
    copy: "Machine labor attacks the physical bottlenecks: energy, housing, food, care, logistics, and restoration.",
  },
  {
    number: "08",
    threshold: VICTORY_THRESHOLD,
    name: "Heaven is a metric",
    short: "PROVE IT",
    copy: "The test was never how futuristic the machines looked. The test was whether ordinary life became freer, safer, and more alive.",
  },
];

export const FIELD_LOG = [
  "A neighbor asks for the spreadsheet. That is a good sign.",
  "Someone disagrees in public and the plan gets better.",
  "A local team publishes its first independently checked receipt.",
  "Two rival groups adopt the same outcome scorecard.",
  "A candidate answers the program instead of changing the subject.",
  "The coalition gains a state without buying a single attack ad.",
  "The first automated permit takes four minutes instead of four months.",
  "A public robot finishes a house and posts the true cost.",
];

const ENGINE_BY_ID = new Map(ENGINES.map((engine) => [engine.id, engine]));
const GUARANTEE_BY_ID = new Map(GUARANTEES.map((guarantee) => [guarantee.id, guarantee]));

export function engineById(id: string) {
  return ENGINE_BY_ID.get(id);
}

export function guaranteeById(id: string) {
  return GUARANTEE_BY_ID.get(id);
}

export function freshState(now: number, keep?: Pick<SaveState, "run" | "bestTimeMs">): SaveState {
  return {
    power: 0,
    totalPower: 0,
    actions: 0,
    levels: {},
    guarantees: [],
    run: keep?.run ?? 1,
    runStartedAt: now,
    completedAt: null,
    bestTimeMs: keep?.bestTimeMs ?? null,
    lastSavedAt: now,
  };
}

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function formatNumber(value: number, compact = false) {
  if (!Number.isFinite(value)) return "0";
  if (compact && value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (compact && value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 100_000_000 ? 0 : 1)}M`;
  if (compact && value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  if (value < 10 && value % 1 !== 0) return value.toFixed(1);
  return Math.floor(value).toLocaleString("en-US");
}

// mm:ss, or h:mm:ss once a run passes an hour.
export function formatTime(milliseconds: number | null) {
  if (milliseconds === null) return "--:--";
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const pad = (part: number) => String(part).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds % 60)}`;
  return `${pad(minutes)}:${pad(seconds % 60)}`;
}

export function unitCost(engine: Engine, level: number) {
  return Math.floor(engine.baseCost * Math.pow(COST_GROWTH, level));
}

export function purchaseCost(engine: Engine, level: number, count: number) {
  let total = 0;
  for (let index = 0; index < count; index += 1) total += unitCost(engine, level + index);
  return total;
}

export function maxPurchase(engine: Engine, level: number, available: number, cap = 100) {
  let count = 0;
  let spent = 0;
  while (count < cap) {
    const next = unitCost(engine, level + count);
    if (spent + next > available) break;
    spent += next;
    count += 1;
  }
  return { count, cost: spent };
}

export function guaranteeMultiplier(ids: string[]) {
  return GUARANTEES.reduce((total, guarantee) => (ids.includes(guarantee.id) ? total * guarantee.boost : total), 1);
}

export function legacyMultiplier(run: number) {
  return 1 + Math.max(0, run - 1) * LEGACY_BONUS_PER_RUN;
}

export function systemBoost(state: SaveState) {
  return guaranteeMultiplier(state.guarantees) * legacyMultiplier(state.run);
}

export function rateForState(state: SaveState) {
  const base = ENGINES.reduce((total, engine) => total + (state.levels[engine.id] || 0) * engine.baseRate, 0);
  return base * systemBoost(state);
}

export function stageFor(total: number) {
  let stageIndex = 0;
  STAGES.forEach((stage, index) => {
    if (total >= stage.threshold) stageIndex = index;
  });
  return stageIndex;
}

export function clickPowerFor(state: SaveState) {
  return (
    (1 + (state.levels.friend || 0) * 0.3 + stageFor(state.totalPower) * 0.8) *
    (1 + state.guarantees.length * 0.16) *
    legacyMultiplier(state.run)
  );
}

// The cheapest engine the player has unlocked: what the "next upgrade" buttons offer.
export function featuredEngineFor(state: SaveState) {
  return ENGINES.filter((engine) => state.totalPower >= engine.unlock).reduce((cheapest, engine) => {
    const cheapestCost = unitCost(cheapest, state.levels[cheapest.id] || 0);
    const engineCost = unitCost(engine, state.levels[engine.id] || 0);
    return engineCost < cheapestCost ? engine : cheapest;
  }, ENGINES[0]);
}

export type Outcomes = {
  stageIndex: number;
  stageProgress: number;
  worldProgress: number;
  needsMet: number;
  hoursReturned: number;
  cleanEnergy: number;
  civicAgency: number;
  heavenScore: number;
  citizens: number;
  consent: number;
  mapProgressPercent: number;
};

// Everything the scoreboard shows, derived from the save alone.
export function outcomesFor(state: SaveState): Outcomes {
  const stageIndex = stageFor(state.totalPower);
  const stage = STAGES[stageIndex];
  const nextStage = STAGES[Math.min(stageIndex + 1, STAGES.length - 1)];
  const atEnd = stageIndex === STAGES.length - 1;
  const stageProgress = atEnd
    ? 100
    : clamp((state.totalPower - stage.threshold) / (nextStage.threshold - stage.threshold)) * 100;
  const worldProgress = clamp(state.totalPower / VICTORY_THRESHOLD);
  const automationProgress = clamp(
    (state.totalPower - STAGES[4].threshold) / (VICTORY_THRESHOLD - STAGES[4].threshold),
  );
  const needsMet = Math.round(clamp(worldProgress * 0.9 + state.guarantees.length * 0.017) * 100);
  const hoursReturned = automationProgress * MAX_HOURS_RETURNED;
  const cleanEnergy = Math.round(16 + worldProgress * 84);
  const civicAgency = Math.min(100, Math.round(24 + stageIndex * 7.5 + state.guarantees.length * 4));
  const heavenScore = Math.round(
    (needsMet + (hoursReturned / MAX_HOURS_RETURNED) * 100 + cleanEnergy + civicAgency) / 4,
  );
  const citizens = Math.max(state.actions > 0 ? 1 : 0, Math.floor(Math.pow(state.totalPower, 0.76) * 2.2));
  const consent = Math.min(
    98,
    Math.floor(
      18 + Math.log10(state.totalPower + 1) * 8 + state.guarantees.length * 5 + (state.levels.ledger || 0) * 1.4,
    ),
  );
  const mapProgress = clamp((stageIndex + stageProgress / 100) / (STAGES.length - 1));
  const mapProgressPercent = Math.max(state.actions > 0 ? 2 : 0, Math.round(mapProgress * 100));
  return {
    stageIndex,
    stageProgress,
    worldProgress,
    needsMet,
    hoursReturned,
    cleanEnergy,
    civicAgency,
    heavenScore,
    citizens,
    consent,
    mapProgressPercent,
  };
}

// The run clock starts at the first action, not at page load, so reading the intro costs no time.
export function hasStarted(state: SaveState) {
  return state.actions > 0 || state.totalPower > 0;
}

export function elapsedMs(state: SaveState, now: number) {
  if (state.completedAt) return state.completedAt - state.runStartedAt;
  if (!hasStarted(state)) return 0;
  return Math.max(0, now - state.runStartedAt);
}

// ---- Moves. Each returns a new state, or the same object when the move is not allowed. ----

export function click(state: SaveState, now: number): SaveState {
  if (state.completedAt) return state;
  const gain = clickPowerFor(state);
  return finish(
    {
      ...state,
      power: state.power + gain,
      totalPower: state.totalPower + gain,
      actions: state.actions + 1,
      runStartedAt: hasStarted(state) ? state.runStartedAt : now,
      lastSavedAt: now,
    },
    now,
  );
}

export function tick(state: SaveState, seconds: number, now: number): SaveState {
  if (state.completedAt) return state;
  const gain = rateForState(state) * seconds;
  if (gain <= 0) return state;
  return finish({ ...state, power: state.power + gain, totalPower: state.totalPower + gain, lastSavedAt: now }, now);
}

export function canBuyEngine(state: SaveState, engineId: string, count: number) {
  const engine = ENGINE_BY_ID.get(engineId);
  if (!engine || state.completedAt || !Number.isInteger(count) || count < 1) return false;
  if (state.totalPower < engine.unlock) return false;
  return purchaseCost(engine, state.levels[engine.id] || 0, count) <= state.power;
}

export function buyEngine(state: SaveState, engineId: string, count: number, now: number): SaveState {
  if (!canBuyEngine(state, engineId, count)) return state;
  const engine = ENGINE_BY_ID.get(engineId)!;
  const level = state.levels[engine.id] || 0;
  return {
    ...state,
    power: state.power - purchaseCost(engine, level, count),
    levels: { ...state.levels, [engine.id]: level + count },
    lastSavedAt: now,
  };
}

export function canEnshrine(state: SaveState, guaranteeId: string) {
  const guarantee = GUARANTEE_BY_ID.get(guaranteeId);
  if (!guarantee || state.completedAt) return false;
  if (state.guarantees.includes(guarantee.id)) return false;
  return state.power >= guarantee.cost && state.totalPower >= guarantee.unlock;
}

export function enshrine(state: SaveState, guaranteeId: string, now: number): SaveState {
  if (!canEnshrine(state, guaranteeId)) return state;
  const guarantee = GUARANTEE_BY_ID.get(guaranteeId)!;
  return {
    ...state,
    power: state.power - guarantee.cost,
    guarantees: [...state.guarantees, guarantee.id],
    lastSavedAt: now,
  };
}

// Crossing the victory line ends the run and records the time.
function finish(state: SaveState, now: number): SaveState {
  if (state.completedAt || state.totalPower < VICTORY_THRESHOLD) return state;
  const duration = Math.max(0, now - state.runStartedAt);
  return {
    ...state,
    completedAt: now,
    bestTimeMs: state.bestTimeMs === null ? duration : Math.min(state.bestTimeMs, duration),
    lastSavedAt: now,
  };
}

export function resetRun(state: SaveState, now: number): SaveState {
  return freshState(now, { run: state.run, bestTimeMs: state.bestTimeMs });
}

export function startNextTimeline(state: SaveState, now: number): SaveState {
  if (!state.completedAt) return state;
  return freshState(now, { run: state.run + 1, bestTimeMs: state.bestTimeMs });
}

// Up to two hours of production for time spent away. Returns the new state and the power gained.
export function applyOffline(state: SaveState, now: number): { state: SaveState; gain: number } {
  const seconds = Math.min(Math.max(0, now - (state.lastSavedAt || now)) / 1000, OFFLINE_CAP_SECONDS);
  if (state.completedAt) return { state: { ...state, lastSavedAt: now }, gain: 0 };
  const gain = rateForState(state) * seconds;
  const next = finish({ ...state, power: state.power + gain, totalPower: state.totalPower + gain, lastSavedAt: now }, now);
  return { state: next, gain };
}

function finiteNumber(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

// Turn anything read from storage (or pasted as a save code) into a valid state. Unknown ids and
// impossible numbers are dropped, so a damaged or hand-edited save can never crash the page.
export function sanitizeSave(raw: unknown, now: number): SaveState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const base = freshState(now);
  const levels: LevelMap = {};
  if (input.levels && typeof input.levels === "object" && !Array.isArray(input.levels)) {
    for (const engine of ENGINES) {
      const level = (input.levels as Record<string, unknown>)[engine.id];
      const clean = Math.floor(finiteNumber(level, 0, 0, 500));
      if (clean > 0) levels[engine.id] = clean;
    }
  }
  const guarantees = Array.isArray(input.guarantees)
    ? GUARANTEES.filter((guarantee) => (input.guarantees as unknown[]).includes(guarantee.id)).map((guarantee) => guarantee.id)
    : [];
  const power = finiteNumber(input.power, 0);
  const totalPower = Math.max(power, finiteNumber(input.totalPower, 0));
  const runStartedAt = finiteNumber(input.runStartedAt, base.runStartedAt, 0, now);
  const completedRaw = input.completedAt === null || input.completedAt === undefined ? null : finiteNumber(input.completedAt, now, 0);
  const completedAt = completedRaw === null ? null : Math.max(runStartedAt, Math.min(completedRaw, now));
  const bestRaw = input.bestTimeMs === null || input.bestTimeMs === undefined ? null : finiteNumber(input.bestTimeMs, 0, 0);
  return {
    power,
    totalPower,
    actions: Math.floor(finiteNumber(input.actions, 0)),
    levels,
    guarantees,
    run: Math.max(1, Math.floor(finiteNumber(input.run, 1, 1, 100_000))),
    runStartedAt,
    completedAt,
    bestTimeMs: bestRaw,
    lastSavedAt: finiteNumber(input.lastSavedAt, now, 0, now),
  };
}

// ---- Save codes: move a save between browsers or domains without an account. ----

const SAVE_CODE_PREFIX = "SRH1.";

function toBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(code: string) {
  const binary = atob(code);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSave(state: SaveState) {
  return SAVE_CODE_PREFIX + toBase64(JSON.stringify(state));
}

export function decodeSave(code: string, now: number): SaveState | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith(SAVE_CODE_PREFIX) || trimmed.length > 20_000) return null;
  try {
    return sanitizeSave(JSON.parse(fromBase64(trimmed.slice(SAVE_CODE_PREFIX.length))), now);
  } catch {
    return null;
  }
}

// ---- Challenge links: ?beat=<seconds> shows the time a friend set. ----

export const MAX_CHALLENGE_SECONDS = 60 * 60 * 24;

export function parseChallenge(search: string): number | null {
  const match = /[?&]beat=(\d{1,6})(?:&|$)/.exec(search);
  if (!match) return null;
  const seconds = Number(match[1]);
  return seconds >= 1 && seconds <= MAX_CHALLENGE_SECONDS ? seconds : null;
}

export function challengeQuery(durationMs: number) {
  // Whole seconds, rounded down like the clock, so the link shows exactly the time on the card.
  const seconds = Math.min(MAX_CHALLENGE_SECONDS, Math.max(1, Math.floor(durationMs / 1000)));
  return `?beat=${seconds}`;
}
