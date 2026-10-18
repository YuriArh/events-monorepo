# Auth audit — 2026-10-17

Scope: authentication, sessions and authorization in `apps/api` (session
plugin, auth and users modules, event permissions, rate limits, Origin check,
config), the web app's session handling (`lib/api.server.ts`,
`lib/set-cookie.ts`, `lib/session*.ts`, `app/actions/*`, protected pages) and
the production setup in `docs/deployment.md`. Method: code review at commit
`bfff9b7`; no penetration testing. How the mechanism works is described in
[../authentication.md](../authentication.md).

## Summary

The design is sound and carefully implemented. No critical or high-severity
issue was found: no way to sign in as someone else, bypass a guard, or modify
another user's event. The findings are about abuse resistance (rate limits,
storage), hardening, and a few gaps between intent and behaviour.

| # | Severity | Finding |
| --- | --- | --- |
| M1 | Medium — **fixed** | Login rate limit is per IP **+ email**: unlimited password spraying and argon2 work per IP |
| M2 | Medium — **limit fixed**, sweep open | Image upload has no rate limit and orphaned files are never removed |
| L1 | Low | Changing the password keeps the current session token, so it doesn't evict a stolen cookie |
| L2 | Low | `sid` has no `__Host-` prefix: cookie tossing from a sibling subdomain |
| L3 | Low — **fixed** | Forgot-password limited only per IP: mail bombing and invalidating a victim's reset link |
| L4 | Low | Email verification is not required for anything |
| L5 | Low | Registration reveals whether an email has an account (409) |
| L6 | Low | Expired sessions and tokens are never purged (incl. stored IP/user agent) |
| L7 | Low | `RATE_LIMITS=off` is not guarded against production |
| L8 | Low | Reset hashes the new password before checking the token |
| I1–I5 | Info | Security headers, `canModify` duplication, `requireRole` unused, in-memory limits, per-request DB lookup |

## What is done well

- Opaque random session tokens (256 bit), stored only as sha256; reset and
  verification links the same way. A database leak yields no usable session.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Secure` derived from `WEB_ORIGIN`
  (not `NODE_ENV`), no `Domain`.
- New token on every sign-in (no fixation); user and role re-read from the
  database on every request, so revocation and role changes are immediate.
- argon2id; timing-equalised login for unknown emails (dummy hash
  precomputed); one error message for unknown email / wrong password and for
  every kind of bad link; forgot-password answers 204 immediately and runs
  fire-and-forget.
- Single-use tokens redeemed with a conditional `updateMany` (race-safe);
  issuing a token retires older ones; reset = new hash + all sessions deleted
  in one transaction; password change likewise for the other sessions.
- Ownership checked in the service (`canModify`), `organizerId` taken from
  the session, never from the body; `currentUser()` fails loudly when a guard
  is missing.
- CSRF: `SameSite=Lax` + Origin check (also covers sibling subdomains) + Next's
  own Server Action Origin/Host check.
- `passwordHash` cannot leak by accident (`publicUserSelect` everywhere).
- `safeNext` blocks open redirects including `/\host` and control-character
  tricks; the verify-email page requires a click, so link scanners can't spend
  the token; destructive account actions re-check the password.
- Mailer fails closed outside development/test; forwarded IP trusted only
  from `TRUSTED_PROXY`; IPv6 grouped by /64 for rate limits.
- Good test coverage of these properties (`app.security.test.ts`,
  `auth.routes.test.ts`, `user.routes.test.ts`, `session.test.ts`, e2e).

## Findings

### M1 — Login limit per IP + email allows spraying and argon2 exhaustion

`authRateLimits.login` (`apps/api/src/lib/rate-limits.ts:48`) keys on
`${clientKey(ip)}:${email}`. One IP gets 5 attempts **per email**, with no
cap across emails:

- *Password spraying*: one address tries `Summer2026!` against 10 000 emails
  — never limited. Only the per-email-per-IP brute force is stopped.
- *Resource exhaustion*: every attempt costs one argon2id operation (default
  64 MiB, 3 passes), including unknown emails (`verifyAgainstDummy`). A single
  client rotating emails can keep the API's CPU and memory saturated.
- Conversely, distributed guessing against one account from many IPs is not
  limited per account.
- *The per-email limit itself can be reset.* Each route's
  `@fastify/rate-limit` store is an LRU of 5000 keys (the plugin-level `cache`
  option does not reach route stores; only a route-level `cache` does). After
  5 guesses at a victim, 5000 logins with throwaway emails evict the victim's
  key and the next 5 guesses are allowed. Reproduced against the installed
  v11.2.0.

**Fix:** keep the IP+email limit and add two more: per IP regardless of email
(e.g. 20–30 / 15 min) and per email regardless of IP (e.g. 10–20 / 15 min,
answering 429 without revealing whether the account exists).
`@fastify/rate-limit` allows one config per route; the extra limits can be a
`preHandler` using `app.rateLimit({...})` instances.

**Status: fixed.** Login now checks 50 per address, then 5 per address +
email (window restarts while blocked), then 20 per email; every limiter keeps
100 000 keys. Note: `app.rateLimit()` hooks can't be stacked (the plugin runs
only the first per request), so the limits are `createRateLimit` checkers in
one hook — see [authentication.md → Rate limits](../authentication.md#rate-limits).

### M2 — Unlimited image uploads, orphans kept forever

`POST /api/events/upload` (`event.routes.ts:99`) requires a session but has no
rate limit. Files are written to `UPLOADS_DIR` immediately; a file not attached
to an event is never deleted (architecture.md says as much: "An uploaded file
not yet attached to an event has no owner"). Accounts are cheap (no email
verification, 5 per IP per 15 min). One account can fill the disk 5 MB at a
time, which also takes down Postgres if it shares the volume.

**Fix:** a per-user limit on upload (e.g. 20 / 15 min); a periodic sweep that
deletes files in `UPLOADS_DIR` not referenced by any `Event.imageKey` and older
than a few hours; optionally record the uploader so only they can attach it.

**Status:** 20 uploads per user per 15 minutes is in place. The orphan sweep
is still open.

### L1 — Password change doesn't rotate the current session

`userService.changePassword` deletes every session **except** the current one
(`user.repository.ts:58`). If the user changes their password because their
cookie was stolen, the attacker holds the *same* token as the victim — it is
"the current session" — and stays signed in. Only "Sign out everywhere"
(`logout-all`) evicts it, and the UI message ("Other devices have been signed
out") suggests the password change is enough.

**Fix:** on password change delete **all** sessions and start a new one in the
same transaction, returning the new cookie (the Server Action already relays
`Set-Cookie`).

### L2 — No `__Host-` cookie prefix

`sid` is set without `Domain` (good), but a sibling subdomain under the same
registrable domain (or a plain-HTTP response for one, absent HSTS) can set a
`sid` cookie with `Domain=.example.com`. The browser then sends both; the
attacker's can sign the victim into the attacker's account (login CSRF, e.g. to
capture what the victim creates), or shadow the real one. The Origin check
doesn't help, because no cross-origin request is needed.

**Fix:** name the cookie `__Host-sid` when `COOKIE_SECURE` (browsers then refuse
it with a `Domain` or without `Secure`/`Path=/`). `SESSION_COOKIE` exists in
both apps (`apps/api/src/lib/session-cookie.ts`, `apps/web/app/lib/session.ts`)
— worth one shared constant. Add HSTS at nginx.

### L3 — Forgot-password: per IP only

`forgotPassword` allows 3 per IP per 15 min with no per-email limit. Rotating
IPs, an attacker can flood a victim's inbox, and because every new token
retires the previous one (`issueToken`), keep invalidating the link the victim
is trying to use.

**Fix:** add a per-email limit (e.g. 3 per hour).

**Status: fixed** — 3 per email per hour, answered with 429 like every other
limit (the limit applies to any address string, so it reveals nothing about
accounts).

### L4 — Email verification is informational

`emailVerifiedAt` is only read to decide whether to show the "resend" section.
Anyone can register with an address they don't own and create events under it.
The real owner can recover the account via password reset (which signs the
squatter out), so this is not a takeover — but unverified accounts are fully
capable, which feeds M1/M2.

**Decide:** whether creating events (and uploading) should require a verified
email. If yes, add a `requireVerified` guard next to `requireAuth`.

### L5 — Registration reveals existing accounts

`POST /api/auth/register` answers 409 `Email already registered`, while login
and forgot-password go to some length not to reveal that. Mitigated by the
5 / 15 min / IP limit. This is a common, acceptable trade-off; recording it so
it is a decision, not an accident. The alternative is "check your email"
for both cases, with a notification mail to the existing owner.

### L6 — No purge of expired sessions and tokens

Expired `Session` rows are deleted only if presented again; used or expired
`AuthToken` rows are never deleted. Tables grow without bound, and
`Session.ip`/`userAgent` (personal data) are retained indefinitely. The
`@@index([expiresAt])` exists but nothing uses it.

**Fix:** a daily job: `deleteMany({ where: { expiresAt: { lt: now } } })` for
both tables (and tokens with `usedAt` older than a day).

### L7 — `RATE_LIMITS=off` has no production guard

`server.ts` disables every limit when `RATE_LIMITS=off`. The mailer fallback
fails closed outside development/test; this switch doesn't, and one stray
environment variable silently removes brute-force protection.

**Fix:** honour it only when `IS_DEV_OR_TEST` (or throw otherwise).

### L8 — Reset hashes before checking the token

`authService.resetPassword` computes `hashPassword(newPassword)` before the
token is checked, so every request with a garbage token costs an argon2
operation. Bounded by 10 / 15 min / IP; part of the same cost picture as M1.

**Fix:** reject unknown/expired tokens with a cheap lookup first, then hash,
then redeem in the transaction as today.

### Info

- **I1 — Security headers.** Neither Next nor nginx sets
  `Content-Security-Policy`, `X-Content-Type-Options: nosniff` (notably on
  `/uploads/`, whose content type comes from the client-declared MIME),
  `Referrer-Policy`, `frame-ancestors`/`X-Frame-Options` or HSTS. `HttpOnly`
  stops cookie theft, not an XSS that acts through same-origin requests; a
  CSP is the remaining layer. Reset and verification tokens sit in page URLs,
  so a strict `Referrer-Policy` on those pages is cheap insurance.
- **I2 — `canModify` exists twice.** `apps/api/.../event.service.ts` and
  `canModifyEvent` in `apps/web/app/lib/session.ts` encode the same rule. Per
  the DRY principle, move it to `@repo/contracts` and use it from both.
- **I3 — `requireRole` is unused**, and there is no way to grant a role except
  SQL. Fine for now (documented in authentication.md); remove it if no admin
  routes are planned (KISS).
- **I4 — In-memory rate limits** reset on restart and multiply with the
  number of API processes. Acceptable for one server; a shared store (Redis or
  Postgres) is needed before scaling out.
- **I5 — Session lookup on every request**, including `/uploads/*` and
  requests carrying a garbage `sid`: one indexed query each. Fine at current
  scale; skip the hook for `/uploads/` if it ever shows up.

Invariants the deployment must keep (already in `deployment.md`, restated
because the security of rate limiting depends on them): Next must not be
reachable directly (it forwards the client's `X-Forwarded-For`); nginx must
append, not pass through, `X-Forwarded-For`; `/api` responses must never be
cached; port 4000 must be firewalled (the API binds `0.0.0.0`).

## Suggested order

1. M1 (login limits) and L1 (rotate on password change) — small, contained
   changes with tests in `app.security.test.ts` / `user.routes.test.ts`.
2. M2 (upload limit + orphan sweep), L6 and L7.
3. L2 and I1 together (cookie prefix, headers in nginx/next.config).
4. Decide L4 and L5.
