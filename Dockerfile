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
# npm start runs `tsx server.ts` (Next + Socket.IO on one port).
CMD ["npm", "start"]
