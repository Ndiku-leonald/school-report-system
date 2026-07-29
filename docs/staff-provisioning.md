# Staff Provisioning

## Required configuration

Provisioning is a trusted server operation. Configure these values through an
ignored local environment file or approved secret store:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Never pass a service-role key as a command-line argument or place it in shell
history, documentation, screenshots, logs, or a pull request.

## Invite a staff member

Confirm the school UUID, employee number, and least-privilege role set. For a
local project:

```bash
npm run auth:invite-staff -- \
  --email synthetic.staff@example.invalid \
  --first-name Synthetic \
  --middle-name Local \
  --last-name Staff \
  --employee-number LOCAL-STAFF-001 \
  --school-id 10000000-0000-4000-8000-000000000001 \
  --roles SUBJECT_TEACHER
```

Multiple roles are comma-separated. Allowed values are `SUPER_ADMIN`,
`SCHOOL_ADMIN`, `HEAD_TEACHER`, `ACADEMIC_REGISTRAR`, `CLASS_TEACHER`, and
`SUBJECT_TEACHER`.

`--middle-name` and `--redirect-url` are optional. A custom redirect must be an
approved absolute URL already allow-listed in Supabase Auth.

The command validates input, confirms the active school, creates the Auth
invitation, linked profile and `INVITED` membership, adds role labels, and
appends `STAFF_INVITED`. If database provisioning fails, it removes the newly
created Auth user. It never prints the service key or invitation token.

## Remote-project guard

The command permits localhost by default. A non-local Supabase URL is rejected
unless `--allow-remote` is supplied. Before using that flag, independently
confirm the exact non-production project, environment configuration, school,
recipient, and role scope. The flag is confirmation, not authorization.

This repository's Stage 4 delivery and CI do not run that flag and do not apply
migrations or invitations to a remote project.

## Operational recovery

If an invitation expires, inspect the existing Auth user, profile, membership,
and audit history through an approved administrative channel before retrying.
Do not create duplicate staff identities merely to bypass an error. If a
membership must be revoked, change its status to `SUSPENDED` or `DISABLED` and,
for urgent account-wide revocation, revoke Supabase Auth sessions separately.
