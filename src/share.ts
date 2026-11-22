// The completion share card: a 1200x630 image drawn on the player's own device. Nothing is uploaded.

export type CardData = {
  timeText: string;
  run: number;
  heavenScore: number;
  guarantees: number;
  guaranteeTotal: number;
  actions: number;
  siteLabel: string; // the address printed on the card, without the protocol
  map?: CanvasImageSource | null;
};

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const INK = "#102a34";
const CREAM = "#f4f0e4";
const PAPER = "#fbf8ef";
const ORANGE = "#fa593c";
const SUN = "#ffcc58";
const HEAVY = '900 {size}px "Arial Black", "Arial Bold", Arial, "Helvetica Neue", sans-serif';
const MONO = '700 {size}px ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';

function font(template: string, size: number) {
  return template.replace("{size}", String(size));
}

function spaced(context: CanvasRenderingContext2D, spacing: string) {
  // letterSpacing is not in every browser; the card still reads fine without it.
  (context as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = spacing;
}

function fitText(context: CanvasRenderingContext2D, text: string, template: string, size: number, maxWidth: number) {
  let current = size;
  context.font = font(template, current);
  while (context.measureText(text).width > maxWidth && current > 12) {
    current -= 2;
    context.font = font(template, current);
  }
  return current;
}

export function drawShareCard(canvas: HTMLCanvasElement, data: CardData) {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return false;

  context.fillStyle = CREAM;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Right panel: the lit map.
  const panel = { x: 742, y: 44, width: 414, height: 542 };
  context.fillStyle = INK;
  context.fillRect(panel.x, panel.y, panel.width, panel.height);
  const centerX = panel.x + panel.width / 2;
  const centerY = panel.y + 236;
  context.strokeStyle = "rgba(255, 204, 88, 0.32)";
  context.lineWidth = 1.5;
  for (const radius of [176, 138, 98, 58]) {
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
  }
  if (data.map) {
    const mapWidth = 340;
    const mapHeight = Math.round((mapWidth * 155) / 250);
    const tint = document.createElement("canvas");
    tint.width = mapWidth;
    tint.height = mapHeight;
    const tintContext = tint.getContext("2d");
    if (tintContext) {
      tintContext.imageSmoothingEnabled = false;
      tintContext.drawImage(data.map, 0, 0, mapWidth, mapHeight);
      tintContext.globalCompositeOperation = "source-atop";
      tintContext.fillStyle = "rgba(255, 204, 88, 0.88)";
      tintContext.fillRect(0, 0, mapWidth, mapHeight);
      context.drawImage(tint, Math.round(centerX - mapWidth / 2), Math.round(centerY - mapHeight / 2));
    }
  }
  context.fillStyle = "rgba(251, 248, 239, 0.62)";
  context.textAlign = "center";
  context.font = font(MONO, 13);
  spaced(context, "3px");
  context.fillText("50-STATE PUBLIC SIGNAL // 100% ONLINE", centerX, panel.y + 452);
  context.fillStyle = SUN;
  context.font = font(HEAVY, 54);
  spaced(context, "-2px");
  context.fillText(`${data.heavenScore}/100`, centerX, panel.y + 510);
  context.fillStyle = "rgba(251, 248, 239, 0.62)";
  context.font = font(MONO, 12);
  spaced(context, "3px");
  context.fillText("HEAVEN SCORE", centerX, panel.y + 528);

  // Left: the claim.
  context.textAlign = "left";
  context.fillStyle = ORANGE;
  context.beginPath();
  context.arc(72, 78, 22, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = PAPER;
  context.font = '400 38px Georgia, "Times New Roman", serif';
  spaced(context, "0px");
  context.textAlign = "center";
  context.fillText("°", 72, 96);
  context.textAlign = "left";
  context.fillStyle = INK;
  context.font = font(MONO, 20);
  spaced(context, "2px");
  context.fillText("SPEED RUN", 108, 85);
  const wordmarkWidth = context.measureText("SPEED RUN ").width;
  context.fillStyle = ORANGE;
  context.fillText("HEAVEN", 108 + wordmarkWidth, 85);

  context.fillStyle = INK;
  context.font = font(MONO, 24);
  spaced(context, "4px");
  context.fillText("I REACHED HEAVEN IN", 50, 206);

  context.fillStyle = ORANGE;
  spaced(context, "-6px");
  const timeSize = fitText(context, data.timeText, HEAVY, 210, 650);
  context.fillText(data.timeText, 44, 206 + 30 + timeSize * 0.76);

  context.fillStyle = INK;
  context.fillRect(50, 458, 640, 2);
  context.font = font(MONO, 18);
  spaced(context, "1.5px");
  const stats = [
    `RUN ${String(data.run).padStart(2, "0")}`,
    `${data.guarantees}/${data.guaranteeTotal} GUARANTEES`,
    `${data.actions.toLocaleString("en-US")} ACTIONS`,
  ].join("  ·  ");
  fitText(context, stats, MONO, 18, 640);
  context.fillText(stats, 50, 494);

  context.font = font(MONO, 17);
  spaced(context, "1px");
  context.fillStyle = ORANGE;
  context.fillText("BEAT MY TIME", 50, 548);
  context.fillStyle = INK;
  const beatWidth = context.measureText("BEAT MY TIME  ").width;
  fitText(context, data.siteLabel, MONO, 17, 640 - beatWidth);
  context.fillText(data.siteLabel, 50 + beatWidth, 548);
  context.font = font(MONO, 13);
  spaced(context, "1px");
  context.fillStyle = "rgba(16, 42, 52, 0.62)";
  context.fillText("A FREE BROWSER GAME. A WORK OF FICTION.", 50, 578);
  return true;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch {
      resolve(null);
    }
  });
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers or contexts without the async clipboard API.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const done = document.execCommand("copy");
      area.remove();
      return done;
    } catch {
      return false;
    }
  }
}
