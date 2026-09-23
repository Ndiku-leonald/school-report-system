# Monitoring, Logging and Alerting

Audit date: 2026-09-23 (Africa/Kampala)

This document is the Stage 18G operating boundary. It records what is implemented in the
repository, what can be observed on the current no-cost hosted plans, what requires later
configuration or a paid feature, and what must wait until real traffic establishes a baseline.
It contains no credentials, tokens, student data, report data, or production log exports.

## 1. Stage 18G scope

The scope is monitoring, logging, alerting, privacy-safe diagnostics, and an operator response
runbook. It does not authorize deployment, hosted migration application, production traffic,
synthetic production requests, paid upgrades, paid log drains, a new migration, or PR merge.

## 2. Current implementation status

| Control                          | State now                                                             | Boundary                                            |
| -------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| Production application           | Not deployed                                                          | Stage 18M or later                                  |
| Supabase application schema/data | Empty                                                                 | Stage 18E remains the migration owner               |
| Vercel project/deployment        | Not created                                                           | Stage 18M remains the deployment owner              |
| Application error logging        | Implemented with `console.error` event text and bounded fields        | Review before each release                          |
| Raw exception-message logging    | Removed from report-artifact materialization                          | No exception messages in application logs           |
| Liveness endpoint                | Implemented at `GET /api/health`                                      | Liveness only; it does not prove database readiness |
| Structured logging policy        | Documented below                                                      | A later logger/transport may implement it           |
| Correlation/request ID           | Database audit field exists; application-wide correlation is deferred | Configure at deployment/observability stage         |
| Supabase Studio logs/reports     | Available after hosted schema and traffic exist                       | Free-plan retention is short                        |
| Vercel Runtime Logs              | Available after a deployment exists                                   | Hobby retention is short                            |
| Alert notifications              | Not configured                                                        | Requires an approved destination and owner          |
| Paid log drains/PITR             | Not enabled                                                           | Requires explicit budget approval                   |

## 3. Production snapshot

The intended Supabase project is `school-report-system`, ref `fpixtedanpbmjnmzrumo`, in
`eu-central-1`, on Free plan with Nano compute. Read-only verification found an active healthy
project but zero application migrations, public application tables, Auth users, Storage buckets,
or Storage objects. The Vercel team is on Hobby plan and has no project or deployment for this
application. Therefore there is no production traffic baseline and no production log sample to
claim as evidence.

## 4. Observability model

Use three layers with separate responsibilities:

1. Application logs explain a failed request or server action without recording secrets or
   personal payloads.
2. Supabase logs, Reports, Auth audit logs, and the immutable application `public.audit_logs`
   table explain hosted database, API, Auth, Storage, and business-control events.
3. Vercel Runtime Logs and later Web Analytics/Speed Insights explain deployment and web-runtime
   behavior.

No layer is a substitute for the others. A zero-event dashboard is not proof of health, and a
successful liveness response is not proof that Auth, database, Storage, or report generation is
healthy.

## 5. Application logging policy

Every new server-side error log must use a stable event name and a small allow-list of fields:

```text
level=error
event=<stable snake_case or stable title>
route_or_operation=<fixed route/action/RPC name>
error_code=<bounded provider/application code when available>
error_type=<constructor name only when needed>
request_id=<trusted bounded correlation ID when available>
```

Allowed values are status/error codes, fixed operation names, booleans, bounded durations,
opaque UUIDs when needed to locate an audit record, and resource categories such as `profile` or
`memberships`. Do not log request bodies, form data, cookies, Authorization headers, access
codes, PINs, password-reset values, signed URLs, service-role keys, SQL, raw provider messages,
student names, guardian contacts, marks, report JSON, or unrestricted URLs.

The repository currently uses stable `console.error` calls rather than a logging dependency. This
is intentional for the no-dependency Stage 18G change. A future structured logger may emit JSON
with the same allow-list; adding a logger package is not a Stage 18G requirement.

## 6. Logging audit result

The production-reachable error sites in the application feature areas were inspected. They log
fixed event text plus Supabase error codes, operation names, resource categories, or an opaque
report ID. The report-artifact route previously logged `Error.message`; Stage 18G changes it to
log only `errorType`. Test scripts and local invitation tooling may print diagnostics to their
own console, but are not production request paths.

Any future log review must treat a new raw `error`, `Error.message`, request object, response
object, query result, or form/body value as a release blocker until it is reduced to the safe
allow-list.

## 7. Correlation and request identity

The database audit schema includes a validated UUID `request_id` field, and the staff audit
writer accepts a UUID from `x-request-id`. This supports linking selected staff audit events
when a trusted upstream supplies that header. It is not yet an application-wide trace system.

After deployment, choose one trusted request/correlation convention, document whether the platform
ID or an application-generated ID is authoritative, and propagate it through API routes and
server actions. Do not trust arbitrary client-supplied IDs for security decisions. Log only a
bounded ID and never echo it with secrets or private payloads.

## 8. Error response policy

Public and parent-facing failures must remain generic. The audited API routes return generic
messages for invalid report IDs, unavailable artifacts, failed PDF generation, rejected parent
requests, and invalid authentication flows. Authentication actions intentionally use generic
sign-in and password-recovery responses to reduce account enumeration.

Diagnostic detail belongs in privacy-safe server logs or the appropriate audit record, not in a
browser response, redirect query string, HTML error page, or PDF response.

## 9. Authentication callbacks and recovery

The callback accepts only a PKCE code paired with exactly one signed invitation or recovery state
and rejects an attacker-supplied `next` parameter. The confirmation route accepts only the
allow-listed `invite` and `recovery` OTP types. Callback `code`, `token_hash`, signed flow state,
and recovery proof values are transient credentials and must never be logged.

The application redirects invalid flows to a generic error page, clears sessions/cookies on
failed binding, and stores the recovery proof in an HttpOnly cookie. Auth provider audit logs are
the future hosted source for sign-in, sign-out, recovery, token, and MFA events.

## 10. Parent portal access

Parent login sends the access code and eight-digit PIN in a bounded JSON body, hashes the access
code before the RPC, applies database-backed rate limiting, and returns the same generic failure
message for invalid credentials and provider failure. Success creates a private, HttpOnly,
same-site session cookie scoped to `/parent`; credentials are not placed in the URL.

Parent report pages use an opaque report UUID in the path and check the server-side session before
reading data. Logout checks same-origin behavior and revokes the server-side session. Do not add
access codes, PINs, session tokens, student data, or report JSON to logs, analytics URLs, or
support screenshots.

## 11. Student photos and Storage URLs

The intended `student-photos` bucket is private. The application requests a signed URL for a
student photo for 120 seconds and does not construct a public bucket URL. Signed URLs are bearer
credentials for their short lifetime and must not be logged or persisted in analytics.

The intended `report-artifacts` bucket is also private and is accessed server-side. Storage
provider logs and application logs must retain only the event category, safe error code/type, and
an opaque object/report identifier when an operator needs to correlate a failure.

## 12. Report pages, PDFs, and artifacts

Report PDF and artifact routes validate UUID path parameters, use private/no-store response
headers, and return generic error responses. The report ID may be logged only when needed to
locate a failed artifact; it is not a secret, but it is still school data context and should not
be copied into external alert messages. Artifact responses expose only the intended descriptor
fields; they do not expose raw database errors.

## 13. Business audit trail

The immutable `public.audit_logs` table is the business audit trail, not a replacement for
operational logs. Existing database functions record staff authentication, configuration,
student, teaching-assignment, marks, results, publication, and parent-artifact access events as
appropriate. Policies restrict who can read the audit trail and prevent updates/deletes.

Audit records may contain actor, school, entity, reason, request ID, IP address, and user agent
where the existing control requires them. Treat this as sensitive personal/security data; it
must not be copied into ordinary application logs or broad analytics exports.

## 14. Supabase logs available now

After the project has application schema and traffic, Supabase Studio Logs can be filtered by
API Gateway, Postgres, Auth, Storage, PostgREST, Edge Function, Realtime, and pooler sources,
with level/status/method/path/message/user filters. CSV/JSON export is limited to an operator
investigation and must be stored privately.

The Free plan is suitable for initial manual diagnosis, not long-term centralized retention.
Use narrow time windows and avoid repeated polling because Logs Explorer queries consume scanned
log volume.

## 15. Supabase Reports and Auth audit logs

Supabase Reports provide Database, Auth, Storage, Realtime, and API views. On the current Free
capability set, the useful time ranges include the last 10 minutes, 30 minutes, 60 minutes,
3 hours, and 24 hours; a 7/14/28-day operational dashboard is not assumed.

Supabase Auth audit logs are automatically captured for authentication events such as sign-in,
sign-out, recovery, password changes, token operations, and MFA events. Optional database
storage in `auth.audit_log_entries` is a separate decision and must be reviewed for retention,
privacy, and query cost before enabling it.

## 16. Supabase platform audit and alert boundaries

Supabase platform audit logs are not a Free-plan control; they are associated with Team and
Enterprise capabilities. Detection checks are starting alert policies, not guarantees: a missing
window or missing permission can be “unable to assess,” and zero events does not prove healthy
operation.

The first operational review after traffic exists should manually inspect API 5xx, Auth failures,
Storage failures, Postgres errors, and database resource signals in narrow windows. Production
alert automation must wait for an approved notification owner and destination.

## 17. Supabase 5xx investigation query

When the hosted project has traffic, use the documented Logs Explorer/SQL form with an explicit
bounded UTC window no longer than 24 hours. A safe starting shape is:

```sql
select timestamp, id,
  toInt32OrZero(log_attributes['response.status_code']) as status,
  log_attributes['request.path'] as path
from logs
where source = 'edge_logs'
  and timestamp >= toDateTime('YYYY-MM-DD HH:MM:SS')
  and timestamp < toDateTime('YYYY-MM-DD HH:MM:SS')
  and toInt32OrZero(log_attributes['response.status_code']) between 500 and 599
order by timestamp desc
limit 100;
```

Use explicit columns and a small limit. Do not use `select *`, unbounded windows, or broad
`count(*)` scans. Redact or restrict any exported path, referer, user-agent, or event message
before sharing it.

## 18. Supabase Free-plan limits and paid boundary

Current planning assumptions from official plan documentation:

| Capability            | Free-plan position                          | Stage 18G decision            |
| --------------------- | ------------------------------------------- | ----------------------------- |
| Studio logs/reports   | Available with short retention/time windows | Use manually after traffic    |
| Auth audit logs       | Available with limited retention            | Review during Auth stage      |
| Platform audit logs   | Not included                                | Do not enable or budget now   |
| Log drains            | Not included; paid Pro add-on               | Do not configure              |
| Metrics endpoint      | Not included in the current Free matrix     | Do not assume it exists       |
| PITR/managed recovery | Not enabled                                 | Stage 18F policy gate remains |

No paid Supabase feature, compute upgrade, log drain, or external monitoring bill is authorized
by this stage.

## 19. Vercel Runtime Logs

After a deployment exists, Vercel Runtime Logs cover Functions and routing middleware and can be
filtered in the dashboard by time and level. The CLI equivalent for a known deployment is
`vercel logs <deployment-url> --level error --since 1h`; the URL and output must be handled as
operationally sensitive.

The application must continue to emit safe server-side event fields so that Vercel is a transport
and viewer, not a reason to log more data. Build logs and runtime logs have different retention
and should not be treated as the same evidence.

## 20. Vercel Hobby limits

Vercel Hobby runtime logs are short-lived (approximately one hour in the current documentation)
and capped in the plan's retained rows. Hobby includes limited Web Analytics and Speed Insights
allowances, but those products are not enabled or installed in Stage 18G. A later operator must
decide whether analytics is appropriate for a school-record application and must exclude sensitive
routes and identifiers.

## 21. Vercel drains and paid observability

Vercel Log Drains are not available for this Hobby-only, not-yet-created project; the documented
drain capability is for Pro/Enterprise. Supabase drains likewise require a paid capability. Do not
paste credentials into a drain URL, purchase an upgrade, or configure a third-party sink as part
of Stage 18G.

## 22. Health endpoint

The repository now provides `GET /api/health`, returning `{ "status": "ok" }` with `no-store`
and `nosniff` headers. It is a liveness endpoint only: it does not query Supabase, Auth, Storage,
or application data, so it cannot prove readiness. A future deployment may use it for process and
routing checks, while a separate protected readiness check must be designed if database readiness
is required.

## 23. Alert policy after deployment

The first alert set should be small and actionable:

| Signal                  | Initial review/alert idea                                                              | Response                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| API/runtime 5xx         | Any sustained non-zero rate after a deployment; set a numeric threshold after baseline | Inspect Vercel and Supabase logs; pause rollout if correlated                  |
| Auth failures           | Sudden increase over the established school-day baseline                               | Check Auth logs, callbacks, redirect/config changes, and abuse indicators      |
| Parent login 429s       | Repeated bursts or sustained rate-limit activity                                       | Check abuse, client-IP behavior, and credential issuance; do not weaken limits |
| Storage failures        | Any sustained photo/artifact failure                                                   | Check private bucket, policy, object, and service error without exposing URL   |
| Database errors/latency | Sustained failures or resource saturation                                              | Inspect narrow Supabase windows and stop risky writes if needed                |
| Health endpoint         | Repeated non-2xx/timeouts from an approved checker                                     | Check deployment, routing, and platform status; it is not a DB-ready signal    |

No fixed percentage or page target is claimed before traffic. Thresholds must be recorded with
window, owner, timezone, notification destination, and a test result after a baseline exists.

## 24. Incident response runbook

1. Record UTC/Africa-Kampala time, deployed SHA, affected route, school impact, and operator.
2. Preserve the narrowest relevant Vercel/Supabase evidence without exporting secrets or private
   student/report payloads.
3. Decide whether to pause a rollout, disable a feature through an approved control, or keep
   service open while investigating. Do not reset or mutate production to clear an alert.
4. Correlate runtime events with `request_id`, platform IDs, application audit events, and the
   deployment SHA where available.
5. Contain credential or privacy incidents first: rotate/revoke through the approved process and
   preserve evidence.
6. Repair forward, verify with the relevant test suite, and record start/end times, impact, and
   follow-up work.

## 25. Privacy, retention, and access

Logs may contain IP addresses, user agents, paths, provider codes, and opaque IDs. Access is
limited to the operator and authorized maintainers. Do not put log exports in GitHub issues, PRs,
chat, public buckets, or screenshots. Redact URLs with query strings and all bearer values before
sharing evidence.

Free-plan retention is not a school records retention policy. The school owner must approve the
retention, access review, deletion, and legal/privacy handling of operational logs and audit
records before real student data is created.

## 26. Activation checklist for a later stage

Do not perform this checklist in Stage 18G. It is the controlled handoff for deployment and
traffic stages:

```text
[ ] Create/link the approved Vercel project without deploying during this stage.
[ ] Apply migrations only under Stage 18E controls and verify schema/RLS/grants.
[ ] Configure the final canonical HTTPS origin and Auth redirects.
[ ] Confirm private Storage buckets and no public student/report URLs.
[ ] Verify /api/health from the approved deployment path.
[ ] Define a protected readiness check if one is required.
[ ] Select the alert owner, escalation path, timezone, and notification destination.
[ ] Record the initial error/latency/traffic baseline after approved traffic exists.
[ ] Configure only no-cost plan capabilities unless a paid decision is recorded.
[ ] Test one alert path with synthetic/non-sensitive evidence.
[ ] Review logs for secret, credential, student, guardian, and report leakage.
[ ] Document the first operational review and unresolved launch gates.
```

## 27. Acceptance and next-stage boundary

Stage 18G work completed in this repository:

- production and branch state re-verified without deployment or hosted mutation;
- Supabase and Vercel monitoring capabilities checked against official documentation;
- production-reachable logs and sensitive URL/body paths audited;
- raw report-artifact exception-message logging removed;
- generic API/auth/parent error behavior preserved;
- dependency and migration counts unchanged;
- no production users, data, buckets, objects, log drains, or paid features created;
- dependency-free liveness endpoint added and unit-tested; and
- this no-credentials monitoring runbook created.

The final acceptance decision belongs to the final-head CI result and the explicit Stage 18G
report. Stage 18H must not start automatically. PR #16 must remain open and unmerged until the
operator separately authorizes that action.

## References

- [Supabase Logs](https://supabase.com/docs/guides/observability/logs)
- [Supabase advanced log filtering](https://supabase.com/docs/guides/observability/advanced-log-filtering)
- [Supabase log field reference](https://supabase.com/docs/guides/observability/log-field-reference)
- [Supabase Reports](https://supabase.com/docs/guides/observability/reports)
- [Supabase Auth audit logs](https://supabase.com/docs/guides/auth/audit-logs)
- [Supabase platform audit logs](https://supabase.com/docs/guides/security/platform-audit-logs)
- [Supabase log drains](https://supabase.com/features/log-drains)
- [Supabase pricing](https://supabase.com/pricing)
- [Vercel Runtime Logs](https://vercel.com/docs/logs/runtime)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [Vercel Drains](https://vercel.com/docs/drains)
- [Vercel limits](https://vercel.com/docs/limits)
