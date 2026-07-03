import Link from "next/link";
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function Privacy() {
  const brand = await getBrand();
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <Link href="/" className="text-sm text-accent hover:underline">← Back</Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated {new Date().getFullYear()}</p>

      <div className="mt-8 space-y-5 text-sm leading-relaxed text-ink/90">
        <p>TORAMA GLOBAL SERVICES LTD operates <b>{brand.name}</b>. This policy explains what we collect and how we use it, consistent with the Nigeria Data Protection Act.</p>

        <h2 className="text-lg font-semibold text-ink">What we collect</h2>
        <p>Account details for staff and agents (name, email/phone, role, assigned unit); field submissions (scores, messages, incidents, media) and their GPS coordinates and timestamps; and basic technical data needed to run the Service. Contact-form messages you send us.</p>

        <h2 className="text-lg font-semibold text-ink">How we use it</h2>
        <p>To operate the situation room, verify and analyse field reports, secure accounts, process seat payments, and respond to your enquiries. Live operational data is accessible only to the relevant organisation's signed-in staff.</p>

        <h2 className="text-lg font-semibold text-ink">Sharing</h2>
        <p>We do not sell personal data. We share it only with service providers that help us run the platform (e.g. payment processors Paystack/Squad for transactions you initiate) and where required by law.</p>

        <h2 className="text-lg font-semibold text-ink">Retention &amp; your rights</h2>
        <p>We keep data for as long as needed to provide the Service and meet legal obligations, then delete or anonymise it. You may request access to, correction of, or deletion of your personal data by contacting us.</p>

        <h2 className="text-lg font-semibold text-ink">Contact</h2>
        <p>Questions or data requests? <Link href="/#contact" className="text-accent hover:underline">Contact us</Link>.</p>
      </div>
    </main>
  );
}
