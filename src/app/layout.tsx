import type { Metadata, Viewport } from "next";
import "./globals.css";
import SWRegister from "@/components/SWRegister";

export const metadata: Metadata = {
  title: "Political Situation Room",
  description: "Real-time election monitoring and situation room",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Situation Room", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
