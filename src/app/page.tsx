import type { Metadata } from "next";
import Link from "next/link";
import ContactForm from "@/components/ContactForm";
import GeoShowcase from "@/components/GeoShowcase";
import Onboard from "@/components/Onboard";
import { getBrand } from "@/lib/brand";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBrand();
  const title = `${b.name} — Live Election Situation Room for Nigeria`;
  const description =
    "Run your own real-time election situation room. Field agents report verified polling-unit results, incidents and photos from across Nigeria — Presidential, Governorship, Senatorial, House of Reps, State Assembly and LG. Independent parallel monitoring, audit-logged and grounded in the Electoral Act.";
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: "/" },
    keywords: [
      "election situation room", "Nigeria election monitoring", "parallel vote tabulation",
      "polling unit results", "INEC results tracking", "election observer platform",
      "party agent app", "collation monitoring", "election incident reporting",
    ],
    openGraph: { title, description, url: SITE_URL, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}
// Defaults to the built-in animated explainer at /explainer.html. Override with
// NEXT_PUBLIC_EXPLAINER_URL (a YouTube/Vimeo embed, an .mp4, or another page).
import ExplainerEmbed from "@/components/ExplainerEmbed";

const EXPLAINER_URL = process.env.NEXT_PUBLIC_EXPLAINER_URL || "https://www.youtube.com/embed/KDE8LVMg1wg";
const EXPLAINER_IS_VIDEO = /\.(mp4|webm|ogg)(\?|$)/i.test(EXPLAINER_URL);
const EXPLAINER_IS_EMBED = EXPLAINER_URL.includes("youtube") || EXPLAINER_URL.includes("vimeo") || EXPLAINER_URL.endsWith(".html") || EXPLAINER_URL.startsWith("/");

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
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: brand.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Android, iOS (PWA)",
    description:
      "Independent, real-time election situation room for Nigeria: verified polling-unit results, incident reporting and field monitoring for parties, campaigns and observer groups.",
    url: SITE_URL,
    offers: { "@type": "Offer", price: "0", priceCurrency: "NGN", description: "First 10 agent seats free per election" },
    areaServed: { "@type": "Country", name: "Nigeria" },
  };
  return (
    <main className="min-h-dvh">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-line bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center px-5 py-3.5">
          {/* Logo stands alone on the landing header. */}
          {brand.logoUrl
            ? <img src={brand.logoUrl} alt={brand.name} className="h-7 w-auto max-w-[132px] object-contain" />
            : <><span className="live-dot text-bad"><span className="block h-2.5 w-2.5 rounded-full bg-bad" /></span><span className="font-bold tracking-tight">{brand.name}</span></>}
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

      {/* Explainer video */}
      <section className="mx-auto max-w-4xl px-5 pb-16">
        <h2 className="mb-4 text-center text-2xl font-bold tracking-tight sm:text-3xl">See it in action</h2>
        <div className="overflow-hidden rounded-2xl border border-line">
          <ExplainerEmbed url={EXPLAINER_URL} isVideo={EXPLAINER_IS_VIDEO} isEmbed={EXPLAINER_IS_EMBED} />
        </div>
        <p className="mt-3 text-center text-sm text-muted">Tap <b className="text-ink">Fullscreen</b> for the best view on mobile. One platform, any election — Presidential, Governorship, Senatorial, House of Reps, State Assembly, LG.</p>
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
            <p className="mt-1 text-sm text-muted"><b>First-Past-The-Post (FPTP)</b> — the most valid votes wins — for Governor, Senator, Reps, Assembly, Chairman and Councillor. <b>President</b>: most votes <i>and</i> ≥ 25% in two-thirds of the 36 states + FCT, else a run-off.</p>
          </div>
        </div>
      </section>

      {/* Live INEC geography from the warehouse */}
      <section className="border-t border-line bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Nigeria&apos;s polling geography</h2>
          <p className="mt-2 max-w-2xl text-muted">The full register — every State → LGA → Ward → Polling Unit, sourced from INEC&apos;s delimitation. Search a state and expand it to see its LGAs with ward and unit counts.</p>
          <div className="mt-8"><GeoShowcase /></div>
          <p className="mt-4 text-xs text-muted">Source: Independent National Electoral Commission (INEC) polling-unit register. Counts reflect the data currently warehoused.</p>
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
              { q: `Is our data private?`, a: `Yes. Live results, agent reports and analytics are visible only to your signed-in staff inside the situation room — never exposed publicly.` },
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

      {/* Contact */}
      <section id="contact" className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Contact us</h2>
            <p className="mt-2 text-muted">Setting up a monitoring room for your election, or want a white-label tenancy? Send us a note and we&apos;ll get back to you.</p>
            <div className="mt-6 text-sm">
              <div className="text-muted">Email: <a className="text-accent hover:underline" href="mailto:psr@torama.money">psr@torama.money</a></div>
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
                ? <img src={brand.logoUrl} alt={brand.name} className="h-6 w-auto max-w-[116px] object-contain" />
                : <><span className="live-dot text-bad"><span className="block h-2 w-2 rounded-full bg-bad" /></span><span className="text-sm font-bold">{brand.name}</span></>}
            </div>
            <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
              <Link href="/terms" className="hover:text-ink">Terms</Link>
              <Link href="/privacy" className="hover:text-ink">Privacy</Link>
              <a href="#contact" className="hover:text-ink">Contact</a>
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
