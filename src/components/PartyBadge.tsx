"use client";
import { useEffect, useRef, useState } from "react";

// Renders a party logo: tries /uploads/party-logos/<CODE>.png, then the bundled
// /party-logos/<CODE>.svg, then a coloured acronym chip. On poor networks a logo
// that isn't cached would hang — so each attempt has a short timeout and falls
// back to the acronym. Cached images load instantly (via the service worker) and
// still show, even offline.
export default function PartyBadge({ code, color, size = 24 }: { code: string; color: string; size?: number }) {
  const [stage, setStage] = useState(0);
  // admin upload override -> bundled INEC logo (png) -> bundled svg -> acronym chip
  const srcs = [`/uploads/party-logos/${code}.png`, `/party-logos/${code}.png`, `/party-logos/${code}.svg`];
  const loaded = useRef(false);

  useEffect(() => {
    loaded.current = false;
    if (stage >= srcs.length) return;
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    // Cached images fire onLoad well before this; if not, drop to the next source
    // / the acronym so agents never stare at a blank/spinning badge.
    const t = setTimeout(() => { if (!loaded.current) setStage((s) => s + 1); }, offline ? 900 : 2500);
    return () => clearTimeout(t);
  }, [stage, code]); // eslint-disable-line

  if (stage < srcs.length) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={srcs[stage]}
        onLoad={() => { loaded.current = true; }}
        onError={() => setStage((s) => s + 1)}
        width={size}
        height={size}
        alt={code}
        className="shrink-0 rounded-full object-contain ring-1 ring-black/10"
        style={{ background: "#ffffff", padding: Math.max(1, Math.round(size * 0.08)) }}
      />
    );
  }
  return <span className="pill text-white" style={{ background: color }}>{code}</span>;
}
