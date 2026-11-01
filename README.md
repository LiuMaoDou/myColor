# 色集 · Color Atlas

A personal color workspace built from [the supplied development plan](docs/development-plan.md). It collects individual colors, ordered palettes and website bookmarks with inline adding, search and editing.

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
- Simple color / palette creation and editing with an optional name, a one-line color input and a pure color preview on its right. Save directly; multiple colors become a palette. Website bookmarks are added from the Websites library. Existing metadata is preserved on edit.
- Add colors directly from the library: click Add or press Enter to save without opening a dialog or editor. An optional name field follows the color input; a blank name defaults to the entered color data. The library refreshes immediately and keeps search, sorting and batch deletion.
- Chinese / English / color search, resource-type filters and 48-resource pagination.
- PostgreSQL RLS and version-conflict detection. The sidebar contains only the library, colors, palettes and websites. Tools, import/export pages, settings, favorites, public sharing, collections, categories, tags, archive and recycle-bin interfaces are retired; old feature URLs return to the library. Public and favorite actions are disabled.
- Existing local display preferences are honored; copy format remains available in the toolbar.

## Stack and architecture

[Next.js](https://nextjs.org/docs), React, strict TypeScript, Tailwind, [shadcn/ui](https://ui.shadcn.com/docs) components, [Culori](https://culorijs.org/api/), Zod, PostgreSQL, Vitest and Playwright. See [decisions](docs/decisions.md).

`lib/color-core` is shared by client and server. All writes pass through same-origin APIs into transactional services. Every resource request uses a restricted database role with a transaction-local owner identity. The server resolves the existing workspace owner internally; there are no accounts to sign into, session cookies or stored application passwords.

This implementation uses the plan's self-hosted option: local PostgreSQL and a passwordless single-user workspace, per the user's updated requirement. The server binds to loopback by default. Anyone who can reach the server can use its workspace; public sharing endpoints are disabled.

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
