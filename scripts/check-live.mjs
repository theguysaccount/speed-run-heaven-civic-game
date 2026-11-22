// Health check of the deployed site.
//   node scripts/check-live.mjs <site-url> [--expect-build <sha>] [--wait <seconds>]
// Checks every sitemap page (status, own canonical, robots meta that matches the configuration), the script,
// stylesheet, share image, robots.txt, IndexNow key file and the 404 page. With --expect-build it also waits
// until the live build.json reports that commit (used right after a deploy). Exits 1 on any failure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "site.json"), "utf8"));
const args = process.argv.slice(2);
const base = (args.find((arg) => !arg.startsWith("--") && /^https?:/.test(arg)) || process.env.SITE_URL || site.defaultSiteUrl).replace(/\/+$/, "");
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const expectBuild = flag("--expect-build");
const waitSeconds = Number(flag("--wait") || (expectBuild ? 600 : 0));
const staged = /^(1|true|yes)$/i.test(process.env.STAGED || "");
const UA = `speed-run-heaven-healthcheck/1.0 (+${site.repoUrl})`;

const problems = [];
const lines = [];
const note = (ok, message) => {
  lines.push(`- ${ok ? "ok" : "**FAIL**"} ${message}`);
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) problems.push(message);
};

// GitHub Pages now and then answers one request with a 5xx or drops it. Those are retried twice, 10 and 20 s apart,
// before they count, so a single CDN hiccup does not open an alert. A real outage still fails.
async function get(url) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}check=${Date.now()}`, {
        headers: { "User-Agent": UA, "Cache-Control": "no-cache" },
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status >= 500 && attempt < 3) {
        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, attempt * 10_000));
        continue;
      }
      return { status: response.status, text: await response.text(), type: response.headers.get("content-type") || "" };
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 10_000));
    }
  }
}

// Right after a deploy the CDN can serve the previous build for a few minutes.
if (expectBuild) {
  const deadline = Date.now() + waitSeconds * 1000;
  let live = "";
  for (;;) {
    try {
      live = JSON.parse((await get(`${base}/build.json`)).text).build;
    } catch {
      live = "";
    }
    if (live === expectBuild.slice(0, 40) || Date.now() > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  note(live === expectBuild.slice(0, 40), `the live build is ${live || "unreadable"} (expected ${expectBuild.slice(0, 12)})`);
}

let pages = [`${base}/`, `${base}/guide/`, `${base}/about/`];
if (!staged) {
  try {
    const sitemap = await get(`${base}/sitemap.xml`);
    const locs = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    note(sitemap.status === 200 && locs.length >= 3, `sitemap.xml lists ${locs.length} pages`);
    note(locs.every((loc) => loc.startsWith(`${base}/`)), "every sitemap address is on this site");
    if (locs.length) pages = locs;
  } catch (error) {
    note(false, `sitemap.xml: ${error.message}`);
  }
}

let home = "";
for (const url of pages) {
  try {
    const page = await get(url);
    const canonical = (page.text.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    const robots = (page.text.match(/<meta name="robots" content="([^"]+)"/) || [])[1] || "";
    note(page.status === 200, `${url} answers ${page.status}`);
    note(canonical === url, `${url} has its own canonical (${canonical || "none"})`);
    note(staged ? robots.includes("noindex") : !robots.includes("noindex"), `${url} robots "${robots}" matches ${staged ? "a staged" : "an indexed"} site`);
    if (url === `${base}/`) home = page.text;
  } catch (error) {
    note(false, `${url}: ${error.message}`);
  }
}

if (home) {
  note(home.includes('data-testid="main-action"') && home.includes("A WORK OF FICTION"), "the game is server-rendered with the fiction note");
  for (const ref of [...home.matchAll(/(?:src|href)="(assets\/[^"]+\.(?:js|css))"/g)].map((match) => match[1])) {
    try {
      const asset = await get(`${base}/${ref}`);
      note(asset.status === 200 && asset.text.length > 1000, `${ref} answers ${asset.status}`);
    } catch (error) {
      note(false, `${ref}: ${error.message}`);
    }
  }
}

for (const [file, test] of [
  ["robots.txt", (text) => (staged ? !text.includes("Sitemap:") : text.includes(`Sitemap: ${base}/sitemap.xml`))],
  [`${site.indexNowKey}.txt`, (text) => text.trim() === site.indexNowKey],
  ["og.jpg", (text) => text.length > 10_000],
  ["usa-states.png", (text) => text.length > 1_000],
]) {
  try {
    const response = await get(`${base}/${file}`);
    note(response.status === 200 && test(response.text), `${file} is served correctly`);
  } catch (error) {
    note(false, `${file}: ${error.message}`);
  }
}

try {
  const missing = await get(`${base}/no-such-page-${Date.now()}/`);
  note(missing.status === 404 && missing.text.includes("PLAY SPEED RUN HEAVEN"), `unknown pages get the 404 page (${missing.status})`);
} catch (error) {
  note(false, `404 page: ${error.message}`);
}

const summary = `## Live site: ${base}\n\n${lines.join("\n")}\n`;
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (problems.length) {
  for (const problem of problems) console.log(`::error::${problem}`);
  process.exit(1);
}
console.log(`\nlive site healthy: ${base}`);
