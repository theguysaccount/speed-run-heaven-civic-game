// The two reading pages (guide, about). They are rendered to plain HTML at build time and need no script.
// Every number on the guide comes from engine.ts or from the scripted player in bot.ts.
import type { ReactNode } from "react";
import {
  COST_GROWTH,
  ENGINES,
  GUARANTEES,
  LEGACY_BONUS_PER_RUN,
  OFFLINE_CAP_SECONDS,
  STAGES,
  VICTORY_THRESHOLD,
  formatNumber,
  formatTime,
  guaranteeMultiplier,
  unitCost,
} from "./engine.ts";
import { simulateRun } from "./bot.ts";
import type { SiteConfig } from "./config.ts";

function DocShell({ config, label, children }: { config: SiteConfig; label: string; children: ReactNode }) {
  return (
    <main className="game-shell doc-shell">
      <div className="paper-noise" aria-hidden="true" />
      <header className="topbar doc-topbar">
        <a className="wordmark" href="../" aria-label="Speed Run Heaven: play the game">
          <span className="halo-mark">°</span>
          SPEED RUN <b>HEAVEN</b>
        </a>
        <nav className="quick-nav" aria-label="Site">
          <a href="../guide/"><span>01</span> GUIDE</a>
          <a href="../about/"><span>02</span> ABOUT</a>
        </nav>
        <a className="play-link" href="../">PLAY THE GAME →</a>
      </header>
      <article className="doc">
        <p className="eyebrow"><span /> {label}</p>
        {children}
        <p className="doc-play"><a className="play-link" href="../">PLAY SPEED RUN HEAVEN →</a></p>
      </article>
      <footer>
        <div className="footer-mark"><span>°</span> SPEED RUN HEAVEN</div>
        <p>
          A hopeful fiction about democratic power, public technology, and a future worth making real.
          Not affiliated with any party, candidate, campaign or government.
        </p>
        <a href="../">BACK TO THE GAME ↑</a>
        <nav className="footer-links" aria-label="More about this game">
          <a href="../guide/">HOW TO PLAY &amp; SPEEDRUN ROUTES</a>
          <a href="../about/">ABOUT, PRIVACY &amp; CREDITS</a>
          <a href={config.repoUrl} rel="noopener">SOURCE CODE</a>
          {config.supportUrl && <a className="support-link" href={config.supportUrl} rel="noopener">{config.supportLabel}</a>}
        </nav>
      </footer>
    </main>
  );
}

function minutes(seconds: number) {
  return formatTime(seconds * 1000);
}

function payback(cost: number, rate: number) {
  const seconds = cost / rate;
  return seconds >= 90 ? `${(seconds / 60).toFixed(1)} min` : `${seconds.toFixed(1)} s`;
}

const totalBoost = guaranteeMultiplier(GUARANTEES.map((guarantee) => guarantee.id));
const offlineHours = OFFLINE_CAP_SECONDS / 3600;
const legacyPercent = Math.round(LEGACY_BONUS_PER_RUN * 100);

// The scripted player's results, shared by the route table and the answers below.
function routeTimes() {
  const routes = [
    { label: "Presses the lit “next upgrade” button, slow clicking", clicks: 1, strategy: "cheapest" as const },
    { label: "Presses the lit “next upgrade” button, steady clicking", clicks: 4, strategy: "cheapest" as const },
    { label: "Buys the best payback, slow clicking", clicks: 1, strategy: "payback" as const },
    { label: "Buys the best payback, steady clicking", clicks: 4, strategy: "payback" as const },
    { label: "Buys the best payback, fast clicking", clicks: 8, strategy: "payback" as const },
  ].map((route) => ({ ...route, result: simulateRun({ clicksPerSecond: route.clicks, strategy: route.strategy }) }));
  const secondRun = simulateRun({ clicksPerSecond: 4, strategy: "payback", run: 2 });
  return { routes, casual: routes[1].result, routed: routes[3].result, secondRun };
}

function aboutMinutes(seconds: number) {
  const value = Math.max(1, Math.round(seconds / 60));
  return `about ${value} minute${value === 1 ? "" : "s"}`;
}

// Questions people actually ask about an idle game. Also published as FAQ structured data.
// The times are computed, so the answers stay true if the game is rebalanced.
export function buildFaq(): { question: string; answer: string }[] {
  const { casual, routed } = routeTimes();
  return [
    {
      question: "How do you win Speed Run Heaven?",
      answer: `Generate ${formatNumber(VICTORY_THRESHOLD)} total public power. That crosses the last of the ${STAGES.length} phases, "${STAGES[STAGES.length - 1].name}", stops the clock and gives you a time to share.`,
    },
    {
      question: "How long does a run take?",
      answer: `A first run that buys the next upgrade whenever it lights up takes ${aboutMinutes(casual.seconds)} with steady clicking. A routed run that buys by payback time takes ${aboutMinutes(routed.seconds)}. Both figures are recomputed from the game's own numbers every time the site is built.`,
    },
    {
      question: "Is it free? Do I need an account?",
      answer: "It is free, with no account, no ads and no download. It runs in any modern browser on a phone or a computer.",
    },
    {
      question: "Where is my save?",
      answer: "In your own browser's local storage, on your device. Nothing is uploaded. Clearing site data erases it, and a save code (in the footer of the game) moves it to another browser or device.",
    },
    {
      question: "Does it keep running when the tab is closed?",
      answer: `Yes, for up to ${offlineHours} hours. When you come back, the engines you own have kept producing for the time you were away, capped at ${offlineHours} hours. The run clock keeps counting too, so idling is safe but slow.`,
    },
    {
      question: "What does a second run change?",
      answer: `Each finished timeline makes every system ${legacyPercent}% faster for good, clicks included. Your best time is kept across runs.`,
    },
    {
      question: "Is this a real political platform or campaign?",
      answer: "No. It is a work of fiction: a thought experiment about what accountable public AI and robotics could look like. It is not affiliated with any party, candidate, campaign or government, and nothing in it is a policy promise or a forecast.",
    },
  ];
}

export function GuidePage({ config }: { config: SiteConfig }) {
  const { routes, casual, routed, secondRun } = routeTimes();
  const faq = buildFaq();
  // How soon an old engine stops being worth another copy: the first copy number of the starter engine
  // that costs more than a fresh copy of the next engine.
  const [starter, second] = ENGINES;
  let overbuyCopy = 1;
  while (unitCost(starter, overbuyCopy - 1) <= second.baseCost && overbuyCopy < 200) overbuyCopy += 1;
  const rateRatio = second.baseRate / starter.baseRate;
  let runningBoost = 1;

  return (
    <DocShell config={config} label="GUIDE">
      <h1>How to play Speed Run Heaven, and how the fastest runs are routed</h1>
      <p className="doc-lede">
        Speed Run Heaven is a free incremental game. You start as one citizen, build nine compounding engines, enshrine six
        guarantees and cross eight phases. The clock stops at {formatNumber(VICTORY_THRESHOLD)} total public power. This page
        lists every number in the game and what the numbers say about going fast.
      </p>

      <h2>The loop in one minute</h2>
      <ol>
        <li><b>Click</b> (or press the spacebar) to make public power by hand. The run clock starts on your first click.</li>
        <li><b>Buy engines.</b> Each one makes power every second. Each copy you buy costs {COST_GROWTH}× the one before it.</li>
        <li><b>Enshrine guarantees.</b> Each one multiplies everything you own, for the rest of the run.</li>
        <li><b>Cross phases.</b> Total power earned moves you through eight phases. Each phase also makes clicks stronger.</li>
        <li><b>Finish, then replay.</b> A finished timeline makes the next one {legacyPercent}% faster.</li>
      </ol>

      <h2>The nine engines</h2>
      <p>
        An engine appears once your total power reaches its unlock. Payback is the first copy&apos;s cost divided by what it
        makes per second, before any multiplier: the lower it is, the sooner the purchase pays for itself.
      </p>
      <div className="doc-table">
        <table>
          <thead>
            <tr><th>Engine</th><th>Unlocks at</th><th>First copy costs</th><th>Makes per second</th><th>Payback</th></tr>
          </thead>
          <tbody>
            {ENGINES.map((engine) => (
              <tr key={engine.id}>
                <th scope="row">{engine.name}<small>{engine.code} · {engine.era}</small></th>
                <td>{formatNumber(engine.unlock)}</td>
                <td>{formatNumber(engine.baseCost)}</td>
                <td>{formatNumber(engine.baseRate)}</td>
                <td>{payback(engine.baseCost, engine.baseRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>The six guarantees</h2>
      <p>
        Guarantees are one-time purchases. Their multipliers stack by multiplication, so all six together make every engine
        ×{totalBoost.toFixed(2)}. Each one also adds 16% to click power.
      </p>
      <div className="doc-table">
        <table>
          <thead>
            <tr><th>Guarantee</th><th>Visible at</th><th>Costs</th><th>Multiplier</th><th>Running total</th></tr>
          </thead>
          <tbody>
            {GUARANTEES.map((guarantee) => {
              runningBoost *= guarantee.boost;
              return (
                <tr key={guarantee.id}>
                  <th scope="row">{guarantee.name}<small>{guarantee.number} · {guarantee.promise}</small></th>
                  <td>{formatNumber(guarantee.unlock)}</td>
                  <td>{formatNumber(guarantee.cost)}</td>
                  <td>×{guarantee.boost.toFixed(2)}</td>
                  <td>×{runningBoost.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>The eight phases</h2>
      <div className="doc-table">
        <table>
          <thead>
            <tr><th>Phase</th><th>Total power needed</th><th>What happens in the story</th></tr>
          </thead>
          <tbody>
            {STAGES.map((stage) => (
              <tr key={stage.number}>
                <th scope="row">{stage.number} · {stage.name}</th>
                <td>{formatNumber(stage.threshold)}</td>
                <td>{stage.copy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>How clicks scale</h2>
      <p>
        One click makes <code>(1 + 0.3 × copies of “{ENGINES[0].name}” + 0.8 × phases crossed) × (1 + 0.16 × guarantees) ×
        replay bonus</code>. Clicks matter most in the first two phases. After that, engines carry the run.
      </p>

      <h2>Speedrun routes</h2>
      <p>
        These times come from a scripted player that runs on the real game rules each time this site is built. The lit
        “next upgrade” button always offers the <em>cheapest</em> engine, which is rarely the best one. At the same steady
        clicking speed, buying by payback finishes in {minutes(routed.seconds)} against {minutes(casual.seconds)} for
        pressing the lit button.
      </p>
      <div className="doc-table">
        <table>
          <thead>
            <tr><th>How the run is played</th><th>Clicks per second</th><th>Finish time</th><th>Clicks used</th></tr>
          </thead>
          <tbody>
            {routes.map((route) => (
              <tr key={route.label}>
                <th scope="row">{route.label}</th>
                <td>{route.clicks}</td>
                <td>{route.result.completed ? minutes(route.result.seconds) : "does not finish"}</td>
                <td>{formatNumber(route.result.actions)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Second timeline, best payback, steady clicking</th>
              <td>4</td>
              <td>{secondRun.completed ? minutes(secondRun.seconds) : "does not finish"}</td>
              <td>{formatNumber(secondRun.actions)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul>
        <li><b>Open the full engine list.</b> Compare cost against power per second and buy the best ratio, not the cheapest row.</li>
        <li><b>Buy guarantees the moment they are affordable.</b> A multiplier on everything beats one more copy of anything.</li>
        <li>
          <b>Stop over-buying old engines.</b> At {COST_GROWTH}× per copy, copy number {overbuyCopy} of “{starter.name}” already
          costs more than a first “{second.name}”, which makes {rateRatio.toFixed(1)} times as much.
        </li>
        <li><b>Use ×10 and MAX with care.</b> They are quick, but they spend on one engine without checking the others.</li>
        <li><b>Keep the tab open.</b> Time away still produces, but the clock runs the whole time.</li>
      </ul>

      <h2>Questions</h2>
      <dl className="doc-faq">
        {faq.map((item) => (
          <div key={item.question}>
            <dt>{item.question}</dt>
            <dd>{item.answer}</dd>
          </div>
        ))}
      </dl>
    </DocShell>
  );
}

export function AboutPage({ config }: { config: SiteConfig }) {
  const embed = `<iframe src="${config.siteUrl}/" title="Speed Run Heaven" width="100%" height="760" style="border:0;max-width:1200px" loading="lazy"></iframe>`;
  return (
    <DocShell config={config} label="ABOUT">
      <h1>About Speed Run Heaven</h1>
      <p className="doc-lede">
        One citizen. One mandate. An automated future that belongs to everyone. Speed Run Heaven is a free browser
        incremental game that imagines AI and robotics run as accountable public infrastructure, and asks how fast you can
        get there.
      </p>

      <h2 id="fiction">A work of fiction</h2>
      <p>
        This is a game and a thought experiment. It is <b>not</b> a political platform, a forecast or a promise, and it is not
        affiliated with, paid for by or endorsed by any party, candidate, campaign, committee or government. The engines,
        guarantees and outcomes (a “Robot Corps”, a “universal dividend”, hours returned each week) are story devices.
        Nothing here is legal, financial or policy advice. The game takes no donations, collects no sign-ups and contacts no
        voters.
      </p>

      <h2 id="privacy">Privacy</h2>
      <ul>
        <li>No account, no cookies, no ads.</li>
        <li>Your run is saved in your browser&apos;s local storage on your own device. It is never uploaded.</li>
        <li>The share card is drawn on your device. A challenge link carries one number: your finish time in seconds.</li>
        <li>
          {config.goatcounterUrl
            ? "Visits and a few game events (run started, phase reached, run finished, card shared) are counted without cookies or personal data, using GoatCounter."
            : "Nothing is counted or tracked: this site loads no analytics."}
        </li>
        <li>The site is hosted on GitHub Pages, which keeps standard server logs. See GitHub&apos;s privacy statement.</li>
      </ul>

      <h2 id="embed">Put the game on your own page</h2>
      <p>The game can be embedded anywhere that allows an iframe. Saves in an embedded copy stay in the visitor&apos;s browser.</p>
      <pre className="doc-code"><code>{embed}</code></pre>

      <h2 id="credits">Credits and licences</h2>
      <ul>
        <li>Game code: MIT licence. <a href={config.repoUrl} rel="noopener">Source on GitHub</a>.</li>
        <li>Map outline: Wikimedia Commons, “Blank US Map (states only)”, public domain (CC0).</li>
        <li>Typefaces: Geist and Geist Mono, SIL Open Font License 1.1.</li>
        <li>Built with React.</li>
      </ul>

      <h2 id="contact">Corrections and contact</h2>
      <p>
        Found a bug or a balance problem? Open an issue on the <a href={`${config.repoUrl}/issues`} rel="noopener">project&apos;s issue tracker</a>.
      </p>

      {config.moreGames.length > 0 && (
        <>
          <h2 id="more">More games in this line</h2>
          <ul>
            {config.moreGames.map((game) => (
              <li key={game.url}><a href={game.url} rel="noopener">{game.name}</a>: {game.blurb}</li>
            ))}
          </ul>
        </>
      )}
    </DocShell>
  );
}
