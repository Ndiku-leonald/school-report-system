# Security Policy

## System and scope

This repository is intended to contain a web application for managing sensitive primary-school academic records. The planned system boundary includes the Next.js staff dashboard, teacher workspace, parent report portal, server-side application interfaces, report-generation services, Supabase PostgreSQL, Supabase Auth, Row Level Security policies, private Supabase Storage, migrations, and Vercel deployments.

The repository is currently in the foundation stage. The controls below are required security invariants for future implementation; their documentation does not imply that they have already been built or verified.

## Threat model and trust boundaries

Protected assets include student records, marks, report snapshots, generated reports, parent access credentials, staff identities, authorization assignments, school configuration, audit events, and server-side secrets.

Untrusted inputs include browser requests, uploaded or imported data, marks-entry data, parent student-code and PIN submissions, URL parameters, cookies, generated-report requests, and external service responses. Trust boundaries exist between browsers and server code, server code and Supabase, authenticated users and their assigned academic scope, private storage and report recipients, preview and production environments, and one student's household and another's.

## Security invariants

- Real student records, parent credentials, private reports, and production data exports must never be committed to the repository.
- API keys, passwords, tokens, private keys, database credentials, and other secrets must never be committed to source control.
- The Supabase service-role key is server-only and must never appear in browser code, client bundles, public environment variables, logs, screenshots, or user-visible errors.
- Student reports must use private storage. Access must be granted only after server-side authorization or secure, short-lived delivery controls.
- Every sensitive read and mutation must be authorized server-side. Hiding a menu or disabling a button is not authorization.
- PostgreSQL Row Level Security must be enabled and explicitly tested for protected application tables and storage objects.
- Subject teachers must be restricted to their current, explicit class and subject assignments. Class-level access must also be scoped to an authorized academic period.
- Marks approval, locking, unlocking, report publication, report withdrawal, role changes, and other sensitive actions must produce tamper-resistant audit events with the actor, action, target, and time.
- All untrusted input must be validated on the server. Output and file handling must be appropriate for the destination context.
- Parent code and PIN verification must be rate-limited and monitored to reduce enumeration and brute-force risk.
- Parent sessions must be secure, short-lived where appropriate, revocable, and restricted to the verified student's published reports.
- Authentication and authorization failures must fail closed and must not reveal whether unrelated students, accounts, or reports exist.

## Secrets and environment handling

Only variables explicitly prefixed with `NEXT_PUBLIC_` may be considered for browser exposure, and that prefix does not make a sensitive value safe. `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`, and equivalent privileged credentials are server-only.

Use local ignored environment files and the hosting provider's encrypted environment configuration. Rotate a credential immediately if it is committed, published, logged, or otherwise exposed; deleting it from the latest revision is not sufficient because Git history and external copies may retain it.

## Reportable findings and severity context

Please report suspected vulnerabilities involving unauthorized student-data access, privilege escalation, cross-school or cross-student data exposure, bypass of marks locking or approval, report disclosure, parent-account enumeration, credential leakage, missing server-side authorization, ineffective Row Level Security, audit-log tampering, or unsafe file/report handling.

Severity should reflect realistic reachability and impact. Unauthorized access to student records, staff privileges, private reports, production secrets, or the integrity of approved academic results is considered high impact.

## Known limitations

Application controls do not yet exist because the project is in its foundation stage. Before any real data is introduced, the implementation must complete threat modeling, authorization design, RLS verification, secure report-delivery testing, secrets scanning, dependency review, and abuse-case testing. No real student information may be used to compensate for missing test fixtures.

## Reporting a vulnerability

Do not open a public issue containing vulnerability details, personal data, credentials, or exploit material. Use the repository's private GitHub vulnerability-reporting or Security Advisory channel when available. If no private channel is enabled, contact the repository owner through an established private channel and disclose only the minimum information needed to coordinate a secure report.

Include the affected component, impact, reproduction conditions using synthetic data, and suggested remediation if known. Do not access, alter, or retain real student data while investigating.
