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

### `MIGRATIONS_FAILED` diagnosis

Classification: `E. Unknown` — the available read-only MCP surface exposes branch metadata but not
the deployment log or failed step.

Evidence currently available:

- The only hosted branch is the default `main` branch, linked by metadata to Git branch `main`.
- Its status is `MIGRATIONS_FAILED`; its creation and last-update timestamps are both
  `2026-06-21T21:45:36.515619+00:00`.
- No preview or additional Supabase branches exist.
- The project is independently `ACTIVE_HEALTHY`, has no application migration history, and has
  no application schema, data, users, Storage objects, or application functions.
- Repository inspection found no repository-owned Supabase deployment workflow. Whether the
  Supabase GitHub integration is enabled, which repository/working directory it uses, and the
  exact failed deployment step remain unverified.

This is not evidence that the healthy fresh database is corrupted, nor does it identify whether
the condition is historical, a current migration/configuration failure, or an integration issue.
Recommended action: `E. Cannot safely determine` remotely; do not repair, reset, rebase, merge,
disable, or otherwise modify the branch. An authenticated owner should inspect Manage Branches →
`main` → View logs and Project Settings → Integrations before Stage 18E deployment planning.

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

## Hosted Quality

The final-head Hosted Quality run completed successfully for commit
`eea6b940f720cc54fd0fc80d0959a4f39ed8ec15`:

- Validate job: `SUCCESS`.
- Database job: `SUCCESS`.
- All required downstream database and browser suites completed successfully.
- No required suite was skipped.

Run: <https://github.com/Ndiku-leonard/school-report-system/actions/runs/34956558436>.

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

## Stage ownership matrix

| Control                                            | Verified state                             | Launch requirement                            | Stage     |
| -------------------------------------------------- | ------------------------------------------ | --------------------------------------------- | --------- |
| Supabase project identity/health/freshness         | Confirmed; active and empty                | Ready for controlled planning                 | 18C       |
| Supabase branching status                          | `MIGRATIONS_FAILED`; cause unknown         | Required before migration deployment planning | 18C → 18E |
| Site URL and redirect URLs                         | Unverified; production domain absent       | Required before application deployment        | 18D       |
| Public signup and anonymous Auth                   | Unverified                                 | Must be disabled before launch                | 18I       |
| Email confirmation, password policy, OTP, recovery | Unverified                                 | Harden and verify before launch               | 18I       |
| Auth rate limits                                   | Unverified                                 | Verify before application deployment          | 18I       |
| SMTP                                               | Default/custom state unverified            | Custom SMTP required before production launch | 18I       |
| Data API exposed schemas                           | Unverified; no application objects exist   | Verify before migrations are deployed         | 18E       |
| SSL enforcement                                    | Unverified                                 | Required before production database use       | 18E       |
| Network restrictions                               | Unverified                                 | Finalize with tested admin access model       | 18E       |
| Free-plan pause risk                               | Free plan                                  | Policy/budget decision for production uptime  | 18C       |
| Backups and retention                              | Free-plan behavior unverified              | Define recovery expectations                  | 18F       |
| PITR                                               | State unverified; not enabled by this task | Requires budget/policy approval               | 18F       |
| Storage backup/recovery                            | No buckets or objects; drill not run       | Define separate object recovery               | 18F       |
| Operator MFA and organization MFA                  | Unverified                                 | Manual hardening required                     | 18I / 18K |

Stage 18D remains deferred. Stage 18E owns controlled migration deployment. Stage 18F owns
backup/restore and Storage recovery evidence. Stage 18I owns final Auth/MFA hardening, Stage 18K
owns final security acceptance, and Stage 18M owns production rollout.
