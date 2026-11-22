import { useEffect, useRef, useState } from "react";
import { GUARANTEES, challengeQuery, formatTime } from "./engine.ts";
import type { SiteConfig } from "./config.ts";
import { track } from "./config.ts";
import { canvasToBlob, copyText, drawShareCard } from "./share.ts";

type Props = {
  config: SiteConfig;
  durationMs: number;
  run: number;
  heavenScore: number;
  guarantees: number;
  actions: number;
  onNotice: (text: string) => void;
};

// Shown when a run is complete: the card, and three ways to send it.
export default function SharePanel({ config, durationMs, run, heavenScore, guarantees, actions, onNotice }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawn, setDrawn] = useState(false);
  const timeText = formatTime(durationMs);
  const challengeUrl = `${config.siteUrl}/${challengeQuery(durationMs)}`;
  const shareText = `I reached Heaven in ${timeText} in Speed Run Heaven, a free browser game about public AI and robots. Beat my time:`;

  useEffect(() => {
    let cancelled = false;
    const draw = (map: HTMLImageElement | null) => {
      if (cancelled || !canvasRef.current) return;
      const ok = drawShareCard(canvasRef.current, {
        timeText,
        run,
        heavenScore,
        guarantees,
        guaranteeTotal: GUARANTEES.length,
        actions,
        siteLabel: config.siteUrl.replace(/^https?:\/\//, ""),
        map,
      });
      setDrawn(ok);
    };
    const image = new Image();
    image.onload = () => draw(image);
    image.onerror = () => draw(null);
    image.src = "usa-states.png";
    return () => {
      cancelled = true;
    };
  }, [timeText, run, heavenScore, guarantees, actions, config.siteUrl]);

  async function share() {
    const canvas = canvasRef.current;
    const blob = canvas ? await canvasToBlob(canvas) : null;
    try {
      if (blob && typeof File === "function" && navigator.canShare) {
        const file = new File([blob], "speed-run-heaven.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: `${shareText} ${challengeUrl}` });
          track("share_native");
          return;
        }
      }
      if (navigator.share) {
        await navigator.share({ title: "Speed Run Heaven", text: shareText, url: challengeUrl });
        track("share_native");
        return;
      }
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
    }
    await copyLink();
  }

  async function download() {
    const canvas = canvasRef.current;
    const blob = canvas ? await canvasToBlob(canvas) : null;
    if (!blob) {
      onNotice("This browser could not make the image. Take a screenshot of the card instead.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `speed-run-heaven-${timeText.replace(/:/g, "-")}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    track("share_download");
    onNotice("Card saved. Post it anywhere, with your challenge link.");
  }

  async function copyLink() {
    const copied = await copyText(`${shareText} ${challengeUrl}`);
    track("share_copy");
    onNotice(copied ? "Challenge link copied. Whoever opens it sees your time to beat." : `Copy this link: ${challengeUrl}`);
  }

  return (
    <article className="share-panel" id="share" data-testid="share-panel" aria-label="Share your run">
      <div className="share-copy">
        <span>YOUR TIME</span>
        <b data-testid="share-time">{timeText}</b>
        <p>
          The card is drawn on your device. The link carries only your time, so a friend sees what to beat.
        </p>
        <div className="share-actions">
          <button type="button" onClick={share} data-testid="share-native">SHARE</button>
          <button type="button" onClick={download} data-testid="share-download" disabled={!drawn}>SAVE CARD (PNG)</button>
          <button type="button" onClick={copyLink} data-testid="share-copy">COPY CHALLENGE LINK</button>
        </div>
        <a className="share-link" href={challengeUrl} data-testid="share-link">{challengeUrl.replace(/^https?:\/\//, "")}</a>
      </div>
      <canvas
        ref={canvasRef}
        className="share-card"
        width={1200}
        height={630}
        role="img"
        aria-label={`Share card: I reached Heaven in ${timeText}. Run ${run}, Heaven score ${heavenScore} out of 100.`}
        data-testid="share-card"
        data-drawn={drawn ? "yes" : "no"}
      />
    </article>
  );
}
