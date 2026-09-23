# Stage 18E — Production migration and rollback safety

Audit date: 2026-09-23 (Africa/Kampala)

This is a preflight and operator runbook. It does not apply migrations, seed
production, create users or Storage objects, change the hosted schema, deploy
Vercel, or start Stage 18F/18M.

## Current decision

`STAGE 18E NOT YET ACCEPTED`

The repository audit is complete, but the final remote migration list, remote
freshness read, and `supabase db push --dry-run` could not be executed because
the local Supabase CLI has no access token. Local Docker is installed but its
daemon is not running, so a local replay is not claimed. These are the only
outstanding Stage 18E evidence gaps identified in this pass.

## 1. Target and starting evidence

| Field                           | Value                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Repository                      | `Ndiku-leonald/school-report-system`                                                                                                  |
| Branch                          | `feature/stage-18-production-hardening`                                                                                               |
| Starting SHA                    | `c2356811a73b1eba6bfbccc84f8d1da44d225802`                                                                                            |
| `origin/main`                   | `6c70dfac69fbb09cb827a013d708a552c5f29f2c`                                                                                            |
| Worktree                        | Clean at audit start                                                                                                                  |
| Pull request                    | #16, `Stage 18: Production hardening`, open/unmerged per continuation brief; GitHub API recheck was unavailable from this environment |
| Project name                    | `school-report-system`                                                                                                                |
| Project ref                     | `fpixtedanpbmjnmzrumo`                                                                                                                |
| Organization                    | `leo's projects`                                                                                                                      |
| Region                          | `eu-central-1`                                                                                                                        |
| Last recorded health            | `ACTIVE_HEALTHY`                                                                                                                      |
| Last recorded application state | 0 migrations, 0 public application tables, 0 Auth users, 0 buckets, 0 objects                                                         |
| Vercel                          | No production or preview deployment; no project created                                                                               |

The last recorded hosted Supabase evidence is in
[`supabase-production.md`](supabase-production.md). It is not a substitute for
the final pre-deployment read immediately before Stage 18M.

## 2. Migration order and pending set

Supabase applies migration files in timestamp order and compares them with
`supabase_migrations.schema_migrations`. The repository has exactly 40 unique,
deterministically ordered files:

```text
01, 02, 03, 04, 05, 06, 07, 08, 09, 10,
11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
31, 32, 33, 34, 35, 36, 37, 38, 39, 40
```

Expected remote result, pending remote verification:

```text
Local migrations: 01–40
Remote migrations: none
Pending migrations: 01–40
```

The exact remote result must be captured with `supabase migration list` before
any future deploy. No migration repair is permitted.

## 3. Ordered migration inventory

The table records the purpose, schemas, principal tables, function/API scope,
security changes, and operational concerns found by inspecting every SQL file.
Function counts include `CREATE OR REPLACE FUNCTION` replacements. The SQL
files remain the authoritative complete definition of every function, index,
trigger, policy, grant, and constraint.

|   # | File / purpose                                                                                                | Schemas and principal tables                                                                                    | Functions / security / operational review                                                                                                                      |
| --: | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  01 | `20260729140000_01_extensions_and_shared_functions.sql` — extensions and shared helpers                       | `extensions`, `internal`, `public`; enum types                                                                  | Creates `pgcrypto` and `btree_gist`; shared timestamp/mutation guards; locks down `internal`. Extension prerequisite; safe on fresh project.                   |
|  02 | `20260729140100_02_identity_and_school_structure.sql` — identity and school structure                         | `public`, `auth`; schools, settings, profiles, memberships, roles                                               | Auth-user foreign key, indexes, updated-at triggers. Depends on standard `auth.users`.                                                                         |
|  03 | `20260729140200_03_academic_configuration.sql` — academic directory                                           | `public`; years, terms, grades, classes, subjects, mappings, students, guardians, enrolments, assignments       | Scope-validation helpers, 22 indexes, 19 triggers. Depends on 02.                                                                                              |
|  04 | `20260729140300_04_assessments_marks_and_results.sql` — assessment and marks base                             | `public`, `internal`; schemes, components, sheets, marks, grading/ranking/promotion rules, attendance, comments | Scope, score, lifecycle/version helpers; 20 indexes, 21 triggers.                                                                                              |
|  05 | `20260729140400_05_reports_parent_access_and_audit.sql` — reports and audit base                              | `public`, `storage`, `internal`; report metadata, snapshots, credentials/sessions, audit log                    | Scope and immutability helpers; 16 indexes, 15 triggers. Credentials are hashes only.                                                                          |
|  06 | `20260729140500_06_rls_foundation_and_privileges.sql` — deny-by-default baseline                              | `public`, `internal`                                                                                            | Enables/forces RLS on initial public tables; revokes browser privileges; changes `postgres` default privileges. Security hardening; privilege-sensitive.       |
|  07 | `20260729140600_07_actor_scope_integrity.sql` — same-school actor integrity                                   | `internal`, `public`, `auth`                                                                                    | Membership/actor helpers and five scope triggers; revokes internal access.                                                                                     |
|  08 | `20260729140700_08_staff_authentication_foundation.sql` — staff identity reads                                | `public`, `auth`, `internal`                                                                                    | Authenticated self-read policies and limited service-role provisioning grants.                                                                                 |
|  09 | `20260729140800_09_staff_authentication_hardening.sql` — invitation activation                                | `public`, `auth`                                                                                                | Service-role-only `activate_staff_invitation`; fixed path, row locks, audit. Empty-row update only when called later.                                          |
|  10 | `20260729140900_10_roles_permissions_and_authorization.sql` — permission model                                | `public`, `auth`, `internal`; `role_permissions`                                                                | Seeds static role-permission metadata; forced RLS; authorization helpers and 24 read policies.                                                                 |
|  11 | `20260729141000_11_session_scoped_active_membership_authorization.sql` — session selection                    | `auth`, `internal`, `public`; session membership table                                                          | Session RPCs and replacement authorization helpers; uses `auth.uid()` and JWT `session_id`.                                                                    |
|  12 | `20260729141100_12_academic_configuration_management.sql` — configuration RPCs                                | `public`, `internal`, `auth`; configuration tables                                                              | 60+ configuration functions, lifecycle indexes, authenticated grants. RPCs may replace dependent rows only when invoked later.                                 |
|  13 | `20260729141200_13_academic_configuration_integrity_and_workflows.sql` — stale-write/version workflows        | `internal`, `public`, `auth`                                                                                    | Replaces workflow functions/triggers; drops/re-adds promotion constraint; authorized RPCs may replace dependent rows.                                          |
|  14 | `20260801074906_14_versioned_configuration_immutability.sql` — lifecycle immutability                         | `public`, `internal`, `auth`                                                                                    | Replaces lifecycle helpers/triggers; drops old definitions before recreating them.                                                                             |
|  15 | `20260801144434_15_mark_sheet_retired_scheme_continuity.sql` — retired-scheme continuity                      | `internal`, `public`, `auth`                                                                                    | Replaces mark-sheet scope validation; no new tables/storage.                                                                                                   |
|  16 | `20260801152543_16_student_management.sql` — student/guardian management                                      | `public`, `internal`, `auth`, `storage`; student domain                                                         | 35+ RPC/helpers, five indexes, seven triggers, four private `student-photos` policies; creates bucket. Top-level normalization updates are empty-project safe. |
|  17 | `20260801170602_17_student_enrollment_consistency_and_capacity.sql` — enrolment integrity                     | `auth`, `storage`, `internal`, `public`                                                                         | Replaces enrollment/student RPCs; current-enrollment index and consistency trigger; reads Storage metadata only.                                               |
|  18 | `20260809132422_18_teacher_assignment_management.sql` — teacher assignment workflow                           | `public`, `internal`, `auth`; assignment tables                                                                 | Rebuilds duplicate indexes; 35+ functions, three history indexes, triggers and two read policies.                                                              |
|  19 | `20260817173437_19_marks_entry_management.sql` — marks entry                                                  | `public`, `auth`, `internal`; mark sheets/marks                                                                 | Replaces authority helpers; two indexes, two triggers; direct browser writes revoked.                                                                          |
|  20 | `20260817192215_20_marks_entry_authority_and_revision_hardening.sql` — revision authority                     | `auth`, `internal`, `public`                                                                                    | Replaces mark-sheet identity/write-authority functions.                                                                                                        |
|  21 | `20260817204710_21_marks_submission_review_and_locking.sql` — marks workflow                                  | `public`, `internal`, `auth`; sheets/terms                                                                      | Workflow helpers, three indexes, five locking triggers; row-lock failure paths.                                                                                |
|  22 | `20260818070033_22_marks_workflow_hardening.sql` — workflow detail hardening                                  | `auth`, `public`, `internal`                                                                                    | Replaces workflow-detail function only.                                                                                                                        |
|  23 | `20260824182823_23_deterministic_results_calculation.sql` — results engine                                    | `public`, `internal`, `auth`, `extensions`; eight result tables                                                 | Result/classification tables, forced RLS, eight append-only triggers, eight indexes; `pgcrypto` hashing.                                                       |
|  24 | `20260824200653_24_results_calculation_hardening.sql` — result authority                                      | `auth`, `public`, `internal`, `extensions`                                                                      | Replaces classification/calculation functions; no new tables.                                                                                                  |
|  25 | `20260824201500_25_results_calculation_temp_table_lint.sql` — temp-table lint correction                      | `public`, `internal`, `extensions`                                                                              | Replaces calculation function; no persistent schema.                                                                                                           |
|  26 | `20260825120000_26_results_calculation_correctness_and_authority.sql` — result correctness                    | `auth`, `internal`, `public`, `extensions`; grade/subject performance                                           | Adds forced-RLS table, index, append-only trigger; source backfill is empty-project safe.                                                                      |
|  27 | `20260825160142_27_results_calculation_readiness_and_ranking_hardening.sql` — readiness/ranking               | `public`, `auth`, `internal`, `extensions`                                                                      | Replaces readiness/calculation functions.                                                                                                                      |
|  28 | `20260828055808_28_report_snapshot_generation.sql` — authoritative snapshots                                  | `public`, `internal`, `auth`, `storage`, `extensions`; snapshot sources                                         | Adds table, seven indexes, five triggers, three policies, generation functions. Reads private Storage metadata only.                                           |
|  29 | `20260828073615_29_report_snapshot_integrity_hardening.sql` — snapshot integrity                              | `public`, `extensions`, `internal`, `auth`, `storage`                                                           | Replaces functions/triggers/policies; drops/recreates indexes and constraints; empty-project backfill.                                                         |
|  30 | `20260829112257_30_report_snapshot_authoritative_source_and_history_hardening.sql` — source/history authority | `public`, `auth`, `internal`, `storage`, `extensions`                                                           | Drops one superseded index and replaces report functions; empty-project backfill.                                                                              |
|  31 | `20260830100000_31_report_snapshot_acceptance_hardening.sql` — snapshot read acceptance                       | `auth`, `internal`, `public`                                                                                    | Replaces reader/generator functions and authenticated grants.                                                                                                  |
|  32 | `20260831010000_32_report_publication_workflow.sql` — PDF publication                                         | `public`, `storage`, `internal`, `auth`; reports                                                                | Creates private `report-artifacts` bucket (10 MiB, PDF only), three Storage policies, publication RPCs, two indexes, two triggers.                             |
|  33 | `20260831030000_33_report_publication_acceptance_hardening.sql` — publication acceptance                      | `storage`, `public`, `internal`, `auth`                                                                         | Replaces publication functions/trigger/policies; drops old signatures intentionally.                                                                           |
|  34 | `20260902010000_34_report_publication_correction_reopen.sql` — correction reopen                              | `public`, `internal`, `auth`                                                                                    | Replaces term-reopen workflow function.                                                                                                                        |
|  35 | `20260902090000_35_parent_portal.sql` — parent portal                                                         | `auth`, `public`, `internal`, `extensions`, `storage`; rate/security tables                                     | Two forced-RLS tables, three indexes, timestamp/immutable-event triggers, parent functions; `pgcrypto`.                                                        |
|  36 | `20260903010000_36_parent_portal_acceptance_hardening.sql` — parent acceptance                                | `public`, `internal`, `extensions`, `storage`                                                                   | Replaces parent verification/detail functions; fixed paths.                                                                                                    |
|  37 | `20260903020000_37_stage_16_academic_analytics.sql` — analytics reads                                         | `internal`, `public`, `auth`                                                                                    | Analytics reader/query RPCs with authenticated-only execution; no tables/views.                                                                                |
|  38 | `20260903040000_38_analytics_acceptance_hardening.sql` — analytics acceptance                                 | `internal`, `public`, `auth`                                                                                    | Replaces analytics functions/grants; no tables/views.                                                                                                          |
|  39 | `20260905010000_39_promotion_progression_workflow.sql` — promotion workflow                                   | `public`, `auth`, `internal`, `extensions`; snapshots/progressions                                              | Frozen. Two forced-RLS tables, two indexes, five triggers, promotion RPCs, restrictive grants; version backfill is zero-row on fresh DB.                       |
|  40 | `20260905030000_40_promotion_acceptance_hardening.sql` — promotion acceptance                                 | `public`, `auth`, `internal`, `extensions`; progressions/rules                                                  | Frozen. Replaces promotion functions, one index, one trigger, signature/constraint; zero-row fresh-DB backfill.                                                |

Static counts from the migration text: 52 created tables (51 `public`, one
`internal`), no migration-created views, 437 function create/replace
statements, 45 policies, 119 triggers, and 115 indexes. Counts include
replacements and are not a substitute for post-deploy catalog checks.

## 4. Integrity and dependency review

- Migration timestamps are unique and sort in the same order as suffixes 01–40.
- Migration 39 blob SHA-1: `757b6650d0bea38b388480cda19c5d789fc23339`.
- Migration 40 blob SHA-1: `4be48719d4d0ee0316dca80ff99bcce64f807558`.
- Migration 41: absent.
- No migration file changed during this audit.
- Dependencies are linear: extensions/types, identity/base tables, security,
  workflows, results/reports, portal/analytics, then promotion.
- `supabase/config.toml` has no schema path requiring an untracked file.

Any change to migration 39/40 or appearance of migration 41 is a hard stop.

## 5. Destructive and environment-sensitive SQL review

Classification is relative to this first deploy to an empty application
database:

| Finding                                                                                   | Classification                                            | Treatment                                                                                                    |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `CREATE EXTENSION pgcrypto` and `btree_gist` in `extensions`                              | Environment-sensitive; safe on fresh project if available | Verify both extensions on the target before authorization. Supabase documents both in its extension catalog. |
| RLS, forced RLS, `REVOKE`, grants, and default privileges                                 | Expected security hardening                               | Verify catalog state after deployment; do not fix with broad grants.                                         |
| `DROP IF EXISTS` of old triggers, policies, indexes, constraints, and function signatures | Safe on fresh project; replacement-sensitive              | Expected migration evolution. A failure requires inspection, not blind rerun.                                |
| Top-level normalization/backfill `UPDATE`s in 09, 13, 16, 26, 29, 39, 40                  | Safe on fresh project; data-sensitive on populated DB     | Expected zero-row effect now. Do not reuse these migrations for a populated database without review.         |
| `DELETE` statements inside authorized future RPC bodies                                   | Data-destructive when called, not during migration replay | Covered by application/database tests; not a rollback mechanism.                                             |
| `CASCADE`/`RESTRICT` foreign-key clauses                                                  | Schema behavior, not migration data deletion              | Expected referential-integrity policy; verify constraints.                                                   |
| `SECURITY DEFINER` functions                                                              | Requires operator review                                  | Verify fixed search paths, ownership, authorization, execute grants and no unsafe dynamic SQL.               |
| `ALTER DEFAULT PRIVILEGES` for `postgres`                                                 | Environment-sensitive privilege change                    | Verify hosted owner/role assumptions before rollout.                                                         |
| Role changes, extension drops, table drops, truncation, renames, concurrent indexes       | Not found                                                 | No special non-transactional DDL was found.                                                                  |

No migration contains `CREATE INDEX CONCURRENTLY`, `ALTER ROLE`, `DROP
EXTENSION`, `DROP TABLE`, `TRUNCATE`, or table renames. No fake down migrations
will be created.

## 6. Transaction and failure safety

The files contain no explicit transaction control, concurrent index creation,
vacuum/reindex, external network calls, or role creation. Normal migration
execution is expected to roll back the currently failing migration while
leaving prior migration history intact; this must be confirmed from the CLI
and catalog after any failure rather than assumed.

| Migration set | Possible failure                                                     | Expected state if transaction rolls back                                     | Retry / recovery                                                                     |
| ------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 01–05         | Missing extension, auth schema mismatch, dependency or syntax error  | No objects from failing migration; earlier migrations remain                 | Retry only after exact error is understood; extension/role issue requires review.    |
| 06–11         | Privilege owner mismatch, JWT function mismatch, policy syntax error | No partial policy/grant state from failing migration                         | Inspect history, RLS and grants; never repair history to hide it.                    |
| 12–15         | Constraint or function/trigger replacement failure                   | Prior version remains if transactional; verify replacement state             | Retry after catalog/error review; manual recovery if catalog disagrees with history. |
| 16–22         | Storage schema, lock, function signature or trigger failure          | No partial application expected; Storage must be checked explicitly          | Retry only if pending and no partial state exists.                                   |
| 23–27         | Result dependency or lock timeout                                    | Prior state remains; no result rows should exist on fresh target             | Resolve dependency/lock issue; do not manually create result tables.                 |
| 28–34         | Report lineage, Storage policy, function signature or lock failure   | Verify report and Storage catalogs; do not assume replacement fully reverted | Manual operator review if any object exists without matching history.                |
| 35–38         | Parent security or analytics function/grant failure                  | Prior state remains if transactional                                         | Retry after exact function/grant inspection.                                         |
| 39–40         | Frozen migration or promotion constraint/function failure            | No application data exists; inspect partial schema/history anyway            | Do not modify 39/40. If a defect is proven, request approval for a new migration.    |

On failure: stop the application rollout, capture exact CLI output and project
ref, run `migration list`, inspect affected catalogs, and escalate before any
reset or manual SQL.

## 7. Seed safety

`supabase/seed.sql` is synthetic local-development data. It creates demo schools
and academic configuration, including synthetic IDs, and no credentials, staff
accounts, students, guardians, marks, or reports.

```text
Production seed deployment: PROHIBITED
```

Never run `supabase db push --include-seed`. Production must receive
`NO PRODUCTION SEED`.

## 8. CLI and remote evidence

The repository has no global Supabase binary. The supported fallback works
without adding a dependency:

```powershell
$env:SUPABASE_TELEMETRY_DISABLED = '1'
npx.cmd supabase --version                 # 2.110.0 observed
npx.cmd supabase link --help
npx.cmd supabase migration list --help
npx.cmd supabase db push --help
npx.cmd supabase db dump --help
```

The safe link attempt used the exact ref and `--skip-pooler`:

```powershell
npx.cmd supabase link --project-ref fpixtedanpbmjnmzrumo --skip-pooler
```

Result: refused before linking because CLI login or `SUPABASE_ACCESS_TOKEN` was
missing. No password, token, service-role key, or database secret was printed or
stored. These commands remain pending and must be run only by an authenticated
operator:

```powershell
npx.cmd supabase migration list --linked
npx.cmd supabase db push --linked --dry-run
```

The dry-run must exit 0, show exactly migrations 01–40, and not mention seed
data. A normal `db push` was not run.

## 9. Fresh replay evidence

Docker is installed, but the daemon was unavailable; no local replay is claimed.
The repository Quality workflow is the fresh-container path: it rebuilds from
migrations plus local seed, lints the schema, runs 25 database test files,
behavioral pgTAP, integration/concurrency suites, generated-type verification,
and browser acceptance.

Recorded hosted evidence before this Stage 18 branch is run `34167402960`, which
passed the complete Stage 17 matrix. A final-head Quality run is required after
this document is committed and pushed:

```text
validate: SUCCESS
database: SUCCESS
no required suite skipped
```

## 10. Expected post-migration schema and security checks

Expected application tables are the 51 `public` tables named in the inventory,
plus `internal.staff_session_active_memberships`. There are no
migration-created views. Verify all application functions, policies, triggers,
indexes, enum types, foreign keys and comments from migrations 01–40.

RLS is expected enabled and forced on the initial public domain tables,
`role_permissions`, assignments, marks, all result tables,
`report_snapshot_sources`, parent rate-limit/security tables, and promotion
recommendation/progression tables. Browser roles must have no direct table-write
path; writes use authorized RPCs. `service_role` is server-only and bypasses RLS
but does not replace application authorization invariants.

Post-deploy RLS acceptance must cover school isolation, staff memberships,
selected membership/session, subject-teacher scope, class-teacher scope,
students/enrolments, marks, calculations, reports, snapshots, parent portal,
analytics, and promotion/progression.

Every application `SECURITY DEFINER` function must be checked for a fixed
`search_path` (`pg_catalog` plus only required application schemas), expected
owner, authorization checks, safe/no dynamic SQL, correct `EXECUTE` roles, and
`PUBLIC`/`anon` revocation where required.

Grant acceptance must verify table privileges, routine `EXECUTE`, schema usage,
default privileges, and accidental `PUBLIC` access for `PUBLIC`, `anon`,
`authenticated`, and `service_role`. Grants decide whether a role can reach an
object; RLS decides which rows it can see.

Representative post-deploy catalog queries:

```sql
select schemaname, tablename, rowsecurity, forcerowsecurity
from pg_catalog.pg_tables
where schemaname in ('public', 'internal')
order by schemaname, tablename;

select n.nspname as schema_name, p.proname,
       pg_get_userbyid(p.proowner) as owner, p.prosecdef,
       pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef and n.nspname in ('public', 'internal')
order by n.nspname, p.proname;

select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by grantee, table_schema, table_name, privilege_type;

select n.nspname, p.proname, p.oid::regprocedure,
       has_function_privilege('public', p.oid, 'execute') as public_execute,
       has_function_privilege('anon', p.oid, 'execute') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'execute') as service_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'internal')
order by n.nspname, p.proname;
```

Run Security Advisor and Performance Advisor after deployment. Pre-deploy
zero-lint results describe only the empty project.

## 11. Storage expectations

Migrations create both required buckets; no separate bucket provisioning is
expected:

| Bucket             | Public  |  Limit | MIME types                              | Access model                                                                               |
| ------------------ | ------- | -----: | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `student-photos`   | `false` |  5 MiB | `image/jpeg`, `image/png`, `image/webp` | Private; scoped Storage policies and server-authorized/signed access                       |
| `report-artifacts` | `false` | 10 MiB | `application/pdf`                       | Private; generated/uploaded through authorized report workflow and parent descriptor paths |

Verify bucket metadata, object policies, no public access, and zero unexpected
objects before launch. Do not create buckets during Stage 18E.

## 12. Auth assumptions

The migrations intentionally reference standard Supabase-managed `auth.users`,
`auth.uid()`, and `auth.jwt()` interfaces. Application profiles are keyed to
Auth user IDs; migrations do not alter Supabase-managed Auth tables. The
session-scoped authorization requires a JWT `session_id` claim. Verify the
hosted Auth JWT shape before rollout. Any mismatch is a hard stop; do not patch
`auth` tables or bypass the claim.

## 13. Backup checkpoint and rollback model

The target is currently empty, so there is no application data backup to take.
Before the later rollout, capture project ref/name/region/health, database
freshness, migration history, no Auth users, no Storage buckets/objects, and the
frozen repository SHA. Do not claim Free-plan backup/PITR capabilities; Stage
18F owns the full backup and recovery policy.

Case A — migration fails before production use:

1. Stop immediately and keep the application offline.
2. Capture the exact failed migration and CLI output.
3. Check migration history and actual catalogs.
4. Retry only if the same migration is pending and the cause is understood.
5. If partial schema exists, plan explicit recovery with the operator. A remote
   reset is not automatically authorized.

Case B — migrations succeed but verification fails before launch:

- Keep production traffic and application deployment disabled.
- Prefer a corrective forward migration after review.
- Recreate/reset only with explicit destructive-operation approval.
- Never use migration repair as a schema fix.

Case C — production has real data/users:

- Never use blanket reset.
- Use reviewed forward migrations, Stage 18F backups/PITR where available,
  incident procedures, and separate Storage object recovery.
- Preserve Auth, application data, and Storage evidence before correction.

`supabase migration repair` changes migration tracking only; it does not apply
or revert schema SQL. It is prohibited in Stage 18E and may only be considered
when actual schema and migration history are independently proven consistent.

## 14. Future controlled execution runbook

Responsible operator: one designated release operator, named in the deployment
authorization record. Exactly one actor may execute the production push.

1. Freeze the approved repository SHA and confirm Quality is green.
2. Confirm project name `school-report-system`, ref `fpixtedanpbmjnmzrumo`,
   region and health.
3. Confirm the database is still fresh: no application history, tables, users,
   buckets or objects.
4. Link using a non-logged-in secret input or `SUPABASE_ACCESS_TOKEN`; never
   commit or print credentials.
5. Run `npx.cmd supabase migration list --linked` and record the exact pending
   set.
6. Run `npx.cmd supabase db push --linked --dry-run`; confirm 01–40 only and no
   seed.
7. Obtain explicit deployment authorization.
8. Execute exactly one controlled deployment:

   ```powershell
   npx.cmd supabase db push --linked
   ```

   This step is not authorized in Stage 18E.

9. Verify migration history and the expected schema/RLS/grants/functions.
10. Verify both private Storage buckets, MIME limits and policies.
11. Run Security Advisor and Performance Advisor.
12. Verify generated database types and application integration checks.
13. Keep application deployment disabled until database acceptance is signed off.

Direct Dashboard SQL/Table Editor schema changes are prohibited. Supabase
production guidance recommends a single controlled CI/CD actor for production
migrations; later repository work may add a gated manual or `workflow_dispatch`
dry-run/deploy process, not an automatic push on every `main` commit.

## 15. Deployment gate and remaining blockers

The gate is closed until all of the following are captured:

- authenticated `migration list` proves remote empty and 01–40 pending;
- authenticated `db push --dry-run` exits 0 with exactly 01–40;
- final-head hosted Quality has `validate` and `database` success;
- local replay or hosted fresh-container evidence is attached to that final SHA;
- target freshness is rechecked immediately before deployment authorization;
- Stage 18F backup/recovery controls are complete before actual rollout;
- operator authorization and evidence destination are named.

No schema mutation, seed, user, Storage object, Vercel deployment, migration
repair, remote reset, migration 41, or migration 39/40 edit is permitted while
this gate is closed.

## 16. Repository validation and freeze checks

Run after this document is committed:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

Expected dependency freeze:

```text
package.json: unchanged
package-lock.json: unchanged
```

Expected migration freeze:

```text
Migration 39: unchanged
Migration 40: unchanged
Migration 41: absent
No migration files changed
```

The only intended repository change for Stage 18E is this runbook. Commit with:

```text
chore: prepare production migration safety
```

Push only `feature/stage-18-production-hardening`; do not merge PR #16.

## Evidence links

- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase managing environments](https://supabase.com/docs/guides/deployment/managing-environments)
- [Supabase Postgres extensions](https://supabase.com/docs/guides/database/extensions)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
