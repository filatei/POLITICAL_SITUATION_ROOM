# PSR Security & Performance Audit — findings + status

Audited the full codebase for multi-tenant isolation, authz, validation, secrets,
realtime, and performance. Status legend: ✅ fixed · ⏳ remaining (prioritized).

## CRITICAL
- ✅ **C1 Tenant scoping trusted a client cookie.** Staff JWTs now carry `electionId`
  (User.electionId column); `scopedElection()` pins agents to their token election
  and pins staff to their own election, rejecting cookie overrides. Super-admins stay
  global. (`auth.ts`, `election-scope.ts`, `auth/*`, `admin/users`)
- ✅ **C2 Agent routes unscoped (IDOR).** `admin/agents` GET now filters by election;
  `[id]/reset` and `[id]/activity` assert the agent belongs to the caller's election.
- ✅ **C3 Submissions read/verify unscoped.** GET filters by election; verify loads the
  row and rejects cross-election ids.
- ✅ **C4 Global realtime bus + presence.** Event bus + dashboard rooms + presence are
  now namespaced by `electionId`; the live wall and roster no longer leak across tenants.
- ✅ **C5 Submission POST used cookie election.** `scopedElection()` now returns the
  agent's own token election, so a tampered cookie can't misfile a report.

## HIGH
- ⏳ **H1 Branding is a global singleton** — one tenant's edit rewrites everyone's logo/
  name/accent. Fix: key `Branding` by `electionId`; read/write the scoped tenant's row.
  (`prisma/schema.prisma`, `lib/brand.ts`, `admin/branding`)
- ✅ **H2 Instructions GET unscoped** → now filtered by election.
- ✅ **H3 ai/ask fed cross-tenant field data** → now scoped by election.
- ⏳ **H4 `psr_tenant` cookie is client-set (not httpOnly).** Prefer deriving tenant from
  the URL segment via middleware / an httpOnly cookie. (defense-in-depth; C1 already
  removes it as an authority source)
- ✅ **H5 JWT secret dev fallback** → now fails fast in production if `JWT_SECRET` is
  missing/short.
- ⏳ **H6 Hardcoded Google client id in Dockerfile** — make it a build arg with no default.

## MEDIUM (remaining)
- ⏳ **M1** `upload` route: sniff magic bytes (don't trust `file.type`), rate-limit per
  agent, store under a tenant path, cap total size.
- ⏳ **M2** In-memory rate limiters (onboard/contact/ask) are per-process — move to a
  shared store (Redis) keyed by IP.
- ⏳ **M3** Add zod schemas to remaining mutating routes (agents POST/PATCH, branding,
  instructions POST, change-pin, geo POST).
- ⏳ **M4** `tally`/`bootstrap` count all polling units platform-wide — scope unit counts
  to the election's state/constituency.
- ⏳ **M5** `geo/import` + `geo/harvest` return raw Prisma error messages — log server-side,
  return generic text.

## LOW (remaining)
- ⏳ **L2** Socket.IO CORS `origin: true` — lock to known hosts (APP_URL + localhost).
- ⏳ **L3** 30-day JWT, no revocation — a reset/suspended agent's token stays valid to
  expiry. Add a token version or shorter expiry + refresh.

## PERFORMANCE (remaining)
- ⏳ **P1** `tally` loads all SCORE rows and sums in JS on every 15s poll — aggregate in
  SQL (`groupBy`) scoped by election; cache a few seconds.
- ⏳ **P4** `agents/bulk` does a count + up-to-10 uniqueness `findUnique`s inside a per-unit
  loop — pre-generate codes and `createMany`.
- ⏳ **P3** Add indexes: `Agent(electionId, pollingUnitId)`, `InstructionReceipt(agentId, status)`.

## Presence — "room sees all active agents" ✅
Implemented: presence keyed by election; `/api/presence` returns `online` (live socket),
`active` (seen ≤3 min, survives socket idling) with unit labels, and `total`. The room
renders the full active roster grouped with online/active/total counts. Socket handshake
carries the tenant slug so a super-admin's dashboard joins the right election room.
