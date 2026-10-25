import "dotenv/config";
import { readFile } from "node:fs/promises";
import { sql } from "../lib/database";
import { seed } from "../server/seed";
async function main() {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz DEFAULT now())`;
  const applied =
    await sql`SELECT 1 FROM schema_migrations WHERE version='001'`;
  if (!applied.length)
    await sql.unsafe(await readFile("migrations/001_initial.sql", "utf8"));
  if (!(await sql`SELECT 1 FROM schema_migrations WHERE version='002'`).length)
    await sql.unsafe(
      await readFile("migrations/002_policy_helpers.sql", "utf8"),
    );
  if (!(await sql`SELECT 1 FROM schema_migrations WHERE version='003'`).length)
    await sql.unsafe(
      await readFile("migrations/003_ownership_guards.sql", "utf8"),
    );
  if (!(await sql`SELECT 1 FROM schema_migrations WHERE version='004'`).length)
    await sql.begin(async (tx) => {
      await tx.unsafe(
        await readFile("migrations/004_passwordless_workspace.sql", "utf8"),
      );
    });
  let [owner] = await sql`SELECT id FROM users ORDER BY created_at, id LIMIT 1`;
  if (!owner) {
    [owner] = await sql`INSERT INTO users DEFAULT VALUES RETURNING id`;
  }
  await seed(String(owner.id));
  console.log(
    "Database ready. Open the workspace directly; no username or password is needed.",
  );
  await sql.end();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
