"use client";
import { useEffect, useState } from "react";
import { api, logout } from "@/lib/session";

// Guards the ROOT /admin and /room routes. Those are reserved for platform
// super-admins. A signed-in tenant admin who lands here is redirected to their
// own room's slug ( /{slug}/admin | /{slug}/room ); if they own more than one,
// they pick which. Super-admins fall through to `children`.
export default function RootTenantGate({ base, children }: { base: "admin" | "room"; children: React.ReactNode }) {
  const [phase, setPhase] = useState<"checking" | "super" | "choose" | "none">("checking");
  const [tenants, setTenants] = useState<{ slug: string; name: string }[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await api("/api/my-tenants");
      const j = r.ok ? await r.json() : { isSuper: false, tenants: [] };
      if (!alive) return;
      if (j.isSuper) { setPhase("super"); return; }
      const list: { slug: string; name: string }[] = j.tenants || [];
      if (list.length === 1) { window.location.replace(`/${list[0].slug}/${base}`); return; }
      if (list.length === 0) { setPhase("none"); return; }
      setTenants(list); setPhase("choose");
    })();
    return () => { alive = false; };
  }, [base]);

  if (phase === "checking") return <main className="grid min-h-dvh place-items-center text-muted">Loading…</main>;
  if (phase === "super") return <>{children}</>;

  if (phase === "none")
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <div className="text-lg font-semibold">No rooms yet</div>
          <p className="text-sm text-muted">This account doesn&apos;t administer any election room. Create one, or ask an admin to add your email to theirs.</p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <a href="/" className="btn-primary">Create a room</a>
            <button className="btn-ghost" onClick={async () => { await logout(); window.location.reload(); }}>Sign out</button>
          </div>
        </div>
      </main>
    );

  // choose
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-lg font-bold tracking-tight">Choose a room</div>
          <p className="mt-1 text-sm text-muted">You administer more than one election room.</p>
        </div>
        <div className="space-y-2">
          {tenants.map((t) => (
            <a key={t.slug} href={`/${t.slug}/${base}`} className="card flex items-center justify-between p-4 hover:brightness-110">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{t.name}</span>
                <span className="block truncate text-xs text-muted">/{t.slug}</span>
              </span>
              <span className="text-accent">→</span>
            </a>
          ))}
        </div>
        <div className="text-center">
          <button className="btn-ghost text-sm" onClick={async () => { await logout(); window.location.reload(); }}>Sign out</button>
        </div>
      </div>
    </main>
  );
}
