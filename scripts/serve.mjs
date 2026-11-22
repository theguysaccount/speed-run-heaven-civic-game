// Serve dist/ the way GitHub Pages does: under the project path, with 404.html for unknown paths.
//   node scripts/serve.mjs [port]      then open the printed address
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".task": "application/octet-stream",
};

export function startServer({ dir = path.join(ROOT, "dist"), port = 0, basePath = "/" } = {}) {
  const base = ("/" + basePath.replace(/^\/+|\/+$/g, "") + "/").replace(/\/+/g, "/");
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    let pathname = decodeURIComponent(url.pathname);
    const send = (status, file) => {
      response.writeHead(status, {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(file).pipe(response);
    };
    const notFound = () => {
      const fallback = path.join(dir, "404.html");
      if (fs.existsSync(fallback)) return send(404, fallback);
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Not found");
    };
    if (base !== "/" && pathname === "/") {
      response.writeHead(302, { Location: base });
      return response.end();
    }
    if (!pathname.startsWith(base)) return notFound();
    pathname = pathname.slice(base.length - 1);
    let file = path.normalize(path.join(dir, pathname));
    if (!file.startsWith(path.normalize(dir))) return notFound();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!pathname.endsWith("/")) {
        response.writeHead(301, { Location: url.pathname + "/" + url.search });
        return response.end();
      }
      file = path.join(file, "index.html");
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return notFound();
    send(200, file);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = `http://127.0.0.1:${server.address().port}${base}`;
      resolve({ url: address, close: () => new Promise((done) => server.close(done)) });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const site = JSON.parse(fs.readFileSync(path.join(ROOT, "site.json"), "utf8"));
  const basePath = new URL((process.env.SITE_URL || site.defaultSiteUrl) + "/").pathname;
  const { url } = await startServer({ port: Number(process.argv[2] || process.env.PORT || 4173), basePath });
  console.log(`serving dist/ at ${url}`);
}
