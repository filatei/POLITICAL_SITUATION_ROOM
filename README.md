# Political Situation Room

Real-time election monitoring. Field agents at polling units / collation centers
report **messages, live scores, and incident media** from an offline-tolerant
PWA; the **situation room dashboard** relays everything live (big-screen mode),
records verified scores, and a **Claude AI panel** analyzes the stream.

See **[DESIGN.md](./DESIGN.md)** for the full architecture and data model.

## Stack
Next.js 14 (App Router) · TypeScript · React 18 · PostgreSQL + Prisma ·
Tailwind · SSE realtime · jose (JWT) · Claude (`@anthropic-ai/sdk`) ·
IndexedDB outbox + service worker (offline-first PWA).

## Quick start

```bash
cd POLITICAL_SITUATION_ROOM
cp .env.example .env          # set DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY
npm install

# database
npx prisma generate
npm run db:push               # create tables
npm run db:seed               # sample governorship election + 2 agents + staff

npm run dev                   # http://localhost:3200
```

Need Postgres quickly:
```bash
docker run -d --name psr-pg -e POSTGRES_USER=psr -e POSTGRES_PASSWORD=psr -e POSTGRES_DB=psr -p 5432:5432 postgres:16-alpine
```

## Try it

- **Agent app** → http://localhost:3200/agent/login
  Invite code `FIELD-1001` (or `FIELD-1002`), set any 4+ digit PIN on first
  sign-in. Send an update, enter scores (attach a result-sheet photo), report an
  incident. Turn off Wi-Fi to see items queue, then reconnect to watch them sync.
- **Situation room** → http://localhost:3200/room
  Sign in `analyst@situationroom.local` / `changeme`. Watch submissions arrive
  live, verify scores, read the AI summary, ask a question.

## Auth methods
- **Invite code + PIN** — agents; works offline after first sign-in.
- **Phone OTP** — `SMS_PROVIDER=log` prints the code to the server console; set
  `termii`/`twilio` for real SMS.
- **Google** — staff; reuses the Otuburu Google client. Add your origin as an
  Authorized JavaScript origin and set `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

## Scripts
- `npm run dev` / `build` / `start`
- `npm run typecheck` — `tsc --noEmit`
- `npm run db:push` / `db:seed` / `prisma:generate`

## Notes
- Realtime uses SSE (`/api/stream`); the dashboard auto-reconnects.
- Media is stored under `public/uploads` (set `UPLOAD_DIR`). For production use
  object storage or a mounted volume.
- Single-instance in-process pub/sub + OTP store; use Redis if you scale out.
- Deploy as a standalone Node container behind Caddy/Cloudflare — **not** on the
  overloaded Otuburu box.
