# Supabase Production Preparation

This document records the Stage 18C production-preparation boundary. It contains no
credentials, access tokens, database passwords, service-role keys, or JWT signing material.

## Audit status

Audit date: 2026-09-15

### VERIFIED

The operator explicitly confirmed that this single accessible Supabase project is the intended
production project:

- Name: `leonaldndiku@gmail.com's Project`
- Project ref: `fnyqjiyhlrktxogyvaea`
- Region: `eu-central-1`
- Postgres: `17.6.1.127` / engine 17
- Organization: `ALPHA-FI`
- Plan: Free
- Project status before reactivation: `INACTIVE`
- Project status after reactivation: `ACTIVE_HEALTHY`
- Default branch status: `MIGRATIONS_FAILED`

Reactivation was performed only for this confirmed project through authenticated Supabase MCP.
It did not apply migrations, modify application data, create users, modify Storage objects,
change the plan, or incur a reported cost. Status was verified by polling project metadata until
`ACTIVE_HEALTHY` at approximately `2026-09-15T13:05:38+03:00`.

Read-only hosted evidence after reactivation:

- `public` contains zero tables and zero application objects.
- Hosted application migration history contains zero entries.
- Auth contains zero users.
- Storage contains zero buckets and zero objects.
- Hosted Edge Functions: zero.
- No hosted application functions or `SECURITY DEFINER` functions were found in the inspected
  application-facing schemas.

The database therefore appears fresh and contains no unrelated school-system data or exposed
student/staff records. The default branch control-plane status remains `MIGRATIONS_FAILED` and
must be understood before future deployment activity.

### REQUIRED

- Resolve or explain the `MIGRATIONS_FAILED` branch status before Stage 18E deployment planning.
- Complete dashboard-only Auth, Data API, SSL/network, backup, and account-security checks.

### DEFERRED

No remote schema, data, Storage object, backup, billing, Auth, network, or key configuration
change was made. Project reactivation is the only remote state change recorded in this stage.

## Auth and redirect configuration

### VERIFIED

Hosted Auth settings were not readable through the available MCP surface. The dashboard opened
an unauthenticated sign-in page, so no dashboard credentials were entered or guessed. Hosted Site
URL, redirects, signup state, anonymous Auth, email confirmation, password policy, recovery,
session settings, rate limits, and SMTP state remain unverified.

The hosted Auth database contains zero users; this is not evidence of the hosted Auth settings.

### REQUIRED

Before production use, manually verify in Authentication / URL Configuration:

- Site URL is the final approved HTTPS application origin.
- Redirect URLs are the narrowest exact paths required for sign-in, invitation activation,
  password recovery, and PKCE callback flows.
- Localhost and preview wildcards are not promoted into the production-only allowlist.
- Public signup and anonymous sign-in remain disabled.
- Email confirmation, recovery behavior, password requirements, session expiry, refresh-token
  rotation, and Auth rate limits match the application runbook.
- Transactional email uses approved custom SMTP before launch.

Record `PRODUCTION DOMAIN REQUIRED` until the owner supplies the final domain. Record
`CUSTOM SMTP SETUP REQUIRED BEFORE PRODUCTION` until an approved SMTP provider is configured.

## Database security and Data API

### VERIFIED

The repository's migration foundation enables and forces RLS on application tables, revokes
default `anon`/`authenticated` table and function privileges, and adds scoped policies and RPC
grants in later migrations. Local configuration exposes `public` and `graphql_public`, with
automatic exposure of newly created entities left disabled.

The active hosted project has no application tables to inspect. Platform-managed `auth` and
`storage` tables have RLS enabled where reported by hosted metadata; no application policies,
application grants, or application RPCs exist because the database is fresh.

Hosted Data API exposure settings were not available through MCP and remain a dashboard check.
No application objects currently exist in `public` or `graphql_public`.

### REQUIRED

- Verify every exposed application table has RLS and expected FORCE RLS after migration.
- Verify `anon` and `authenticated` grants are minimal after migration.
- Verify parent, audit, report, and student records cannot be read outside approved policies.
- Verify only required schemas are exposed through Data API and GraphQL.
- Verify views use safe invoker behavior or remain outside exposed schemas.
- Verify RPC execute privileges do not create an authorization bypass.

## SECURITY DEFINER review

Repository functions using `SECURITY DEFINER` are intentional privileged authorization,
configuration, workflow, audit, and storage helpers. Migrations consistently set a fixed
`search_path` and explicitly revoke or grant execution for sensitive functions.

Hosted inventory found no application-facing `SECURITY DEFINER` functions and no hosted
application functions to compare. This is consistent with the fresh database classification.

## Storage configuration

### VERIFIED

The hosted Storage schema is present, but `storage.buckets` and `storage.objects` are empty.
Neither expected application bucket currently exists, and no object bytes are present.

### REQUIRED

Repository expectations are:

| Bucket             | Public | Limit  | MIME policy   | Access design                                     |
| ------------------ | ------ | ------ | ------------- | ------------------------------------------------- |
| `student-photos`   | No     | 5 MiB  | JPEG/PNG/WebP | Scoped Storage policies and server-managed writes |
| `report-artifacts` | No     | 10 MiB | PDF           | Private application/database-authorized access    |

Do not make either bucket public, delete objects, or modify production artifact data. Bucket
creation and policy application belong to the controlled production migration/deployment plan.

## Backups, PITR, and restore runbook

The current project reports the Free plan. Daily backup availability, retention, and PITR state
remain unverified through the available MCP/dashboard access. Do not enable paid PITR
automatically. If PITR is required, record `PITR REQUIRES BUDGET/POLICY APPROVAL` and obtain
approval first.

Database backups contain Storage metadata but do not restore deleted Storage object bytes. Stage
18F must define separate backup and reconciliation for report artifacts and retained student
photos.

For a future non-production restore drill, verify in order:

1. schema and migration history;
2. Auth users and configuration as applicable;
3. school data and audit data;
4. RLS, grants, policies, and privileged function execution;
5. report metadata and artifact reconciliation;
6. Storage object availability separately from database recovery;
7. application authentication and authorized report downloads.

Never run this drill against production.

## Platform, SSL, and network security

### REQUIRED

Manually verify organization MFA enforcement, owner/admin MFA, owner count, access recovery,
SSL enforcement, database network restrictions, and the approved administration allowlist. Do
not remove members, change ownership, or apply network restrictions until the allowlist is known
and tested.

## Service-role boundary

`SUPABASE_SERVICE_ROLE_KEY` is server-only and is not a `NEXT_PUBLIC_*` variable. Repository
tests also assert that browser sources do not contain the service-role key. It must not be
logged, bundled, used for ordinary staff RLS flows, or rotated during this stage unless a
compromise is detected.

## Advisors

The read-only Supabase MCP advisor calls completed successfully after reactivation:

- Security Advisor: zero lints.
- Performance Advisor: zero lints.

These results do not replace the dashboard-only Auth, Data API, SSL/network, backup, or
account-security checks.

## Migration boundary

The repository contains exactly migrations 01-40. Migrations 39 and 40 are unchanged and
Migration 41 is absent. The hosted migration classification is:

`A. Fresh / no application migrations`

The hosted migration listing returned zero entries. The default branch still reports
`MIGRATIONS_FAILED`, which is recorded as an unresolved control-plane condition and was not
repaired in this stage. Do not run `supabase link`, `supabase db push`, migration repair, reset,
destructive SQL, or any remote schema deployment in Stage 18C.

## Stage 18E/18F and manual prerequisites

- Production project identity is confirmed by operator designation.
- The project is active and the hosted database is fresh; the `MIGRATIONS_FAILED` branch status
  still requires explanation.
- Auth, Data API, SSL/network, backup/PITR, and account/MFA dashboard checks remain required.
- The final HTTPS production domain is required.
- Approved custom SMTP is required.
- Backup retention and PITR policy/budget require confirmation.
- Network restrictions require a tested administrator allowlist.
- Stage 18E owns production migration and rollback safety.
- Stage 18F owns Storage backup, restore drills, and disaster-recovery evidence.

Preview/Vercel hardening belongs to Stage 18D.
