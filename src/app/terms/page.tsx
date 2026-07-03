import Link from "next/link";
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function Terms() {
  const brand = await getBrand();
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <Link href="/" className="text-sm text-accent hover:underline">← Back</Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Terms of Use</h1>
      <p className="mt-2 text-sm text-muted">Last updated {new Date().getFullYear()}</p>

      <div className="prose mt-8 space-y-5 text-sm leading-relaxed text-ink/90">
        <p><b>{brand.name}</b> (“the Service”) is operated by TORAMA GLOBAL SERVICES LTD (“we”, “us”). By accessing or using the Service you agree to these Terms.</p>

        <h2 className="text-lg font-semibold text-ink">1. Nature of the Service</h2>
        <p>The Service is a parallel, independent citizen/party election-monitoring platform. Data shown is compiled from field reports submitted by users and is <b>not</b> an official result of the Independent National Electoral Commission (INEC) or any electoral body. Official results are declared solely by the competent electoral authority.</p>

        <h2 className="text-lg font-semibold text-ink">2. Accounts &amp; access</h2>
        <p>Staff and field agents access the Service through credentials issued by an authorised administrator. You are responsible for keeping your access codes and credentials confidential and for all activity under your account.</p>

        <h2 className="text-lg font-semibold text-ink">3. Acceptable use</h2>
        <p>You agree not to submit false, misleading or unlawful content, not to interfere with the Service, and to comply with all applicable Nigerian laws, including the Electoral Act and data-protection regulations.</p>

        <h2 className="text-lg font-semibold text-ink">4. Fees</h2>
        <p>Certain features are provided on a paid basis (per-seat pricing per election). Fees are stated in-app before purchase and are, unless required by law, non-refundable once seats are allocated.</p>

        <h2 className="text-lg font-semibold text-ink">5. No warranty; limitation of liability</h2>
        <p>The Service is provided “as is”. To the fullest extent permitted by law, we disclaim all warranties and are not liable for any decision taken in reliance on data displayed. You use the Service at your own risk.</p>

        <h2 className="text-lg font-semibold text-ink">6. Changes &amp; contact</h2>
        <p>We may update these Terms from time to time. Questions? <Link href="/#contact" className="text-accent hover:underline">Contact us</Link>.</p>
      </div>
    </main>
  );
}
