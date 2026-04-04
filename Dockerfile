# Stage 1: build client
FROM node:20-alpine AS client-build
RUN npm install -g pnpm
WORKDIR /app/client
COPY client/package.json client/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY client/ ./
ARG VITE_TURNSTILE_SITE_KEY=""
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
RUN pnpm build

# Stage 2: build server
FROM node:20-alpine AS server-build
RUN npm install -g pnpm
WORKDIR /app/server
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY server/ ./
RUN pnpm build

# Stage 3: production image
FROM node:20-alpine
RUN npm install -g pnpm
WORKDIR /app

# Copy server dist
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/package.json ./server/package.json
COPY --from=server-build /app/server/pnpm-lock.yaml ./server/pnpm-lock.yaml

# Install only production deps
WORKDIR /app/server
RUN pnpm install --prod --frozen-lockfile

# Copy client build next to server so the path ../../client/dist resolves
COPY --from=client-build /app/client/dist /app/client/dist

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

WORKDIR /app
EXPOSE 3001
CMD ["node", "server/dist/index.js"]
