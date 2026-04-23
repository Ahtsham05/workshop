FROM node:20-bullseye-slim

# ── Install Chromium (required by whatsapp-web.js / Puppeteer) ─────────────────
# Using the system Chromium package avoids the 300 MB Puppeteer bundled download
# and ensures the binary works inside a Docker container without sandbox issues.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-freefont-ttf \
      fonts-ipafont-gothic \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer / whatsapp-web.js where to find Chrome
ENV CHROME_PATH=/usr/bin/chromium
# Puppeteer should not download its own Chrome (we use the system one)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN mkdir -p /usr/src/node-app && chown -R node:node /usr/src/node-app

WORKDIR /usr/src/node-app

COPY package.json yarn.lock ./

USER node

RUN yarn install --pure-lockfile

COPY --chown=node:node . .

EXPOSE 3000

# Start the Express server (persistent process — required for WhatsApp/Puppeteer)
CMD ["node", "src/index.js"]
