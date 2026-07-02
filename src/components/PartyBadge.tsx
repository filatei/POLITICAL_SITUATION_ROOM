"use client";
import { useState } from "react";

// Renders a party logo. Tries the official file you drop at
// /uploads/party-logos/<CODE>.png first, then the bundled badge
// /party-logos/<CODE>.svg, then finally a colored acronym chip.
export default function PartyBadge({ code, color, size = 24 }: { code: string; color: string; size?: number }) {
  const [stage, setStage] = useState(0);
  const srcs = [`/uploads/party-logos/${code}.png`, `/party-logos/${code}.svg`];
  if (stage < srcs.length) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={srcs[stage]}
        onError={() => setStage((s) => s + 1)}
        width={size}
        height={size}
        alt={code}
        className="shrink-0 rounded-full object-contain ring-1 ring-white/10"
        style={{ background: "rgba(255,255,255,0.06)" }}
      />
    );
  }
  return <span className="pill text-white" style={{ background: color }}>{code}</span>;
}
