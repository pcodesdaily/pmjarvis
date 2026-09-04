# ---- dependencies -----------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./

# Production install, then strip everything Node never reads at runtime:
# TypeScript declarations, source maps, docs and each package's own test suite.
# On this dependency set that is roughly 12 MB of the 25 MB installed.
# LICENSE files are kept on purpose — the dependencies' terms require them.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
 && find node_modules \( \
        -name '*.d.ts'  -o -name '*.d.mts' -o -name '*.d.cts' \
     -o -name '*.map'   -o -name '*.ts' \
     -o -name '*.md'    -o -name 'CHANGELOG*' \
     -o -name '.npmignore' -o -name '.editorconfig' -o -name '.eslintrc*' \
    \) -type f -delete \
 && find node_modules \( \
        -name 'test' -o -name 'tests' -o -name '__tests__' \
     -o -name 'docs' -o -name 'example' -o -name 'examples' \
     -o -name '.github' -o -name '.bin' \
    \) -type d -prune -exec rm -rf {} + \
 && npm cache clean --force

# ---- runtime ----------------------------------------------------------------
FROM node:24-alpine AS runtime

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    # Cap the JS heap so the container cannot balloon on a small VPS. The bot
    # idles around 60 MB; 192 MB leaves room for large queues.
    NODE_OPTIONS=--max-old-space-size=192

# tini reaps zombies and forwards SIGTERM, so the bot leaves voice channels
# cleanly when the container restarts. ~100 KB.
RUN apk add --no-cache tini

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

USER node

ENTRYPOINT ["/sbin/tini", "--"]
# --env-file-if-exists replaces the dotenv dependency. Compose injects the real
# environment anyway; this only matters when running the image standalone.
CMD ["node", "--env-file-if-exists=.env", "src/index.js"]
