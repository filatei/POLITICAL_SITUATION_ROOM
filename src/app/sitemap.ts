import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// The public surface is the single marketing landing page. Tenant rooms/admin
// are intentionally excluded (private, per-election, disallowed in robots).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
  ];
}
