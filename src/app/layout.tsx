import type { Metadata, Viewport } from "next";
import "./globals.css";
import SWRegister from "@/components/SWRegister";
import InstallPrompt from "@/components/InstallPrompt";
import { BrandProvider } from "@/components/BrandProvider";
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBrand();
  return {
    title: b.name,
    description: b.tagline,
    manifest: "/manifest.webmanifest",
    applicationName: b.name,
    appleWebApp: { capable: true, title: b.name, statusBarStyle: "black-translucent" },
    icons: {
      icon: [
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/icon-180.png", sizes: "180x180" }],
    },
    // Dark share card so WhatsApp/social previews don't show a white background.
    openGraph: { title: b.name, description: b.tagline, type: "website", images: [{ url: "/og.png", width: 1200, height: 630, alt: b.name }] },
    twitter: { card: "summary_large_image", title: b.name, description: b.tagline, images: ["/og.png"] },
  };
}

export const viewport: Viewport = {
  themeColor: "#08080b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const b = await getBrand();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* White-label accent: override the --accent CSS variable per tenant. */}
        <style dangerouslySetInnerHTML={{ __html: `:root{--accent:${b.accentRgb}} html.light{--accent:${b.accentRgb}}` }} />
      </head>
      <body className="font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.psr_theme==='light')document.documentElement.classList.add('light')}catch(e){}" }} />
        <BrandProvider brand={{ name: b.name, tagline: b.tagline, logoUrl: b.logoUrl }}>
          {children}
        </BrandProvider>
        <SWRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
