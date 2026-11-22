// Build-time rendering. scripts/build.mjs bundles this file and calls it to write the static pages.
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import SpeedRunGame from "./SpeedRunGame.tsx";
import { AboutPage, GuidePage, buildFaq } from "./pages.tsx";
import type { SiteConfig } from "./config.ts";

export { buildFaq };
export { ENGINES, GUARANTEES, STAGES, STORAGE_KEY, VICTORY_THRESHOLD } from "./engine.ts";

export function renderGame(config: SiteConfig) {
  return renderToString(<SpeedRunGame config={config} />);
}

export function renderGuide(config: SiteConfig) {
  return renderToStaticMarkup(<GuidePage config={config} />);
}

export function renderAbout(config: SiteConfig) {
  return renderToStaticMarkup(<AboutPage config={config} />);
}
