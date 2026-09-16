# Supabase Production Preparation

This document records the Stage 18C production-preparation boundary. It contains no database
passwords, access tokens, service-role keys, JWT signing material, or other credentials.

## Production target

Audit date: 2026-09-15

| Field              | Verified value                          |
| ------------------ | --------------------------------------- |
| Project name       | `school-report-system`                  |
| Project ref        | `fpixtedanpbmjnmzrumo`                  |
| Organization       | `leo's projects`                        |
| Region             | `eu-central-1` / Central EU (Frankfurt) |
| Status             | `ACTIVE_HEALTHY`                        |
| Compute            | Nano                                    |
| Plan               | Free                                    |
| GitHub integration | Not connected                           |
| Supabase branches  | None                                    |

The operator designated this dedicated project for the School Report System. The previous
`MIGRATIONS_FAILED` finding belonged to a different Supabase project and is superseded; it is not
evidence for this application and must not be used as its production backend.

## Hosted database classification

Classification: `A. Fresh / no application migrations`.

Read-only hosted verification for `fpixtedanpbmjnmzrumo` found:

- Application migrations: `0`.
- Application tables: `0` in `public`.
- Application users: `0` in `auth.users`.
- Storage buckets: `0`.
- Storage objects: `0`.
- Application Edge Functions: `0`.
- Application functions: `0`.
- Security Advisor: `0` lints.
- Performance Advisor: `0` lints.

Platform-managed Auth and Storage tables are present as expected. Their system migration rows do
not represent application migrations. No application schema, data, users, or Storage objects were
created or modified.

## Local and hosted architecture

Development and testing use the local Supabase stack through Docker. Migrations 01–40 are tested
locally and in GitHub CI. The hosted project is a separate, intentionally empty production target;
local Docker state is not automatically synchronized with Supabase Cloud.

```text
Development / testing
        |
        v
Local Supabase in Docker
        |
        | migrations 01–40 tested locally and in GitHub CI
        v
GitHub repository / Quality workflow
        |
        | future controlled migration deployment
        v
Hosted Supabase production
fpixtedanpbmjnmzrumo
```

## Migration and deployment boundary

The repository contains exactly migrations 01–40. Migration 39 and Migration 40 are unchanged;
Migration 41 is absent. No production migration has been applied. Stage 18E owns migration
deployment, rollback planning, and post-deployment schema/RLS/grant verification.

Do not run `supabase db push`, migration repair, raw schema SQL, or a remote reset during Stage
18C. Do not connect Supabase GitHub integration before the Stage 18E deployment workflow is
approved.

## Credential boundary

The production database credential must be long, random, unique, and stored outside the
repository. It was not requested, printed, or stored. Repository inspection found no tracked
production database credential.

## Deferred hosted configuration

These settings are intentionally not finalized in Stage 18C because they depend on later
deployment, recovery, or security decisions:

- Stage 18D: Vercel project, production domain, preview/production isolation, and public URL.
- Stage 18E: controlled migrations 01–40 deployment, Data API schema exposure, database
  connection strategy, SSL, network restrictions, and post-migration RLS/grant/function review.
- Stage 18F: backups, restore drill, Storage recovery, RPO/RTO, and PITR policy/budget.
- Stage 18I: Auth providers, Site URL, redirect URLs, signup and anonymous access, password and
  recovery policy, OTP/rate limits, SMTP, and application/admin MFA.
- Stage 18K: final production security review.

Current Auth configuration, production domain, custom SMTP, PITR, network restrictions, and MFA
remain unconfigured or unverified. No Auth users were created.

## Storage boundary

Current hosted Storage state is intentionally empty:

```text
Buckets: none
Objects: none
```

Future private buckets are expected to be `student-photos` and `report-artifacts`. Bucket
creation, policies, and separate object recovery belong to the controlled migration and recovery
stages. No bucket or object was created, uploaded, deleted, or modified.

## Advisors and security boundary

Security and Performance Advisor calls completed successfully against the dedicated project with
zero lints each. These results cover the current empty application schema; meaningful RLS, grants,
function, Data API, and Storage-policy verification occurs after Stage 18E deployment.

No service-role credential was exposed. No Vercel configuration or application deployment was
performed.

## Stage ownership matrix

| Control                                       | Current state                    | Owner stage |
| --------------------------------------------- | -------------------------------- | ----------- |
| Project identity, health, region, freshness   | Confirmed                        | 18C         |
| Local Docker vs hosted separation             | Documented                       | 18C         |
| Migration deployment boundary                 | Documented; no remote deployment | 18C / 18E   |
| Vercel and production domain                  | Not started                      | 18D         |
| Production migrations and schema verification | Not started                      | 18E         |
| Data API, SSL, network, RLS, grants           | Awaiting schema/deployment plan  | 18E         |
| Backups, PITR, restore, Storage recovery      | Not started                      | 18F         |
| Auth and MFA hardening                        | Not finalized                    | 18I         |
| Final security acceptance                     | Not started                      | 18K         |

Production plan suitability remains a later policy/budget decision because Free infrastructure may
pause for inactivity and does not provide the same recovery/availability posture as a paid plan.

## Validation record

Local validation is required after each documentation change. The final-head Hosted Quality run
must pass both `validate` and `database` jobs with no required suite skipped. The run associated
with the prior Stage 18C head passed; the documentation correction requires final-head CI evidence
for the new commit after it is pushed.
