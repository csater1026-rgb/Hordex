# Hordex swarm backend — runs N headless Chromium bots, so the image needs a
# real browser + its OS deps. node base + `playwright install` fetches the
# Chromium build that matches the installed playwright version (version-proof).
FROM node:20-bookworm-slim

WORKDIR /app

# Build tools for better-sqlite3 (falls back to source build if no prebuilt).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Chromium + its system libraries, matched to the installed playwright.
RUN npx playwright install --with-deps chromium

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
# Let Playwright resolve its own bundled Chromium in this image.
ENV HORDEX_CHROMIUM=
EXPOSE 3000
CMD ["node", "server/index.js"]
