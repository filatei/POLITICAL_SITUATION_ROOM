import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Let crawlers index the public marketing landing, but keep the app itself out:
// gated consoles (/admin, /agent) and live tenant rooms (which show unverified
// field figures we don't want surfaced as "results" in search).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/agent", "/oauth", "/*/admin", "/*/room"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
