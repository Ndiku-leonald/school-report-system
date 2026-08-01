# Student Management Testing

## Local prerequisites

Run the lockfile-managed Supabase CLI against the local Docker stack only:

```bash
npm ci
npm run db:start
npm run db:reset
```

Do not supply a hosted project reference or remote credentials. Every fixture
uses generated synthetic UUIDs, `.invalid` email identities and non-personal
names.

## Focused suites

```bash
npm run db:test
npm run test:students
npm run test:e2e:students
```

The pgTAP file `student_management.test.sql` covers direct-write denial, RPC
privileges and fixed search paths, normalized identity constraints, forced RLS,
private Storage policy structure, credential-table denial, canonical values and
no-physical-delete behavior.

The signed-in integration suite provisions school administrator, registrar,
head teacher, class teacher, subject teacher, mixed-school and revoked-role
identities. It uses anonymous-key clients for all product calls and a local
service client only to create disposable Auth fixtures. It validates admission,
concurrency, search, capacity authority, guardian privacy, assignment scope,
multi-school selection, audits, Storage policies and direct-write denial.

The 26-case Playwright suite covers the complete Stage 7 route story on desktop
and mobile, including accessible labels and keyboard focus. It must not be
silently skipped in CI. For merge-level stability, repeat the dedicated suite:

```bash
npm run test:e2e:students -- --repeat-each=5
```

## Full regression matrix

Run all existing Stage 4–7 checks:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run db:lint
npm run db:test
npm run db:types
git diff --exit-code -- src/types/database.generated.ts
npm run test:auth
npm run test:authorization
npm run test:academic-config
npm run test:students
npm run test:e2e:auth
npm run test:e2e:authorization
npm run test:e2e:academic-config
npm run test:e2e:students
```

Always stop the local stack after validation. Temporary Windows port workarounds
must be restored before staging; no local Docker state, browser output, secrets
or port configuration belongs in a commit.

The Stage 7 correction adds true concurrent signed-client cases for the final
class seat, competing class moves and primary-guardian replacement. It also
tests rollback lock release, administrator-only overrides, the global current
enrolment invariant, explicit reactivation, genuine later-year RPC/UI flows,
historical filters and assigned-teacher privacy, and real-versus-missing Storage
objects. The browser later-year test closes the prior enrolment through the
product workflow; it does not update it through a fixture shortcut.
