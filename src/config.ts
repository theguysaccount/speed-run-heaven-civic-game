// Site settings, decided at build time (scripts/build.mjs reads them from environment variables)
// and embedded in each page as JSON. Nothing here is secret.

export type MoreGame = { name: string; url: string; blurb: string };

export type SiteConfig = {
  siteUrl: string; // canonical address without a trailing slash: the one setting to change at a domain move
  repoUrl: string;
  supportUrl: string; // the money slot: empty hides it
  supportLabel: string;
  goatcounterUrl: string; // optional cookieless analytics: empty means nothing is counted
  staged: boolean; // true adds noindex (a staged copy of a site that is live elsewhere)
  build: string;
  moreGames: MoreGame[];
};

export const CONFIG_ELEMENT_ID = "site-config";

export function readConfig(): SiteConfig {
  const element = document.getElementById(CONFIG_ELEMENT_ID);
  return JSON.parse(element?.textContent || "{}") as SiteConfig;
}

declare global {
  interface Window {
    goatcounter?: { count?: (options: { path: string; title?: string; event?: boolean }) => void };
  }
}

// Counts an event only when the site owner has switched analytics on, and never for automated browsers.
export function track(event: string) {
  try {
    if (typeof window === "undefined" || navigator.webdriver) return;
    window.goatcounter?.count?.({ path: `event/${event}`, title: event, event: true });
  } catch {
    // Analytics must never break the game.
  }
}
