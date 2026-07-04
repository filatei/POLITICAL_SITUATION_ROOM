"use client";
import { useRef } from "react";

// Renders the explainer (HTML iframe / mp4 / YouTube-Vimeo) with a Fullscreen
// button. On phones the inline aspect-video box is small, so fullscreen is how
// users get a clear, full-screen view of the animation.
export default function ExplainerEmbed({ url, isVideo, isEmbed }: { url: string; isVideo: boolean; isEmbed: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLIFrameElement & HTMLVideoElement>(null);

  async function goFull() {
    const el: any = (isVideo ? mediaRef.current : wrapRef.current) || wrapRef.current;
    try {
      if (el?.requestFullscreen) await el.requestFullscreen();
      else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else if (mediaRef.current && (mediaRef.current as any).webkitEnterFullscreen) (mediaRef.current as any).webkitEnterFullscreen(); // iOS <video>
      else window.open(url, "_blank"); // last resort (e.g. iOS Safari iframe)
    } catch { window.open(url, "_blank"); }
  }

  return (
    <div ref={wrapRef} className="relative bg-black">
      {isVideo ? (
        <video ref={mediaRef as any} className="aspect-video w-full" src={url} controls playsInline poster="/psr-explainer-poster.png" />
      ) : isEmbed ? (
        <iframe ref={mediaRef as any} className="aspect-video w-full" src={url} title="Explainer" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen />
      ) : (
        <div className="flex aspect-video items-center justify-center text-muted">Explainer</div>
      )}
      <button onClick={goFull} aria-label="Play fullscreen"
        className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/80">
        <span aria-hidden>⤢</span> Fullscreen
      </button>
    </div>
  );
}
