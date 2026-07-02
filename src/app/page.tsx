import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Political Situation Room</h1>
        <p className="mt-2 text-muted">Real-time election monitoring. Field agents report from the ground; the situation room sees everything live.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/agent/login" className="card p-6 hover:bg-panel">
          <div className="text-lg font-semibold">Field Agent</div>
          <p className="mt-1 text-sm text-muted">Send updates, scores, incidents and voice notes from your polling unit. Works offline.</p>
          <div className="mt-4 text-sm font-medium text-accent">Open agent app →</div>
        </Link>
        <Link href="/room" className="card p-6 hover:bg-panel">
          <div className="text-lg font-semibold">Situation Room</div>
          <p className="mt-1 text-sm text-muted">Live wall, score tally, incidents, AI analysis and big-screen relay.</p>
          <div className="mt-4 text-sm font-medium text-accent">Open dashboard →</div>
        </Link>
      </div>
      <p className="text-xs text-muted">Staff sign in inside the dashboard. Agents use an invite code + PIN, phone OTP, or Google.</p>
    </main>
  );
}
