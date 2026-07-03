import Link from "next/link";
import AiChat from "@/components/AiChat";
import ContactForm from "@/components/ContactForm";
import Onboard from "@/components/Onboard";
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";
const EXPLAINER_URL = process.env.NEXT_PUBLIC_EXPLAINER_URL || "";

const STRUCTURE = [
  { level: "Polling Unit", count: "176,846", form: "EC8A", who: "Capture point — agents report here" },
  { level: "Ward / RA", count: "8,809", form: "EC8B", who: "Councillor" },
  { level: "LGA", count: "774", form: "EC8C", who: "LG Chairman" },
  { level: "State Constituency", count: "990", form: "EC8D", who: "State Assembly member" },
  { level: "Federal Constituency", count: "360", form: "EC8D", who: "House of Reps member" },
  { level: "Senatorial District", count: "109", form: "EC8D", who: "Senator" },
  { level: "State", count: "36 + FCT", form: "EC8D/E", who: "Governor" },
  { level: "Nation", count: "1", form: "EC8E", who: "President" },
];

const FEATURES = [
  { icon: "📡", title: "Offline-first field capture", body: "Agents send scores, messages, incidents, photos, voice and GPS from the polling unit — queued and synced even on poor networks." },
  { icon: "✅", title: "Verified, auditable results", body: "Numbers only enter the tally when a coordinator verifies them. Every verify, override and code assignment is audit-logged." },
  { icon: "🗺️", title: "Geography drill-down", body: "LGA → Ward → Unit navigation. Open any code to see that agent's full activity with map pins." },
  { icon: "🤖", title: "AI assistant", body: "Ask about the Electoral Act, how the app works, or live anomalies in the incoming data — grounded, not guessed." },
];

export default async function Home() {
  const brand = await getBrand();
  return (
    <main className="min-h-dvh">
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-line bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            {brand.logoUrl
              ? <img src={brand.logoUrl} alt="" className="h-7 w-7 rounded object-contain" />
              : <span className="live-dot text-bad"><span className="block h-2.5 w-2.5 rounded-full bg-bad" /></span>}
            <span className="font-bold tracking-tight">{brand.name}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/agent/login" className="btn-ghost px-3 py-1.5">Field agent</Link>
            <Link href="/room" className="btn-primary px-3 py-1.5">Enter room</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-16 text-center sm:pt-24">
        <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-white/5 px-3 py-1 text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-good" /> Live parallel election monitoring
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          See the vote as it happens — <span className="text-accent">unit by unit</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          Field agents report from every polling unit; the situation room sees scores, incidents and turnout
          the moment they land — verified, mapped, and analysed live.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href="#create" className="btn-primary px-5 py-3 text-base">Create your situation room →</a>
          <Link href="/agent/login" className="btn-ghost px-5 py-3 text-base">I'm a field agent</Link>
        </div>
      </section>

      {/* Onboarding — the primary action */}
      <section id="create" className="mx-auto max-w-3xl px-5 pb-16">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Launch your own situation room</h2>
          <p className="mt-2 text-muted">Set up a branded monitoring room for any election in minutes. Start free with 10 agent seats — no card required.</p>
        </div>
        <Onboard />
      </section>

      {/* Sign-in cards for existing rooms */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wider text-muted">Already have a room? Sign in</h2>
        <div className="grid gap-4 sm:grid-cols-3">
        {[
          { href: "/agent/login", title: "Field Agent", body: "Send scores, incidents and voice notes from your polling unit. Works offline.", cta: "Open agent app" },
          { href: "/room", title: "Situation Room", body: "Live tally, scores by unit, incidents, AI analysis and big-screen relay.", cta: "Open dashboard" },
          { href: "/admin", title: "Admin", body: "Enrol agents, generate codes, manage geography, verify and override results.", cta: "Open admin" },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="card p-6 transition hover:-translate-y-0.5 hover:ring-1 hover:ring-accent/40">
            <div className="text-lg font-semibold">{c.title}</div>
            <p className="mt-1 text-sm text-muted">{c.body}</p>
            <div className="mt-4 text-sm font-medium text-accent">{c.cta} →</div>
          </Link>
        ))}
        </div>
      </section>

      {/* Explainer video */}
      <section className="mx-auto max-w-4xl px-5 pb-16">
        <h2 className="mb-4 text-center text-2xl font-bold tracking-tight sm:text-3xl">See it in action</h2>
        <div className="overflow-hidden rounded-2xl border border-line bg-black">
          {EXPLAINER_URL ? (
            EXPLAINER_URL.includes("youtube") || EXPLAINER_URL.includes("vimeo") ? (
              <div className="aspect-video"><iframe className="h-full w-full" src={EXPLAINER_URL} title="Explainer" allow="accelerated-download; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen /></div>
            ) : (
              <video className="aspect-video w-full" src={EXPLAINER_URL} controls poster="/icon-512.png" />
            )
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-2 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-accent/20 text-2xl text-accent">▶</div>
              <div className="text-sm font-medium text-ink">Explainer video</div>
              <div className="max-w-md px-6 text-xs text-muted">A short walkthrough of the situation room and its white-label features. Set <span className="tabular">NEXT_PUBLIC_EXPLAINER_URL</span> (a YouTube/Vimeo embed or an MP4 URL) to show it here.</div>
            </div>
          )}
        </div>
        <p className="mt-3 text-center text-sm text-muted">One platform, any election — Presidential, Governorship, Senatorial, House of Reps, State Assembly, LG. White-labelled per client: your brand, your domain, your candidates.</p>
      </section>

      {/* Features */}
      <section className="border-y border-line bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">Built for the collation battle</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <div className="text-2xl">{f.icon}</div>
                <div className="mt-2 font-semibold">{f.title}</div>
                <p className="mt-1 text-sm text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Electoral structure */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Nigeria's electoral structure</h2>
        <p className="mt-2 max-w-2xl text-muted">
          One physical hierarchy — State → LGA → Ward → Polling Unit — carries every contest. Results flow up the
          same ladder; only the constituency and the office change.
        </p>

        <div className="mt-8 overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Count (2023)</th>
                <th className="hidden px-4 py-3 sm:table-cell">Result form</th>
                <th className="px-4 py-3">Who is elected</th>
              </tr>
            </thead>
            <tbody>
              {STRUCTURE.map((r, i) => (
                <tr key={r.level} className={i % 2 ? "bg-white/[0.02]" : ""}>
                  <td className="px-4 py-3 font-semibold">{r.level}</td>
                  <td className="tabular px-4 py-3 text-muted">{r.count}</td>
                  <td className="hidden px-4 py-3 text-muted sm:table-cell">{r.form}</td>
                  <td className="px-4 py-3 text-muted">{r.who}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="card p-5">
            <div className="text-sm font-semibold">Collation ladder</div>
            <p className="mt-1 text-sm text-muted">EC8A (unit) → EC8B (ward) → EC8C (LGA) → EC8D (constituency/state) → EC8E (final declaration). This platform is the <b>parallel citizen/party collation</b> of the same ladder.</p>
          </div>
          <div className="card p-5">
            <div className="text-sm font-semibold">Winning rules</div>
            <p className="mt-1 text-sm text-muted"><b>FPTP</b> (most valid votes) for Governor, Senator, Reps, Assembly, Chairman and Councillor. <b>President</b>: most votes <i>and</i> ≥ 25% in two-thirds of the 36 states + FCT, else a run-off.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-3xl px-5 py-16">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Frequently asked questions</h2>
          <div className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {[
              { q: `Is this the official INEC result?`, a: `No. ${brand.name} is a parallel, independent citizen/party count. Figures are field reports pending verification; the official result is declared only by INEC.` },
              { q: `Who is it for?`, a: `Political parties, campaigns, election-observer groups and CSOs who want their own real-time, verified view of results and incidents from the field.` },
              { q: `How do field agents report?`, a: `Through an offline-first mobile web app (PWA). They sign in with an admin-issued invite code / QR link or a pre-authorised Google account, then send scores, messages, incidents and photos — queued and synced even on poor networks, with GPS.` },
              { q: `Which elections does it support?`, a: `Any Nigerian election — Presidential, Governorship, Senatorial, House of Reps, State Assembly, LG Chairman and Councillor. The polling structure (State → LGA → Ward → Unit) is the same; only the constituency, candidates and win-rule change.` },
              { q: `Is our data private?`, a: `Yes. Live results, agent reports and analytics are visible only to your signed-in staff inside the situation room. The public assistant answers only about the Electoral Act — never your data.` },
              { q: `What does it cost?`, a: `The first 10 agent seats are free to trial. Extra seats are ₦10,000 each, one-off per election. Use the in-app calculator (units × agents per unit) to size your plan, and pay by Paystack or Squad.` },
              { q: `Can we use our own brand and domain?`, a: `Yes — it's white-label. Set your name, logo, accent colour, candidates and constituency; run it on your own domain. Contact us to set up a tenancy.` },
            ].map((f) => (
              <details key={f.q} className="group bg-surface/40 open:bg-white/[0.03]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-medium hover:bg-white/[0.03]">
                  <span>{f.q}</span>
                  <span className="shrink-0 text-muted transition group-open:rotate-45">＋</span>
                </summary>
                <div className="px-5 pb-4 text-sm text-muted">{f.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Public Act assistant */}
      <section className="border-t border-line bg-white/[0.02]">
        <div className="mx-auto max-w-3xl px-5 py-16">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ask about the Electoral Act</h2>
          <p className="mt-2 text-muted">A free assistant trained on Nigeria's Electoral Act — ask about over-voting, primaries, petitions, when campaigns start, how a winner is declared, and more. (Live election data stays private to signed-in staff.)</p>
          <div className="card mt-6 p-5">
            <AiChat isPublic intro="Ask a question about the Electoral Act or how this platform works." />
          </div>
          <p className="mt-3 text-xs text-muted">Informational only, not legal advice. Verify against the official Act and INEC guidelines.</p>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Contact us</h2>
            <p className="mt-2 text-muted">Setting up a monitoring room for your election, or want a white-label tenancy? Send us a note.</p>
            <div className="mt-6 space-y-1 text-sm">
              <div className="font-semibold text-ink">TORAMA GLOBAL SERVICES LTD</div>
              <div className="text-muted">No. 1, KM 7 (Zipcode 560213), Tonbia–Amasoma Road,<br />Yenagoa, Bayelsa State, Nigeria</div>
              <div className="text-muted">Email: <a className="text-accent hover:underline" href="mailto:psr@torama.money">psr@torama.money</a></div>
              <div className="text-muted">Web: <a className="text-accent hover:underline" href="https://torama.money" target="_blank" rel="noreferrer">torama.money</a></div>
            </div>
          </div>
          <ContactForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              {brand.logoUrl
                ? <img src={brand.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
                : <span className="live-dot text-bad"><span className="block h-2 w-2 rounded-full bg-bad" /></span>}
              <span className="text-sm font-bold">{brand.name}</span>
            </div>
            <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
              <Link href="/terms" className="hover:text-ink">Terms</Link>
              <Link href="/privacy" className="hover:text-ink">Privacy</Link>
              <a href="#contact" className="hover:text-ink">Contact</a>
              <Link href="/agent/login" className="hover:text-ink">Agent</Link>
              <Link href="/room" className="hover:text-ink">Room</Link>
            </nav>
          </div>
          <div className="mt-6 border-t border-line pt-6 text-xs text-muted">
            <p><b className="text-ink">{brand.name}</b> is a parallel, independent citizen/party election monitor — <b>not</b> the official INEC result. Figures shown are field reports pending verification.</p>
            <p className="mt-2">© {new Date().getFullYear()} TORAMA GLOBAL SERVICES LTD. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
