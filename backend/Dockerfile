# ── Build stage ──────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Production stage ─────────────────────────────────────────
FROM node:20-slim

# Install FFmpeg + yt-dlp
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl ca-certificates && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
         -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist

# Create storage directories (ephemeral on Render free tier)
RUN mkdir -p storage/downloads storage/clips storage/final storage/transcripts uploads

EXPOSE 10000

CMD ["node", "dist/index.js"]
