import Link from "next/link";

// Shown when a /{slug}/(admin|room|agent) link points to a tenant that doesn't
// exist (or was removed/recreated under a new address). Friendlier than a raw
// 404 — tells the visitor what likely happened and what to do next, tailored to
// whether they arrived as an organiser, viewer, or field agent.
export default function TenantMissing({ slug, kind }: { slug: string; kind: "admin" | "room" | "agent" }) {
  const title =
    kind === "agent" ? "This agent link isn't active" :
    kind === "admin" ? "This admin console isn't available" :
    "This situation room isn't available";

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-2xl">🔎</div>
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">
          We couldn&apos;t find an election at <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-ink">/{slug}</span>.
          The link may be old, mistyped, or the room was closed or recreated at a new address.
        </p>

        {kind === "agent" ? (
          <div className="mt-6 flex flex-col gap-2">
            <Link href="/agent/login" className="btn-primary">Enter your invite code</Link>
            <Link href="/" className="btn-ghost">Back to home</Link>
            <p className="mt-3 text-xs text-muted">Ask your election admin to resend your personal sign-in link and polling unit.</p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-2">
            <Link href="/" className="btn-primary">Go to home</Link>
            <Link href="/#create" className="btn-ghost">Create a situation room</Link>
            <p className="mt-3 text-xs text-muted">Double-check the address your organiser shared with you.</p>
          </div>
        )}
      </div>
    </main>
  );
}
