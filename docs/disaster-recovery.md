# Stage 18F — Backup and Disaster Recovery

Audit date: 2026-09-23 (Africa/Kampala)

Status: `STAGE 18F PLAN DOCUMENTED — OPERATOR APPROVAL AND PRE-LAUNCH DRILL REMAIN REQUIRED`

This runbook covers the empty pre-launch Supabase project
`school-report-system` (`fpixtedanpbmjnmzrumo`). It defines the controls that
must be in place before real school data is created. It does not deploy
migrations, create users or Storage objects, perform a production restore,
enable paid features, deploy Vercel, create Migration 41, modify migrations 39
or 40, or merge PR #16.

## 1. Starting state and hard boundaries

| Field          | Verified value                                    |
| -------------- | ------------------------------------------------- |
| Repository     | `Ndiku-leonald/school-report-system`              |
| Branch         | `feature/stage-18-production-hardening`           |
| Starting SHA   | `9ef35f82d01f361854cbf2f5756f290d28c7c6fa`        |
| `origin/main`  | `6c70dfac69fbb09cb827a013d708a552c5f29f2c`        |
| Pull request   | #16, open/unmerged per continuation brief         |
| Project        | `school-report-system`                            |
| Project ref    | `fpixtedanpbmjnmzrumo`                            |
| Region         | `eu-central-1` / Central EU (Frankfurt)           |
| Project health | `ACTIVE_HEALTHY`                                  |
| Plan           | Free                                              |
| Compute        | Nano; 2 GB disk volume reported by Management API |
| Postgres       | 17.6.1.166                                        |

The live read-only freshness query returned:

```text
Application migrations: 0
Application tables in public: 0
Application users in auth.users: 0
Storage buckets: 0
Storage objects: 0
```

The target is still fresh. No production backup or restore is needed at this
stage. If any of those values changes unexpectedly, stop and report:

```text
PRODUCTION STATE CHANGED — DR PLAN MUST BE REASSESSED
```

Never use `supabase db reset --linked` against this target. After launch, a
blanket reset is permanently prohibited.

## 2. Current hosted backup capability

The organization and project were checked read-only through the Supabase
Management API. The organization is on the Free plan, the project has no
selected billing add-ons, and the primary database is Nano. Current Supabase
documentation states that daily managed backups are available on Pro, Team,
and Enterprise; Free projects should regularly export with `supabase db dump`
and maintain off-site backups.

| Capability                  | Current state                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| Scheduled managed backups   | **NO** on Free                                                                                  |
| Downloadable managed backup | **NO** on Free; use logical export                                                              |
| PITR available              | **NO** on current Free plan                                                                     |
| PITR enabled                | **NO**                                                                                          |
| Managed backup retention    | None on current Free plan                                                                       |
| Compute add-on              | None; Nano is the current primary                                                               |
| Project auto-pause          | Free projects may pause after inactivity; operator must monitor and resume before recovery work |

The policy below is therefore an interim external-backup policy, not a claim
that Supabase Free provides managed disaster recovery.

Sources checked on 2026-09-23:

- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase Pricing](https://supabase.com/pricing)
- [Supabase PITR usage](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery)
- [Supabase Storage object download](https://supabase.com/docs/guides/storage/management/download-objects)

Supabase documentation also states that database backups contain Storage
metadata, not the actual object bytes. Database and Storage recovery are
separate procedures.

## 3. Data classes and recovery importance

The following classification is for backup priority and recovery sequencing.
It is not a legal retention schedule. School management must approve the legal
and institutional retention policy separately.

| Data                          | Recovery classification                                   | Why it matters                                                                                |
| ----------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Schools                       | Critical transactional; personal data                     | Tenant boundary and ownership of every school record.                                         |
| Staff users                   | Critical transactional; security-sensitive; personal data | Identity, access, and operator continuity. Auth configuration is separate from database rows. |
| Staff memberships             | Critical transactional; security-sensitive                | Determines school and role scope; incorrect restoration can cause cross-school access.        |
| Students                      | Critical transactional; personal data                     | Core learner records and school relationships.                                                |
| Guardians                     | Critical transactional; personal data                     | Parent identity and contact relationships.                                                    |
| Enrolments                    | Critical transactional; personal data                     | Historical and current school/class placement.                                                |
| Academic configuration        | Critical transactional; regenerable                       | Years, terms, grades, classes, subjects, schemes, and rules drive workflows.                  |
| Teacher assignments           | Critical transactional; personal data                     | Controls who may act on a class or subject.                                                   |
| Marks                         | Critical transactional; personal data                     | Assessment evidence; loss changes academic outcomes.                                          |
| Results                       | Derived; critical transactional                           | Can be recalculated, but must be preserved for audit and to avoid unexplained changes.        |
| Reports                       | Critical transactional; personal data                     | Publication state and report descriptors are part of the school record.                       |
| Report snapshots              | Immutable artifact; personal data                         | Historical authoritative output; do not silently regenerate over a published snapshot.        |
| Parent access records         | Critical transactional; security-sensitive; personal data | Access grants, sessions, rate limits, and revocation evidence.                                |
| Audit/security records        | Immutable artifact; security-sensitive; personal data     | Incident investigation, accountability, and access review.                                    |
| Analytics data                | Derived; regenerable; personal data                       | Useful for operations but lower priority than source marks and results.                       |
| Promotion/progression records | Critical transactional; personal data                     | Decisions and workflow history must remain explainable.                                       |
| Student photos                | Immutable artifact; personal data; security-sensitive     | Object bytes are not in database backups and must be backed up separately.                    |
| Report PDF artifacts          | Immutable artifact; personal data; security-sensitive     | Published bytes must remain private and checksum-verifiable.                                  |

No real instance of any class exists in the production target today.

## 4. Database backup policy

### 4.1 Interim Free-plan schedule

Before the first real production record is created, the operator must select an
approved encrypted off-site destination and run a restore drill. Once live:

1. Run a full logical database export at least daily, with one run after the
   day's scheduled data-entry window.
2. Retain daily generations for 14 days, weekly generations for 12 weeks, and
   monthly generations for 12 months, subject to school-approved policy.
3. Keep at least one recent copy in a separate failure domain from Supabase.
4. Record a backup batch ID, UTC timestamps, file size, SHA-256 checksum,
   encryption status, destination, operator, and result.
5. Perform an automated file/checksum check after every export and a synthetic
   restore drill at least quarterly and after any format or tooling change.
6. Escalate any failed or partial run immediately. `PARTIAL` is never accepted
   as `SUCCESS`.

### 4.2 Current CLI command

The installed CLI was checked with `supabase db dump --help`. The supported
linked export form is:

```powershell
$env:SUPABASE_TELEMETRY_DISABLED = '1'
npx.cmd supabase db dump --linked --file $backupFile
```

`$backupFile` must be an explicit path under the ignored, access-controlled
backup workspace. The operator must authenticate without putting a database
password, access token, or service-role key in shell history or output. Do not
use `--password` with a literal secret in a command line. The normal backup
workflow is:

```text
1. Confirm the exact project ref and an approved backup destination.
2. Link only to the named target using an interactive/non-logged secret path.
3. Run the command above to produce the logical export.
4. Check command exit status and non-zero expected size.
5. Encrypt the file before transfer or long-term storage.
6. Compute and record SHA-256 after encryption.
7. Upload only to the approved private destination.
8. Verify the remote object exists, is private, and matches the checksum.
9. Record SUCCESS, PARTIAL, or FAILED in the batch record.
```

The empty production target has no backup artifact to export now. This policy
must not be interpreted as permission to run a production backup/restore drill
against the empty project.

### 4.3 Backup naming

Use UTC and an opaque batch ID; do not put student names or IDs in filenames:

```text
db/<project-ref>/YYYY/MM/DD/backup-<project-ref>-<UTC timestamp>-<batch-id>.sql
db/<project-ref>/YYYY/MM/DD/backup-<project-ref>-<UTC timestamp>-<batch-id>.sql.age
db/<project-ref>/YYYY/MM/DD/backup-<project-ref>-<UTC timestamp>-<batch-id>.sha256
```

The unencrypted export is temporary only and must be securely deleted after
successful encrypted upload and verification.

## 5. Storage object backup policy

Database exports do not preserve object bytes. The future buckets must remain
private:

```text
student-photos: PRIVATE
report-artifacts: PRIVATE
```

No bucket or object exists in production now. Before live use, select an
independent private object-storage destination and copy every object byte from
each bucket at least daily. The copy process must:

- list objects recursively;
- download bytes over TLS;
- preserve bucket and object path;
- preserve or explicitly record MIME type and size;
- compute a cryptographic checksum of the downloaded bytes;
- record the backup timestamp and batch ID;
- record the recoverable student/report association only in the encrypted
  manifest, never in a public filename or URL;
- keep the destination private and separate from the production project; and
- verify that no signed URL, access token, service-role key, or secret appears
  in the manifest or destination path.

The installed CLI supports read/list and copy operations such as:

```powershell
npx.cmd supabase storage ls --linked --recursive ss:///student-photos
npx.cmd supabase storage cp --linked --recursive ss:///student-photos $storageBackupRoot/student-photos
npx.cmd supabase storage ls --linked --recursive ss:///report-artifacts
npx.cmd supabase storage cp --linked --recursive ss:///report-artifacts $storageBackupRoot/report-artifacts
```

These commands are future operator examples only. The destination must be
approved before use, and the copy process must create the manifest and verify
metadata/checksums; a byte copy alone is not a complete Storage backup.

## 6. Storage manifest and database/Storage consistency

Each backup batch must contain an encrypted manifest with at least:

```text
backup_batch_id
bucket
object_key
size
content_type
checksum_algorithm
checksum
backed_up_at_utc
source_etag_if_available
report_or_student_association_if_recoverable
```

Never store signed URLs, service-role keys, access tokens, or long-lived
credentials in the manifest.

A database backup can contain Storage metadata that points to an object whose
byte backup was taken earlier or later. Treat the following as one auditable
batch record:

```text
backup_batch_id
database_backup_timestamp
storage_backup_start
storage_backup_end
object_count
manifest_checksum
database_checksum
status
operator
```

If the database and Storage windows do not overlap, mark the batch `PARTIAL`
and reconcile before calling it successful. During restore, compare every
database object reference with the manifest and quarantine unresolved objects
for operator review.

## 7. Confidentiality and backup destination

Backups contain the same sensitive information as production: student and
guardian data, staff data, marks, reports, and security/audit records.

Required controls:

- encryption at rest using an organization-approved encryption tool or KMS;
- encryption in transit using TLS/SFTP/S3-compatible TLS during transfer;
- separate key storage from the backup data;
- least-privilege operator and service identities;
- no personal-device sharing, USB-only storage, public cloud folders, Git,
  GitHub commits, or GitHub PR attachments;
- access review at least quarterly and after operator changes;
- secure deletion of temporary plaintext exports and expired copies; and
- incident notification if a backup or key is exposed.

No approved destination or key-management system has been selected yet. This is
an explicit launch gate:

```text
SECURE OFF-SITE BACKUP DESTINATION REQUIRED BEFORE PRODUCTION DATA IS CREATED
```

Do not invent or commit encryption keys. Do not hardcode backup passwords.

## 8. RPO and RTO policy proposals

These are proposed operational targets and require operator/school-management
approval:

| Incident scope                        | Proposed RPO                           | Proposed RTO                                                 |
| ------------------------------------- | -------------------------------------- | ------------------------------------------------------------ |
| Database-only incident                | <= 24 hours                            | 4–8 hours                                                    |
| Storage-only incident                 | <= 24 hours                            | 2–6 hours                                                    |
| Complete application/project recovery | <= 24 hours                            | 8–24 hours                                                   |
| Credential compromise containment     | No data-loss target; preserve evidence | Contain/rotate in 1–4 hours; full validation within 24 hours |

The Free-plan daily export design cannot honestly promise sub-day recovery
points. If the school requires materially lower database RPO, the decision is:

```text
PITR/PLAN UPGRADE REQUIRED FOR LOWER RPO
```

No paid upgrade is approved by this stage. RPO and RTO must be reviewed after
the first real workload, file volume, and staffing model are known.

## 9. Incident classes

### DR-1 — Accidental database row deletion

Stop further writes if practical, identify affected tables and time window,
preserve current state, and choose targeted forward repair or a reviewed restore.
Reconcile legitimate later writes before restoring older data. Do not blindly
replace the current database.

### DR-2 — Bad database migration

Stop the rollout, capture the exact migration and CLI output, inspect migration
history and catalogs, and prefer a corrective forward migration. Never repair
history merely to hide a schema mismatch and never reset a populated project.

### DR-3 — Storage object deletion

Database restoration alone cannot recover deleted bytes. Restore the specific
object from the encrypted Storage copy, verify its checksum and metadata, keep
the bucket private, and reconcile the database descriptor.

### DR-4 — Database corruption or severe schema failure

Preserve a current-state forensic export if possible, stop writes, determine
whether a logical export or paid managed recovery is available, restore only to
an approved target, validate security and relationships, and record downtime.

### DR-5 — Credential compromise

Contain first: revoke/rotate affected keys, invalidate sessions or credentials
as appropriate, review audit logs, inspect backup access, and notify the owner.
Restoring database data does not rotate secrets or undo an attacker’s access.

### DR-6 — Complete project loss

Create or recover the infrastructure, replay the repository migrations, restore
database data, restore Storage bytes, restore configuration and Auth settings,
validate RLS and private buckets, reconnect the application, and reopen traffic
only after acceptance checks pass.

## 10. Restore procedures

### 10.1 Database restore

1. Declare the incident and assign one recovery operator.
2. Freeze application writes and preserve current logs, exports, and evidence.
3. Confirm the target project ref and destination; never restore to an ambiguous
   or production target without explicit authorization.
4. Select the closest valid backup before the incident and verify its encrypted
   checksum, batch status, and operator record.
5. For a new disposable environment, apply the approved repository migrations
   in order before loading data where the export is data-only. For a full
   logical export, follow the documented restore mode for that artifact and do
   not duplicate schema creation.
6. Restore data using the tool appropriate to the actual export format. Keep
   credentials out of command arguments and logs.
7. Verify row counts, key relationships, representative checksums, RLS,
   functions, triggers, policies, and grants.
8. Reconcile Auth users, sessions, invitations, and secrets separately.
9. Record duration, discrepancies, and acceptance evidence before reopening.

Do not use `supabase db reset --linked`. Do not manually patch a populated
production database with unreviewed SQL.

### 10.2 Storage restore

1. Select the required object set from the manifest.
2. Confirm the destination bucket exists and is private.
3. Restore bytes and metadata over TLS using an approved operator identity.
4. Compute the restored checksum and compare it with the manifest.
5. Verify MIME type, size, object path, bucket, and report/student association.
6. Reconcile database descriptors and quarantine missing or mismatched objects.
7. Verify Storage policies and that no public URL was introduced.

### 10.3 Complete recovery order

```text
1. Recover infrastructure/project.
2. Apply repository migrations 01–40 to establish schema.
3. Restore database data as appropriate for the artifact format.
4. Verify schema, RLS, grants, functions, triggers, and relationships.
5. Restore private Storage objects from the manifest.
6. Reconcile Storage metadata and object checksums.
7. Reconfigure Auth, SMTP, domains, rate limits, and platform settings.
8. Re-provision secrets; never recover secrets from database backups.
9. Configure application environment and run acceptance checks.
10. Reopen traffic only after operator sign-off.
```

## 11. Auth, configuration, and secret recovery

Database data and Supabase project configuration are different recovery
domains. A database restore does not by itself restore or safely re-provision:

- Auth provider settings, Site URL, redirect URLs, SMTP, rate limits, MFA, or
  project secrets;
- active sessions, password-recovery tokens, invitations, or signing secrets;
- `SUPABASE_SERVICE_ROLE_KEY`, database URLs, SMTP credentials, Vercel tokens,
  or application rate-limit secrets; or
- custom Postgres-role passwords. Supabase documents that daily backups do not
  retain passwords for custom Postgres roles; reset them after restoration.

Maintain a non-secret configuration inventory outside the backup data containing:

```text
project name/ref/region and Postgres major version
exposed Data API schemas and SSL/network requirements
Auth providers, Site URL, redirect URL requirements, SMTP provider name
bucket names, private/public state, MIME and size limits
rate limits, MFA/security settings, production domain
Vercel environment-variable names (names only, never values)
```

Re-provision secrets from the approved secret manager. Backups are not a secret
store.

## 12. Non-production restore drill

### Current result

```text
Performed: NO
Environment: None; local Docker Engine unavailable
Synthetic data only: Not applicable
Database restore: Not performed
Storage restore: Not performed
Duration: Not applicable
Result: NOT RUN — no false pass claimed
```

The local Supabase stack could not start because the Docker Desktop Linux
engine pipe was unavailable. No disposable paid environment was created and
the production project was not used.

This is a mandatory pre-launch gate. Before real production data is created,
the operator must complete a synthetic drill in one of these environments:

1. local Supabase through Docker;
2. a disposable non-production project with explicit no-cost approval; or
3. another isolated environment approved by the operator.

The drill must use synthetic schools, users, marks, one synthetic image, and one
synthetic PDF only. It must not use real student, guardian, staff, report, or
email data.

### Required database drill evidence

1. Create the synthetic dataset and record representative counts/checksums.
2. Produce the intended logical backup.
3. Destroy only the disposable test state with explicit approval.
4. Recreate the schema safely and restore from the backup artifact.
5. Verify row counts, relationships, representative values/checksums, RLS,
   functions, triggers, policies, and grants.
6. Confirm no test secret leaked into the backup or logs.
7. Record the exact duration and result.

### Required Storage drill evidence

1. Create synthetic image and PDF objects in private disposable buckets.
2. Record byte hashes, MIME types, sizes, paths, and bucket privacy.
3. Create and checksum the manifest and copy the bytes.
4. Delete only the synthetic source objects.
5. Restore the bytes, compare hashes, and verify metadata.
6. Verify private bucket policies after restoration.

A migration reset alone is not a backup restore test and cannot satisfy this
gate.

## 13. Backup verification and retention

A backup is `SUCCESS` only when all checks pass:

```text
command exit status: 0
expected non-zero file size
encrypted output confirmed
SHA-256 checksum recorded
Storage manifest present where applicable
UTC timestamp and batch ID recorded
secure destination upload confirmed
database/Storage batch windows reconciled
operator and status recorded
```

Use these statuses:

```text
SUCCESS — all required artifacts and checks verified
PARTIAL — some artifacts exist, but reconciliation or verification is incomplete
FAILED — command, encryption, transfer, or integrity check failed
```

Never rotate out the last known-good generation solely because a newer run is
partial or failed. The proposed operational retention is daily 14 days,
weekly 12 weeks, monthly 12 months. Technical backup retention is distinct from
legal/institutional record retention:

```text
LEGAL/INSTITUTIONAL RETENTION POLICY MUST BE CONFIRMED BY SCHOOL MANAGEMENT
```

## 14. Free-plan decision and PITR record

Two policy options remain open:

### Option A — Remain Free temporarily

Permitted only after operator approval of encrypted external database and
Storage backups, independent destination, daily schedule, restore drills, and
the proposed RPO/RTO. Free auto-pause and lack of managed backups remain
accepted operational risks.

### Option B — Upgrade before launch

An eligible paid plan would provide Supabase-managed daily backups and plan-
dependent retention. PITR is separate, paid, and requires at least Small
compute. The financial decision is not made in this stage.

```text
PRODUCTION BACKUP PLAN REQUIRES OPERATOR/POLICY APPROVAL
PITR enabled: NO
```

PITR may not be enabled, compute may not be upgraded, and no paid feature may
be purchased in Stage 18F.

## 15. Rollback after a failed deployment

Rollback means restoring service safely, not deleting migration history:

1. Stop the application rollout and keep traffic closed if acceptance is not
   complete.
2. Capture the deployed SHA, migration history, logs, and current database
   state.
3. If no real data exists, inspect the exact failure and correct the repository
   through a reviewed forward migration process.
4. If real data exists, prefer a corrective forward migration or targeted data
   repair. Use a reviewed backup/PITR restore only when forward repair cannot
   preserve correctness.
5. Restore Storage separately where object bytes are involved.
6. Never run `db reset --linked`, delete production data, or use migration repair
   as a substitute for fixing schema state.

## 16. Operator responsibilities and escalation

The release/recovery operator must be named in the deployment authorization
record. Responsibilities are:

- protect backup keys and credentials;
- confirm the exact project ref before every operation;
- verify backup status and reconcile database/Storage batches;
- keep backups private and outside Git;
- preserve incident evidence and timestamps;
- coordinate school-management approval for RPO/RTO and retention;
- run and record quarterly synthetic restore drills; and
- escalate any unexpected production state, checksum mismatch, exposure,
  failed backup, or missing destination.

Escalate to the project owner and school management for data-loss, privacy,
credential, legal-retention, or paid-plan decisions. No single operator may
silently approve a destructive production restore.

## 17. Production-launch checklist

Before the first real user or student record:

```text
[ ] Encrypted off-site database destination selected and tested
[ ] Independent private Storage destination selected and tested
[ ] Separate key storage and least-privilege access approved
[ ] Database backup command and schedule operational
[ ] Storage copy and manifest process operational
[ ] Checksums and remote verification operational
[ ] Operator and escalation contacts named
[ ] RPO/RTO approved
[ ] Retention policy approved by school management
[ ] Synthetic database restore drill passed
[ ] Synthetic Storage restore drill passed
[ ] Backup failure alert/escalation tested
[ ] Auth/configuration/secret recovery inventory current
[ ] PITR decision recorded; no unapproved paid feature enabled
[ ] Production remains empty until all gates pass
```

## 18. Stage 18F evidence and acceptance

Completed in this stage:

- Free-plan and current project capability verified read-only;
- database logical-backup policy documented;
- separate Storage byte-backup and manifest policy documented;
- encryption, key separation, privacy, and off-site requirements documented;
- RPO/RTO proposals and incident classes DR-1 through DR-6 documented;
- restore order, Auth/configuration recovery, secret recovery, and rollback
  boundaries documented;
- production reset prohibited explicitly;
- backup verification, retention, launch checklist, and PITR decision recorded;
- no dependencies, migrations, production data, users, buckets, objects, or
  Vercel deployments changed; and
- non-production restore drill limitation documented honestly.

The secure destination, operator approval, and synthetic restore drill remain
genuine production-launch blockers. Stage 18F documentation may be committed,
but the stage is not accepted until those controls are approved and the drill
is completed or formally waived by the responsible operator.

## References

- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase Storage object downloads](https://supabase.com/docs/guides/storage/management/download-objects)
- [Supabase Management API](https://supabase.com/docs/reference/api/introduction)
