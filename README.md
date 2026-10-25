# 色集 · Color Atlas

A personal color workspace built from [the supplied development plan](docs/development-plan.md). It collects individual colors, ordered palettes and website bookmarks with a shared search, organization, publishing and backup workflow.

**Local app:** [http://localhost:3017](http://localhost:3017)  
**Open directly:** no username, password or login is required. Existing resources stay in the same single-user workspace.

## Run

Requirements: Node.js 22+ and Docker Desktop running.

```bash
npm ci
npm run setup
npm run dev
```

`setup` creates a local `.env` only when absent, starts the isolated PostgreSQL container, applies migrations, creates an internal workspace identity and imports the 12 palettes / 15 bookmarks as private drafts. It does not alter the existing Sub2API containers.

For the production build:

```bash
npm run build
npm run start
```

The app listens on loopback port **3017**. PostgreSQL listens on loopback port **54339** and persists in Docker volume `mycolor_atlas_pgdata`. To stop the database without deleting data, run `npm run db:stop`.

## Included

- Live parsing of HEX/HEX8, RGB/RGBA, HSL/HSLA, HSV/HSB, CSS names and explicit RGB triples; original input, source coordinates and alpha preserved.
- Current-format swatch copying, keyboard access and a manual-copy dialog when permission is denied.
- Persistent color / palette / website create and edit flows, roles, drag and keyboard ordering, single-color snapshots, duplicate warnings and palette copies.
- Categories with a three-level tree, tag merging, ordered mixed-resource collections, favorites, batch organization, archive, recycle and restore.
- Chinese / English / color search, combinable URL filters and 48-resource pagination.
- Explicit public preview / publish / revoke, separate private notes and ratings, PostgreSQL RLS and version-conflict detection.
- JSON / CSV import preview with selected valid rows and idempotency; JSON / CSV / CSS / text export. JSON restoration preserves source colors and relationships; imported publication state is intentionally reset to private.
- Color conversion and alpha-aware WCAG contrast tools; light / dark shell and compact / comfortable density.

## Stack and architecture

[Next.js](https://nextjs.org/docs), React, strict TypeScript, Tailwind, [shadcn/ui](https://ui.shadcn.com/docs) components, [Culori](https://culorijs.org/api/), Zod, PostgreSQL, Vitest and Playwright. See [decisions](docs/decisions.md).

`lib/color-core` is shared by client and server. All writes pass through same-origin APIs into transactional services. Every resource request uses a restricted database role with a transaction-local owner identity. Public responses use an explicit whitelist. The server resolves the existing workspace owner internally; there are no accounts to sign into, session cookies or stored application passwords.

This implementation uses the plan's self-hosted option: local PostgreSQL and a passwordless single-user workspace, per the user's updated requirement. The server binds to loopback by default. Anyone who can reach the server can use its workspace; the public view remains a separate, filtered presentation of published resources.

## Verification

```bash
npm run format:check
npm run typecheck
npm test
npm run build
# With npm run start running in another terminal:
npm run test:e2e
```

Database tests create and reset only the dedicated `color_atlas_test` database. Browser tests use temporary resources in the local development library and clean them up. Playwright uses installed Google Chrome on macOS and Chromium in CI.

Read [acceptance and remaining work](docs/acceptance.md) and [deployment / backup / recovery](docs/deployment.md). Production HTTPS, real Safari/iPhone verification and large-dataset performance gates remain outstanding. P1/P2 roadmap items such as image extraction, gradients, share tokens and AI are not presented as available features.
