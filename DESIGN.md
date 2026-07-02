# Political Situation Room — Design

A real-time election monitoring platform. Field agents at polling units and
ward/LGA collation centers submit **messages, live scores, and incident
media** from a PWA (offline-tolerant). A **situation room dashboard** relays
everything live onto big screens, records verified scores, and an **AI panel
(Claude)** analyzes the incoming stream and the database on demand.

Built to work in poor-network conditions: the agent app is **offline-first**
with a durable outbox and background sync, so nothing is lost and the situation
room always receives the data once a link is available.

---

## 1. Election types supported

One deployment runs one **Election** instance, configurable to any of:
Presidential, Governorship, Senatorial, House of Representatives, State House of
Assembly, or LG Council Chairmanship. The type only changes the **geographic
tier that defines a "constituency"** and which parties/candidates contest — the
data model is the same for all.

| Election type | Constituency scope | Collation tiers |
|---|---|---|
| Presidential | Nation | PU → Ward → LGA → State → National |
| Governorship | State | PU → Ward → LGA → State |
| Senatorial | Senatorial district (group of LGAs) | PU → Ward → LGA → District |
| House of Reps | Federal constituency | PU → Ward → LGA → Fed. constituency |
| State Assembly | State constituency | PU → Ward → State constituency |
| LG Chairmanship | LGA | PU → Ward → LGA |

Nigerian INEC geography is the backbone: **State → LGA → Registration Area
(Ward) → Polling Unit (PU)**. Every agent is bound to a specific PU or a
collation center at ward/LGA level.

---

## 2. Roles

- **Agent (field)** — assigned to one PU or collation center. Sends messages,
  scores, incidents, media, voice notes. Only sees their own submissions.
- **Coordinator** — oversees a ward/LGA; sees all agents under them; can verify
  scores at their tier.
- **Situation Room / Analyst** — read-heavy dashboard access across the whole
  election; runs AI analysis; marks scores verified/disputed.
- **Admin** — configures the election, geography, parties/candidates, and
  registers agents (issues invite codes).

Roles + the agent's geographic scope are encoded in the JWT (`role`, `scope`,
`unitId`) and enforced server-side on every request.

---

## 3. Architecture

```
 Agent PWA (Next.js)          submit (queued offline)        Next.js API routes
 IndexedDB outbox + SW  ───────────────────────────────▶     (App Router, Node)
                        ◀──────────── ack / sync ───────      Prisma → PostgreSQL
                                                              in-proc pub/sub
 Situation Room screens ◀─────── SSE live stream ───────      Claude AI service
                                                              Media store (disk)
```

- **One Next.js app** (App Router, TypeScript, `output: standalone`) serves both
  the agent PWA and the situation-room dashboard, plus all API route handlers.
- **PostgreSQL via Prisma** is the system of record.
- **Realtime = Server-Sent Events (SSE)**. Chosen over WebSocket because it is
  one-directional (server→screens, exactly the relay need), survives
  Cloudflare/reverse proxies cleanly, and auto-reconnects. Agents *push* via
  ordinary POSTs (which is what makes offline queuing simple); the dashboard
  *subscribes* via SSE. An in-process `EventEmitter` pub/sub fans out new
  submissions to all connected screens. (Swap to Redis pub/sub if it ever runs
  multi-instance.)
- **Claude** runs behind a backend service module; the API key never reaches the
  browser.

### Why offline-first is a POST + outbox, not a socket
Agents on 2G/edge or in dead zones cannot hold a socket. So every agent action
is written to an **IndexedDB outbox** immediately (instant UX, survives app
close / reload / battery death) and a **service-worker Background Sync** (with a
foreground retry loop fallback) drains the outbox to the API whenever
connectivity returns. Each item carries a **client-generated UUID** so retries
are idempotent server-side (no double-counted scores).

---

## 4. Data model (Prisma)

- **Election** — type, name, date, status, config (tiers, flags).
- **Party** — code, name, color, logo.
- **Candidate** — party, name, running mate, the constituency they contest.
- **State / Lga / Ward / PollingUnit** — INEC geography; PU has code, name,
  registered-voter count, geo (lat/lng).
- **User** — staff (admin/coordinator/analyst); Google or password login.
- **Agent** — name, phone, assigned `pollingUnitId` or collation `wardId/lgaId`,
  `inviteCode`, `pinHash`, status.
- **Submission** — the universal field event: `type` = MESSAGE | SCORE | INCIDENT
  | STATUS; `clientUid` (idempotency); author (agent/user); unit; free text;
  `capturedAt` vs `receivedAt`; geo; linked media; `channel` (text/voice).
- **ScoreRecord** — per submission, per candidate/party: votes; plus
  `accreditedVoters`, `totalVotesCast`, `rejectedBallots`; `confidence` =
  DECLARED | PERCEIVED | ESTIMATE; `sheetSigned` boolean; `status` = PENDING |
  VERIFIED | DISPUTED.
- **Media** — file ref (image/video/audio), mime, size, thumbnail, sha256,
  `kind` = RESULT_SHEET | INCIDENT | VOICE | OTHER, `sheetSigned` flag.
- **AuditLog** — who/what/when for every verify/dispute/config change (integrity).

**Score integrity model:** scores arrive as **DECLARED / PERCEIVED / ESTIMATE**.
The dashboard shows all three but tallies **verified declared** scores as the
"real" count, with perceived/estimate shown separately as an early signal. A
result attached to a **signed sheet** photo is weighted higher and can be
verified with one click by an analyst who eyeballs the sheet.

---

## 5. Authentication (all three methods)

A single `/api/auth/*` surface issues the same HS256 JWT regardless of method.

- **Invite code + PIN (primary, field)** — Admin registers an agent to a unit
  and generates a one-time invite code. First launch: agent enters code, sets a
  PIN. Thereafter the app re-auths with **PIN against a cached credential**, so
  login works even fully offline (the cached JWT + PIN unlock the app; queued
  submissions still sync later). No SMS/data dependency.
- **Phone + SMS OTP** — pluggable SMS provider (`SMS_PROVIDER` env: termii |
  twilio | log). Good for coordinators; needs signal at login.
- **Google SSO** — reuses the Otuburu/Torama Google client for staff/analysts.

JWT claims: `sub`, `role`, `scope` (national/state/lga/ward/pu), `unitId`,
`name`. Middleware validates and enforces scope on every API route.

---

## 6. Agent PWA screens

- **Login** — tabbed: Invite+PIN / Phone OTP / Google.
- **Home** — my unit banner, connectivity + outbox badge ("3 queued"), big
  action buttons: *Send Update*, *Enter Scores*, *Report Incident*.
- **Send Update** — message text or **voice note**. Voice → on-device
  Web Speech API transcription to editable text; audio file also queued so the
  room can replay. "Speak the numbers" command mode parses spoken digits into
  the score fields.
- **Enter Scores** — one row per candidate/party (pre-loaded for the unit),
  accredited voters / total cast / rejected, confidence selector
  (declared/perceived/estimate), attach result-sheet photo, signed? toggle.
- **Report Incident** — text + photo/video capture, auto-geotag, severity.
- Everything writes to the **outbox** first; a sync indicator shows progress.

## 7. Situation room dashboard

- **Live wall** — chronological stream of incoming submissions with agent name,
  unit, tier, geo, media thumbnails; filter by type/tier/severity.
- **Incident board** — media-forward grid of incidents (result sheets, videos),
  click to enlarge, verify/flag.
- **Score tally** — live leaderboard per candidate/party, split
  declared/perceived, reporting progress ("412 / 1,203 PUs in"), by state/LGA/
  ward drill-down, turnout/rejected stats.
- **Map** — agent/unit pins colored by status/leading party.
- **AI panel** — live rolling summary, incident triage, anomaly flags on scores
  (e.g. votes > accredited, turnout outliers), and a natural-language Q&A box
  over the DB.
- **Big-screen mode** — full-bleed, high-contrast, auto-rotating panels for the
  projector; no chrome.

## 8. AI (Claude)

Backend `lib/ai` service using the Anthropic SDK. Capabilities:
1. **Live summary** — rolling digest of the last N minutes of submissions.
2. **Incident triage** — classify/severity-rank incoming incident text.
3. **Score anomaly detection** — flag impossible/suspicious tallies.
4. **Q&A over DB** — analyst asks in plain English; service runs safe read
   queries and answers with citations to units.
Key stays server-side; all AI calls are logged.

## 9. Poor-network & integrity guarantees

- Outbox + idempotent UUIDs → **no loss, no double counting**.
- `capturedAt` recorded on device, `receivedAt` on server → true timeline even
  when sync is delayed.
- Media compressed client-side before queueing (images downscaled; video size
  cap) to survive slow uplinks; large items retried with backoff.
- Append-only `AuditLog` on every score verify/dispute and config change.
- Optional edge write-lock after polls close; scores become read-only.

## 10. Theme
White background, near-black text (`#0a0a0a`), professional `Inter`-style font,
restrained accent, semantic **green = confirmed**, **red = disputed / alert**
only. High-contrast big-screen variant.

## 11. Stack summary
Next.js 14 (App Router) · TypeScript · React 18 · PostgreSQL + Prisma ·
Tailwind · SSE (in-proc pub/sub) · jose (JWT) · bcryptjs · zod ·
@anthropic-ai/sdk · manual service worker + IndexedDB outbox (PWA). Deploy as a
standalone Node container behind Caddy/Cloudflare (same pattern as your other
apps) — **not** on the overloaded Otuburu box.

---

## 12. Realtime v2 — two-way socket tier (Socket.IO)

The situation room needs bidirectional realtime during the count: **push
instructions to specific agents**, see **who is online (presence)**, and get
**per-agent delivery receipts**. This adds a Socket.IO tier alongside the app.

**Invariant (unchanged):** result/incident **submissions always go over the
offline POST + outbox** — never over a socket. Field agents on bad networks
cannot depend on a live connection to file data. Sockets are an *enhancement*
for presence, instructions, and receipts, and for low-latency dashboard push.

### Transport
Socket.IO (not raw ws): auto-reconnect, WebSocket with HTTP long-poll fallback
(survives flaky 3G and Cloudflare), rooms, and **ack callbacks** (which give us
delivery receipts for free). A single custom Node server (`server.ts`) hosts
both Next.js and Socket.IO on one port → one deploy. Optional Redis adapter
(env flag) for multi-instance later.

### Rooms
- `dashboard` — all situation-room screens.
- `agent:<agentId>` — one room per agent (targeted instructions + receipts).
- `election:<id>` — broadcast to all agents.
Handshake authenticates with the same JWT (cookie or `auth.token`); the socket
joins rooms by role/identity.

### Events
- Server→dashboard: `live` (submission/score/verify — bridged from the existing
  in-process event bus, so current POST routes need no change) and
  `presence:update`.
- Server→agent: `instruction` (with an ack callback → receipt).
- Agent→server: `presence` heartbeat, `instruction:ack` / `instruction:read`.
  (Submissions still POST.)

### Durable instructions (survive offline)
Instructions are **persisted first**, then delivered — never fire-and-forget:
- `Instruction` row + one `InstructionReceipt` per targeted agent (status
  `SENT → DELIVERED → ACK → READ`).
- If the agent socket is online: emit with ack → mark `DELIVERED`; agent tap →
  `READ`.
- If offline: the receipt stays `SENT`; on reconnect the server flushes all
  undelivered receipts, and the agent app also `GET`s `/api/instructions` on
  load to catch anything missed. (SMS/push fallback is a later add for
  CRITICAL instructions.)
Every receipt transition is mirrored to the dashboard so staff watch delivery
in real time.

### Presence
Connect/disconnect maintains an in-process online set (Redis later);
`Agent.lastSeenAt` is persisted. Dashboard shows online count + per-unit online
status so the room knows which units currently have a live agent.
