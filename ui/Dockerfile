FROM node:22-alpine AS build

ARG APP_VERSION=dev
WORKDIR /app

# Install deps (layer cached)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .

# Stamp version into assets before building
RUN echo "{\"version\": \"${APP_VERSION}\"}" > src/assets/version.json

RUN npx ng build --configuration=production

# Production stage — sync built files into the shared volume on every start
FROM alpine:3.21

COPY --from=build /app/dist/bytescop-saas/browser /build

# On every container start: wipe stale files, copy fresh build, then exit.
# Using rsync --delete ensures removed files don't linger in the volume.
RUN apk add --no-cache rsync
CMD ["sh", "-c", "rsync -a --delete /build/ /app/ui/"]
