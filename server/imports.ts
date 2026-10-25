import Papa from "papaparse";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import type { Tx } from "@/lib/database";
import type {
  Resource,
  ResourceInput,
  Category,
  Collection,
} from "@/lib/types";
import {
  listResources,
  organization,
  toInput,
  validatedInput,
  saveResource,
} from "./resources";
import { requireCondition } from "./errors";
export interface Backup {
  schemaVersion: 1;
  product: "color-atlas";
  exportedAt: string;
  resources: Resource[];
  categories: Category[];
  tags: { id: string; name: string }[];
  collections: Collection[];
}
export async function exportData(actor: string, includeNotes = false) {
  const resources: Resource[] = [];
  for (let page = 1; ; page++) {
    const result = await listResources(
      actor,
      new URLSearchParams({ page: String(page), status: "" }),
    );
    resources.push(...result.resources);
    if (resources.length >= result.total) break;
  }
  for (const state of ["archived", "trash"]) {
    for (let page = 1; ; page++) {
      const result = await listResources(
        actor,
        new URLSearchParams({
          ...(state === "archived"
            ? { status: "archived" }
            : { trash: "true" }),
          page: String(page),
        }),
      );
      resources.push(...result.resources);
      if (page * 48 >= result.total) break;
    }
  }
  const { asActor } = await import("@/lib/database");
  const org = await asActor(actor, (tx) => organization(tx, actor));
  return {
    schemaVersion: 1,
    product: "color-atlas",
    exportedAt: new Date().toISOString(),
    resources: resources.map((r) => {
      if (includeNotes) return r;
      const copy = { ...r };
      delete copy.privateNote;
      delete copy.rating;
      return copy;
    }),
    ...org,
  } as Backup;
}
export function decodeImport(text: string, format: string) {
  requireCondition(
    Buffer.byteLength(text) <= 5 * 1024 * 1024,
    "IMPORT_LIMIT_EXCEEDED",
    "文件最多 5 MB",
    413,
  );
  if (format === "csv") {
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: "greedy",
    });
    requireCondition(
      !parsed.errors.length,
      "INVALID_CSV",
      parsed.errors[0]?.message || "CSV 解析失败",
    );
    const groups = new Map<string, ResourceInput>();
    const categories = new Map<
      string,
      { id: string; name: string; slug: string; parentId: null }
    >();
    const positions = new Map<string, Map<number, number>>();
    for (const [i, row] of parsed.data.entries()) {
      const key = row.group_key || `row-${i}`;
      if (!groups.has(key))
        groups.set(key, {
          type: (row.type || "color") as ResourceInput["type"],
          title: row.title || row.color_input || row.url,
          description: row.description || "",
          url: row.url || "",
          colors: [],
          tags: (row.tags || "").split("|").filter(Boolean),
          sourceUrl: row.source_url || "",
          categoryIds: (row.categories || "")
            .split("|")
            .filter(Boolean)
            .map((name) => {
              if (!categories.has(name))
                categories.set(name, {
                  id: randomUUID(),
                  name,
                  slug: name,
                  parentId: null,
                });
              return categories.get(name)!.id;
            }),
        });
      const group = groups.get(key)!;
      if (row.color_input) {
        if (!positions.has(key)) positions.set(key, new Map());
        const position = row.color_position
          ? Number(row.color_position)
          : group.colors.length;
        requireCondition(
          Number.isInteger(position) &&
            position >= 0 &&
            !positions.get(key)!.has(position),
          "INVALID_CSV",
          "颜色序号无效或重复",
        );
        positions.get(key)!.set(position, group.colors.length);
        group.colors.push({
          input: row.color_input,
          role: row.color_role || "",
          label: "",
        });
      }
    }
    return {
      schemaVersion: 1,
      product: "color-atlas",
      resources: [...groups.entries()].map(([key, group]) => ({
        ...group,
        colors: positions.has(key)
          ? [...positions.get(key)!.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([, index]) => group.colors[index])
          : [],
      })),
      categories: [...categories.values()],
      tags: [],
      collections: [],
    };
  }
  const data = JSON.parse(text);
  requireCondition(
    data.schemaVersion === 1 && data.product === "color-atlas",
    "UNSUPPORTED_SCHEMA",
    "只支持 Color Atlas schemaVersion 1",
  );
  return data;
}
const documentSchema = z.object({
  schemaVersion: z.literal(1),
  product: z.literal("color-atlas"),
  resources: z.array(z.unknown()).max(2000),
  categories: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().min(1).max(100),
        slug: z.string().max(150),
        parentId: z.uuid().nullable(),
      }),
    )
    .max(1000)
    .default([]),
  tags: z
    .array(z.object({ id: z.uuid(), name: z.string().min(1).max(60) }))
    .max(5000)
    .default([]),
  collections: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().min(1).max(100),
        description: z.string().max(5000),
        visibility: z.enum(["private", "public"]),
        resourceIds: z.array(z.uuid()).max(2000),
      }),
    )
    .max(1000)
    .default([]),
});
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export function importPreview(text: string, format: string) {
  const doc = documentSchema.parse(decodeImport(text, format));
  const rows = doc.resources.map((raw, index) => {
    try {
      const data = raw as Resource;
      const input = data.colors?.some((c) => "value" in c)
        ? toInput(data)
        : raw;
      const checked = validatedInput(input);
      return {
        index,
        title: checked.data.title,
        valid: true,
        error: "",
        input: checked.data,
        original: raw,
      };
    } catch (e) {
      return {
        index,
        title: `第 ${index + 1} 项`,
        valid: false,
        error: e instanceof Error ? e.message : "无效资源",
        input: null,
        original: raw,
      };
    }
  });
  return {
    hash: hash(text),
    total: rows.length,
    valid: rows.filter((r) => r.valid).length,
    invalid: rows.filter((r) => !r.valid).length,
    rows,
    doc,
  };
}
export async function commitImport(tx: Tx, actor: string, body: unknown) {
  const b = z
    .object({
      text: z.string(),
      format: z.enum(["json", "csv"]),
      hash: z.string(),
      indices: z.array(z.number().int().nonnegative()).max(2000),
      duplicates: z.enum(["skip", "copy"]).default("skip"),
    })
    .parse(body);
  const preview = importPreview(b.text, b.format);
  requireCondition(
    preview.hash === b.hash,
    "IMPORT_CHANGED",
    "文件在预览后发生变化，请重新预览",
  );
  requireCondition(b.indices.length > 0, "EMPTY_IMPORT", "请勾选要导入的项目");
  const key = hash(
    b.hash + JSON.stringify([...b.indices].sort()) + b.duplicates,
  );
  await tx`SELECT pg_advisory_xact_lock(hashtext(${actor + key}))`;
  const [done] =
    await tx`SELECT result FROM import_jobs WHERE owner_id=${actor} AND source_hash=${key}`;
  if (done) return { ...done.result, alreadyImported: true };
  const catMap = new Map<string, string>();
  const resourceMap = new Map<string, string>();
  for (const c of preview.doc.categories) {
    const [row] =
      await tx`INSERT INTO categories(owner_id,name,slug) VALUES(${actor},${c.name},${c.slug}) ON CONFLICT(owner_id,slug) DO UPDATE SET name=categories.name RETURNING id`;
    catMap.set(c.id, String(row.id));
  }
  for (const c of preview.doc.categories) {
    if (c.parentId) {
      requireCondition(
        catMap.has(c.parentId),
        "INVALID_CATEGORY",
        "导入分类父节点不存在",
      );
      let parent: string | null = c.id;
      const seen = new Set<string>();
      while (parent) {
        requireCondition(
          !seen.has(parent) && seen.size < 3,
          "INVALID_CATEGORY",
          "导入分类存在循环或超过三级",
        );
        seen.add(parent);
        parent =
          preview.doc.categories.find((x) => x.id === parent)?.parentId || null;
      }
      await tx`UPDATE categories SET parent_id=${catMap.get(c.parentId)!} WHERE id=${catMap.get(c.id)!}`;
    }
  }
  let imported = 0,
    skipped = 0;
  for (const index of [...new Set(b.indices)]) {
    const row = preview.rows[index];
    requireCondition(
      row?.valid && row.input,
      "INVALID_IMPORT",
      "选中的项目含错误，请重新预览",
    );
    const original = row.original as Partial<Resource>;
    const data = {
      ...row.input,
      categoryIds: row.input.categoryIds
        .map((c) => catMap.get(c))
        .filter((c): c is string => !!c),
    };
    let existing: string | undefined;
    if (b.duplicates === "skip") {
      const candidates = await tx<
        { id: string }[]
      >`SELECT id FROM resources WHERE owner_id=${actor} AND type=${data.type} AND title=${data.title}`;
      const { readResource } = await import("./resources");
      for (const c of candidates) {
        const r = await readResource(tx, c.id);
        if (
          JSON.stringify(r.colors.map((v) => v.input)) ===
            JSON.stringify(data.colors.map((v) => v.input)) &&
          r.url === data.url
        ) {
          existing = c.id;
          break;
        }
      }
    }
    if (existing) {
      skipped++;
      if (original.id) resourceMap.set(original.id, existing);
      continue;
    }
    const r = await saveResource(tx, actor, data);
    if (original.id) resourceMap.set(original.id, r.id);
    if (original.favorite)
      await tx`INSERT INTO user_resource_state(user_id,resource_id,is_favorite) VALUES(${actor},${r.id},true)`;
    if (original.deletedAt)
      await tx`UPDATE resources SET deleted_at=${original.deletedAt} WHERE id=${r.id}`;
    if (original.status === "archived")
      await tx`UPDATE resources SET status='archived' WHERE id=${r.id}`;
    imported++;
  }
  for (const t of preview.doc.tags)
    await tx`INSERT INTO tags(owner_id,name,normalized_name) VALUES(${actor},${t.name},${t.name.toLowerCase()}) ON CONFLICT DO NOTHING`;
  for (const c of preview.doc.collections) {
    const [collection] =
      await tx`INSERT INTO collections(owner_id,name,description) VALUES(${actor},${c.name},${c.description}) RETURNING id`;
    let position = 0;
    for (const rid of c.resourceIds) {
      const mapped = resourceMap.get(rid);
      if (mapped)
        await tx`INSERT INTO collection_items(collection_id,resource_id,position) VALUES(${collection.id},${mapped},${position++}) ON CONFLICT(collection_id,resource_id) DO NOTHING`;
    }
  }
  const result = {
    imported,
    skipped,
    invalid: preview.invalid,
    notSelected: preview.total - new Set(b.indices).size,
  };
  await tx`INSERT INTO import_jobs(owner_id,source_hash,result) VALUES(${actor},${key},${tx.json(result)})`;
  return result;
}
