import { z } from "zod";
import type { Tx } from "@/lib/database";
import { requireCondition } from "./errors";
const id = z.uuid();
const name = z.string().trim().min(1).max(100);
export async function changeOrganization(
  tx: Tx,
  actor: string,
  kind: string,
  method: string,
  raw: unknown,
  entityId?: string,
) {
  if (entityId) id.parse(entityId);
  if (kind === "categories") {
    const b = z
      .object({
        name: name.optional(),
        parentId: id.nullable().optional(),
        targetId: id.nullable().optional(),
      })
      .parse(raw);
    await tx`SELECT pg_advisory_xact_lock(hashtext(${actor}))`;
    if (method === "DELETE") {
      if (b.targetId)
        requireCondition(
          b.targetId !== entityId,
          "INVALID_CATEGORY",
          "不能移入当前分类",
        );
      const [c] =
        await tx`SELECT id FROM categories WHERE id=${entityId!} AND owner_id=${actor}`;
      requireCondition(c, "NOT_FOUND", "分类不存在", 404);
      if (b.targetId) {
        const [target] =
          await tx`SELECT id FROM categories WHERE id=${b.targetId} AND owner_id=${actor}`;
        requireCondition(target, "NOT_FOUND", "目标分类不存在", 404);
        await tx`INSERT INTO resource_categories(resource_id,category_id) SELECT resource_id,${b.targetId} FROM resource_categories WHERE category_id=${entityId!} ON CONFLICT DO NOTHING`;
      }
      await tx`DELETE FROM categories WHERE id=${entityId!} AND owner_id=${actor}`;
      return;
    }
    if (b.parentId) {
      const [p] =
        await tx`SELECT id FROM categories WHERE id=${b.parentId} AND owner_id=${actor}`;
      requireCondition(p, "FORBIDDEN", "父分类不可访问", 403);
    }
    if (entityId) {
      const rows =
        await tx`UPDATE categories SET name=COALESCE(${b.name ?? null},name),parent_id=${b.parentId ?? null} WHERE id=${entityId} AND owner_id=${actor} RETURNING id`;
      requireCondition(rows.length, "NOT_FOUND", "分类不存在", 404);
    } else {
      requireCondition(b.name, "INVALID_NAME", "请输入分类名称");
      await tx`INSERT INTO categories(owner_id,name,slug,parent_id) VALUES(${actor},${b.name},${crypto.randomUUID()},${b.parentId ?? null})`;
    }
    const tree = await tx<
      { id: string; parent_id: string | null }[]
    >`SELECT id,parent_id FROM categories WHERE owner_id=${actor}`;
    const parents = new Map(tree.map((c) => [c.id, c.parent_id]));
    for (const c of tree) {
      let current: string | null = c.id;
      const seen = new Set<string>();
      while (current) {
        requireCondition(
          !seen.has(current),
          "CATEGORY_CYCLE",
          "分类不能形成循环",
        );
        seen.add(current);
        requireCondition(seen.size <= 3, "CATEGORY_DEPTH", "分类最多支持三级");
        current = parents.get(current) || null;
      }
    }
    return;
  }
  if (kind === "tags") {
    const b = z
      .object({ name: name.optional(), targetId: id.optional() })
      .parse(raw);
    if (method === "DELETE") {
      await tx`DELETE FROM tags WHERE id=${entityId!} AND owner_id=${actor}`;
      return;
    }
    if (b.targetId) {
      requireCondition(
        b.targetId !== entityId,
        "INVALID_TAG",
        "请选择不同的目标标签",
      );
      const owned =
        await tx`SELECT id FROM tags WHERE id IN (${entityId!},${b.targetId}) AND owner_id=${actor}`;
      requireCondition(owned.length === 2, "NOT_FOUND", "标签不存在", 404);
      await tx`INSERT INTO resource_tags(resource_id,tag_id) SELECT resource_id,${b.targetId} FROM resource_tags WHERE tag_id=${entityId!} ON CONFLICT DO NOTHING`;
      await tx`DELETE FROM tags WHERE id=${entityId!} AND owner_id=${actor}`;
      return;
    }
    requireCondition(b.name, "INVALID_NAME", "请输入标签名称");
    if (entityId)
      await tx`UPDATE tags SET name=${b.name},normalized_name=${b.name.toLowerCase()} WHERE id=${entityId} AND owner_id=${actor}`;
    else
      await tx`INSERT INTO tags(owner_id,name,normalized_name) VALUES(${actor},${b.name},${b.name.toLowerCase()}) ON CONFLICT DO NOTHING`;
    return;
  }
  if (kind === "collections") {
    const b = z
      .object({
        name: name.optional(),
        description: z.string().max(5000).optional(),
        visibility: z.enum(["private", "public"]).optional(),
        resourceIds: z.array(id).max(2000).optional(),
      })
      .parse(raw);
    if (method === "DELETE") {
      await tx`DELETE FROM collections WHERE id=${entityId!} AND owner_id=${actor}`;
      return;
    }
    if (entityId) {
      const rows =
        await tx`UPDATE collections SET name=COALESCE(${b.name ?? null},name),description=COALESCE(${b.description ?? null},description),visibility=COALESCE(${b.visibility ?? null},visibility) WHERE id=${entityId} AND owner_id=${actor} RETURNING id`;
      requireCondition(rows.length, "NOT_FOUND", "合集不存在", 404);
    } else {
      requireCondition(b.name, "INVALID_NAME", "请输入合集名称");
      const [c] =
        await tx`INSERT INTO collections(owner_id,name,description,visibility) VALUES(${actor},${b.name},${b.description || ""},${b.visibility || "private"}) RETURNING id`;
      entityId = String(c.id);
    }
    if (b.resourceIds) {
      await tx`DELETE FROM collection_items WHERE collection_id=${entityId!}`;
      for (const [i, rid] of [...new Set(b.resourceIds)].entries()) {
        const [r] =
          await tx`SELECT id FROM resources WHERE id=${rid} AND owner_id=${actor} AND deleted_at IS NULL`;
        requireCondition(r, "FORBIDDEN", "合集包含不可访问的资源", 403);
        await tx`INSERT INTO collection_items(collection_id,resource_id,position) VALUES(${entityId!},${rid},${i})`;
      }
    }
    return;
  }
}
