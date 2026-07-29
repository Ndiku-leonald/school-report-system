# Security Policy

## System and scope

This repository is intended to contain a web application for managing sensitive primary-school academic records. The planned system boundary includes the Next.js staff dashboard, teacher workspace, parent report portal, server-side application interfaces, report-generation services, Supabase PostgreSQL, Supabase Auth, Row Level Security policies, private Supabase Storage, migrations, and Vercel deployments.

Staff authentication is implemented with cookie-based Supabase sessions.
Stage 5 adds active-membership, school-scoped role permissions and
assignment-scoped academic-read RLS. Parent verification and storage controls
remain future work, so no real academic data is permitted.

## Threat model and trust boundaries

Protected assets include student records, marks, report snapshots, generated reports, parent access credentials, staff identities, authorization assignments, school configuration, audit events, and server-side secrets.

Untrusted inputs include browser requests, uploaded or imported data, marks-entry data, parent student-code and PIN submissions, URL parameters, cookies, generated-report requests, and external service responses. Trust boundaries exist between browsers and server code, server code and Supabase, authenticated users and their assigned academic scope, private storage and report recipients, preview and production environments, and one student's household and another's.

## Security invariants

- Real student records, parent credentials, private reports, and production data exports must never be committed to the repository.
- API keys, passwords, tokens, private keys, database credentials, and other secrets must never be committed to source control.
- The Supabase service-role key is server-only and must never appear in browser code, client bundles, public environment variables, logs, screenshots, or user-visible errors.
- Proxy routing is an optimistic usability boundary only. Protected layouts,
  server actions, and later domain services must establish a validated user and
  current active membership again.
- An active-school cookie is only a selector. It must be HttpOnly, SameSite=Lax,
  Secure in production, and revalidated against the authenticated user's active
  memberships on every authoritative request.
- A normal authenticated session is not authority to reset a password. Recovery
  additionally requires a signed, 15-minute proof bound to the current Auth
  user and recovery purpose. Its HttpOnly cookie is SameSite=Lax, Secure in
  production, scoped to `/reset-password`, and cleared after successful or
  invalid use.
- Redirect destinations are never authentication-flow proof. A PKCE callback
  must present exactly one valid 15-minute HMAC state for recovery or
  invitation before its code is exchanged. Each state contains only a
  purpose-bound keyed hash of the normalized email and is checked against the
  authoritative Auth user. Invitation callbacks additionally require the
  user's own RLS-filtered `INVITED` membership.
- Public signup and anonymous sign-in must remain disabled. The email/password
  provider remains enabled for invited staff login, and Supabase must enforce a
  minimum password length of 12 locally and in the hosted project.
- Student reports must use private storage. Access must be granted only after server-side authorization or secure, short-lived delivery controls.
- Every sensitive read and mutation must be authorized server-side. Hiding a menu or disabling a button is not authorization.
- Membership-backed workflow actors must belong to the target record's school even when a privileged server credential performs the write. Database scope validation is required in addition to Stage 5 role authorization.
- PostgreSQL Row Level Security must be enabled and explicitly tested for protected application tables and storage objects.
- Subject teachers must be restricted to their current, explicit class and subject assignments. Class-level access must also be scoped to an authorized academic period.
- Marks approval, locking, unlocking, report publication, report withdrawal, role changes, and other sensitive actions must produce tamper-resistant audit events with the actor, action, target, and time.
- All untrusted input must be validated on the server. Output and file handling must be appropriate for the destination context.
- Parent code and PIN verification must be rate-limited and monitored to reduce enumeration and brute-force risk.
- Parent sessions must be secure, short-lived where appropriate, revocable, and restricted to the verified student's published reports.
- Authentication and authorization failures must fail closed and must not reveal whether unrelated students, accounts, or reports exist.

## Secrets and environment handling

Only variables explicitly prefixed with `NEXT_PUBLIC_` may be considered for browser exposure, and that prefix does not make a sensitive value safe. `AUTH_FLOW_SIGNING_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`, and equivalent privileged credentials are server-only. The Auth-flow secret must contain at least 32 random bytes, must not be a Supabase key, and must never be logged.

Use local ignored environment files and the hosting provider's encrypted environment configuration. Rotate a credential immediately if it is committed, published, logged, or otherwise exposed; deleting it from the latest revision is not sufficient because Git history and external copies may retain it.

## Reportable findings and severity context

Please report suspected vulnerabilities involving unauthorized student-data access, privilege escalation, cross-school or cross-student data exposure, bypass of marks locking or approval, report disclosure, parent-account enumeration, credential leakage, missing server-side authorization, ineffective Row Level Security, audit-log tampering, or unsafe file/report handling.

Severity should reflect realistic reachability and impact. Unauthorized access to student records, staff privileges, private reports, production secrets, or the integrity of approved academic results is considered high impact.

## Authentication controls and limitations

The administrative Supabase client exists only for narrowly scoped trusted
operations: staff provisioning, invitation activation, and authentication
audit writes. Its auth client disables token persistence, URL detection, and
automatic refresh. Browser modules must never import it.

Login and password-reset requests use generic responses to reduce account
enumeration. Authentication audit metadata excludes passwords, recovery codes,
access tokens, refresh tokens, invitation token hashes, and service keys.
Disabling or suspending a membership blocks workspace access on the next
authoritative request; administrators should also revoke Auth sessions when
urgent account-wide revocation is required.

Proxy redirects propagate only Supabase cookies and their attributes from the
refresh response, not arbitrary headers. Invitation redirects are fixed,
same-origin callbacks, carry server-created signed invitation state, and
require HTTPS except on approved localhost origins. Generic PKCE codes, missing
or dual states, and operator-supplied state values are rejected before code
exchange. Token-hash confirmation separately accepts only `invite` and
`recovery`; public `signup` and `magiclink` confirmation are rejected. Hosted
Supabase Auth settings and email delivery remain separately configured
production controls.

## Known limitations

Role and assignment authorization is evaluated from current database state,
not user metadata, JWT role claims, navigation visibility, or browser cookies.
Stage 5 grants no browser academic mutations and exposes no guardian, parent
credential, or parent session records. Same-school actor triggers remain
integrity controls rather than business authorization. Before any real data is
introduced, the later workflow controls and production security work must be
completed.

Database-specific controls and limitations are documented in [docs/database-security.md](docs/database-security.md).

## Reporting a vulnerability

Do not open a public issue containing vulnerability details, personal data, credentials, or exploit material. Use the repository's private GitHub vulnerability-reporting or Security Advisory channel when available. If no private channel is enabled, contact the repository owner through an established private channel and disclose only the minimum information needed to coordinate a secure report.

Include the affected component, impact, reproduction conditions using synthetic data, and suggested remediation if known. Do not access, alter, or retain real student data while investigating.
