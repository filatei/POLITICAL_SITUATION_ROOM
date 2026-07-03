# Situation Room — Multi-Election & White-Label Strategy

*How to take the current Ondo-Governorship app and make it serve Presidential,
Senatorial, House of Reps, State Assembly, LG Chairmanship & Councillor elections
— and white-label the same platform per client / per election.*

---

## 1. Executive summary

The good news: **you do not need a different app per election type.** Nigeria's
physical polling structure — **State → LGA → Ward → Polling Unit** — is *identical*
for every contest. What actually changes between a Governorship race and a
Senatorial or Presidential race is only three things:

1. **The constituency (scope)** — *which* polling units roll up into the result,
   and therefore who is on the ballot and who wins.
2. **The candidates & parties** on that ballot.
3. **The win rule & collation ladder** (First-Past-The-Post vs. the Presidential
   "25% in two-thirds of states" rule).

Everything else you have already built — agents, invite codes, offline PWA capture,
scores/messages/incidents, GPS, the situation-room dashboard, verify/override,
AI analysis — is **election-type agnostic** and reusable as-is.

**Recommendation:** a **two-phase** play.

- **Phase A — "Instance per election" (white-label template).** Generalise the
  data model with a *Constituency* layer and make branding config-driven. Ship a
  branded, isolated instance per client/election (own domain, logo, colours,
  candidates, scope). Fast to market, sells per-election, low blast-radius.
- **Phase B — "Multi-tenant SaaS".** One platform, many organisations, each with a
  self-service election-setup wizard, isolated data (`tenant_id` everywhere), and
  billing. This is the recurring-revenue product; build it once Phase A has paying
  users and a repeatable setup.

---

## 2. The core insight (why one codebase suffices)

```
PHYSICAL HIERARCHY (constant for every election)      ELECTORAL SCOPE (varies by type)
────────────────────────────────────────────────     ────────────────────────────────
State                                                 Presidential   → all 36 states + FCT
  └─ LGA (774)                                         Governorship   → 1 state
       └─ Ward / Registration Area (8,809)             Senatorial     → 1 senatorial district (≈3 LGAs)
            └─ Polling Unit (176,846)  ← agents here   Federal Const. → 1 federal constituency (group of wards/LGAs)
                                                        State Const.   → 1 state constituency (group of wards)
                                                        LG Chairman    → 1 LGA
                                                        Councillor     → 1 ward
```

A **Constituency** is just *a named set of polling units*, expressed through the
geography you already store. The app already captures results at the **polling
unit** (the atomic EC8A level); every higher contest is simply a *different
grouping* of the same polling units. So the generalisation is: **add a
Constituency layer, scope each election to a constituency, and make the tally +
win-rule aware of the election type.**

---

## 3. Nigeria electoral structure — reference (verify against current INEC data)

| Level | Count (2023) | Result form | Who is elected here |
|---|---|---|---|
| Polling Unit | 176,846 | **EC8A** | (capture point) |
| Ward / Registration Area | 8,809 | **EC8B** (collation) | Councillor |
| LGA | 774 | **EC8C** (collation) | LG Chairman |
| State Constituency | 990 | EC8D-equiv | State House of Assembly member |
| Federal Constituency | 360 | EC8D-equiv | House of Reps member |
| Senatorial District | 109 (3 × 36 + specials) | EC8D-equiv | Senator |
| State | 36 + FCT | EC8D/EC8E | Governor |
| Nation | 1 | EC8E | President |

**Collation ladder:** EC8A (PU) → EC8B (Ward) → EC8C (LGA) → EC8D (constituency/
state collation) → EC8E (final declaration). Your app is the *parallel* citizen/
party collation of the same ladder.

**Win rules:**
- **FPTP** (highest valid votes wins) — Governor, Senator, Reps, Assembly, Chairman,
  Councillor, *within their constituency*.
- **Presidential** — highest votes **and** ≥ 25% in **two-thirds of the 36 states +
  FCT**; else a run-off. This is the one contest needing a special declaration rule.

---

## 4. What "generalise to any election type" requires (data model)

You already have `ElectionType` enum and the geography. Add:

### 4.1 Constituency layer
```prisma
enum ConstituencyType { NATIONAL STATE SENATORIAL FEDERAL_CONSTITUENCY STATE_CONSTITUENCY LGA WARD }

model Constituency {
  id        String            @id @default(cuid())
  type      ConstituencyType
  name      String            // "Ondo Central", "Akure North/South Federal Constituency"
  code      String?
  stateId   String?           // parent state where applicable
  elections Election[]
  members   ConstituencyUnit[]
}

// Which polling units belong to a constituency (the delimitation mapping).
model ConstituencyUnit {
  constituencyId String
  pollingUnitId  String
  @@id([constituencyId, pollingUnitId])
}
```
`Election.constituencyId` scopes the whole app: agents, tally, reporting all filter
to the polling units in that constituency. For Governorship you can shortcut
(constituency = the state) — but modelling it uniformly keeps one code path.

> Simpler interim: since your geography already has `stateId/lgaId/wardId` on each
> unit, you can *derive* many constituencies by rule (Governorship = all units in
> state; Chairman = all units in LGA; Councillor = all units in ward) and only need
> the explicit `ConstituencyUnit` table for Senatorial / Federal / State
> constituencies, whose boundaries cut across LGAs/wards and must come from INEC's
> delimitation file.

### 4.2 Collation levels (optional but powerful)
Add a `level` to verified aggregation so the dashboard can show **PU → Ward → LGA →
Constituency** roll-ups (mirrors EC8A→B→C). Today you aggregate flat; a `level`
dimension lets coordinators collate ward-by-ward, spot outliers, and match INEC's
own collation as it's announced.

### 4.3 Election-type-aware result engine
A small `resultRule(electionType)` function:
- FPTP types → leader = max verified votes in scope.
- Presidential → compute per-state percentages + the 25%/two-thirds test, flag
  "declared / run-off / pending".
Drives the dashboard's "Leading / Winner / Run-off" badge and the AI summary prompt.

---

## 5. White-label strategy — two paths

### Path A — Instance per election (ship this first)
One Git template → many deployments, each fully isolated.

- **Per-client config bundle**: `election.json` (name, type, date, constituency,
  candidates/parties + logos), `branding.json` (product name, primary colour, logo,
  favicon, domain), plus INEC CSVs (units for the constituency).
- **Deploy**: a `create-instance` script that: provisions a DB, seeds geography +
  election + candidates from the bundle, bakes `NEXT_PUBLIC_*` (Google client,
  brand), writes a Caddy vhost + Cloudflare DNS for the client's domain, brings up
  the compose stack. (You already do most of this manually for Ondo.)
- **Pros**: hard data isolation (great for political clients who don't want to share
  a DB), simple mental model, per-election billing, no cross-tenant bugs.
- **Cons**: N databases/instances to operate; upgrades must be rolled across
  instances (scriptable).

### Path B — Multi-tenant SaaS (the platform play)
One deployment serves many organisations.

- **Tenant/Org layer**: `Organisation` (client/observer group/party) owns many
  `Election`s, its own staff, agents, branding. Add `tenantId` (or `orgId`) to every
  row and enforce it in every query (middleware) — exactly the pattern in your
  Daybook app.
- **Self-service setup wizard**: pick election type → pick state/constituency →
  auto-load the geography + delimitation → add candidates/logos → set branding →
  generate agent codes. No engineer per election.
- **Custom domains per tenant** (wildcard `*.sr.example` + verified custom domains).
- **Billing**: per election, per polling unit covered, or per agent seat.
- **Pros**: recurring revenue, one system to operate/upgrade, marketplace of past
  elections. **Cons**: strict isolation discipline, noisy-neighbour and blast-radius
  risk, more auth/roles work.

**Verdict:** Path A now (you're ~80% there), Path B as the productised follow-on.
The Constituency + config-driven branding work in Path A is a *prerequisite* for B,
so nothing is wasted.

---

## 6. Branding / white-label config model

Move every hard-coded identity value behind config so a rebrand is data, not code:

| Concern | Today | White-label |
|---|---|---|
| Product name ("Situation Room") | hard-coded | `branding.name` |
| Logo / favicon / PWA icons | committed assets | per-tenant asset set (upload) |
| Primary/accent colours | CSS vars in `globals.css` | `branding.theme` → injected CSS vars at runtime |
| Domain | Caddy/Cloudflare manual | per-tenant custom domain record |
| Google OAuth client | one shared client | per-tenant client id (or one central client with all origins) |
| Election name/type/date/candidates | seed | setup wizard / config bundle |

You already theme with CSS variables and light/dark — extend that to a
tenant-driven palette and you have skinnable UI for free.

---

## 7. Data ingestion (the real operational work)

The hardest part of any new election isn't code — it's **loading the correct
polling-unit register and the delimitation mapping** for the constituency:

1. **Geography**: INEC's State/LGA/Ward/PU register (you already seeded Ondo).
   Build a generic **CSV importer** (`state, lga, ward, pu_code, pu_name,
   registered_voters, lat, lng`).
2. **Delimitation**: INEC's "Senatorial Districts, Federal & State Constituencies"
   file maps LGAs/wards → constituencies. Import into `ConstituencyUnit`.
3. **Candidates/parties**: per election, with logos (reuse your party-logo system).

Ship these as an **Admin → "Election setup" importer** (CSV upload + preview +
commit) so onboarding a new election is a data task, not a deploy.

---

## 8. Phased roadmap

**P0 — Decouple identity (1–2 days).** Pull product name, colours, logo, election
metadata into a single config/env surface. Nothing functional changes; proves the
skin is data.

**P1 — Constituency layer + type-aware results (3–5 days).** Add `Constituency` +
`ConstituencyUnit`, `Election.constituencyId`, and `resultRule(type)`. Governorship/
Chairman/Councillor derive by geography; Senatorial/Federal/State via the mapping.
Dashboard shows the correct scope + win badge.

**P2 — Election-setup importer + collation levels (1 week).** CSV importers
(geography, delimitation, candidates); PU→Ward→LGA→Constituency roll-up views that
mirror EC8A→B→C. Now a non-engineer can stand up an election.

**P3 — Multi-tenant SaaS (2–3 weeks).** `Organisation` + `tenantId` everywhere,
setup wizard, custom domains, billing, org-scoped roles. This is the platform.

**P-cross — Instance factory (parallel).** A `create-instance` script for Path A so
you can sell branded per-election deployments today while P3 matures.

---

## 9. Commercial packaging (options)

- **Per-election licence** (Path A): fixed fee per contest, tiered by polling units
  covered (a Councillor ward vs. a Presidential nation are very different scopes).
- **Observer/CSO tier**: multiple constituencies under one org (Path B), priced per
  active agent seat + per election.
- **Party "war-room" tier**: real-time + AI analysis + instruction broadcast +
  incident heatmap; premium.
- **Add-ons**: SMS alerts (needs the paid SMS rail you already stubbed), PDF result
  packs (EC8A image + parallel tally), historical archive/export.

---

## 10. Risks & open questions

- **Delimitation accuracy** — Senatorial/Federal/State constituency boundaries must
  come from INEC's official file; wrong mapping = wrong result. Treat as authored,
  version-controlled reference data.
- **Presidential win-rule edge cases** — run-off logic, FCT handling, void/rejected
  ballots. Needs careful test fixtures.
- **Legal framing** — this is a *parallel citizen/party collation*, explicitly not
  the official INEC result; keep that disclaimer prominent (protects you and sets
  expectations).
- **Scale** — a Presidential parallel count is 176k polling units and potentially
  tens of thousands of agents; the offline-outbox + Socket.IO design should hold,
  but load-test P3 before a national contest.
- **Isolation model** — decide early: political clients often *require* their own DB
  (Path A) over shared multi-tenant (Path B). You can offer both tiers.

---

## Appendix — what's already reusable (no change needed)

Agent PWA + offline outbox · invite-code / QR / Google-agent enrolment · GPS
capture · scores/messages/incidents with media · verify / dispute / manual override
· situation-room dashboard (tally, unit grouping, activity, arrival chime) ·
instruction broadcast + delivery receipts · presence · AI analysis · admin geography
drill-down · CSS-variable theming (light/dark). All of this is election-type
agnostic and carries straight into every contest and every white-label instance.

---

*Sources for the electoral structure figures are listed with the message that
accompanied this document. Figures (counts, forms, win rules) should be re-verified
against the current INEC Regulations & Guidelines before a live deployment.*
