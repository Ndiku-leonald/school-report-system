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

`--middle-name` and `--redirect-url` are optional. The tool constructs the final
destination from `NEXT_PUBLIC_APP_URL` and the fixed `/auth/callback` path. It
creates a short-lived HMAC invitation state bound to the normalized invited
email and appends only `?invitation_state=<signed-state>`. A supplied redirect
represents the callback base only: it must exactly match that same-origin path,
use HTTPS except on approved localhost origins, and contain no credentials,
query, or fragment. External origins, protocol-relative URLs, misleading
subdomains, unrelated same-origin paths, and operator-supplied state values are
rejected. The callback base must be allow-listed in Supabase Auth.

The command validates input, confirms the active school, creates the Auth
invitation, linked profile and `INVITED` membership, adds role labels, and
appends `STAFF_INVITED`. If database provisioning fails, it removes the newly
created Auth user. It never prints the service key, invitation token, signed
state, or final invitation URL.

The callback verifies the signed state before exchanging a PKCE code, binds it
to the authoritative Auth email, and requires the user's own RLS-filtered
memberships to contain at least one current `INVITED` row. A redirect
destination alone never establishes an invitation flow. Token-hash invitation
links remain separately verified by `/auth/confirm`.

## Remote-project guard

The command permits localhost by default. A non-local Supabase URL is rejected
unless `--allow-remote` is supplied. Before using that flag, independently
confirm the exact non-production project, environment configuration, school,
recipient, and role scope. The flag is confirmation, not authorization.

This repository's Stage 4 delivery and CI do not run that flag and do not apply
migrations or invitations to a remote project.

Public signup remains disabled. Hosted-project signup, minimum-password,
redirect allow-list, and email-delivery settings require separate operational
configuration; local capture does not prove production email delivery.

Invitation acceptance uses migration 09's service-role-only database function.
It locks and validates the complete expected `INVITED` membership set.
Activation and both success audit events commit together or roll back together.
A changed, suspended, disabled, inactive-school, missing, duplicate, or
cross-profile row fails the entire operation.

## Operational recovery

If an invitation expires, inspect the existing Auth user, profile, membership,
and audit history through an approved administrative channel before retrying.
Do not create duplicate staff identities merely to bypass an error. If a
membership must be revoked, change its status to `SUSPENDED` or `DISABLED` and,
for urgent account-wide revocation, revoke Supabase Auth sessions separately.
