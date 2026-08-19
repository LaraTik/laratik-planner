# Migration and deployment evidence

## Baseline findings

- Deployment runs independently from the CI quality workflow.
- The production runner image does not provide a reliable migration runtime.
- `scripts/deploy.sh` explicitly continues when migration fails.
- Production health reports version `0.0.0` and checks database reachability rather than schema readiness.

## Required deployment sequence

1. CI quality, database, browser, security and image jobs pass.
2. Build and publish an immutable SHA-tagged app image and matching migrator.
3. Verify disk space and encrypted backup.
4. Run the migrator; abort on any failure.
5. Deploy the app image.
6. Check schema readiness, app health and release SHA.
7. Run authenticated smoke tests.
8. Monitor the release; roll back the image on failure and execute only the documented compatible database rollback.

## Evidence table

| Gate                   | Commit/image | Command or run | Result  | Operator/date |
| ---------------------- | ------------ | -------------- | ------- | ------------- |
| From-zero migration    | —            | —              | Pending | —             |
| In-place upgrade       | —            | —              | Pending | —             |
| Backup verification    | —            | —              | Pending | —             |
| Disposable restore     | —            | —              | Pending | —             |
| Failed migration abort | —            | —              | Pending | —             |
| Release health/version | —            | —              | Pending | —             |
| Rollback drill         | —            | —              | Pending | —             |
