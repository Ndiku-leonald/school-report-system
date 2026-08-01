# Contributing

## Workflow

1. Start from the latest reviewed default branch.
2. Create a focused feature branch with a descriptive name.
3. Keep the branch limited to one feature, fix, or documentation concern.
4. Commit in small, coherent units with descriptive commit messages.
5. Open a pull request and obtain review before merging.

Do not commit directly to the production branch without review. Do not mix unrelated cleanup or feature work into a branch.

## Quality checks

Before requesting a merge, run every formatting, linting, type-checking, testing, and build command supported by the repository. Record any skipped or failing check in the pull request rather than claiming it passed.

For application and database changes, run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:auth
npm run test:authorization
npm run test:academic-config
npm run build
npm run test:e2e
npm run test:e2e:auth
npm run test:e2e:authorization
npm run test:e2e:academic-config
npm run db:reset
npm run db:lint
npm run db:test
npm run db:types
```

## Database changes

All database changes must be represented by version-controlled Supabase migrations. Do not maintain a duplicate ORM schema or make undocumented production-only schema changes. Migrations should be reviewable, reversible where practical, and tested through a local reset using synthetic data before deployment.

Regenerate and commit `src/types/database.generated.ts` after schema changes. Never reset a remote project. Link or push only after confirming the intended non-production project and reviewing its migration status. See [docs/local-supabase-development.md](docs/local-supabase-development.md).

Authentication integration and authenticated browser tests require the local
Supabase stack. Use synthetic `.invalid` identities only. Administrative Auth
scripts must retain their remote-project guard, must not print tokens or keys,
and must never be imported by client code.

## Architecture and security

- Document significant architectural decisions and material tradeoffs.
- Enforce authorization on the server and in database policies, not only in the interface.
- Change the Stage 5 permission enum or `role_permissions` matrix only through
  reviewed migrations. Never copy permissions into editable user metadata.
- Run `npm run test:authorization` and
  `npm run test:e2e:authorization` for authorization changes; keep fixtures
  local, synthetic, and scoped to `.invalid` identities.
- Academic configuration changes must preserve migration order, direct-write
  denial, selected-membership scoping, expected-version checks, atomic audits,
  and historical immutability. Run both academic configuration test commands.
- Never commit secrets, real student records, parent credentials, or private reports.
- Treat `.env.example` as a variable-name template only.
- Keep business rules configurable; do not hard-code school identity, subjects, classes, streams, grading, aggregates, assessment weights, promotion thresholds, or report-card layout.
- Follow [SECURITY.md](SECURITY.md) and update relevant documentation when behavior changes.

## Pull-request expectations

A pull request should explain its purpose, affected workflows, verification performed, database or environment changes, security implications, and any follow-up work. Screenshots or test evidence should use synthetic data only.

For student-management changes, run `npm run test:students` and
`npm run test:e2e:students` in addition to every retained suite. Preserve the
guardian-contact privacy boundary, selected-school isolation, direct-write
denial, photo-bucket privacy, concurrency tokens and exact audit behavior.
Never use parent credential/session tables as part of Stage 7. Temporary local
port mappings and Playwright output must be restored or removed before staging.
