# Abuse protection

Stage 18H audits the externally reachable abuse-sensitive surfaces before production launch. This document records the controls that already exist, the limits of those controls, and the activation work deferred until a Vercel project and production architecture exist.

## Scope and threat model

The relevant threats are parent-code and PIN guessing, credential-targeted brute force, staff authentication abuse, password-recovery and OTP abuse, repeated report/artifact downloads, expensive report and promotion operations, oversized or malformed requests, upload abuse, and coarse request floods. Authorization remains deny-by-default; rate limiting is supplementary and is not an authorization mechanism.

Production load testing was not performed. The production Supabase project and Vercel project remain untouched.

## Abuse-sensitive surface inventory

| Surface                                                     | Trust class                          | Cost / sensitivity                         | Existing control                                                                                                |
| ----------------------------------------------------------- | ------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `/parent` and `/parent/api/session`                         | Public before login                  | Moderate / security-sensitive              | Schema and body bounds; persistent client throttle and credential lockout                                       |
| `/parent/api/logout`                                        | Parent session                       | Cheap / security-sensitive                 | POST-only, same-origin check when an Origin is supplied, session revocation, cookie clearing                    |
| Parent report pages and report APIs                         | Parent session                       | Moderate / security-sensitive              | Session expiry/idle checks, student-scoped report authorization, published-report checks                        |
| Parent artifact download                                    | Parent session                       | Moderate to expensive / security-sensitive | Private storage, student/report scope, checksum and PDF checks, access audit, `no-store`                        |
| Staff sign-in, refresh, verification and recovery           | Public Auth endpoints                | Moderate / security-sensitive              | Supabase Auth controls; application responses are generic where applicable                                      |
| Auth callbacks and confirmation routes                      | Public callback surface              | Cheap to moderate / security-sensitive     | Signed state/OTP validation and allowlisted callback behavior                                                   |
| Report PDF generation and artifact materialization          | Authenticated staff                  | Expensive / security-sensitive             | Permission checks, bounded inputs, deterministic artifacts, database concurrency/idempotency handling           |
| Results calculation, publication, promotion and progression | Authenticated staff                  | Expensive / security-sensitive             | Permission checks and transactional/concurrency protections                                                     |
| Analytics export                                            | Authenticated staff                  | Moderate / security-sensitive              | Permission checks, UUID/type validation, bounded export inputs, private response                                |
| Student photo upload                                        | Authenticated staff                  | Moderate / security-sensitive              | Permission and scoped-path checks, 5 MB limit, MIME/signature checks, private bucket, random path, no overwrite |
| Report artifact upload                                      | Authenticated staff/service workflow | Moderate / security-sensitive              | 10 MB limit, PDF content type and signature checks, private bucket, deterministic path, no overwrite            |
| `GET /api/health`                                           | Public                               | Cheap / liveness-only                      | No database query, secret, personal data or expensive computation                                               |

No additional route handlers were found that expose a new public mutation surface. Sensitive methods are restricted; unexpected methods do not invoke expensive work.

## Existing parent controls

The accepted migrations 35 and 36 provide persistent database-backed throttling:

- Client rate: 60 requests.
- Window: 15 minutes per HMAC-derived client-key hash.
- Credential failure limit: 5 failed attempts.
- Credential lock duration: 15 minutes.
- Parent session duration: 2 hours, with a 30-minute idle timeout.

The limiter row is locked with `SELECT ... FOR UPDATE` inside the verification transaction. The request counter and failed-attempt state therefore persist across serverless instances and are protected against concurrent updates. Raw client identifiers and parent access codes are not stored in the limiter table.

For unknown access codes, the server performs fake bcrypt work before returning the same generic failure result. Known-code failures do not disclose whether the code, PIN, expiry, lock state, or guardian eligibility was the failing condition. Success resets `failed_attempts` and `locked_until`.

The parent session route rejects a request body whose declared `Content-Length` exceeds 2,048 bytes, validates the JSON shape, and returns generic errors. Rate-limited responses are `429 Too Many Requests`, include `Retry-After` when calculable, and are `private, no-store`. Authentication failures are generic `401` responses and do not expose counters or keys.

## Parent artifact and download abuse

Parent report access is session-validated and scoped to the authenticated student. Artifact downloads use private storage, verify the expected byte size, SHA-256 checksum, and PDF signature, record the access event, and return `private, no-store` responses. There is intentionally no per-download application throttle at this stage: a parent may legitimately retry or download a report, and the stronger authorization and storage checks prevent cross-student or cross-report access. Repeated large downloads should be monitored through storage egress and application audit telemetry; a targeted quota can be considered after real traffic exists.

## Client-key trust model

The current application derives the parent client key from the first value of `x-forwarded-for`, then falls back to `user-agent`, then `unknown-client`, and stores only an HMAC pseudonym. This is suitable for a direct Vercel deployment because Vercel documents that it overwrites `x-forwarded-for` with the client IP and does not forward an external proxy's value. The first-value parsing must be reconsidered if an external proxy or additional trusted proxy is introduced. Vercel Enterprise Trusted Proxy behavior is a separate deployment decision.

The user-agent fallback is deliberately not treated as identity and can put clients without a usable forwarded IP into a shared bucket. That can reduce availability for unusual proxy paths but does not provide a bypass. It should be monitored during deployment validation rather than replaced with raw-IP persistence or excessive fingerprinting.

This is not distributed-bot protection. Attackers using many client keys can still distribute requests; the credential lockout limits attacks against an individual credential, while edge controls and operational monitoring are needed for coarse floods.

## Supabase Auth rate limits

Supabase exposes Auth rate-limit settings under Authentication > Rate Limits. Current documented defaults include email endpoints at 2 emails/hour, OTP at 360/hour, a 60-second minimum between repeated OTP/magic-link requests, a 60-second minimum between signup confirmations and password resets, verification at 360/hour/IP with bursts up to 30, token refresh at 1,800/hour with bursts up to 30, MFA challenge/verify at 15/minute with bursts up to 30, and anonymous sign-ins at 30/hour/IP with bursts up to 30. Some settings are configurable and some are platform-managed; the production dashboard values have not been changed or treated as configured during Stage 18H.

The repository's local Auth configuration is test infrastructure only. It includes local limits for email, SMS, anonymous users, sign-in/sign-up, token refresh and verification. Stage 18I owns the final production Auth review and configuration, including IP-forwarding decisions. Auth 429 behavior and dashboard settings must be checked again after the final Vercel/server architecture is known.

Sources: [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod) and [Supabase Auth CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha).

## CAPTCHA decision

- Staff sign-in: **RECOMMENDED BEFORE LAUNCH**. Supabase Auth rate limits and the staff authorization model provide a baseline, but CAPTCHA should be evaluated before public launch if sign-in abuse telemetry or the final exposure model warrants it.
- Password recovery: **RECOMMENDED BEFORE LAUNCH**. Recovery is an email-abuse surface and should use the documented generic response and Auth limits; CAPTCHA is a reasonable additional control before launch if recovery is publicly exposed.
- Parent portal: **NOT REQUIRED for the initial Stage 18H baseline**. The custom parent endpoint is not protected by enabling Supabase Auth CAPTCHA, and its persistent client throttle, per-credential lockout, fake bcrypt path and generic responses are already in place. Reassess using telemetry rather than adding a CAPTCHA dependency now.

Supabase currently documents hCaptcha and Cloudflare Turnstile for supported Auth sign-in, sign-up and password-reset flows. No CAPTCHA package, provider, secret or production setting was added.

## Vercel firewall strategy

Vercel documents platform-wide DDoS mitigation, WAF/custom rules, IP blocking and Attack Mode across plans. Current Vercel WAF rate limiting is also documented as available on all plans using fixed-window rules; Hobby has a limited rule allowance and usage limits/pricing. BotID basic mode is available across plans, while deeper analysis is plan-dependent. No project exists, so no rule can be configured or published during Stage 18H.

The edge layer is appropriate for coarse path bursts, known abusive IPs, bot traffic and DDoS-adjacent filtering. It is not a substitute for the database limiter's per-credential lockout or authorization-aware quotas. Stage 18N must activate and verify only the controls approved for the final Hobby deployment, with no paid feature enabled without explicit approval.

Sources: [Vercel Firewall](https://vercel.com/docs/vercel-firewall), [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting), [Vercel Hobby plan](https://vercel.com/docs/plans/hobby), [Vercel request headers](https://vercel.com/docs/headers/request-headers), and [Vercel BotID](https://vercel.com/docs/botid).

## Expensive operations and uploads

Report generation, report regeneration, result calculation, publication, bulk export and promotion/progression are all staff-only and require the relevant permission. Existing workflows use transactions, deterministic artifact paths, versioning, cleanup/recovery and concurrency/idempotency protections where applicable. Rate limiting is not being used to compensate for missing authorization or transaction safety.

Student-photo uploads require authorized staff, scoped storage operations, JPEG/PNG/WebP validation, a 5 MB bound, content/signature checks, random object paths and no overwrite. Report artifacts are private, have a 10 MB bound, use PDF validation and checksum verification, and do not expose public object URLs. Final bucket and malware/untrusted-content hardening remains Stage 18J.

The report-artifact mutation route now rejects a declared body larger than 2,048 bytes before JSON parsing. Existing schemas also bound text fields, mark batches and bulk arrays. This is an application bound in addition to upstream platform limits.

## Health, methods, caching and retries

`GET /api/health` is intentionally a cheap liveness endpoint: it does not query the database, expose secrets or personal data, or perform expensive work. Heavy rate limiting is not warranted. Its cache policy is explicit and it should be monitored for unusual request volume at the edge.

The parent login route is POST-only. Logout is POST-only and rejects GET. Sensitive responses use `private, no-store`, and 429 responses are not publicly cacheable. `Retry-After` is returned when the database can calculate a window or lock expiry. The parent UI has no automatic retry loop and disables the submit action while a request is pending, so a normal failure does not create a retry storm.

## Security events and failure modes

Parent security events cover unknown-code failures, ordinary failures, rate-limited attempts and successful logins, with HMAC client-key hashes and no raw secrets. Parent artifact access and broader audit logs provide investigation trails. Supabase Auth audit logs remain the source for Auth events. Stage 18G structured logging avoids raw tokens and raw artifact payloads.

The parent limiter fails closed for login when its database-backed verification cannot complete: the server returns a generic failure instead of bypassing the limiter. Missing or invalid HMAC configuration fails environment validation. A missing usable client key falls back to a shared pseudonymous bucket rather than persisting a raw address. Benign telemetry failures should not take down unrelated application paths.

`PARENT_ACCESS_RATE_LIMIT_SECRET` is server-only, must be at least 32 random bytes, is rejected when it is a placeholder or reused from the Supabase anon/service-role keys, and is now also rejected when reused as `AUTH_FLOW_SIGNING_SECRET`. It must not be logged or committed. A credential/token previously pasted into the development conversation must be rotated before launch if it was real.

## Validation and freeze status

Stage 18H does not create or modify migrations. Migration 39 and Migration 40 remain unchanged; Migration 41 is absent. `package.json` and `package-lock.json` remain unchanged, and no Redis, CAPTCHA, bot, firewall or external rate-limit dependency was added.

Production load testing was **not performed**. Controlled local parent behavior/concurrency suites should be run when local Supabase/Docker is available; Hosted Quality remains the authoritative isolated database/concurrency evidence for this branch. No production requests were generated for abuse testing.

## Stage 18N activation checklist

After the application and Vercel project exist:

1. Verify the actual Vercel request headers and any external proxy chain before relying on client-key derivation.
2. Configure only approved Hobby-compatible edge rules, IP blocks and monitoring; confirm no paid feature or unexpected usage charge is enabled.
3. Establish request-volume, 401/429, Auth recovery, artifact-egress and report-generation baselines.
4. Decide whether staff sign-in or password recovery needs Supabase hCaptcha/Turnstile and complete the approved frontend/configuration work.
5. Recheck `Retry-After`, cache behavior, alerting and incident runbooks with the deployed domains.
6. Keep application/database controls for credential security even if edge controls are enabled.

## References

- [Supabase production checklist and Auth rate limits](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha)
- [Vercel Firewall](https://vercel.com/docs/vercel-firewall)
- [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Vercel request headers](https://vercel.com/docs/headers/request-headers)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [Vercel BotID](https://vercel.com/docs/botid)
