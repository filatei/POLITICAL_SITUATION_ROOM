"use client";
import { useEffect, useState } from "react";

// App-wide replacement for window.alert / confirm / prompt — promise-based so
// call sites read the same (`if (await confirmDialog(...))`), but render as a
// styled in-app modal. Mount <DialogHost/> once (in the root layout); then call
// alertDialog / confirmDialog / promptDialog from anywhere.

type Kind = "alert" | "confirm" | "prompt";
type Req = {
  kind: Kind;
  title?: string;
  body?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  placeholder?: string;
  defaultValue?: string;
  resolve: (v: unknown) => void;
};

let notify: ((r: Req | null) => void) | null = null;

function fallback(kind: Kind) {
  return kind === "confirm" ? false : kind === "prompt" ? null : undefined;
}

function open(req: Omit<Req, "resolve">): Promise<unknown> {
  return new Promise((resolve) => {
    if (!notify) { resolve(fallback(req.kind)); return; } // host not mounted yet
    notify({ ...req, resolve } as Req);
  });
}

export function alertDialog(o: { title?: string; body?: string; confirmText?: string }): Promise<void> {
  return open({ kind: "alert", ...o }) as Promise<void>;
}
export function confirmDialog(o: {
  title?: string; body?: string; confirmText?: string; cancelText?: string; danger?: boolean;
}): Promise<boolean> {
  return open({ kind: "confirm", ...o }) as Promise<boolean>;
}
export function promptDialog(o: {
  title?: string; body?: string; placeholder?: string; defaultValue?: string; confirmText?: string; danger?: boolean;
}): Promise<string | null> {
  return open({ kind: "prompt", ...o }) as Promise<string | null>;
}

export function DialogHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [val, setVal] = useState("");

  useEffect(() => {
    notify = (r) => { setReq(r); setVal(r?.defaultValue || ""); };
    return () => { notify = null; };
  }, []);

  if (!req) return null;

  const done = (result: unknown) => { req.resolve(result); setReq(null); };
  const onCancel = () => done(fallback(req.kind));
  const onOk = () => done(req.kind === "confirm" ? true : req.kind === "prompt" ? val : undefined);
  const dangerCls = "btn inline-flex items-center justify-center rounded-lg bg-bad px-4 py-2.5 font-semibold text-white hover:brightness-110 active:brightness-95";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="sheet-in card w-full max-w-sm space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
        {req.title && <h2 className="text-base font-bold tracking-tight">{req.title}</h2>}
        {req.body && <p className="whitespace-pre-wrap text-sm text-muted">{req.body}</p>}
        {req.kind === "prompt" && (
          <input
            autoFocus
            className="input"
            placeholder={req.placeholder}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onOk(); if (e.key === "Escape") onCancel(); }}
          />
        )}
        <div className="flex justify-end gap-2 pt-1">
          {req.kind !== "alert" && <button className="btn-ghost" onClick={onCancel}>{req.cancelText || "Cancel"}</button>}
          <button className={req.danger ? dangerCls : "btn-primary"} onClick={onOk} autoFocus={req.kind !== "prompt"}>
            {req.confirmText || "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
