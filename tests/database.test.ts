import { beforeAll, afterAll, describe, it, expect } from "vitest";
import postgres from "postgres";
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
config({ quiet: true });
const original = process.env.DATABASE_URL!;
const testUrl = new URL(original);
testUrl.pathname = "/color_atlas_test";
process.env.DATABASE_URL = testUrl.toString();
let db: typeof import("../lib/database");
let service: typeof import("../server/resources");
let imports: typeof import("../server/imports");
let org: typeof import("../server/organization");
let a: string, b: string;
beforeAll(async () => {
  const admin = postgres(original, { max: 1 });
  try {
    await admin.unsafe("CREATE DATABASE color_atlas_test");
  } catch (e) {
    if ((e as { code: string }).code !== "42P04") throw e;
  }
  await admin.end();
  db = await import("../lib/database");
  service = await import("../server/resources");
  imports = await import("../server/imports");
  org = await import("../server/organization");
  await db.sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await db.sql.unsafe(await readFile("migrations/001_initial.sql", "utf8"));
  await db.sql.unsafe(
    await readFile("migrations/003_ownership_guards.sql", "utf8"),
  );
  await db.sql.begin(async (tx) => {
    await tx.unsafe(
      await readFile("migrations/004_passwordless_workspace.sql", "utf8"),
    );
  });
  const rows =
    await db.sql`INSERT INTO users(id) VALUES(gen_random_uuid()),(gen_random_uuid()) RETURNING id`;
  [a, b] = rows.map((r) => String(r.id));
});
afterAll(async () => {
  await db?.sql.end();
});
const create = (
  owner: string,
  title = "Test",
  colors = [{ input: "rgba(255,0,0,.5)", role: "primary" }],
) =>
  db.asActor(owner, (tx) =>
    service.saveResource(tx, owner, {
      type: colors.length > 1 ? "palette" : "color",
      title,
      colors,
      privateNote: "DO NOT EXPOSE",
    }),
  );
describe("real PostgreSQL persistence and authorization", () => {
  it("retains internal owners without credentials or sessions", async () => {
    const columns =
      await db.sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users'`;
    expect(columns.map((column) => column.column_name).sort()).toEqual([
      "created_at",
      "id",
    ]);
    const [tables] =
      await db.sql`SELECT to_regclass('public.sessions') AS sessions`;
    expect(tables.sessions).toBeNull();
    const { workspaceOwner } = await import("../server/workspace");
    expect([a, b]).toContain(await workspaceOwner());
  });
  it("saves source precision, returns private drafts, isolates users and anonymous child queries", async () => {
    const r = await create(a);
    expect(r.visibility).toBe("private");
    expect(r.colors[0].value.alpha).toBe(0.5);
    expect(
      (await db.asActor(a, (tx) => service.readResource(tx, r.id))).privateNote,
    ).toBe("DO NOT EXPOSE");
    await expect(
      db.asActor(b, (tx) => service.readResource(tx, r.id)),
    ).rejects.toThrow();
    const anonymous = await db.asActor(null, async (tx) => ({
      r: await tx`SELECT * FROM resources`,
      c: await tx`SELECT * FROM resource_colors`,
      n: await tx`SELECT * FROM resource_private_notes`,
    }));
    expect(anonymous.r).toHaveLength(0);
    expect(anonymous.c).toHaveLength(0);
    expect(anonymous.n).toHaveLength(0);
  });
  it("publishes only whitelisted fields and revokes immediately", async () => {
    let r = await create(a, "Public");
    r = await db.asActor(a, (tx) =>
      service.mutateResource(tx, a, r.id, "publish", {
        expectedVersion: r.version,
      }),
    );
    const pub = await db.asActor(null, (tx) =>
      service.readResource(tx, r.id, true),
    );
    expect(pub.visibility).toBe("public");
    expect(pub).not.toHaveProperty("privateNote");
    expect(pub).not.toHaveProperty("rating");
    expect(pub.sourceMetadata).toEqual({});
    await db.asActor(a, (tx) =>
      service.mutateResource(tx, a, r.id, "unpublish", {
        expectedVersion: r.version,
      }),
    );
    await expect(
      db.asActor(null, (tx) => service.readResource(tx, r.id, true)),
    ).rejects.toThrow();
  });
  it("rejects stale writes, soft deletes and restores with versions", async () => {
    let r = await create(a, "Conflict");
    const version = r.version;
    r = await db.asActor(a, (tx) =>
      service.saveResource(
        tx,
        a,
        { ...service.toInput(r), title: "Changed", expectedVersion: version },
        r.id,
      ),
    );
    await expect(
      db.asActor(a, (tx) =>
        service.saveResource(
          tx,
          a,
          { ...service.toInput(r), expectedVersion: version },
          r.id,
        ),
      ),
    ).rejects.toThrow("其他窗口");
    r = await db.asActor(a, (tx) =>
      service.mutateResource(tx, a, r.id, "delete", {
        expectedVersion: r.version,
      }),
    );
    expect(r.deletedAt).toBeTruthy();
    r = await db.asActor(a, (tx) =>
      service.mutateResource(tx, a, r.id, "restore", {
        expectedVersion: r.version,
      }),
    );
    expect(r.deletedAt).toBeNull();
  });
  it("does not allow cross-user associations or direct unauthorized writes", async () => {
    const [category] = await db.asActor(
      b,
      (tx) =>
        tx`INSERT INTO categories(owner_id,name,slug) VALUES(${b},'Secret','secret') RETURNING id`,
    );
    await expect(
      db.asActor(a, (tx) =>
        service.saveResource(tx, a, {
          type: "color",
          title: "Steal",
          colors: [{ input: "red" }],
          categoryIds: [category.id],
        }),
      ),
    ).rejects.toThrow();
    const r = await create(b, "Private B");
    const updated = await db.asActor(
      a,
      (tx) =>
        tx`UPDATE resources SET title='Intrusion' WHERE id=${r.id} RETURNING id`,
    );
    expect(updated).toHaveLength(0);
  });
  it("enforces color counts at database commit", async () => {
    await expect(
      db.asActor(
        a,
        (tx) =>
          tx`INSERT INTO resources(owner_id,type,title) VALUES(${a},'color','No colors')`,
      ),
    ).rejects.toThrow("Invalid color count");
  });
  it("searches Chinese keywords, tags, and equivalent colors", async () => {
    await db.asActor(a, (tx) =>
      service.saveResource(tx, a, {
        type: "color",
        title: "教育测试",
        colors: [{ input: "#ff0000" }],
        tags: ["蓝绿"],
      }),
    );
    expect(
      (
        await service.listResources(a, new URLSearchParams({ q: "教育" }))
      ).resources.some((r) => r.title === "教育测试"),
    ).toBe(true);
    expect(
      (
        await service.listResources(a, new URLSearchParams({ q: "蓝绿" }))
      ).resources.some((r) => r.title === "教育测试"),
    ).toBe(true);
    expect(
      (
        await service.listResources(
          a,
          new URLSearchParams({ q: "rgb(255 0 0)" }),
        )
      ).resources.some((r) => r.title === "教育测试"),
    ).toBe(true);
  });
  it("prevents category cycles and preserves resources on category deletion", async () => {
    await db.asActor(a, (tx) =>
      org.changeOrganization(tx, a, "categories", "POST", { name: "Parent" }),
    );
    let data = await db.asActor(a, (tx) => service.organization(tx, a));
    const parent = data.categories.find((c) => c.name === "Parent")!;
    await db.asActor(a, (tx) =>
      org.changeOrganization(tx, a, "categories", "POST", {
        name: "Child",
        parentId: parent.id,
      }),
    );
    data = await db.asActor(a, (tx) => service.organization(tx, a));
    const child = data.categories.find((c) => c.name === "Child")!;
    await expect(
      db.asActor(a, (tx) =>
        org.changeOrganization(
          tx,
          a,
          "categories",
          "PATCH",
          { name: "Parent", parentId: child.id },
          parent.id,
        ),
      ),
    ).rejects.toThrow("循环");
    await db.asActor(a, (tx) =>
      org.changeOrganization(tx, a, "categories", "DELETE", {}, parent.id),
    );
    expect(
      (
        await db.asActor(a, (tx) => service.organization(tx, a))
      ).categories.find((c) => c.id === child.id)?.parentId,
    ).toBeNull();
  });
  it("hides private members and counts in public collections", async () => {
    const hidden = await create(a, "Hidden member");
    let visible = await create(a, "Visible member");
    visible = await db.asActor(a, (tx) =>
      service.mutateResource(tx, a, visible.id, "publish", {
        expectedVersion: visible.version,
      }),
    );
    await db.asActor(a, (tx) =>
      org.changeOrganization(tx, a, "collections", "POST", {
        name: "Shared",
        visibility: "public",
        resourceIds: [hidden.id, visible.id],
      }),
    );
    const publicOrg = await db.asActor(null, (tx) =>
      service.organization(tx, null),
    );
    expect(
      publicOrg.collections.find((c) => c.name === "Shared")?.resourceIds,
    ).toEqual([visible.id]);
    await db.asActor(a, (tx) =>
      service.mutateResource(tx, a, visible.id, "unpublish", {
        expectedVersion: visible.version,
      }),
    );
  });
  it("backs up and restores into an empty owner, preserves relations and is idempotent", async () => {
    const colors = [
      { input: "rgb(12.34567 50 200 / .5)", role: "primary" },
      { input: "#fff", role: "background" },
    ];
    const r = await create(a, "Round trip", colors);
    await db.asActor(a, (tx) =>
      org.changeOrganization(tx, a, "collections", "POST", {
        name: "Roundtrip Collection",
        resourceIds: [r.id],
      }),
    );
    const backup = await imports.exportData(a, true);
    const [owner] = await db.sql`INSERT INTO users DEFAULT VALUES RETURNING id`;
    const ownerId = String(owner.id);
    const text = JSON.stringify(backup);
    const preview = imports.importPreview(text, "json");
    expect(preview.invalid).toBe(0);
    const body = {
      text,
      format: "json",
      hash: preview.hash,
      indices: preview.rows.map((r) => r.index),
      duplicates: "copy",
    };
    const result = await db.asActor(ownerId, (tx) =>
      imports.commitImport(tx, ownerId, body),
    );
    expect(result.imported).toBe(backup.resources.length);
    const again = await db.asActor(ownerId, (tx) =>
      imports.commitImport(tx, ownerId, body),
    );
    expect(again.alreadyImported).toBe(true);
    const restored = await imports.exportData(ownerId, true);
    const target = restored.resources.find((x) => x.title === "Round trip")!;
    expect(target.colors.map((c) => c.value)).toEqual(
      r.colors.map((c) => c.value),
    );
    expect(target.privateNote).toBe("DO NOT EXPOSE");
    expect(
      restored.collections.find((c) => c.name === "Roundtrip Collection")
        ?.resourceIds,
    ).toEqual([target.id]);
    expect(restored.resources.every((r) => r.visibility === "private")).toBe(
      true,
    );
  });
  it("rejects future import schemas and malformed CSV; flags partial invalid rows", () => {
    expect(() =>
      imports.importPreview(
        '{"schemaVersion":2,"product":"color-atlas","resources":[]}',
        "json",
      ),
    ).toThrow();
    const p = imports.importPreview(
      JSON.stringify({
        schemaVersion: 1,
        product: "color-atlas",
        resources: [
          { type: "color", title: "ok", colors: [{ input: "red" }] },
          { type: "color", title: "bad", colors: [{ input: "nope" }] },
        ],
      }),
      "json",
    );
    expect(p.valid).toBe(1);
    expect(p.invalid).toBe(1);
  });
});

describe("import ordering and association guards", () => {
  it("imports quoted CSV with ordered palette colors and category mapping", () => {
    const preview = imports.importPreview(
      'group_key,type,title,color_input,color_position,color_role,categories,tags\np,palette,"CSV, palette",blue,1,accent,教育,蓝绿\np,palette,"CSV, palette","rgb(255,0,0)",0,primary,教育,蓝绿',
      "csv",
    );
    expect(preview.invalid).toBe(0);
    expect(preview.rows[0].input!.colors.map((c) => c.input)).toEqual([
      "rgb(255,0,0)",
      "blue",
    ]);
    expect(preview.doc.categories[0].name).toBe("教育");
    expect(preview.rows[0].input!.categoryIds).toEqual([
      preview.doc.categories[0].id,
    ]);
  });
  it("rejects a direct cross-owner private-note association", async () => {
    const r = await create(b, "Note guard");
    await db.sql`DELETE FROM resource_private_notes WHERE resource_id=${r.id}`;
    await expect(
      db.asActor(
        a,
        (tx) =>
          tx`INSERT INTO resource_private_notes(owner_id,resource_id,body) VALUES(${a},${r.id},'malicious')`,
      ),
    ).rejects.toThrow("Cross-owner");
  });
  it("rejects a direct category cycle at commit", async () => {
    const [r] = await db.asActor(
      a,
      (tx) =>
        tx`INSERT INTO categories(owner_id,name,slug) VALUES(${a},'Cycle direct','cycle-direct') RETURNING id`,
    );
    await expect(
      db.asActor(
        a,
        (tx) => tx`UPDATE categories SET parent_id=id WHERE id=${r.id}`,
      ),
    ).rejects.toThrow("cycle");
  });
});
