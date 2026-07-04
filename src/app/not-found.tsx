import Link from "next/link";

// Friendly branded 404. Reached for any unmatched path — including stray agent
// links like /agent/SOMECODE or an unknown /{slug}. Field agents in particular
// land here if they open a bare /agent link with no invite code, so we point
// them at how to get one instead of showing a dead-end error.
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="text-4xl font-black tracking-tight text-accent">404</div>
        <h1 className="text-xl font-bold tracking-tight">Page not found</h1>
        <p className="text-sm text-muted">
          This link doesn&apos;t point to a live page. If you&apos;re a field agent, you need the
          personal invite link (or invite code) your election admin shared with you — a bare
          address won&apos;t sign you in.
        </p>
        <div className="flex flex-col gap-2">
          <Link href="/agent/login" className="btn-primary w-full">Enter an invite code</Link>
          <Link href="/" className="text-sm text-accent underline">Go to the home page</Link>
        </div>
        <p className="text-xs text-muted">
          Lost your link? Ask your election admin to resend your sign-in link and polling unit.
        </p>
      </div>
    </main>
  );
}
