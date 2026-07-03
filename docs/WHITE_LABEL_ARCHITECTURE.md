# White-Label / Multi-Tenant Reference Architecture

*A reusable blueprint for turning any single-tenant app into a best-in-class
white-label, multi-tenant SaaS. Written product-agnostically, with this
election-monitoring app as the worked example. Lift the patterns (and the
`tenant-kit` below) straight into future projects.*

---

## 0. First principle

> **A tenant is the isolation boundary. Everything a customer sees, owns, or pays
> for hangs off exactly one tenant, and no query ever crosses that boundary
> unless a super-admin explicitly asks it to.**

Design the tenant boundary first; retrofit it into features second. If you can't
answer "which tenant does this row/request/job belong to?" for every piece of the
system, you don't yet have multi-tenancy — you have a data leak waiting to happen.

---

## 1. Choose the tenant granularity

Pick the smallest thing a customer buys and brands:

| Product | Natural tenant |
|---|---|
| Election monitor (this app) | one election room (`ondogov2027`) |
| Water-business SaaS (Daybook) | one business/company |
| Fintech (BibiPay) | one merchant/org |
| Course platform | one school |

**This app:** tenant = **one election**, 1:1. That's the key simplification —
every domain row already carried `electionId`, so the tenant boundary *reuses an
existing scoping column* instead of adding `tenant_id` everywhere. **Always look
for a natural scoping key you already have before introducing a new one.**

Generalisation: `Tenant { id, slug, <naturalKeyId>, name, ownerEmails[], ... }`.
Here `<naturalKeyId>` = `electionId`. In a greenfield app it's a fresh
`tenantId` FK on every table.

---

## 2. Tenant resolution — how a request learns its tenant

Support these in priority order; each request resolves to exactly one tenant
before any business logic runs:

1. **Custom domain** — `results.myparty.com` → tenant (best for enterprise; needs a
   `domains` table + TLS automation).
2. **Sub-domain** — `ondogov2027.app.com` (clean isolation, easy cookies, wildcard
   TLS).
3. **Path prefix** — `app.com/ondogov2027/...` (simplest to ship; one cert; the
   choice here).

Implement once, in **middleware** (`middleware.ts`) or a server util
`resolveTenant(req)`, never ad-hoc per route. Cache slug→tenant lookups.

> **This app:** path prefix `/{slug}/room|agent|admin`. `resolveTenant(slug)`
> returns the tenant + its election. A future upgrade to sub-domains/custom
> domains only changes the resolver, not the features.

---

## 3. Data isolation — pick the model deliberately

| Model | Isolation | Ops cost | When |
|---|---|---|---|
| **Shared DB, row-level (`tenantId` on every row)** | Logical | Low | Default. Thousands of small tenants. |
| **Schema-per-tenant** | Strong | Medium | Dozens–hundreds of tenants; per-tenant migrations. |
| **DB-per-tenant** | Physical | High | Regulated/enterprise clients who require their own DB. |

**Rule of thumb:** start shared-row-level; offer DB-per-tenant as a premium tier
(political/finance clients often demand their own DB — see the election app's
"instance-per-election" option). Design so the *same code* runs in both by
routing the Prisma client per tenant.

**Enforcement is non-negotiable.** Never rely on developers remembering to add
`where: { tenantId }`. Use one of:
- A **scoped data accessor** — `db.forTenant(tenantId)` that injects the filter
  (Prisma client extension / `$extends`), or a thin repository layer.
- **Postgres Row-Level Security (RLS)** with `SET app.tenant_id` per connection —
  the DB refuses cross-tenant reads even if code forgets.

> **This app (interim, backward-compatible):** every route resolves its election
> from `session.electionId ?? findFirst()`. A single helper
> `electionForSession(session)` centralises it, so single-tenant deployments keep
> working while multi-tenant sessions are scoped. The end-state wraps this in a
> `scopedDb(tenant)` accessor.

---

## 4. Identity vs. authorization (the part teams get wrong)

Separate **who you are** from **what you may do in this tenant**:

1. **Authenticate the person globally** — one identity (Google/password/passkey),
   one `User` row keyed by email. A person is *not* owned by a tenant.
2. **Authorise per tenant** — access to `/{tenant}/admin` is granted if the
   person's email is in that tenant's `ownerEmails`/roles **or** they're a
   platform **super-admin**.
3. **Carry the tenant in the session** — after entering a tenant, the JWT/session
   holds `{ sub, tenantId }`. Every API authorises against `session.tenantId`, and
   a mismatch between the URL's tenant and the token's tenant is a hard 403.

> **This app:** `SUPER_ADMINS` allowlist (`filatei@torama.money`, …, plus
> `SUPER_ADMINS` env) can administer any tenant; `Tenant.adminEmails` holds each
> tenant's own admins; agent tokens already carry `electionId` (the tenant key).
> `canAdminTenant(email, tenant)` is the single choke-point.

**Golden rule:** one function decides tenant authorization; call it everywhere.
Never scatter email checks.

---

## 5. Branding / theming per tenant

White-label = the customer's identity, applied as **data, not code**:

- A `Branding` record per tenant: `name, tagline, accentColor, logoUrl, faviconUrl`
  (extend with fonts, email-from, domain).
- **Inject at the edge, SSR-consistent:** in the root layout (server), fetch the
  tenant's brand and (a) set `<title>`/metadata/manifest, (b) inject the theme as
  CSS variables (`:root{--accent: …}`), (c) pass a `BrandProvider` context so
  client components render the right name/logo with **no hydration flash**.
- Theme with **CSS variables + a token system** (`--accent`, `--surface`, `--ink`)
  so one value reskins the whole UI. Never hard-code brand colours in components.
- Assets (logo/favicon) come from a URL or per-tenant upload bucket.

> **This app:** `getBrand()` server-side → layout injects `--accent` + a
> `BrandProvider`; admin has a live brand editor (name/tagline/colour/logo).
> Same pattern reused verbatim for any product.

---

## 6. Onboarding & provisioning (self-serve)

The landing page's **primary job is to create a tenant**, not to log existing
users in. A best-in-class flow:

1. **Wizard** collects the minimum: display name → auto-derive a **unique slug**
   (editable), owner email/phone, plan inputs.
2. **Provision atomically:** create the tenant + its natural-key entity
   (election/org/store) + a **free-tier subscription** + default branding, in one
   transaction. Idempotent; unique-slug with collision suffixing.
3. **Free to start** (this app: 10 seats free, no card) → time-to-value in minutes;
   upsell seats later. Free trials convert far better than paywalls-at-signup.
4. **Hand off** to `/{slug}/admin` and email the owner their links.
5. **Auto-wrap legacy data:** on first boot after tenancy lands, wrap the existing
   single-tenant data in a default tenant so nothing is orphaned
   (`ensureDefaultTenant()` → `ondogov2027`).

> **This app:** `POST /api/onboard` + the `Onboard` component on the root; the
> owner's email becomes the tenant admin; 10 free seats provisioned.

---

## 7. Billing per tenant (with a shared payment merchant)

Reusable pattern proven here, works for any number of white-label outlets on **one**
merchant account:

- **Per-tenant subscription/seat/usage** records; price config in one place.
- **Namespaced references** (`{OUTLET_PREFIX}_{tenant}_{rand}`) so a shared
  merchant's *single* webhook (owned by one app) can fan out by prefix.
- **Webhook-independent crediting:** verify each payment via the provider API on
  the **callback redirect**, plus a **periodic reconcile sweep**, plus an optional
  webhook. Any one suffices — so a new outlet needs **no** webhook registration.
- **Never handle card data / never move money in code** — always redirect to the
  provider's hosted checkout; the buyer pays; you verify.

> **This app:** Paystack **and** Squad, `psr_`-prefixed refs, callback-verify +
> 3-min reconcile sweep + optional webhook. Reuse for any outlet by changing
> `BILLING_REF_PREFIX`.

---

## 8. Everything else that must be tenant-aware

Audit every cross-cutting concern for a tenant tag:

- **Realtime** (sockets): namespace rooms by tenant — `io.to(`t:${tenantId}`)`. A
  client only joins its own tenant's room.
- **Background jobs / cron:** every job carries a `tenantId`; sweeps iterate
  tenants. (This app's reconcile & seed run globally but write tenant-scoped rows.)
- **File storage:** prefix object keys with `tenantId/…`; signed URLs scoped.
- **Email:** per-tenant `from`/reply-to and templates.
- **Rate limits & quotas:** per-tenant buckets, not just global.
- **Audit log:** stamp `tenantId` + actor on every mutating action.
- **Observability:** put `tenantId` in every log line and trace; per-tenant
  dashboards and error budgets.
- **Search/analytics indexes:** partition by tenant.

---

## 9. Security checklist (cross-tenant leak prevention)

- [ ] URL tenant **must equal** session tenant, else 403.
- [ ] Every list/read/write is scoped by tenant at the data layer (RLS or scoped
      accessor), not per-handler.
- [ ] IDs are non-guessable (cuid/uuid) **and** ownership-checked — never trust an
      ID from the client without a tenant check.
- [ ] Super-admin actions are audited and, ideally, require an explicit
      "acting-as-tenant" switch.
- [ ] Automated test: seed 2 tenants, assert tenant A can never read/modify B via
      any endpoint (a "tenant isolation" test suite that runs in CI).
- [ ] Backups/exports are per-tenant; deletion (GDPR/NDPA) removes one tenant
      cleanly.

---

## 10. The reusable "tenant-kit" (extract this for future projects)

Package these into a shared internal library you drop into every white-label app:

```
tenant-kit/
├── resolve.ts        // resolveTenant(req): path | subdomain | custom-domain
├── context.ts        // AsyncLocalStorage tenant context + getTenant()
├── scoped-db.ts      // Prisma $extends → auto-inject tenantId filter (or RLS helper)
├── auth.ts           // authenticate() + authorizeTenant(email, tenant) + super-admins
├── brand.ts          // getBrand(tenant) + <BrandProvider> + CSS-var injector
├── onboard.ts        // createTenant(): atomic provision + unique slug + free tier
├── billing/          // subscription, seat math, provider adapters, reconcile sweep
│   ├── providers/    // paystack.ts, squad.ts, stripe.ts (same interface)
│   └── reference.ts  // namespaced refs + verify-based crediting
├── domains.ts        // custom-domain mapping + TLS hooks
└── admin/            // super-admin console: list tenants, impersonate, suspend
```

**Interfaces, not implementations.** A `PaymentProvider` interface (init / verify /
signature) lets Paystack, Squad, Stripe, Flutterwave slot in. A `TenantResolver`
interface lets path→subdomain→custom-domain evolve without touching features.

---

## 11. Apply-to-a-new-project recipe (checklist)

1. Define the tenant (what a customer buys) and its natural key.
2. Add `Tenant { slug, <naturalKeyId>, ownerEmails[], branding, subscription }`.
3. Put `resolveTenant` in middleware; decide path/subdomain/domain.
4. Add `scopedDb(tenant)` (or RLS) and route **all** data access through it.
5. Split identity (global) from authorization (`authorizeTenant` + super-admins);
   put `tenantId` in the session.
6. Move feature routes under `/{tenant}/…`; make the root the onboarding funnel.
7. Wire branding: layout injects tokens + `BrandProvider`; add a brand editor.
8. Provision on signup (atomic, free tier); auto-wrap any legacy data.
9. Billing: per-tenant subscription + namespaced refs + verify/reconcile; hosted
   checkout only.
10. Tenant-tag realtime, jobs, storage, email, logs, rate-limits, audit.
11. Ship the tenant-isolation CI test **before** onboarding real customers.

---

## 12. Anti-patterns to avoid

- ❌ Adding `where: { tenantId }` by hand in each handler (someone will forget).
- ❌ Trusting the URL's tenant without checking the session's tenant.
- ❌ Owning `User` per tenant (breaks people who belong to many tenants; breaks
  super-admins).
- ❌ Baking brand colours/logos into components instead of tokens.
- ❌ Depending on a provider webhook you don't control for money-critical state.
- ❌ One shared "current tenant" global mutable variable (race conditions) — use
  request-scoped context (AsyncLocalStorage), never a module-level singleton.

---

### Where this app stands today
Foundation shipped: `Tenant` model (1:1 with election), `resolveTenant`,
super-admin allowlist, `canAdminTenant`, auto-wrap of the live data into
`ondogov2027`, `POST /api/onboard` + a self-serve onboarding funnel on the root,
per-tenant `Branding`, and per-election billing (Paystack/Squad, reconcile). 
**Next:** path routing `/{slug}/…` + `electionForSession` scoping across the API +
the tenant-isolation CI test — turning the foundation into fully live, isolated
tenants.
