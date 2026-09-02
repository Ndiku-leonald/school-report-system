# Stage 15 parent and guardian report portal

The parent portal is a separate, no-index route under `/parent`. It uses a
custom credential and session boundary; it does not use Supabase Auth and it
does not expose the Supabase client to parent pages.

## Credential lifecycle

Staff with `STUDENTS_MANAGE` can issue, reset, or revoke a student credential
from the student detail page. Issuance requires an active guardian relationship
with `student_guardians.can_access_reports = true`. A credential is generated
inside one database transaction, its lookup value is stored as a SHA-256 hash,
and its random eight-digit PIN is stored as a bcrypt hash. The plaintext code
and PIN are returned to staff once and are never displayed by a later request.

Reset rotates the credential and revokes sessions using the old credential.
Revoke disables the active credential and all of its sessions. These staff
operations are audited without secrets.

## Session and login boundary

`POST /parent/api/session` accepts only an access code and PIN. Access-code
separators are normalized at the edge, while the lookup hash is recomputed
server-side. A successful login sets the raw session token only in the
HttpOnly `parent-report-session` cookie; the database stores only its SHA-256
hash. The cookie is scoped to `/parent`, uses `SameSite=Lax`, is Secure in
production, and has a two-hour absolute lifetime. Database validation applies a
30-minute idle timeout and rechecks credential state and guardian eligibility on
every request.

Login responses are generic. Persistent transactional throttling is keyed by a
keyed hash of a transient client signal; no raw IP is persisted. Five wrong
PIN attempts lock the credential for fifteen minutes, and the shared rate
limit is sixty requests per fifteen-minute window. Logout revokes the server
session and clears the cookie.

## Report and artifact policy

Parents may see only the verified student’s current `PUBLISHED` reports and
historical reports that are `SUPERSEDED` and have a non-null `published_at`.
Withdrawn, generated, reviewed, never-published, or other students’ reports
are denied. Detail data is derived from the immutable report snapshot and is
parent-safe: it excludes date of birth, gender, photo paths, guardian contacts,
internal IDs, and staff-only data.

The download endpoint authorizes the report again, reads only the registered
private Stage 14 artifact, checks the PDF signature, byte size, and SHA-256
checksum, records the access only after verification, and returns a private
`no-store` response. It never creates a preview, regenerates a report, or
returns a public Storage URL.

## Configuration

Set `PARENT_ACCESS_RATE_LIMIT_SECRET` to a server-only value of at least 32
bytes. It is used to key the persistent login throttle and must not be exposed
as a `NEXT_PUBLIC_*` variable.

## Verification

The repository keeps the previous suites and adds:

- `npm run test:parent-portal`
- `npm run test:parent-portal:concurrency`
- `npm run test:e2e:parent-portal`

The local integration wrappers require the Supabase local stack. Browser tests
use Playwright traces on failure and must be run against the local, synthetic
dataset; no production credentials or real student data belong in fixtures.
