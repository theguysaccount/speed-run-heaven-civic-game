// Tell IndexNow search engines (Bing, Yandex, Seznam, Naver and others) about every page.
//   node scripts/indexnow.mjs [urls.txt]
// The key file is published at <site>/<key>.txt by the build. Problems are reported, never fatal, and a
// staged build (empty urls.txt) sends nothing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "site.json"), "utf8"));
const file = process.argv[2] || path.join(ROOT, "dist", "urls.txt");
const base = (process.env.SITE_URL || site.defaultSiteUrl).replace(/\/+$/, "");

const urls = fs.existsSync(file)
  ? fs.readFileSync(file, "utf8").split("\n").map((line) => line.trim()).filter((line) => line.startsWith(`${base}/`))
  : [];
if (!urls.length) {
  console.log("IndexNow: nothing to submit (staged build, or no pages under the site address)");
  process.exit(0);
}
const body = {
  host: new URL(base).host,
  key: site.indexNowKey,
  keyLocation: `${base}/${site.indexNowKey}.txt`,
  urlList: urls.slice(0, 10_000),
};
try {
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": `${site.slug}/1.0 (+${site.repoUrl})` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  console.log(`IndexNow: HTTP ${response.status} for ${body.urlList.length} URLs`);
  if (response.status >= 400) console.log(`::warning::IndexNow answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
} catch (error) {
  console.log(`::warning::IndexNow request failed: ${error.message}`);
}
