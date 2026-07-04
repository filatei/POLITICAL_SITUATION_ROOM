# Political Situation Room — app image (Next.js custom server + Socket.IO).
FROM node:20-bullseye AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci || npm install

COPY . .
RUN npx prisma generate

# NEXT_PUBLIC_* must be present at build time (baked into the client bundle).
# Defaults to the Otuburu/Torama Google client; override with --build-arg.
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=763064592541-afo8b3po66bmo04q9ecselk9prske4l0.apps.googleusercontent.com
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3200
EXPOSE 3200
# On boot, sync the DB to the schema (additive `db push`) so a deploy that adds
# tables/columns doesn't leave prod out of sync → 500s. Non-fatal: if the push
# can't run we still start (same as before), and it's logged.
# Then `npm start` runs the Next + Socket.IO custom server on one port.
# Try a safe additive push first; if Prisma blocks on a (usually false-alarm)
# data-loss warning — e.g. adding a unique constraint on a nullable column — retry
# with --accept-data-loss so new columns actually land instead of silently failing.
CMD ["sh", "-c", "npx prisma db push --skip-generate || npx prisma db push --skip-generate --accept-data-loss || echo 'WARN: prisma db push failed — starting anyway'; npm start"]
