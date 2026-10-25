# Local acceptance — 2026-10-25

This is a working local implementation of the plan's core library flows. It is **not** a claim that all production M3 gates or P1/P2 milestones have been completed.

## Updated requirement: no login

The user requested a workspace without a username or password. Login/logout UI, credential verification, session endpoints and the password-reset command are removed. Migration 004 preserves owner IDs and resource relationships while deleting credential columns and the session table. The setup script opens a ready-to-use workspace. Original plan text remains unchanged as a historical specification. The running production build was restarted and verified without cookies. The original owner ID, all 27 resources and all 60 color records were unchanged; full resource and color row hashes matched before and after migration.

## Environment

- macOS host, Node 24.21.0; Next.js 16.4.3 / React 19.3.1; Culori 4.0.2.
- Isolated Docker PostgreSQL 17, durable volume; localhost:3017 production build.
- Playwright 1.64.1 using installed Google Chrome, desktop 1536 × 1024 and mobile emulation 390 × 844.
- Browser skill/runtime was not listed in this session. Project Playwright was used for local interaction, clipboard, console and screenshot verification. Browser Use's remote automation is a different surface and was not used to claim local-browser coverage.

## Automated checks

| Check | Result |
|---|---|
| Strict TypeScript | Pass |
| Prettier formatting | Pass |
| Production Next.js build | Pass |
| Vitest color / URL / PostgreSQL tests | 57 passed |
| Playwright end-to-end scenarios | 5 passed |
| Page identity, meaningful content, no framework overlay | Pass |
| Browser runtime console errors in primary flow | None observed |
| Desktop and phone-width screenshots | Inspected |
| Mobile horizontal overflow | None at 390px |
| npm dependency audit | 0 known advisories in the resolved dependency set at verification |
| PostgreSQL dump → new database → data comparison | Exact match |

### Behavioral evidence

1. Open directly without credentials → seeded library → copy HEX → switch global RGB → copy exactly the displayed value → search Chinese text → reload URL filters → force clipboard denial → manually selectable fallback → open and close mobile navigation.
2. New palette → mixed RGB alpha / HEX input → assign role → keyboard reorder → save → reload → edit description → save → reload → inspect persisted description, order and alpha → unauthorized public lookup rejected → public preview hides note → publish → anonymous public DTO excludes note and rating → revoke → anonymous lookup rejected immediately → soft delete → restore.
3. Contrast tool → black foreground / white background → 21:1 → category management → dark/light preference → JSON download with 27 resources, 4 categories, 3 collections and no private notes unless explicitly requested.
4. Manually save an unreachable website without fetching it → strip tracking query while preserving content query → reload persisted bookmark → import JSON containing one valid and one invalid item → preview and explicitly import the selected valid item → verify private visibility and alpha.

5. Fresh cookie-free API access succeeds; removed session/login/logout endpoints return 404 without setting cookies; cross-origin writes still return 403. Database schema contains neither credential columns nor a session table.

Tests cover T01–T12 and most local automated paths in T14–T28. They do not substitute for T13 or physical-device clipboard testing. Additional database tests verify two-user isolation, anonymous child-table protection, direct cross-owner association rejection, deferred color-count constraints, category-cycle rejection, public collection filtering, stale-write conflicts, import idempotency and restoration into an empty owner.

### Restore exercise

A PostgreSQL custom-format dump was restored into a newly created temporary database. The restored resources, color records, private-note records, categories, tags, collections, collection membership and category/tag relationships exactly matched the source snapshot. The temporary database was then removed. The source held 27 resources, 60 color records, 4 categories and 3 collections. A separate JSON restore test compared original source values, alpha, ordered roles, notes and collection relationships, with private visibility on import.

Temporary browser-test resources were removed. The development library contains the plan's 12 palettes and 15 websites, all private drafts.

## Visual comparison

Reference: [generated primary-screen concept](design-concept.png), produced with the built-in Image Gen tool. Both that image and the final browser images were opened with `view_image` and inspected at the native desktop/phone sizes.

| Comparison point | Result |
|---|---|
| White main canvas / neutral sidebar / restrained teal accent | Preserved |
| Sidebar, header, content alignment and three-column desktop grid | Matched to the concept's proportions |
| Heading, body text and fixed monospace color-value rows | Matched hierarchy; text sizing improved after screenshot review |
| Palette order, strip colors, white information region and card borders | Real plan data; values remain independent of shell theme |
| Quick input, filter controls, favorite and privacy indicators | Implemented as interactive controls |
| Mobile layout, visible color values and navigation | One-column cards, no horizontal overflow, focus-trapped drawer |

The implementation was visually verified against the generated concept. The core above-the-fold title, description, add action and filter copy match. Intentional differences are real data rather than generated mockup text: four initial categories and three collections; exact source HEX values; authoritative seed names/tags; and functional format, bulk-selection, organization controls. Account controls are removed per the updated request. No unplanned marketing content was added.

Material fixes during validation: recursive category/tag RLS policies; explicit conflict target for deferrable collection ordering; a missing bare-HEX explanation; mobile dialog centering inherited by the drawer; tiny-alpha formatting and high-precision snapshot handling. The drawer now uses an explicit left-aligned component variant, with a 40px close target.

## Remaining gates and scope

- Real macOS Safari / iPhone Safari clipboard success, denied permissions and native paste have **not** been tested. Firefox and WebKit have not been run.
- A real production domain, HTTPS, remote deployment and hosted provider setup remain unconfigured.
- No 10,000-resource / 50,000-color load benchmark or production-region latency measurements have been made.
- Source HTML / Markdown from the earlier atlas were not available in this workspace. The supplied plan's explicit 12-palette / 15-site tables are the seed source, with attribution retained.
- JSON import supports the versioned Color Atlas envelope and the supplied CSV contract. An arbitrary legacy HTML importer is not implemented; uploaded scripts are never executed.
- New-resource drafts are temporary browser session storage; this is not offline synchronization. Failed writes do not show successful persistence.
- Public collection and resource visibility reset to private on import. Audit history and internal owner IDs is restored by PostgreSQL backup, not by application JSON.
- P1/P2 features, including image extraction, gradients, expiring share tokens, full publishing revisions and AI, are deferred. No fake controls advertise them as working.
