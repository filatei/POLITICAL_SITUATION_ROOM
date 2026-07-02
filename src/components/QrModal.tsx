"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Shows a scannable QR that opens the agent login with the code pre-filled:
//   {origin}/agent/login?code=OND-XXXXX
// The agent scans it with their phone camera and just sets a PIN.
export default function QrModal({ code, label, onClose, onCopy }: {
  code: string; label?: string; onClose: () => void; onCopy: (text: string) => void;
}) {
  const [png, setPng] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [copied, setCopied] = useState<"" | "code" | "link">("");

  function doCopy(kind: "code" | "link", text: string) {
    onCopy(text);
    setCopied(kind);
    setTimeout(() => setCopied(""), 1600);
  }

  useEffect(() => {
    const url = `${window.location.origin}/agent/login?code=${encodeURIComponent(code)}`;
    setLoginUrl(url);
    QRCode.toDataURL(url, { width: 360, margin: 1, errorCorrectionLevel: "M", color: { dark: "#0a0a0a", light: "#ffffff" } })
      .then(setPng)
      .catch(() => {});
  }, [code]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="sheet-in card w-full max-w-sm space-y-4 p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Access code</h2>
          <button className="text-muted hover:text-ink" onClick={onClose}>✕</button>
        </div>
        {label && <div className="truncate text-sm text-muted">{label}</div>}
        <div className="mx-auto w-fit rounded-2xl bg-white p-3">
          {png ? <img src={png} alt="QR code" width={220} height={220} /> : <div className="grid h-[220px] w-[220px] place-items-center text-black/40">…</div>}
        </div>
        <div className="tabular text-2xl font-extrabold tracking-wide">{code}</div>
        <p className="text-xs text-muted">Agent scans this with their phone camera → the app opens with the code filled in and signs them straight in.</p>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost" onClick={() => doCopy("code", code)}>{copied === "code" ? "Copied ✓" : "Copy code"}</button>
          <button className="btn-primary" onClick={() => doCopy("link", loginUrl)}>{copied === "link" ? "Copied ✓" : "Copy link"}</button>
        </div>
      </div>
    </div>
  );
}
