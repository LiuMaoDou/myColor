# Deployment, backup and recovery

## Current verified environment

The app is local to this Mac at `http://localhost:3017`; the database is an isolated Docker PostgreSQL 17 instance. No public domain or remote hosting has been deployed. The `.env` connection string remains server-only. The workspace opens directly without a username, password or session cookie. Everyone who can reach this server can access the editable workspace; the default server binding is loopback.

## Local operation

```bash
npm ci
npm run setup
npm run build
npm run start
```

`npm run setup` is safe to rerun: existing environment values, internal owner IDs and initialized seed resources are preserved. Docker database data survives container/app restarts. Keep Docker Desktop running. `npm run db:stop` stops only this project's database. Do not use `docker compose down -v` unless intentionally destroying this database.


## Backups

In the app, open Settings → Import / Export and download JSON. Enable the explicit private-note option when those fields should be included. JSON includes original inputs, high-precision computed data, alpha, roles, aliases, source metadata, categories, tags, collections and favorites. Import revalidates all original color inputs and remaps IDs to the workspace owner. Published resources and collections become private; inspect and republish explicitly.

JSON is an application-data migration format. Internal owner IDs, audit history and import-job history belong to the database backup and are not exported by the app. For a consistent full PostgreSQL snapshot:

```bash
mkdir -p backups
chmod 700 backups
docker compose exec -T db pg_dump -U atlas -d color_atlas -Fc > backups/color-atlas.dump
chmod 600 backups/color-atlas.dump
```

Store copies outside the Docker volume and encrypt/offsite them as appropriate. Backups can contain private notes. No automatic backup schedule or 30-day trash purge is configured.

Restore a PostgreSQL dump into a **new** test database first:

```bash
docker compose exec -T db createdb -U atlas color_atlas_restore
docker compose exec -T db pg_restore -U atlas -d color_atlas_restore --no-owner < backups/color-atlas.dump
```

Never use destructive restore options against the active library without first verifying its backup. The automated JSON restore test uses a new empty owner in an isolated test database and compares colors, alpha, notes and collection membership.

## Production gate

1. Choose and provision an authorized Node hosting environment and PostgreSQL service. The included Docker configuration is for local development.
2. Set `DATABASE_URL`, `APP_ORIGIN=https://your-domain`; configure TLS and a trusted reverse proxy. Keep the database and application secrets private.
3. Apply tracked migrations using an administrative connection, then run the same permission tests against a separate staging database. The application currently sets a restricted role per resource transaction; do not expose its administrative connection to a browser or direct client.
4. Choose network access appropriate for a passwordless workspace. The public resource view filters publication fields, but does not restrict access to the editable workspace.
5. Set up process supervision, backups, retention and recovery ownership. The rate limiter is process-local, suitable for the current single-process app; scale-out needs a shared limiter.
6. Test all app and database paths through the real HTTPS domain. Test clipboard success and denial on actual macOS Safari and iPhone Safari. Automated Chrome checks do not replace those gates.
7. Benchmark the plan's 10,000-resource dataset and short Chinese queries. No production latency / throughput target is claimed from the small local seed library.

P1/P2 need separate scoped development and verification. No unbounded URL fetcher, file-upload endpoint, unlisted-sharing policy, or AI service was added.
