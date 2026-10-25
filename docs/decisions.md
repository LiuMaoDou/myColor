# Implementation decisions

The supplied development plan is the product specification. Its embedded sample assistant prompt is illustrative; the implementation targets a usable local P0 release, with P1/P2 deferred.

- Next.js App Router, React, strict TypeScript, Tailwind, Radix/shadcn primitives, Culori 4.0.2 and Zod. Dependencies are locked in package-lock.json.
- Self-hosted development: isolated Docker PostgreSQL 17 on loopback port 54339; durable Docker volume. User update on 2026-10-25: no username or password. The app opens directly into a single-user workspace. Migration 004 retains the original owner ID and all resources while dropping credentials and sessions; authentication UI, endpoints and reset tooling were removed.
- Database access uses a restricted role and transaction-local actor context. All resource tables have RLS. Public-view reads use an explicit public DTO and public-only policy. The editable workspace itself requires no login. Notes remain in a separate table.
- UI: docs/design-concept.png. White main canvas; #f5f6f7 sidebar; #202832 text; #327a67 accent; 12px card radius; 24px grid gaps; 270px desktop sidebar (224px medium); 70px header; 40px content margins; system Chinese sans serif plus monospace values. Desktop three-column grid, two at medium widths, one on phones. Lucide 18px outline icons. Resource colors never change with shell theme.
- No automatic publishing, third-party fetching, uploads, AI, or P1/P2 dead controls.
- Browser skill/runtime is not installed in this session; use project Playwright for rendered verification.
