// Tests of the built site in dist/ (run `npm run build` first), plus two extra builds into temporary folders:
// one for a custom domain and one staged copy. Expected values come from site.json and the game data.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ENGINES, GUARANTEES, STAGES, STORAGE_KEY } from "../src/engine.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "site.json"), "utf8"));
const PAGES = ["index.html", "guide/index.html", "about/index.html"];

function read(dir, file) {
  return fs.readFileSync(path.join(dir, file), "utf8");
}

function meta(html, attribute, name) {
  const match = html.match(new RegExp(`<meta ${attribute}="${name}" content="([^"]*)"`));
  return match ? match[1] : null;
}

function canonical(html) {
  return (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
}

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

function build(env) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "srh-build-"));
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "build.mjs")], {
    cwd: ROOT,
    env: { ...process.env, SITE_URL: "", STAGED: "", SUPPORT_URL: "", GOATCOUNTER_URL: "", ...env, OUT_DIR: out },
    stdio: "pipe",
  });
  return out;
}

const config = JSON.parse(read(DIST, "index.html").match(/<script id="site-config" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const base = config.siteUrl;

test("the game page is server-rendered with the whole game on it", () => {
  const html = read(DIST, "index.html");
  assert.match(html, /<title>Speed Run Heaven[^<]*<\/title>/);
  for (const text of ["A DEMOCRATIC ABUNDANCE CLICKER", "Build the machine", "Bind the future", "HEAVEN SCORE", "A WORK OF FICTION"]) {
    assert.ok(html.includes(text), `"${text}" is in the HTML`);
  }
  assert.ok(html.includes('data-testid="main-action"'), "the main button is rendered");
  for (const engine of ENGINES) assert.ok(html.includes(`data-engine="${engine.id}"`), `engine ${engine.id} is rendered`);
  for (const guarantee of GUARANTEES) assert.ok(html.includes(`data-guarantee="${guarantee.id}"`), `guarantee ${guarantee.id} is rendered`);
  assert.ok(html.includes(STAGES[0].name), "the first phase is shown");
  assert.match(html, /<script type="module" src="assets\/app\.[0-9a-f]{10}\.js"><\/script>/);
  assert.doesNotMatch(html, /Codex is working|Your site is taking shape|react-loading-skeleton/i);
});

test("the client bundle carries the save key, autosave and offline progress", () => {
  const script = read(DIST, read(DIST, "index.html").match(/src="(assets\/app\.[0-9a-f]{10}\.js)"/)[1]);
  assert.ok(script.includes(STORAGE_KEY), "the save key is unchanged, so old saves still load");
  assert.ok(script.includes("localStorage"));
  assert.ok(script.includes("pagehide"), "the save is written when the page closes");
  assert.ok(fs.statSync(path.join(DIST, read(DIST, "index.html").match(/src="(assets\/app\.[0-9a-f]{10}\.js)"/)[1])).size < 400_000, "the script stays small");
});

test("every page has its own canonical, description and share tags", () => {
  const seen = new Set();
  for (const file of PAGES) {
    const html = read(DIST, file);
    const url = canonical(html);
    assert.equal(url, `${base}/${file.replace(/index\.html$/, "")}`, `${file} canonical`);
    assert.ok(!seen.has(url));
    seen.add(url);
    assert.equal(meta(html, "property", "og:url"), url);
    assert.ok((meta(html, "name", "description") || "").length > 60, `${file} has a description`);
    assert.equal(meta(html, "property", "og:image"), `${base}/og.jpg`);
    assert.equal(meta(html, "name", "robots"), "index, follow, max-image-preview:large", `${file} is indexable`);
    for (const item of jsonLd(html)) assert.ok(item["@context"] && item["@type"], `${file} structured data parses`);
  }
});

test("local links and assets resolve inside dist/", () => {
  for (const file of PAGES) {
    const html = read(DIST, file);
    for (const [, ref] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
      if (/^(https?:|mailto:|data:)/.test(ref)) continue;
      assert.ok(!ref.startsWith("/"), `${file} uses a relative link (${ref}), so the site works under any path`);
      const target = path.normalize(path.join(DIST, path.dirname(file), ref.split("?")[0]));
      const resolved = fs.existsSync(target) && fs.statSync(target).isDirectory() ? path.join(target, "index.html") : target;
      assert.ok(fs.existsSync(resolved), `${file} links to ${ref}, which exists`);
    }
  }
  const css = fs.readdirSync(path.join(DIST, "assets")).find((name) => name.endsWith(".css"));
  for (const [, ref] of read(DIST, `assets/${css}`).matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    if (ref.startsWith("data:")) continue;
    assert.ok(fs.existsSync(path.join(DIST, "assets", ref)), `the stylesheet's ${ref} exists`);
  }
});

test("the guide is generated from the game data", () => {
  const html = read(DIST, "guide/index.html");
  for (const engine of ENGINES) assert.ok(html.includes(engine.name.replace(/&/g, "&amp;")), `the guide lists ${engine.name}`);
  for (const guarantee of GUARANTEES) assert.ok(html.includes(guarantee.name), `the guide lists ${guarantee.name}`);
  for (const stage of STAGES) assert.ok(html.includes(stage.name), `the guide lists phase ${stage.name}`);
  const faq = jsonLd(html).find((item) => item["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 5, "the guide has FAQ structured data");
  assert.ok(!html.includes("does not finish"), "every route in the table finishes");
  assert.ok(!html.includes('src="assets/'), "the guide needs no script");
});

test("the about page states the fiction, privacy and licences", () => {
  const html = read(DIST, "about/index.html");
  assert.match(html, /work of fiction/i);
  assert.match(html, /not<\/b> a political platform/);
  assert.match(html, /never uploaded/);
  assert.match(html, /CC0/);
  assert.ok(html.includes(site.repoUrl));
});

test("search files list exactly the pages and the key file matches", () => {
  const sitemap = read(DIST, "sitemap.xml");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(locs, PAGES.map((file) => `${base}/${file.replace(/index\.html$/, "")}`));
  assert.equal(read(DIST, "robots.txt").trim().split("\n").pop(), `Sitemap: ${base}/sitemap.xml`);
  assert.deepEqual(read(DIST, "urls.txt").trim().split("\n"), locs);
  assert.equal(read(DIST, `${site.indexNowKey}.txt`), site.indexNowKey);
  assert.match(site.indexNowKey, /^[0-9a-f]{32}$/);
  assert.match(read(DIST, "404.html"), /PLAY SPEED RUN HEAVEN/);
  assert.ok(fs.statSync(path.join(DIST, "og.jpg")).size < 1_000_000, "the share image is under 1 MB");
});

test("a custom-domain build switches every address with one setting", () => {
  const out = build({ SITE_URL: "https://play.example.org/" });
  try {
    const html = read(out, "index.html");
    assert.equal(canonical(html), "https://play.example.org/");
    assert.equal(meta(html, "property", "og:image"), "https://play.example.org/og.jpg");
    assert.match(read(out, "robots.txt"), /Sitemap: https:\/\/play\.example\.org\/sitemap\.xml/);
    assert.match(read(out, "404.html"), /href="\/"/);
    assert.ok(!read(out, "sitemap.xml").includes("github.io"));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("a staged build is noindex everywhere and publishes no sitemap", () => {
  const out = build({ STAGED: "true" });
  try {
    for (const file of PAGES) assert.equal(meta(read(out, file), "name", "robots"), "noindex, nofollow", `${file} is noindex`);
    assert.ok(!fs.existsSync(path.join(out, "sitemap.xml")));
    assert.doesNotMatch(read(out, "robots.txt"), /Sitemap:/);
    assert.equal(read(out, "urls.txt"), "", "nothing is sent to IndexNow");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("the optional slots stay off until set, and accept only https", () => {
  assert.equal(config.supportUrl, process.env.SUPPORT_URL ? config.supportUrl : "");
  const out = build({ SUPPORT_URL: "javascript:alert(1)", GOATCOUNTER_URL: "http://insecure.example/count" });
  try {
    const html = read(out, "index.html");
    assert.ok(!html.includes("javascript:alert"));
    assert.ok(!html.includes("gc.zgo.at"));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
  const on = build({ SUPPORT_URL: "https://example.org/support", SUPPORT_LABEL: "Tip jar", GOATCOUNTER_URL: "https://demo.goatcounter.com/count" });
  try {
    const html = read(on, "index.html");
    assert.ok(html.includes('data-testid="support-link"') && html.includes("Tip jar"), "the money slot appears when set");
    assert.ok(html.includes('data-goatcounter="https://demo.goatcounter.com/count"'), "analytics load only when set");
  } finally {
    fs.rmSync(on, { recursive: true, force: true });
  }
});
