"use client";
import { ReactNode } from "react";

// Sets the active-tenant cookie so that the admin/room API calls scope to this
// tenant's election. Set synchronously during render (before children fetch).
export default function TenantScope({ slug, children }: { slug: string; children: ReactNode }) {
  if (typeof document !== "undefined") {
    document.cookie = `psr_tenant=${encodeURIComponent(slug)}; path=/; max-age=86400; samesite=lax`;
  }
  return <>{children}</>;
}
