# Security Best Practices Audit Report

**Project:** comigration-gang (Hono + React/Vite map application)  
**Date:** 2026-04-04  
**Auditor:** Claude Opus 4.6 (automated)  
**Scope:** Full codebase (server + client + Docker + configuration)  
**Reference specs:** javascript-express-web-server-security.md, javascript-typescript-react-web-frontend-security.md, javascript-general-web-frontend-security.md  
**Note:** Server uses Hono (not Express), but the same security patterns from the Express spec apply.

---

## Executive Summary

This project is a community pin-map application where users place pins with nicknames and comments on a map. It has undergone two prior rounds of security fixes and shows strong security posture in many areas. The project correctly implements: security headers via Hono `secureHeaders`, timing-safe admin auth comparison, input sanitization with HTML stripping, rate limiting, IP banning, CAPTCHA integration (Turnstile), body size limits, CORS restrictions, IP anonymization for old data, non-root Docker execution, and the `toPublic()` pattern to exclude sensitive fields from API responses.

However, several findings remain that do not follow best practices per the reference documents. The most notable issues are: the CSP allows `'unsafe-inline'` for scripts (undermining XSS protection), proxy trust is not explicitly configured (making IP-based rate limiting spoofable), the admin password is a static bearer token without brute-force lockout, the `client/.env.example` contains a real Turnstile site key, and error handling does not include a global catch-all to prevent stack trace leaks.

**Finding count:** 3 High, 5 Medium, 5 Low

---

## Findings by Severity

---

### HIGH

---

#### Finding #1: CSP allows `'unsafe-inline'` for script-src, significantly weakening XSS protection

**Rule IDs:** REACT-CSP-001, JS-CSP-001, EXPRESS-HEADERS-001  
**Severity:** High  
**Location:** `server/src/index.ts:71`

**Evidence:**
```typescript
scriptSrc: ["'self'", "'unsafe-inline'", "challenges.cloudflare.com"],
```

**Impact:** The `'unsafe-inline'` directive in `script-src` effectively neutralizes CSP as an XSS defense. If an attacker can inject HTML (e.g., via a future vulnerability in pin rendering or a stored XSS in comments), they can execute arbitrary inline scripts. The reference specs state: "MUST avoid adding `unsafe-inline` as a quick fix for CSP issues unless explicitly required and reviewed (it defeats much of CSP's purpose)."

**Fix:** Remove `'unsafe-inline'` from `scriptSrc`. If inline scripts are needed (e.g., for Turnstile or Vite's module preload), use nonce-based CSP instead. Modern Vite builds do not require `unsafe-inline` for script-src when configured correctly.

**Mitigation:** If removing `'unsafe-inline'` immediately is not feasible, add `'strict-dynamic'` with nonces, and document why `'unsafe-inline'` is temporarily required.

---

#### Finding #2: No explicit proxy trust configuration -- IP-based security is spoofable

**Rule ID:** EXPRESS-PROXY-001  
**Severity:** High  
**Location:** `server/src/index.ts` (entire file -- no trust proxy setting); `server/src/routes/pins.ts:109-110`; `server/src/middleware/rateLimit.ts:8-9`; `server/src/routes/admin.ts:25`

**Evidence:**
```typescript
// pins.ts:109-110
const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

// rateLimit.ts:8-9
const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
```

**Impact:** The application reads `X-Forwarded-For` directly without any proxy trust configuration. In Hono, without configuring trusted proxies, the `X-Forwarded-For` header is entirely client-controllable. An attacker can set arbitrary IP addresses to:
- Bypass rate limiting (3 pins/day limit)
- Bypass IP bans
- Evade deduplication checks
- Frame innocent IPs for banning by admins

The reference spec states: "MUST NOT blindly trust `X-Forwarded-For`... Rate limiting keyed by `req.ip` with spoofable forwarded headers" is an insecure pattern.

**Fix:** Configure Hono's trusted proxy handling. If deployed behind a known reverse proxy (e.g., Cloudflare, nginx), use the `CF-Connecting-IP` header or configure Hono to only trust the immediate proxy's `X-Forwarded-For`. Extract the IP centrally via middleware instead of repeating the pattern in 3 places:

```typescript
// Option A: For Cloudflare deployments
const ip = c.req.header("cf-connecting-ip") || "unknown";

// Option B: Configure trusted hop count and use the correct entry
// Hono doesn't have built-in trust proxy -- implement middleware
```

Also consolidate IP extraction into a single middleware to avoid the current triple-duplication.

---

#### Finding #3: Admin authentication lacks brute-force protection and uses a static bearer token

**Rule ID:** EXPRESS-AUTH-001  
**Severity:** High  
**Location:** `server/src/middleware/auth.ts:17-29`; `server/src/routes/admin.ts:14-38`; `client/src/api/admin.ts:3`

**Evidence:**
```typescript
// auth.ts -- static password comparison
const adminPass = process.env.ADMIN_PASSWORD;
if (!authHeader || !safeCompare(authHeader, `Bearer ${adminPass}`)) {
  return c.json({ error: "Unauthorized" }, 401);
}

// admin.ts -- rate limit is 100 req/min with no failed-attempt tracking
const ADMIN_RATE_LIMIT = 100; // 100 requests per minute

// client admin.ts -- password stored in module-level variable
let _adminToken = "";
```

**Impact:** While the admin rate limit exists (100 req/min), it does not track failed authentication attempts specifically. An attacker can attempt 100 password guesses per minute per IP (and with the X-Forwarded-For spoofing from Finding #2, unlimited attempts). The reference spec states: "SHOULD rate-limit by consecutive failed attempts per username+IP" and "SHOULD protect login/auth endpoints against brute forcing."

Additionally, the admin token is stored in a module-scoped JS variable (`_adminToken`) on the client. While this is better than localStorage (per REACT-AUTH-001), it means the token persists for the tab lifetime and is accessible to any XSS.

**Fix:**
1. Add failed-attempt tracking: after N failed auth attempts from an IP, lock out that IP for a progressively increasing duration.
2. Consider adding an account lockout or exponential backoff after repeated failures.
3. Consider time-limited admin sessions (JWT with expiry) instead of a static password that never rotates.

---

### MEDIUM

---

#### Finding #4: CSP allows `'unsafe-inline'` for style-src

**Rule ID:** REACT-CSP-001, JS-CSP-002  
**Severity:** Medium  
**Location:** `server/src/index.ts:72`

**Evidence:**
```typescript
styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
```

**Impact:** While `'unsafe-inline'` in `style-src` is less dangerous than in `script-src`, it still allows CSS injection which can be used for data exfiltration (e.g., reading CSRF tokens via CSS selectors). The reference specs note to "avoid `unsafe-inline` where possible."

**Fix:** Remove `'unsafe-inline'` from `styleSrc` if feasible. If inline styles are needed (common for React/Leaflet), use nonce-based styles or accept the risk with documentation.

**False positive notes:** Many React/Leaflet applications require `'unsafe-inline'` for styles due to how libraries inject CSS. This may be acceptable if documented.

---

#### Finding #5: `client/.env.example` contains a real Turnstile site key

**Rule ID:** REACT-CONFIG-001  
**Severity:** Medium  
**Location:** `client/.env.example:2`

**Evidence:**
```
VITE_TURNSTILE_SITE_KEY=0x4AAAAAACxTsJrtJWwLbyB8
```

**Impact:** The `.env.example` file is committed to the repository and contains what appears to be a real Cloudflare Turnstile site key (not a placeholder). While Turnstile site keys are public by design (they appear in frontend HTML), best practice per the reference spec is: example files should contain placeholders, not real values, to avoid confusion about what is secret and what is not.

**Fix:** Replace with a placeholder:
```
VITE_TURNSTILE_SITE_KEY=your-turnstile-site-key-here
```

---

#### Finding #6: No custom 404 handler or global error handler for API routes

**Rule ID:** EXPRESS-ERROR-001, EXPRESS-FINGERPRINT-001  
**Severity:** Medium  
**Location:** `server/src/index.ts:101-118`

**Evidence:** The server defines API routes and static file serving but has no explicit:
- 404 handler for `/api/*` routes that don't match
- Global error-catching middleware

While individual route handlers have try/catch blocks returning generic "Internal server error" messages (good), there is no global fallback. If a middleware or an unhandled async rejection occurs, Hono's default error handling may leak stack traces or framework-identifying information.

**Fix:** Add a global error handler and a 404 handler for API routes:
```typescript
// After route definitions
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});
```

---

#### Finding #7: MongoDB connection string falls back to localhost without TLS

**Rule ID:** EXPRESS-SESS-002 (adapted for DB connections)  
**Severity:** Medium  
**Location:** `server/src/index.ts:21`

**Evidence:**
```typescript
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/comigration";
```

**Impact:** The fallback MongoDB URI uses no authentication and no TLS. If `MONGODB_URI` is accidentally unset in production, the server would attempt to connect to an unauthenticated local MongoDB instance. The reference specs emphasize that secrets and connection strings should be managed carefully.

**Fix:** In production, fail hard if `MONGODB_URI` is not set rather than falling back to an insecure default:
```typescript
const MONGODB_URI = process.env.MONGODB_URI || (process.env.NODE_ENV === "production"
  ? (() => { throw new Error("MONGODB_URI is required in production"); })()
  : "mongodb://localhost:27017/comigration");
```

---

#### Finding #8: IP addresses logged in plain text to console

**Rule ID:** EXPRESS-ERROR-001 (sensitive data logging)  
**Severity:** Medium  
**Location:** `server/src/routes/admin.ts:143`; `server/src/routes/pins.ts:117`

**Evidence:**
```typescript
// admin.ts:143 -- full IP logged
console.log(`[ADMIN] IP banned: ${pin.ip} via pin ${id}, deleted ${deleteResult.deletedCount} pins at ${new Date().toISOString()}`);

// pins.ts:117 -- full IP logged
console.warn(`[SECURITY] Banned IP attempted to post: ${ip}`);
```

**Impact:** Full IP addresses are logged to stdout. In containerized/cloud environments, these logs may be shipped to log aggregation services. IP addresses are PII under GDPR and similar regulations. While line 142 of admin.ts masks the IP for the API response (good), the console log on line 143 contains the full unmasked IP.

**Fix:** Mask IPs in log output the same way they are masked in API responses, or use a structured logging library that can be configured to redact PII.

---

### LOW

---

#### Finding #9: No `Permissions-Policy` header configured

**Rule ID:** REACT-HEADERS-001  
**Severity:** Low  
**Location:** `server/src/index.ts:65-79`

**Evidence:** The `secureHeaders` configuration sets CSP, HSTS, and other headers, but does not include `Permissions-Policy` (formerly `Feature-Policy`).

**Impact:** Without `Permissions-Policy`, the application does not restrict access to browser features (camera, microphone, geolocation, etc.) for embedded content. This is defense-in-depth.

**Fix:** Add `Permissions-Policy` to restrict unnecessary browser features:
```typescript
// In secureHeaders or as a separate middleware:
c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
```

---

#### Finding #10: Rate limit state stored in-memory -- lost on restart, not shared across instances

**Rule ID:** EXPRESS-AUTH-001 (rate limiting robustness)  
**Severity:** Low  
**Location:** `server/src/middleware/rateLimit.ts:1-29`; `server/src/routes/admin.ts:13-22`

**Evidence:** Both the pin rate limiter and admin rate limiter use in-memory Maps/DB queries. The pin rate limiter queries MongoDB (durable), but the admin rate limiter uses an in-memory Map that resets on restart.

**Impact:** If the server restarts or if multiple instances are deployed, the admin rate limit resets, allowing a burst of requests. For single-instance deployments this is acceptable; for multi-instance it is not.

**Fix:** For production multi-instance deployments, consider using Redis or MongoDB for rate limit state. For single-instance, this is acceptable as-is. Document the assumption.

---

#### Finding #11: No Subresource Integrity (SRI) for third-party resources

**Rule ID:** REACT-SRI-001, JS-SRI-001  
**Severity:** Low  
**Location:** `client/index.html` (no external scripts); CSP allows `challenges.cloudflare.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `*.cartocdn.com`, `*.openstreetmap.org`

**Evidence:** The CSP permits loading resources from several third-party domains. While the `index.html` does not directly include `<script>` tags from CDNs (Vite bundles dependencies), the application loads:
- Google Fonts (stylesheet + font files)
- CartoCDN tile images
- OpenStreetMap tiles
- Cloudflare Turnstile script

These are loaded at runtime without SRI.

**Impact:** If any of these CDNs are compromised, malicious content could be served. The reference spec states: "SHOULD use SRI for any third-party script/style loaded from a CDN."

**Fix:** For Google Fonts, consider self-hosting. For Turnstile, SRI is not practical as Cloudflare controls versioning. For tile images, SRI does not apply. Document the rationale.

---

#### Finding #12: Dockerfile installs pnpm globally in production image

**Rule ID:** EXPRESS-DEPS-001  
**Severity:** Low  
**Location:** `Dockerfile:24`

**Evidence:**
```dockerfile
FROM node:20-alpine
RUN npm install -g pnpm
```

**Impact:** The production image includes pnpm installed globally, which increases the attack surface slightly. After `pnpm install --prod`, pnpm is no longer needed.

**Fix:** Use a multi-stage approach where pnpm is only in the build stage, or use `corepack enable` (built into Node 20) instead of global npm install. Alternatively, remove pnpm after installation:
```dockerfile
RUN pnpm install --prod --frozen-lockfile && npm uninstall -g pnpm
```

---

#### Finding #13: `city` field not length-validated before database insertion

**Rule ID:** EXPRESS-INPUT-001  
**Severity:** Low  
**Location:** `server/src/routes/pins.ts:91-92`, `server/src/routes/pins.ts:157`

**Evidence:**
```typescript
// Validation only checks non-empty:
if (typeof city !== "string" || city.trim().length === 0) {
  return c.json({ error: "city is required" }, 400);
}
// ...
// But city is not length-capped before insertion:
city: stripHtml(city),
```

**Impact:** While the body size limit (16KB) provides an upper bound, the `city` field has no explicit max-length validation unlike `nickname` (30 chars), `comment` (200 chars), and `country` (100 chars). An attacker could submit a very long city name (up to ~16KB).

**Fix:** Add a length check consistent with other fields:
```typescript
if (typeof city !== "string" || city.trim().length === 0 || city.length > 200) {
  return c.json({ error: "city must be 1-200 characters" }, 400);
}
```

---

## Positive Findings (What's Done Right)

1. **Timing-safe admin auth comparison** (`server/src/middleware/auth.ts:5-15`): Uses `crypto.timingSafeEqual` with length padding -- prevents timing side-channel attacks on the admin password.

2. **HTML stripping on all user input** (`server/src/routes/pins.ts:14-25`): The `stripHtml()` function decodes HTML entities and strips tags before storing data, preventing stored XSS.

3. **Public/private data separation** (`server/src/models/Pin.ts:26-37`): The `toPublic()` function explicitly excludes the `ip` field from public API responses -- defense against accidental PII exposure.

4. **IP anonymization for old data** (`server/src/index.ts:43-51`): IPs are removed from pins older than 90 days on server startup -- good GDPR/privacy practice.

5. **Rate limiting on pin creation** (`server/src/middleware/rateLimit.ts`): Database-backed rate limit of 3 pins per day per IP, surviving restarts.

6. **Body size limits** (`server/src/index.ts:62`): 16KB body limit on API routes prevents large payload DoS.

7. **CAPTCHA integration** (`server/src/routes/pins.ts:39-55`): Cloudflare Turnstile verification with proper server-side validation.

8. **CORS with explicit origins** (`server/src/index.ts:82-89`): CORS is restricted to configured origins with explicit methods -- not a wildcard.

9. **HSTS configured** (`server/src/index.ts:68`): Strict-Transport-Security with includeSubDomains and 1-year max-age.

10. **Deduplication logic** (`server/src/routes/pins.ts:133-143`): Prevents the same IP from creating pins in the same location within 24 hours.

11. **Non-root Docker user** (`Dockerfile:39-41`): Production container runs as `nodejs` user (UID 1001), not root.

12. **Profanity filter** (`server/src/utils/profanity.ts`): Content moderation with normalization (letter substitution, repeated chars).

13. **`.env` properly gitignored** (`.gitignore:3`): The `server/.env` file is not tracked by git.

14. **React JSX escaping used consistently**: The client renders all user data (nicknames, comments, cities) through JSX interpolation (`{pin.nickname}`, `{pin.comment}`, etc.) -- React's default escaping prevents client-side XSS.

15. **No `dangerouslySetInnerHTML` usage**: The entire client codebase avoids `dangerouslySetInnerHTML` and direct DOM sinks.

16. **No localStorage for auth tokens**: The admin token is stored in a module-scoped variable rather than `localStorage`, reducing XSS exfiltration risk (per REACT-AUTH-001).

17. **CSRF not applicable**: Authentication uses `Authorization: Bearer` headers (not cookies), so CSRF is not a concern per EXPRESS-CSRF-001.

18. **Referrer policy set** (`client/index.html:11`): `<meta name="referrer" content="strict-origin-when-cross-origin">` prevents leaking full URLs to third parties.

19. **NoSQL injection mitigated**: All MongoDB queries are constructed with explicit field selections from validated input, not by passing `req.body` directly into query objects.

20. **Cache-Control headers** (`server/src/index.ts:92-99`): GET responses use `public, max-age=30` and mutation responses use `no-store`.

---

## Summary Table

| ID  | Severity | Rule ID(s) | Finding |
|-----|----------|------------|---------|
| #1  | High     | REACT-CSP-001, JS-CSP-001 | `'unsafe-inline'` in script-src CSP |
| #2  | High     | EXPRESS-PROXY-001 | No proxy trust -- IP spoofable via X-Forwarded-For |
| #3  | High     | EXPRESS-AUTH-001 | Admin auth lacks brute-force protection |
| #4  | Medium   | REACT-CSP-001 | `'unsafe-inline'` in style-src CSP |
| #5  | Medium   | REACT-CONFIG-001 | Real key in .env.example |
| #6  | Medium   | EXPRESS-ERROR-001 | No global 404/error handler |
| #7  | Medium   | EXPRESS-SESS-002 | Insecure MongoDB fallback URI |
| #8  | Medium   | EXPRESS-ERROR-001 | Full IPs logged in plain text |
| #9  | Low      | REACT-HEADERS-001 | No Permissions-Policy header |
| #10 | Low      | EXPRESS-AUTH-001 | In-memory admin rate limit state |
| #11 | Low      | REACT-SRI-001 | No SRI for third-party resources |
| #12 | Low      | EXPRESS-DEPS-001 | pnpm in production Docker image |
| #13 | Low      | EXPRESS-INPUT-001 | city field missing length validation |
