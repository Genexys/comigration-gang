# Comigration Gang — Fan Map

## Project Overview
Interactive fan map for the Comigration community. Users place pins on a map to show where they watch from. Russian-language UI.

## Tech Stack
- **Client:** React 19 + TypeScript + Vite, react-leaflet + react-leaflet-cluster, Cloudflare Turnstile
- **Server:** Hono + TypeScript, @hono/node-server
- **Database:** MongoDB (native driver, no Mongoose)
- **Testing:** Vitest (server + client), @testing-library/react
- **Package manager:** pnpm (monorepo: root, client/, server/)

## Architecture
```
client/          — React SPA (Vite)
  src/components/  — Map, Header, Sidebar, AddPinModal, LocationSearch, PinPopup
  src/pages/       — Admin, Privacy
  src/hooks/       — usePins (with SSE real-time updates)
  src/api/         — pins, admin API clients
server/          — Hono API server
  src/routes/      — pins (GET/POST + SSE stream), admin (CRUD + ban + geocode)
  src/middleware/   — auth (timing-safe + brute-force lockout), rateLimit
  src/utils/       — profanity filter, maskIp
  src/models/      — Pin (PinDoc → PinPublic via toPublic())
Dockerfile       — multistage build, non-root user (nodejs:1001)
```

## Key Commands
```bash
pnpm dev              # Run client + server concurrently
pnpm test             # Run all tests (client + server)
pnpm build            # Build both packages
cd server && pnpm test   # Server tests only (28 tests)
cd client && pnpm test   # Client tests only (15 tests)
```

## Infrastructure
- **Domain:** comigration-gang.com
- **Hosting:** Railway (auto-deploy from GitHub main branch)
- **CDN/DDoS:** Cloudflare (Proxied DNS, Full strict SSL)
- **Admin:** /admin — Cloudflare Access + password + brute-force lockout
- **MongoDB:** Railway plugin, internal network only (no public access)

## Security Principles
- IP addresses are **never** exposed in public API responses — `toPublic()` strips `ip` field
- IPs are **masked** (last octet/segment hidden) in admin panel and all logs
- IPs are **auto-deleted** from pins after 30 days (`$unset` at server startup)
- SSE stream sends only public pin data (no IP)
- Admin API requires Bearer token + Cloudflare Access gate
- All user input: HTML stripped (decode entities → strip tags), profanity filtered, length validated
- MongoDB queries use escaped regex, no operator injection possible
- Body limit: 16KB on all API routes
- Rate limit: 3 pins/day per IP, 100 req/min on admin, brute-force lockout (5 fails → 15min)
- CSP configured without unsafe-inline, Permissions-Policy set

## Conventions
- Server uses centralized IP extraction via middleware (`c.get("clientIp")`) — never parse headers in routes
- Use `maskIp()` from `server/src/utils/maskIp.ts` for any IP display/logging (handles IPv4 + IPv6)
- Use `toPublic()` from `server/src/models/Pin.ts` for all public-facing pin data
- Server responses: `c.json({...}, statusCode)` — Hono pattern
- Client: no `dangerouslySetInnerHTML`, all user data via JSX text nodes
- Tests excluded from tsc build (`tsconfig.json` exclude)
- Commits: conventional commits style, Co-Authored-By footer

## Environment Variables (Railway)
```
MONGODB_URI          — MongoDB connection string (required in production)
ADMIN_PASSWORD       — Admin panel password
ALLOWED_ORIGIN       — CORS origin (https://comigration-gang.com)
TURNSTILE_SECRET     — Cloudflare Turnstile secret key
NODE_ENV             — "production" in Railway
PORT                 — Set by Railway
```

## Client Environment (.env)
```
VITE_TURNSTILE_SITE_KEY  — Cloudflare Turnstile site key (public)
```
