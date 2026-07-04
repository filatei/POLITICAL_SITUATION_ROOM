// Canonical public origin for SEO (sitemap, robots, canonical URLs, OG images).
// Overridable per deploy via APP_URL; defaults to the live PSR domain.
export const SITE_URL = (process.env.APP_URL || "https://sr.torama.money").replace(/\/+$/, "");
