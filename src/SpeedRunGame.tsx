import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ENGINES,
  FIELD_LOG,
  GUARANTEES,
  OFFLINE_CAP_SECONDS,
  STAGES,
  STORAGE_KEY,
  TICKS_PER_SECOND,
  VICTORY_THRESHOLD,
  applyOffline,
  buyEngine,
  canBuyEngine,
  canEnshrine,
  click,
  clickPowerFor,
  decodeSave,
  elapsedMs as elapsedFor,
  encodeSave,
  enshrine,
  featuredEngineFor,
  formatNumber,
  formatTime,
  freshState,
  guaranteeMultiplier,
  hasStarted,
  legacyMultiplier,
  maxPurchase,
  MAX_HOURS_RETURNED,
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
} from "./engine.ts";
import type { Engine, Guarantee, SaveState } from "./engine.ts";
import type { SiteConfig } from "./config.ts";
import { track } from "./config.ts";
import SharePanel from "./SharePanel.tsx";
import { copyText } from "./share.ts";

type BulkMode = 1 | 10 | "max";

const CHALLENGE_KEY = "speed-run-heaven-challenge-v1";

// localStorage can be missing or blocked (private windows, embedded frames). The game still plays.
const storage = {
  get(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to remove.
    }
  },
};

export default function SpeedRunGame({ config }: { config: SiteConfig }) {
  const [state, setState] = useState<SaveState>(() => freshState(0));
  const [ready, setReady] = useState(false);
  const [clock, setClock] = useState(0);
  const [bulkMode, setBulkMode] = useState<BulkMode>(1);
  const [burst, setBurst] = useState(0);
  const [resetArmed, setResetArmed] = useState(false);
  const [challenge, setChallenge] = useState<number | null>(null);
  const [saveWorks, setSaveWorks] = useState(true);
  const [saveCode, setSaveCode] = useState("");
  const [notice, setNotice] = useState(
    "The run begins with one idea: public power should buy the public a better life.",
  );
  const previousStage = useRef(0);
  const lastTick = useRef(0);
  const wasComplete = useRef(false);
  const latest = useRef<SaveState | null>(null);

  useEffect(() => {
    const now = Date.now();
    let next = freshState(now);
    const saved = storage.get(STORAGE_KEY);
    if (saved) {
      try {
        const clean = sanitizeSave(JSON.parse(saved), now);
        if (clean) {
          const offline = applyOffline(clean, now);
          next = offline.state;
          if (offline.gain >= 1) {
            setNotice(`While you were away, the public stack generated ${formatNumber(offline.gain, true)} power.`);
          }
        }
      } catch {
        storage.remove(STORAGE_KEY);
      }
    }
    const linked = parseChallenge(window.location.search);
    const remembered = parseChallenge(`?beat=${storage.get(CHALLENGE_KEY) || ""}`);
    if (linked) storage.set(CHALLENGE_KEY, String(linked));
    // One-time client hydration from the device-local save.
    setChallenge(linked ?? remembered);
    setState(next);
    setSaveWorks(storage.set(STORAGE_KEY, JSON.stringify(next)));
    previousStage.current = stageFor(next.totalPower);
    wasComplete.current = Boolean(next.completedAt);
    lastTick.current = now;
    setClock(now);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const ticker = window.setInterval(() => {
      const now = Date.now();
      // Real elapsed time, so a throttled background tab keeps producing at full rate.
      const seconds = Math.min(Math.max(0, now - lastTick.current) / 1000, OFFLINE_CAP_SECONDS);
      lastTick.current = now;
      setClock(now);
      setState((current) => tick(current, seconds, now));
    }, 1000 / TICKS_PER_SECOND);
    return () => window.clearInterval(ticker);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    latest.current = state;
    const saver = window.setTimeout(() => {
      storage.set(STORAGE_KEY, JSON.stringify({ ...state, lastSavedAt: Date.now() }));
    }, 80);
    return () => window.clearTimeout(saver);
  }, [state, ready]);

  // Write the save at once when the page is hidden or closed, so the last moves are never lost.
  useEffect(() => {
    if (!ready) return;
    const flush = () => {
      if (latest.current) storage.set(STORAGE_KEY, JSON.stringify({ ...latest.current, lastSavedAt: Date.now() }));
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (state.completedAt && !wasComplete.current) {
      storage.set(STORAGE_KEY, JSON.stringify({ ...state, lastSavedAt: Date.now() }));
      setNotice("RUN COMPLETE — America measures wealth in time, agency, health, and a living world.");
      track("run_complete");
    }
    wasComplete.current = Boolean(state.completedAt);
  }, [ready, state]);

  const rate = useMemo(() => rateForState(state), [state]);
  const guardMultiplier = useMemo(() => guaranteeMultiplier(state.guarantees), [state.guarantees]);
  const outcomes = useMemo(() => outcomesFor(state), [state]);
  const { stageIndex, stageProgress, worldProgress, needsMet, hoursReturned, cleanEnergy, civicAgency, heavenScore } = outcomes;
  const stage = STAGES[stageIndex];
  const nextStage = STAGES[Math.min(stageIndex + 1, STAGES.length - 1)];
  const atEnd = stageIndex === STAGES.length - 1;
  const clickPower = clickPowerFor(state);
  const runMultiplier = legacyMultiplier(state.run);
  const elapsed = ready ? elapsedFor(state, clock) : 0;
  const featuredEngine = featuredEngineFor(state);
  const featuredLevel = state.levels[featuredEngine.id] || 0;
  const featuredCost = unitCost(featuredEngine, featuredLevel);
  const featuredCanBuy = state.power >= featuredCost && !state.completedAt;
  const complete = Boolean(state.completedAt);
  const runDuration = state.completedAt ? state.completedAt - state.runStartedAt : null;

  useEffect(() => {
    if (!ready) return;
    if (stageIndex > previousStage.current) {
      setNotice(`${STAGES[stageIndex].name.toUpperCase()} — ${STAGES[stageIndex].copy}`);
      track(`phase_${STAGES[stageIndex].number}`);
    }
    previousStage.current = stageIndex;
  }, [ready, stageIndex]);

  useEffect(() => {
    if (!ready || state.completedAt) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (event.code === "Space" && tag !== "BUTTON" && tag !== "TEXTAREA" && tag !== "INPUT" && tag !== "SUMMARY" && tag !== "A") {
        event.preventDefault();
        makeContact();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function makeContact() {
    if (state.completedAt) return;
    const now = Date.now();
    if (!hasStarted(state)) track("run_start");
    setState((current) => click(current, now));
    setBurst((current) => current + 1);
    if ((state.actions + 1) % 11 === 0) {
      setNotice(FIELD_LOG[Math.floor((state.actions + 1) / 11) % FIELD_LOG.length]);
    }
  }

  function purchasePlan(engine: Engine) {
    const level = state.levels[engine.id] || 0;
    if (bulkMode === "max") return maxPurchase(engine, level, state.power);
    return { count: bulkMode, cost: purchaseCost(engine, level, bulkMode) };
  }

  function buy(engine: Engine, quickCount?: number) {
    const level = state.levels[engine.id] || 0;
    const plan = quickCount
      ? { count: quickCount, cost: purchaseCost(engine, level, quickCount) }
      : purchasePlan(engine);
    if (!canBuyEngine(state, engine.id, plan.count)) return;
    const now = Date.now();
    setState((current) => buyEngine(current, engine.id, plan.count, now));
    const addedRate = engine.baseRate * plan.count * guardMultiplier * runMultiplier;
    setNotice(`${engine.name} ×${plan.count} deployed. The loop adds +${formatNumber(addedRate, true)} power/sec.`);
  }

  function enshrineGuarantee(guarantee: Guarantee) {
    if (!canEnshrine(state, guarantee.id)) return;
    const now = Date.now();
    setState((current) => enshrine(current, guarantee.id, now));
    setNotice(`${guarantee.number} ENSHRINED — ${guarantee.promise} All public systems accelerate ×${guarantee.boost.toFixed(2)}.`);
  }

  function reset() {
    if (!resetArmed) {
      setResetArmed(true);
      setNotice("Press reset again to erase this run. Your best time will be kept.");
      return;
    }
    const next = resetRun(state, Date.now());
    storage.set(STORAGE_KEY, JSON.stringify(next));
    setState(next);
    setResetArmed(false);
    previousStage.current = 0;
    setNotice("A blank page. One citizen. The clock starts on your first move.");
  }

  function startBetterTimeline() {
    const next = startNextTimeline(state, Date.now());
    if (next === state) return;
    storage.set(STORAGE_KEY, JSON.stringify(next));
    setState(next);
    setResetArmed(false);
    previousStage.current = 0;
    track("next_timeline");
    setNotice("NEW TIMELINE — experience makes every system 25% faster. Start with one person.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function dismissChallenge() {
    storage.remove(CHALLENGE_KEY);
    setChallenge(null);
  }

  async function copySaveCode() {
    const copied = await copyText(encodeSave({ ...state, lastSavedAt: Date.now() }));
    setNotice(copied ? "Save code copied. Paste it into this game on any device to carry on." : "Could not copy. Select the code below and copy it by hand.");
    if (!copied) setSaveCode(encodeSave({ ...state, lastSavedAt: Date.now() }));
  }

  function loadSaveCode() {
    const now = Date.now();
    const loaded = decodeSave(saveCode, now);
    if (!loaded) {
      setNotice("That save code could not be read. Copy the whole code and try again.");
      return;
    }
    const next = { ...loaded, lastSavedAt: now };
    storage.set(STORAGE_KEY, JSON.stringify(next));
    setState(next);
    previousStage.current = stageFor(next.totalPower);
    wasComplete.current = Boolean(next.completedAt);
    setSaveCode("");
    setNotice("Save loaded. The run carries on from where it was.");
  }

  const challengeMs = challenge === null ? null : challenge * 1000;
  let challengeLine = null;
  if (challengeMs !== null) {
    if (runDuration === null) {
      challengeLine = (
        <span>
          A friend reached Heaven in <strong>{formatTime(challengeMs)}</strong>. Your clock starts on your first move.
        </span>
      );
    } else if (runDuration < challengeMs) {
      challengeLine = (
        <span>
          You beat the challenge time of <strong>{formatTime(challengeMs)}</strong> by {formatTime(challengeMs - runDuration)}. Send yours back.
        </span>
      );
    } else {
      challengeLine = (
        <span>
          The challenge time of <strong>{formatTime(challengeMs)}</strong> stands. A new timeline runs 25% faster.
        </span>
      );
    }
  }

  return (
    <main className="game-shell">
      <div className="paper-noise" aria-hidden="true" />

      <header className="topbar">
        <a className="wordmark" href="#run" aria-label="Speed Run Heaven home">
          <span className="halo-mark">°</span>
          SPEED RUN <b>HEAVEN</b>
        </a>
        <nav className="quick-nav" aria-label="Jump to game sections">
          <a href="#build"><span>01</span> UPGRADES</a>
          <a href="#guarantees"><span>02</span> GUARANTEES</a>
          <a href="#outcomes"><span>03</span> HEAVEN SCORE</a>
        </nav>
        <div className="run-clock" aria-label={`Run time ${formatTime(elapsed)}`}>
          <span>RUN {String(state.run).padStart(2, "0")}</span>
          <b data-testid="run-clock">{formatTime(elapsed)}</b>
          <small>BEST {formatTime(state.bestTimeMs)}</small>
        </div>
        <button className={`reset-button ${resetArmed ? "armed" : ""}`} type="button" onClick={reset}>
          {resetArmed ? "CONFIRM RESET" : "RESET"}
        </button>
      </header>

      <aside className={`upgrade-dock ${featuredCanBuy ? "ready" : ""} ${complete ? "complete" : ""}`} aria-label="Always-visible controls">
        <button
          type="button"
          className="upgrade-dock-loop"
          onClick={makeContact}
          disabled={complete}
          aria-label={`Gain power: plus ${formatNumber(clickPower)}`}
          data-testid="dock-action"
        >
          <span>1 · CLICK</span><i>+{formatNumber(clickPower)}</i><b>2 · BUY →</b>
        </button>
        <div className="upgrade-dock-copy">
          <small>{complete ? "TIMELINE COMPLETE" : `NEXT UPGRADE · ${featuredEngine.code} · LEVEL ${String(featuredLevel).padStart(2, "0")}`}</small>
          <strong>{complete ? `Heaven reached in ${formatTime(runDuration)}` : featuredEngine.name}</strong>
          <span>{complete ? "SHARE YOUR CARD, THEN RUN IT FASTER" : `+${formatNumber(featuredEngine.baseRate * guardMultiplier * runMultiplier, true)} POWER / SEC`}</span>
        </div>
        {complete ? (
          <a className="dock-share" href="#share" data-testid="dock-share">SEE YOUR CARD ↓</a>
        ) : (
          <button
            type="button"
            className="dock-buy"
            disabled={!featuredCanBuy}
            onClick={() => buy(featuredEngine, 1)}
            data-engine-dock={featuredEngine.id}
          >
            {featuredCanBuy ? `BUY UPGRADE · ${formatNumber(featuredCost, true)}` : `NEED ${formatNumber(Math.max(0, featuredCost - state.power), true)} MORE`}
          </button>
        )}
        <a href="#build" aria-label="See all nine upgrades">ALL 9 ↓</a>
      </aside>

      <section className="hero" id="run">
        <div className="hero-copy">
          {challengeLine && (
            <aside className="challenge-banner" role="status" data-testid="challenge-banner">
              <b>CHALLENGE</b>
              {challengeLine}
              <button type="button" onClick={dismissChallenge} aria-label="Dismiss the challenge">×</button>
            </aside>
          )}
          <p className="eyebrow"><span /> A DEMOCRATIC ABUNDANCE CLICKER</p>
          <h1><span>Speed</span><span>Run</span><em>Heaven.</em></h1>
          <p className="hero-lede">
            You are an American citizen who notices that government is the country&apos;s
            largest machine for coordinating resources. Win it peacefully. Make AI
            public infrastructure. Point robots at scarcity. Return the upside to everyone.
          </p>
          <div className="route-note">
            <b>THE ONLY WINNING ROUTE</b>
            <span>Consent → constitutional power → accountable automation → shared abundance</span>
          </div>
          <p className="fiction-note" data-testid="fiction-note">
            <b>A WORK OF FICTION</b>
            <span>
              A thought experiment you can play, not a platform, a forecast or a promise. No party, no candidate,
              no campaign, no government behind it. <a href="about/">About this game</a>
            </span>
          </p>
          <nav className="hero-shortcuts" aria-label="Explore the game">
            <a href="#build">UPGRADES <span>↓</span></a>
            <a href="#guarantees">GUARANTEES <span>↓</span></a>
            <a href="#outcomes">HEAVEN SCORE <span>↓</span></a>
          </nav>
        </div>

        <article className="mission-card">
          <div className="mission-topline"><span>PHASE {stage.number} / 08</span><b>{stage.short}</b></div>
          <div className="map-wrap">
            <div className="signal-sun" aria-hidden="true"><span /></div>
            <div
              className="america-grid"
              role="img"
              aria-label={`${outcomes.mapProgressPercent} percent of the United States signal online`}
              style={{ "--map-fill": `${outcomes.mapProgressPercent}%` } as CSSProperties}
            >
              <span className="usa-map-layer usa-map-base" aria-hidden="true" />
              <span className="usa-map-layer usa-map-live" aria-hidden="true" />
              <span className="usa-map-outline" aria-hidden="true" />
            </div>
            <span className="map-label">50-STATE PUBLIC SIGNAL // {outcomes.mapProgressPercent}% ONLINE</span>
          </div>
          <div className="stage-copy">
            <span className="phase-number">{stage.number}</span>
            <div><h2 data-testid="phase-name">{stage.name}</h2><p>{stage.copy}</p></div>
          </div>
          <div className="meter-label">
            <span>{atEnd ? "HEAVEN: MEASURED" : `NEXT — ${nextStage.name.toUpperCase()}`}</span><b>{Math.round(stageProgress)}%</b>
          </div>
          <div className="big-meter" aria-hidden="true"><span style={{ width: `${stageProgress}%` }} /></div>
          {!atEnd && <small className="meter-foot">{formatNumber(nextStage.threshold - state.totalPower, true)} power to next phase</small>}
        </article>

        <aside className="action-card">
          <div className="action-heading"><span>1 · GAIN POWER</span><b>SPACEBAR</b></div>
          <button className="main-action" type="button" onClick={makeContact} disabled={complete} data-testid="main-action">
            <span className="action-orbit" aria-hidden="true"><i /><i /><i /></span>
            <strong>{stageIndex < 4 ? "TELL ONE\nPERSON" : "UNBLOCK ONE\nSYSTEM"}</strong>
            <small>{stageIndex < 4 ? "MAKE THE FUTURE LEGIBLE" : "MAKE THE FUTURE CHEAPER"}</small>
            <em key={burst}>+{formatNumber(clickPower)}</em>
          </button>
          <section className={`quick-upgrade ${featuredCanBuy ? "ready" : ""}`} data-testid="quick-upgrade" aria-label="Buy the next upgrade">
            <div className="quick-upgrade-top"><span>2 · BUY AN UPGRADE</span><b>CHEAPEST NEXT</b></div>
            <div className="quick-upgrade-body">
              <div className="quick-upgrade-copy">
                <small>{featuredEngine.code} · LEVEL {String(featuredLevel).padStart(2, "0")}</small>
                <strong>{featuredEngine.name}</strong>
                <span>+{formatNumber(featuredEngine.baseRate * guardMultiplier * runMultiplier, true)} POWER / SEC</span>
              </div>
              <button
                type="button"
                disabled={!featuredCanBuy}
                onClick={() => buy(featuredEngine, 1)}
                data-engine-quick={featuredEngine.id}
              >
                {featuredCanBuy
                  ? `BUY · ${formatNumber(featuredCost, true)}`
                  : `${formatNumber(state.power, true)} / ${formatNumber(featuredCost, true)}`}
              </button>
            </div>
            <div className="quick-upgrade-foot">
              <span>{complete ? "TIMELINE COMPLETE" : featuredCanBuy ? "READY — BUY IT NOW" : "CLICK ABOVE UNTIL THIS LIGHTS UP"}</span>
              <a href="#build">ALL 9 UPGRADES ↓</a>
            </div>
          </section>
          <div className="field-log" role="status" aria-live="polite"><span>LIVE FEED</span><p data-testid="notice">{notice}</p></div>
          <div className="save-line">
            <i /> {saveWorks ? "SAVED ON THIS DEVICE · EARNS 2H OFFLINE" : "THIS BROWSER BLOCKS SAVES · KEEP THE TAB OPEN"}
          </div>
        </aside>
      </section>

      <section className="stat-strip" aria-label="Run statistics">
        <article className="power-stat"><span>PUBLIC POWER</span><b data-testid="power-value">{formatNumber(state.power, true)}</b><small>SPENDABLE</small></article>
        <article><span>POWER / SEC</span><b data-testid="rate-value">+{formatNumber(rate, true)}</b><small>COMPOUNDING</small></article>
        <article><span>PEOPLE LINKED</span><b>{formatNumber(outcomes.citizens, true)}</b><small>ESTIMATED</small></article>
        <article><span>PUBLIC CONSENT</span><b>{outcomes.consent}%</b><small>TRUST, NOT FEAR</small></article>
        <article><span>SYSTEM BOOST</span><b data-testid="boost-value">×{(guardMultiplier * runMultiplier).toFixed(2)}</b><small>GUARANTEED</small></article>
      </section>

      <section className="build-section" id="build">
        <div className="section-heading">
          <div><span className="section-index">01</span><p className="eyebrow">COMPOUND CAPACITY</p><h2>Build the machine<br />that builds the future.</h2></div>
          <div className="heading-aside">
            <p>Every loop automates the loop before it. First people coordinate. Then institutions. Then intelligence. Then matter.</p>
            <div className="bulk-picker" role="group" aria-label="Purchase quantity">
              {([1, 10, "max"] as BulkMode[]).map((mode) => (
                <button type="button" className={bulkMode === mode ? "active" : ""} aria-pressed={bulkMode === mode} onClick={() => setBulkMode(mode)} key={mode}>
                  {mode === "max" ? "MAX" : `×${mode}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="engine-list">
          {ENGINES.map((engine) => {
            const level = state.levels[engine.id] || 0;
            const plan = purchasePlan(engine);
            const unlocked = state.totalPower >= engine.unlock;
            const canBuy = unlocked && plan.count > 0 && state.power >= plan.cost;
            return (
              <article className={`engine-row ${unlocked ? "" : "locked"}`} key={engine.id}>
                <div className="engine-code"><span>{engine.code}</span><b>{engine.era}</b></div>
                <div className="engine-copy"><span>{engine.verb}</span><h3>{engine.name}</h3><p>{engine.detail}</p></div>
                <div className="engine-output"><span>OWNED</span><b>{String(level).padStart(2, "0")}</b><small>+{formatNumber(engine.baseRate * level * guardMultiplier * runMultiplier, true)}/s</small></div>
                <button type="button" disabled={!canBuy || complete} onClick={() => buy(engine)} data-engine={engine.id}>
                  {!unlocked ? `UNLOCK ${formatNumber(engine.unlock, true)}` : plan.count < 1 ? "NEED POWER" : `BUILD ×${plan.count} · ${formatNumber(plan.cost, true)}`}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="guarantee-section" id="guarantees">
        <div className="section-heading inverse">
          <div><span className="section-index">02</span><p className="eyebrow">POWER NEEDS A CONTAINER</p><h2>Bind the future<br />before it gets powerful.</h2></div>
          <div className="heading-aside">
            <p>You do not win by maximizing capability. You win by making capability public, contestable, broadly owned, and visibly useful.</p>
            <div className="constitution-count"><b data-testid="guarantee-count">{state.guarantees.length}/{GUARANTEES.length}</b><span>GUARANTEES<br />ENSHRINED</span></div>
          </div>
        </div>

        <div className="guarantee-grid">
          {GUARANTEES.map((guarantee) => {
            const enshrined = state.guarantees.includes(guarantee.id);
            const unlocked = state.totalPower >= guarantee.unlock;
            const canBuy = unlocked && state.power >= guarantee.cost && !enshrined;
            return (
              <article className={`${enshrined ? "enshrined" : ""} ${unlocked ? "" : "locked"}`} key={guarantee.id}>
                <div className="guarantee-topline"><span>{guarantee.number}</span><b>×{guarantee.boost.toFixed(2)}</b></div>
                <h3>{guarantee.name}</h3><strong>{guarantee.promise}</strong><p>{guarantee.detail}</p>
                <button type="button" disabled={!canBuy || complete} onClick={() => enshrineGuarantee(guarantee)} data-guarantee={guarantee.id}>
                  {enshrined ? "✓ ENSHRINED" : !unlocked ? `VISIBLE AT ${formatNumber(guarantee.unlock, true)}` : `ENSHRINE · ${formatNumber(guarantee.cost, true)}`}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="outcome-section" id="outcomes">
        <div className="section-heading">
          <div><span className="section-index">03</span><p className="eyebrow">THE HEAVEN TEST</p><h2>Never count robots.<br />Count the life they return.</h2></div>
          <div className="heaven-score"><span>HEAVEN SCORE</span><b data-testid="heaven-score">{heavenScore}</b><em>/100</em></div>
        </div>

        <div className="outcome-grid">
          <article className="outcome-card warm"><span>01 · MATERIAL FLOOR</span><b>{needsMet}%</b><h3>Basic needs met</h3><p>Food, shelter, healthcare, energy, and mobility available as reliable foundations.</p><div><i style={{ width: `${needsMet}%` }} /></div></article>
          <article className="outcome-card sky"><span>02 · TIME DIVIDEND</span><b>{hoursReturned.toFixed(1)}h</b><h3>Returned each week</h3><p>Less compulsory labor. More care, play, learning, making, rest, and local life.</p><div><i style={{ width: `${(hoursReturned / MAX_HOURS_RETURNED) * 100}%` }} /></div></article>
          <article className="outcome-card green"><span>03 · LIVING INFRASTRUCTURE</span><b>{cleanEnergy}%</b><h3>Clean public energy</h3><p>Abundance runs on infrastructure that restores more of the world than it consumes.</p><div><i style={{ width: `${cleanEnergy}%` }} /></div></article>
          <article className="outcome-card violet"><span>04 · HUMAN SOVEREIGNTY</span><b>{civicAgency}%</b><h3>Meaningful public agency</h3><p>People can inspect, appeal, change, exit, and collectively redirect their systems.</p><div><i style={{ width: `${civicAgency}%` }} /></div></article>
        </div>

        <article className={`finale ${complete ? "complete" : ""}`} data-testid="finale">
          <div className="finale-orbit" aria-hidden="true"><i /><i /><i /><b>°</b></div>
          <div>
            <span>{complete ? "TIMELINE COMPLETE" : "FINAL THESIS"}</span>
            <h2>{complete ? "You made the future arrive for everyone." : "Heaven is not a place. It is a public scorecard."}</h2>
            <p>{complete
              ? "You did not conquer the country. You made a program legible, won consent, bound power with guarantees, and converted machine capability into human freedom."
              : "The persuasive idea is the loop itself: democratic legitimacy unlocks public-scale coordination; public AI lowers cognitive costs; robotics lowers material costs; shared ownership turns the gain into time and agency."}
            </p>
          </div>
          {complete ? (
            <button type="button" onClick={startBetterTimeline} data-testid="next-timeline">RUN A BETTER TIMELINE <small>+25% PERMANENT SPEED</small></button>
          ) : (
            <div className="finale-progress"><span>{formatNumber(Math.max(0, VICTORY_THRESHOLD - state.totalPower), true)} POWER REMAINS</span><div><i style={{ width: `${worldProgress * 100}%` }} /></div></div>
          )}
        </article>

        {complete && runDuration !== null && (
          <SharePanel
            config={config}
            durationMs={runDuration}
            run={state.run}
            heavenScore={heavenScore}
            guarantees={state.guarantees.length}
            actions={state.actions}
            onNotice={setNotice}
          />
        )}
      </section>

      <footer>
        <div className="footer-mark"><span>°</span> SPEED RUN HEAVEN</div>
        <p>
          A hopeful fiction about democratic power, public technology, and a future worth making real.
          Not affiliated with any party, candidate, campaign or government.
        </p>
        <a href="#run">BACK TO THE RUN ↑</a>
        <nav className="footer-links" aria-label="More about this game">
          <a href="guide/">HOW TO PLAY &amp; SPEEDRUN ROUTES</a>
          <a href="about/">ABOUT, PRIVACY &amp; CREDITS</a>
          <a href={config.repoUrl} rel="noopener">SOURCE CODE</a>
          {config.supportUrl && (
            <a className="support-link" href={config.supportUrl} rel="noopener" data-testid="support-link">{config.supportLabel}</a>
          )}
        </nav>
        {config.moreGames.length > 0 && (
          <div className="more-games" data-testid="more-games">
            <b>MORE GAMES IN THIS LINE</b>
            {config.moreGames.map((game) => (
              <a href={game.url} key={game.url} rel="noopener"><strong>{game.name}</strong><span>{game.blurb}</span></a>
            ))}
          </div>
        )}
        <details className="save-tools">
          <summary>MOVE OR BACK UP YOUR SAVE</summary>
          <p>Your run lives in this browser only. A save code carries it to another browser or device. No account, nothing uploaded.</p>
          <div className="save-tools-row">
            <button type="button" onClick={copySaveCode} data-testid="copy-save">COPY SAVE CODE</button>
          </div>
          <label htmlFor="save-code">PASTE A SAVE CODE</label>
          <textarea
            id="save-code"
            value={saveCode}
            onChange={(event) => setSaveCode(event.target.value)}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            data-testid="save-code"
          />
          <div className="save-tools-row">
            <button type="button" onClick={loadSaveCode} disabled={!saveCode.trim()} data-testid="load-save">LOAD THIS SAVE</button>
          </div>
        </details>
      </footer>
    </main>
  );
}
