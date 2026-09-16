# Vercel Production Hardening

This document records the Stage 18D Vercel project and deployment boundary. It
contains no credentials, tokens, database passwords, or secret values.

## Audit status

- Audit date: 2026-09-16 (Africa/Kampala)
- Vercel team: leo's projects
- Team slug: leos-projects-031b1ac1
- Team ID: team_R71kVUr1Hm2iOTG89vTR9j9A
- Plan: Hobby
- Current Vercel project count: 0
- Desired project name: school-report-system
- Project ID: not created
- Deployment performed during Stage 18D: no

The Vercel CLI is installed, but the local CLI session has no valid
authentication. The authenticated Vercel inventory confirms the target team and
that no projects exist. Project creation was safely deferred: the available
project-creation path could not be completed without authentication, and the
deployment-capable fallback was not used. No .vercel linkage directory was
created.

## Repository and build configuration

The repository is a Next.js application (next 16.3.3) at the repository root.
The intended Vercel configuration is:

| Setting                   | Value                                    |
| ------------------------- | ---------------------------------------- |
| Framework                 | Next.js (framework default)              |
| Root directory            | Repository root                          |
| Install command           | Repository default (npm ci in CI)        |
| Build command             | npm run build                            |
| Output                    | Next.js managed output                   |
| Node requirement          | >=20.9.0 from package.json               |
| Vercel configuration file | None required; no vercel.json is present |
| Local linkage             | None; .vercel/ is ignored                |

The application does not need a Vercel SDK or CLI dependency. The existing
next.config.ts includes the report-card font assets in output tracing and
keeps the report PDF route on the Node.js runtime.

## Git integration and branch policy

GitHub integration is not connected to a Vercel project. The future policy is:

- main -> Production
- feature and pull-request branches -> Preview

Automatic Production deployment must remain disabled or otherwise gated until
the later controlled deployment stage (18M). PR #16 remains open and must not
be merged as part of Stage 18D.

## Environment matrix

The Preview policy is intentionally fail-closed because there is no isolated
hosted Preview Supabase project. Blank or unconfigured values below mean that
the environment must not be used for application traffic until its isolated
backend is deliberately provisioned.

| Variable                        | Visibility / use                                                | Development                                       | Preview                                                        | Production                                                                            |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| NEXT_PUBLIC_APP_URL             | Public; build/runtime canonical origin                          | Local HTTP origin, normally http://localhost:3000 | Not configured until an isolated Preview origin/backend exists | Final approved HTTPS domain; do not invent it during Stage 18D                        |
| NEXT_PUBLIC_SUPABASE_URL        | Public URL; build/runtime                                       | Local Docker Supabase URL                         | Not configured; never the Production URL                       | Hosted project fpixtedanpbmjnmzrumo URL, populated only during controlled preparation |
| NEXT_PUBLIC_SUPABASE_ANON_KEY   | Public/publishable key; build/runtime                           | Local Docker Supabase publishable/anon key        | Not configured; no Production key sharing                      | Hosted target's publishable/anon key, protected by controlled configuration           |
| SUPABASE_SERVICE_ROLE_KEY       | Secret; server runtime only                                     | Local-only test/development value when required   | Not configured                                                 | Hosted target service-role key, Production-only and server-only                       |
| AUTH_FLOW_SIGNING_SECRET        | Secret; server runtime only                                     | Local synthetic secret meeting validation         | Not configured                                                 | Dedicated Production secret, never shared with Preview                                |
| PARENT_ACCESS_RATE_LIMIT_SECRET | Secret; server runtime only                                     | Local synthetic secret meeting validation         | Not configured                                                 | Dedicated Production secret, never shared with Preview                                |
| DATABASE_URL                    | Secret; migration/operations only unless later proven necessary | Local Docker database URL                         | Not configured                                                 | Not a default web-runtime variable; use only for controlled database operations       |
| DIRECT_URL                      | Secret; migration/operations only unless later proven necessary | Local Docker direct database URL                  | Not configured                                                 | Not a default web-runtime variable; use only for controlled database operations       |

Production values must be entered through Vercel's protected environment
variable controls when controlled deployment preparation begins. They must not
be pasted into Git, chat, logs, or build output. The application already rejects
privileged variables with NEXT_PUBLIC_ names during a production build and
validates the separation of public and server secrets.

## Preview isolation and development separation

Preview must not receive any Production service-role key, database URL,
authentication-flow secret, parent rate-limit secret, Storage access, Auth
configuration, or student/report data. Because no separate hosted Preview
backend exists, the approved Stage 18D state is:

Production secrets in Preview: NOT CONFIGURED
Preview application traffic: fail closed until an isolated backend exists

Development remains local Next.js plus Docker Supabase. vercel dev, if used
later, must use local or synthetic values and must not become a shortcut to the
Production Supabase project.

## Supabase Production target

The correct hosted target is:

| Property                           | Value                                                      |
| ---------------------------------- | ---------------------------------------------------------- |
| Project name                       | school-report-system                                       |
| Project ref                        | fpixtedanpbmjnmzrumo                                       |
| Organization                       | leo's projects                                             |
| Region                             | eu-central-1                                               |
| State                              | ACTIVE_HEALTHY                                             |
| Hosted application schema at audit | Intentionally fresh; no application migrations/tables/data |

The local supabase/config.toml project ID is for the Docker development project
and does not establish a hosted Vercel or Supabase link.

## Application origin and custom domain

No final custom production domain has been selected. The required decision is:

FINAL PRODUCTION DOMAIN REQUIRED BEFORE AUTH CONFIGURATION

Do not set NEXT_PUBLIC_APP_URL to an invented custom hostname. Before Auth
configuration, the final HTTPS canonical hostname, DNS ownership, alternate
hostname redirects (if any), Supabase Auth Site URL, Auth redirect allowlist,
and application URL must agree. This belongs to the later deployment-readiness
work (Stage 18I and the controlled launch sequence).

VERCEL_URL, VERCEL_BRANCH_URL, and VERCEL_PROJECT_PRODUCTION_URL are
deployment/system metadata. They are not a substitute for the explicit
canonical NEXT_PUBLIC_APP_URL, and unstable Preview URLs must not be used as
the application's canonical origin.

## Deployment protection on Hobby

The Vercel documentation states that Hobby supports Vercel Authentication with
Standard Protection. This protects Preview and deployment URLs, while a
production domain remains publicly accessible. Password Protection is not an
included Hobby capability. See the Vercel Deployment Protection documentation
and Hobby plan documentation.

The project does not yet exist, so no protection setting is active or verified
for this application. Before any deployment, manually review the project and
team settings, decide whether Standard Protection is appropriate for Preview,
and do not represent it as production access control. Do not upgrade the plan
as part of Stage 18D.

## Security headers

The audit found route-level protections on sensitive file/data responses:

- Cache-Control: private, no-store
- X-Content-Type-Options: nosniff
- Referrer-Policy: no-referrer on the parent artifact response

No global Content-Security-Policy, Strict-Transport-Security,
Permissions-Policy, frame-ancestors, or X-Frame-Options policy is currently
defined in next.config.ts or middleware. The final header policy is owned by
the Stage 18K security review; no broad header redesign is introduced here so
PDFs, fonts, Auth, and Supabase connections remain unaffected.

## Cache and private-data review

The reviewed report PDF, stored-artifact, parent-session, parent-logout, and
analytics-export routes are Node.js/dynamic where applicable and return private
no-store responses. The report PDF and artifact responses also set
Content-Disposition and nosniff. No explicit public revalidate or static cache
configuration was found for these sensitive routes. Existing revalidatePath
calls invalidate application paths after mutations; they do not authorize
public caching of authenticated data.

The complete CDN/header behavior remains part of the final Stage 18K and
deployment validation pass.

## Logging and privacy review

The reviewed server logs contain error type/code and operational context only.
They do not intentionally print service-role keys, database URLs, signing
secrets, rate-limit secrets, cookies, authorization headers, parent access
codes, or full student/report payloads. Full structured monitoring and retention
policy remain Stage 18G work. Any future logging change must preserve this
redaction boundary.

## Runtime, PDF, and artifact review

- Report PDF generation uses pdfkit and the Node.js runtime.
- The PDF route is explicitly dynamic = force-dynamic and runtime = nodejs.
- next.config.ts traces the bundled Noto Sans regular and bold font assets.
- CI verifies the traced font assets.
- No Vercel Edge runtime is selected for the reviewed report routes.
- No durable report PDF storage may rely on the Vercel filesystem.
- Vercel filesystem writes are ephemeral and may be used only for transient
  processing if later proven necessary.
- Persistent report artifacts belong in Supabase Storage after the controlled
  Supabase configuration stage.
- CI's Poppler installation is for visual regression testing only; the
  application PDF renderer must not assume that Poppler or other system
  binaries exist in the Vercel runtime.

No unsupported runtime or system-binary blocker was found in the reviewed
application path. Duration and payload behavior should be rechecked during a
controlled deployment validation.

## Rollback

Application rollback means promoting or redeploying a known-good Vercel
deployment. Keep the previous known-good deployment identifiable before each
launch and validate the canonical origin after rollback.

Vercel rollback does not roll back Supabase schema or data. Database changes
require their own migration, backup, and rollback/recovery procedure and must
be coordinated with Stage 18E/18F.

## Safe manual steps for a later operator

1. Authenticate the Vercel CLI or dashboard to the leo's projects team without
   exposing the token.
2. Create the school-report-system project shell or link an already-created
   project with the repository root and Next.js defaults, confirming that the
   action does not deploy.
3. If local linkage is created, inspect .vercel/project.json locally and keep
   .vercel/ ignored and uncommitted.
4. Keep Preview secretless until an isolated Preview Supabase/Auth/Storage
   environment exists.
5. Populate only protected Production variables during controlled deployment
   preparation, after the final domain is selected.
6. Configure Git integration and the main -> Production policy only when the
   later launch gate explicitly permits it.

## Stage 18D boundary

Production deployment performed: NO
Preview deployment performed: NO
Production secrets placed in Preview: NO
Custom domain attached: NO
Supabase Auth redirects configured: NO
Supabase migrations applied: NO
Real users created: NO
Stage 18E started: NO
Stage 18M started: NO
