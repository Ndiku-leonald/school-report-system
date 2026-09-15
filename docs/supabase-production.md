# Supabase Production Preparation

This document records the Stage 18C production-preparation boundary. It contains no
credentials, access tokens, database passwords, service-role keys, or JWT signing material.

## Audit status

Audit date: 2026-09-15

The Supabase MCP exposed one project:

- Name: `leonaldndiku@gmail.com's Project`
- Project ref: `fnyqjiyhlrktxogyvaea`
- Region: `eu-central-1`
- Postgres: `17.6.1.127` / engine 17
- Organization: `ALPHA-FI`
- Plan: Free
- Project status: `INACTIVE`
- Default branch status: `MIGRATIONS_FAILED`

This metadata does not safely prove that the project is the intended production project for
this repository. The project name is generic, the project is inactive, and remote database
queries and migration listing timed out. Treat the hosted database as unverified until the
owner confirms the project identity and restores usable project access.

No remote setting, schema, data, Storage object, backup, or billing change was made.

## Auth and redirect configuration

Before production use, manually verify in Authentication → URL Configuration:

- Site URL is the final approved HTTPS application origin.
- Redirect URLs are the narrowest exact paths required for sign-in, invitation activation,
  password recovery, and PKCE callback flows.
- Localhost and preview wildcards are not promoted into the production-only allowlist.
- Public signup and anonymous sign-in remain disabled.
- Email confirmation, recovery behavior, password requirements, session expiry, refresh-token
  rotation, and Auth rate limits match the application runbook.
- Transactional email uses approved custom SMTP before launch.

The production domain is not known in this repository. Record `PRODUCTION DOMAIN REQUIRED`
until the owner supplies it. Record `CUSTOM SMTP SETUP REQUIRED BEFORE PRODUCTION` until an
approved SMTP provider is configured.

## Database security and Data API

The repository's migration foundation enables and forces RLS on application tables, revokes
default `anon`/`authenticated` table and function privileges, and adds scoped policies and
RPC grants in later migrations. The local configuration exposes `public` and
`graphql_public`, with automatic exposure of newly created entities left disabled.

Remote verification remains pending because the target project is inactive and SQL metadata
queries timed out. Before launch, verify remotely:

- every exposed application table has RLS and expected FORCE RLS;
- `anon` and `authenticated` grants are minimal;
- parent, audit, report, and student records cannot be read outside approved policies;
- only required schemas are exposed through Data API and GraphQL;
- views use safe invoker behavior or are kept out of exposed schemas;
- RPC execute privileges do not create an authorization bypass.

## SECURITY DEFINER review

Repository functions using `SECURITY DEFINER` are intentional privileged authorization,
configuration, workflow, audit, and storage helpers. The migrations consistently set a fixed
`search_path` and explicitly revoke or grant execution for sensitive functions. The hosted
function inventory and effective privileges still require verification after the project is
made active.

## Storage configuration

Repository expectations are:

| Bucket             | Public | Limit  | MIME policy   | Access design                                     |
| ------------------ | ------ | ------ | ------------- | ------------------------------------------------- |
| `student-photos`   | No     | 5 MiB  | JPEG/PNG/WebP | Scoped Storage policies and server-managed writes |
| `report-artifacts` | No     | 10 MiB | PDF           | Private application/database-authorized access    |

Do not make either bucket public, delete objects, or modify production artifact data. Confirm
the hosted bucket list, limits, MIME restrictions, and object policies manually after access is
restored.

## Backups, PITR, and restore runbook

The current project reports the Free plan. Daily backup availability, retention, and PITR state
could not be verified while the project was inactive. Do not enable paid PITR automatically.
If PITR is required, record `PITR REQUIRES BUDGET/POLICY APPROVAL` and obtain approval first.

Database backups contain Storage metadata but do not restore deleted Storage object bytes.
Stage 18F must define separate backup and reconciliation for report artifacts and retained
student photos.

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

Manually verify organization MFA enforcement, owner/admin MFA, owner count, access recovery,
SSL enforcement, database network restrictions, and the approved administration allowlist.
Do not remove members, change ownership, or apply network restrictions until the allowlist is
known and tested.

## Service-role boundary

`SUPABASE_SERVICE_ROLE_KEY` is server-only and is not a `NEXT_PUBLIC_*` variable. Repository
tests also assert that browser sources do not contain the service-role key. It must not be
logged, bundled, used for ordinary staff RLS flows, or rotated during this stage unless a
compromise is detected.

## Advisors

The read-only Supabase MCP advisor calls returned zero Security Advisor lints and zero
Performance Advisor lints. Because the project is inactive and database introspection timed
out, treat this as an advisor result only—not as proof that hosted RLS, grants, Storage, or
configuration are production-ready. Re-run both advisors from the dashboard after the intended
project is active.

## Migration boundary

The repository contains exactly migrations 01–40. Migrations 39 and 40 are unchanged and
Migration 41 is absent. The remote migration classification is:

`E. Unknown`

Remote history listing timed out and the default branch reports `MIGRATIONS_FAILED`. Do not run
`supabase link`, `supabase db push`, migration repair, reset, destructive SQL, or any remote
schema deployment in Stage 18C.

## Stage 18E/18F and manual prerequisites

- Production project identity must be explicitly confirmed.
- The project must be active and its migration state must be reconciled read-only.
- The final HTTPS production domain is required.
- Approved custom SMTP is required.
- Organization/admin MFA and owner/escalation policy require confirmation.
- Backup retention and PITR policy/budget require confirmation.
- Network restrictions require a tested administrator allowlist.
- Stage 18E owns production migration and rollback safety.
- Stage 18F owns Storage backup, restore drills, and disaster-recovery evidence.

Preview/Vercel hardening belongs to Stage 18D.
