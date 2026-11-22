// Build the static site into dist/: bundle the game, prerender every page, write the search files.
//   node scripts/build.mjs
// Settings come from environment variables (see .env.example); with none set it builds the public
// GitHub Pages version.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "site.json"), "utf8"));
const env = process.env;
const OUT = path.resolve(ROOT, env.OUT_DIR || "dist");
const WORK = path.join(ROOT, ".build");

const siteUrl = (env.SITE_URL || site.defaultSiteUrl).replace(/\/+$/, "");
const staged = /^(1|true|yes)$/i.test(env.STAGED || "");
const config = {
  siteUrl,
  repoUrl: env.REPO_URL || site.repoUrl,
  supportUrl: httpsUrl(env.SUPPORT_URL),
  supportLabel: (env.SUPPORT_LABEL || "SUPPORT THE GAME").slice(0, 60),
  goatcounterUrl: httpsUrl(env.GOATCOUNTER_URL),
  staged,
  build: (env.BUILD_ID || env.GITHUB_SHA || "dev").slice(0, 40),
  moreGames: site.moreGames,
};
const basePath = new URL(siteUrl + "/").pathname; // "/speed-run-heaven-civic-game/" on Pages, "/" on a domain

// Only https links are accepted for the optional slots, so a mistyped variable cannot inject markup.
function httpsUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function jsonForScript(value) {
  // Safe inside <script>: no "<", and no raw line separators (U+2028, U+2029).
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
}

function hashOf(buffer) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 10);
}

function lastChange() {
  try {
    return execFileSync("git", ["log", "-1", "--format=%cs"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "assets", "fonts"), { recursive: true });
fs.mkdirSync(WORK, { recursive: true });
fs.cpSync(path.join(ROOT, "public"), OUT, { recursive: true });

// Fonts (self-hosted, with their licence).
for (const [pkg, file] of [
  ["@fontsource-variable/geist", "geist-latin-wght-normal.woff2"],
  ["@fontsource-variable/geist-mono", "geist-mono-latin-wght-normal.woff2"],
]) {
  fs.copyFileSync(path.join(ROOT, "node_modules", pkg, "files", file), path.join(OUT, "assets", "fonts", file));
}
fs.copyFileSync(
  path.join(ROOT, "node_modules", "@fontsource-variable/geist", "LICENSE"),
  path.join(OUT, "assets", "fonts", "OFL.txt"),
);

// Stylesheet.
const css = await esbuild.transform(fs.readFileSync(path.join(ROOT, "src", "styles.css"), "utf8"), {
  loader: "css",
  minify: true,
});
const cssFile = `app.${hashOf(css.code)}.css`;
fs.writeFileSync(path.join(OUT, "assets", cssFile), css.code);

// Browser bundle.
const client = await esbuild.build({
  entryPoints: [path.join(ROOT, "src", "entry-client.tsx")],
  bundle: true,
  format: "esm",
  target: ["es2020"],
  minify: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
  write: false,
});
const clientCode = client.outputFiles[0].contents;
const jsFile = `app.${hashOf(clientCode)}.js`;
fs.writeFileSync(path.join(OUT, "assets", jsFile), clientCode);

// The same components, bundled for Node, render the HTML that ships.
const serverFile = path.join(WORK, "server.mjs");
await esbuild.build({
  entryPoints: [path.join(ROOT, "src", "entry-server.tsx")],
  bundle: true,
  packages: "external", // React is loaded from node_modules at build time, not bundled
  format: "esm",
  platform: "node",
  target: ["node22"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: serverFile,
  logLevel: "warning",
});
const server = await import(pathToFileURL(serverFile).href + `?t=${Date.now()}`);

const description =
  "A free browser incremental game. Start as one citizen, win a peaceful democratic mandate, turn AI and robotics into public infrastructure, and race the clock to a future with more time for everyone. A work of fiction. No account, no ads.";
const shareDescription = "One citizen. One mandate. An automated future that belongs to everyone. A free incremental game; a work of fiction.";

function page({ file, title, pageDescription, body, prefix, jsonLd, script }) {
  const canonical = `${siteUrl}/${file === "index.html" ? "" : file.replace(/index\.html$/, "")}`;
  const image = `${siteUrl}/og.jpg`;
  const robots = staged ? "noindex, nofollow" : "index, follow, max-image-preview:large";
  const analytics = config.goatcounterUrl
    ? `\n<script data-goatcounter="${escapeHtml(config.goatcounterUrl)}" async src="https://gc.zgo.at/count.js"></script>`
    : "";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(pageDescription)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta name="robots" content="${robots}">
<meta name="theme-color" content="#f4f0e4">
<meta name="application-name" content="${escapeHtml(site.name)}">
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
<link rel="preload" href="${prefix}assets/fonts/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${prefix}assets/${cssFile}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(site.name)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(shareDescription)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Speed Run Heaven: neighbors and public robots under a glowing map of the United States.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(shareDescription)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
${jsonLd.map((item) => `<script type="application/ld+json">${jsonForScript(item)}</script>`).join("\n")}
</head>
<body>
<div id="root">${body}</div>
${script ? `<noscript><p class="noscript">Speed Run Heaven is a browser game and needs JavaScript to play. The <a href="${prefix}guide/">guide</a> explains how it works.</p></noscript>
<script id="site-config" type="application/json">${jsonForScript(config)}</script>
<script type="module" src="${prefix}assets/${jsFile}"></script>` : ""}${analytics}
</body>
</html>
`;
  const target = path.join(OUT, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
  return canonical;
}

const game = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: site.name,
  url: `${siteUrl}/`,
  description,
  image: `${siteUrl}/og.jpg`,
  genre: ["Incremental game", "Idle game", "Clicker game"],
  gamePlatform: "Web browser",
  applicationCategory: "Game",
  operatingSystem: "Any",
  playMode: "SinglePlayer",
  inLanguage: "en",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@type": "Organization", name: site.name, url: config.repoUrl },
};
const crumbs = (name, url) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: site.name, item: `${siteUrl}/` },
    { "@type": "ListItem", position: 2, name, item: url },
  ],
});
const faq = server.buildFaq();

const urls = [
  page({
    file: "index.html",
    title: "Speed Run Heaven — Free Idle Clicker About Public AI & Robots",
    pageDescription: description,
    body: server.renderGame(config),
    prefix: "",
    jsonLd: [game],
    script: true,
  }),
  page({
    file: "guide/index.html",
    title: "Speed Run Heaven Guide: Every Upgrade, Cost and Speedrun Route",
    pageDescription:
      "How to play Speed Run Heaven and finish faster: all nine engines, six guarantees and eight phases with their costs and multipliers, plus route times computed from the game itself.",
    body: server.renderGuide(config),
    prefix: "../",
    jsonLd: [
      crumbs("Guide", `${siteUrl}/guide/`),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
    script: false,
  }),
  page({
    file: "about/index.html",
    title: "About Speed Run Heaven: a Work of Fiction, Privacy and Credits",
    pageDescription:
      "What Speed Run Heaven is, why it is fiction and not a political platform, how saves stay on your device, how to embed the game, and credits.",
    body: server.renderAbout(config),
    prefix: "../",
    jsonLd: [crumbs("About", `${siteUrl}/about/`)],
    script: false,
  }),
];

// 404 page: self-contained, because it can be served from any depth.
fs.writeFileSync(
  path.join(OUT, "404.html"),
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found · ${escapeHtml(site.name)}</title><meta name="robots" content="noindex">
<style>body{background:#f4f0e4;color:#102a34;font-family:ui-sans-serif,system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;text-align:center;padding:24px}
h1{font-family:"Arial Black",Arial,sans-serif;font-size:clamp(40px,9vw,90px);letter-spacing:-.05em;line-height:.95;margin:0 0 18px;text-transform:uppercase}
a{background:#fa593c;color:#fbf8ef;display:inline-block;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;font-weight:800;letter-spacing:.1em;margin-top:22px;padding:14px 18px;text-decoration:none}</style></head>
<body><main><h1>This timeline<br>does not exist.</h1><p>The page you asked for is not here.</p><a href="${escapeHtml(basePath)}">PLAY SPEED RUN HEAVEN →</a></main></body></html>
`,
);

// Search files. A staged build (a copy of a site that is live elsewhere) publishes no sitemap and marks
// every page noindex. It does not block crawling, because a crawler has to read a page to see its noindex.
const lastmod = lastChange();
if (staged) {
  fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nAllow: /\n# Staged copy: every page is marked noindex and no sitemap is published.\n");
} else {
  fs.writeFileSync(
    path.join(OUT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`,
  );
  fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
}
fs.writeFileSync(path.join(OUT, "urls.txt"), (staged ? [] : urls).join("\n") + (staged ? "" : "\n"));
fs.writeFileSync(
  path.join(OUT, "build.json"),
  JSON.stringify({ build: config.build, siteUrl, staged, pages: urls.length, script: `assets/${jsFile}`, style: `assets/${cssFile}` }, null, 2) + "\n",
);

fs.rmSync(WORK, { recursive: true, force: true });
const size = (file) => `${(fs.statSync(path.join(OUT, "assets", file)).size / 1024).toFixed(1)} KB`;
console.log(`built ${path.relative(ROOT, OUT)}/ for ${siteUrl}${staged ? " (staged: noindex)" : ""}`);
console.log(`  ${jsFile} ${size(jsFile)}, ${cssFile} ${size(cssFile)}, ${urls.length} pages`);
