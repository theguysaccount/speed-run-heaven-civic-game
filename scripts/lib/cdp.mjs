// A small Chrome DevTools Protocol driver (no dependencies; Node 22+ for the global WebSocket).
// Used by the end-to-end playthrough and the screenshot script.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export function findChrome() {
  const candidates = [
    process.env.CHROME,
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes("/")) {
      if (fs.existsSync(candidate)) return candidate;
    } else {
      const found = spawnSync("which", [candidate], { encoding: "utf8" });
      if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
    }
  }
  throw new Error("Chrome not found; set CHROME to its path");
}

export async function launchChrome({ args = [] } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cdp-profile-"));
  const chrome = spawn(
    findChrome(),
    [
      ...(process.env.CI ? ["--no-sandbox"] : []),
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--enable-automation",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      ...args,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error("Chrome did not start: " + buffer.slice(-400))), 30_000);
    chrome.stderr.on("data", (chunk) => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    chrome.on("exit", () => reject(new Error("Chrome exited: " + buffer.slice(-400))));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let seq = 0;
  const waiting = new Map();
  const listeners = new Set();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      const { resolve, reject, method } = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
    } else {
      for (const listener of listeners) listener(message);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      waiting.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const { userAgent } = await send("Browser.getVersion");

  async function newPage({ width = 1280, height = 900, mobile = false, preload = "" } = {}) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const problems = [];
    listeners.add((message) => {
      if (message.sessionId !== sessionId) return;
      if (message.method === "Runtime.exceptionThrown") {
        const details = message.params.exceptionDetails;
        problems.push("exception: " + (details.exception?.description || details.text));
      } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
        problems.push("console.error: " + message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
      } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
        problems.push(`log: ${message.params.entry.text} ${message.params.entry.url || ""}`);
      }
    });
    const call = (method, params = {}) => send(method, params, sessionId);
    await call("Page.enable");
    await call("Runtime.enable");
    await call("Log.enable");
    if (preload) await call("Page.addScriptToEvaluateOnNewDocument", { source: preload });
    const page = {
      problems,
      call,
      async setViewport(nextWidth, nextHeight, nextMobile = false) {
        await call("Emulation.setDeviceMetricsOverride", {
          width: nextWidth,
          height: nextHeight,
          deviceScaleFactor: nextMobile ? 2 : 1,
          mobile: nextMobile,
        });
        await call("Emulation.setTouchEmulationEnabled", { enabled: nextMobile });
        await call("Emulation.setUserAgentOverride", {
          userAgent: nextMobile ? PHONE_UA : userAgent.replace("HeadlessChrome", "Chrome"),
        });
      },
      async goto(url, { settle = 400 } = {}) {
        const loaded = new Promise((resolve) => {
          const listener = (message) => {
            if (message.sessionId === sessionId && message.method === "Page.loadEventFired") {
              listeners.delete(listener);
              resolve();
            }
          };
          listeners.add(listener);
        });
        const result = await call("Page.navigate", { url });
        if (result.errorText) throw new Error(`could not open ${url}: ${result.errorText}`);
        await Promise.race([
          loaded,
          new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out loading ${url}`)), 45_000)),
        ]);
        await new Promise((resolve) => setTimeout(resolve, settle));
      },
      // Evaluate an expression (or an async function body via `(async () => { ... })()`) and return its value.
      async eval(expression) {
        const { result, exceptionDetails } = await call("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
          userGesture: true,
        });
        if (exceptionDetails) {
          throw new Error("page script failed: " + (exceptionDetails.exception?.description || exceptionDetails.text));
        }
        return result.value;
      },
      async screenshot(file, { fullPage = false } = {}) {
        const params = { format: "png" };
        if (fullPage) params.captureBeyondViewport = true;
        if (fullPage) {
          const { cssContentSize } = await call("Page.getLayoutMetrics");
          params.clip = { x: 0, y: 0, width: cssContentSize.width, height: Math.min(cssContentSize.height, 12_000), scale: 1 };
        }
        const { data } = await call("Page.captureScreenshot", params);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(data, "base64"));
      },
      async close() {
        await send("Target.closeTarget", { targetId });
      },
    };
    await page.setViewport(width, height, mobile);
    return page;
  }

  async function close() {
    try {
      ws.close();
    } catch {}
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }

  return { newPage, close, send };
}

// Injected before the page's own scripts: a clock the test can jump forward. Timers still fire in real
// time; `__testClock.advance(ms)` moves Date.now() ahead and runs every interval and timeout that falls due.
export const FAKE_CLOCK = `(() => {
  const realNow = Date.now.bind(Date);
  const realSetTimeout = window.setTimeout.bind(window);
  const realSetInterval = window.setInterval.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  const realClearInterval = window.clearInterval.bind(window);
  // sessionStorage keeps the offset across reloads of the same tab. "Away" time is added when the next
  // page loads, which is what happens when someone closes a tab and comes back later.
  const store = (() => { try { return window.sessionStorage; } catch { return null; } })();
  const read = (key) => Number((store && store.getItem(key)) || 0);
  let offset = read("__testClockOffset") + read("__testClockAway");
  if (store) { store.setItem("__testClockOffset", String(offset)); store.removeItem("__testClockAway"); }
  const timers = new Map();
  let nextId = 1e6;
  Date.now = () => realNow() + offset;
  const schedule = (fn, delay, repeat, args) => {
    const id = nextId++;
    timers.set(id, { fn, delay: Math.max(0, Number(delay) || 0), repeat, args, due: Date.now() + Math.max(0, Number(delay) || 0) });
    return id;
  };
  window.setTimeout = (fn, delay, ...args) => schedule(fn, delay, false, args);
  window.setInterval = (fn, delay, ...args) => schedule(fn, delay, true, args);
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); realClearTimeout(id); realClearInterval(id); };
  const runDue = () => {
    for (let guard = 0; guard < 100000; guard += 1) {
      let next = null;
      for (const [id, timer] of timers) if (timer.due <= Date.now() && (!next || timer.due < next[1].due)) next = [id, timer];
      if (!next) return;
      const [id, timer] = next;
      if (timer.repeat) timer.due += Math.max(1, timer.delay); else timers.delete(id);
      if (typeof timer.fn === "function") timer.fn(...timer.args);
    }
  };
  realSetInterval(runDue, 20);
  window.__testClock = {
    advance(ms, step = 250) {
      const target = Date.now() + ms;
      while (Date.now() < target) {
        offset += Math.min(step, target - Date.now());
        runDue();
      }
      if (store) store.setItem("__testClockOffset", String(offset));
    },
    // Time that passes while the page is closed: Date.now() jumps by this much on the next page load.
    away(ms) { if (store) store.setItem("__testClockAway", String(read("__testClockAway") + ms)); },
    macrotask: () => new Promise((resolve) => realSetTimeout(resolve, 0)),
    offset: () => offset,
  };
})();`;
