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
npm run build
npm run test:e2e
npm run db:reset
npm run db:lint
npm run db:test
npm run db:types
```

## Database changes

All database changes must be represented by version-controlled Supabase migrations. Do not maintain a duplicate ORM schema or make undocumented production-only schema changes. Migrations should be reviewable, reversible where practical, and tested through a local reset using synthetic data before deployment.

Regenerate and commit `src/types/database.generated.ts` after schema changes. Never reset a remote project. Link or push only after confirming the intended non-production project and reviewing its migration status. See [docs/local-supabase-development.md](docs/local-supabase-development.md).

## Architecture and security

- Document significant architectural decisions and material tradeoffs.
- Enforce authorization on the server and in database policies, not only in the interface.
- Never commit secrets, real student records, parent credentials, or private reports.
- Treat `.env.example` as a variable-name template only.
- Keep business rules configurable; do not hard-code school identity, subjects, classes, streams, grading, aggregates, assessment weights, promotion thresholds, or report-card layout.
- Follow [SECURITY.md](SECURITY.md) and update relevant documentation when behavior changes.

## Pull-request expectations

A pull request should explain its purpose, affected workflows, verification performed, database or environment changes, security implications, and any follow-up work. Screenshots or test evidence should use synthetic data only.
