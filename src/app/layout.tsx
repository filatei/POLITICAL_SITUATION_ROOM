import type { Metadata, Viewport } from "next";
import "./globals.css";
import SWRegister from "@/components/SWRegister";
import InstallPrompt from "@/components/InstallPrompt";

export const metadata: Metadata = {
  title: "Situation Room",
  description: "Real-time election monitoring and situation room",
  manifest: "/manifest.webmanifest",
  applicationName: "Situation Room",
  appleWebApp: { capable: true, title: "Situation Room", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon-180.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#08080b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.psr_theme==='light')document.documentElement.classList.add('light')}catch(e){}" }} />
        {children}
        <SWRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
