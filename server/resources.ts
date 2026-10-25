import { asActor, type Tx } from "@/lib/database";
import { parseColorInput, exactColorKey } from "@/lib/color-core";
import { resourceSchema, normalizeUrl } from "@/lib/validation";
import type { Resource, Organization, ResourceInput } from "@/lib/types";
import { AppError, requireCondition } from "./errors";
const fields = `r.id,r.type,r.title,r.aliases,r.description,r.source_url AS "sourceUrl",r.source_kind AS "sourceKind",r.source_metadata AS "sourceMetadata",r.status,r.visibility,r.version,r.created_at AS "createdAt",r.updated_at AS "updatedAt",r.deleted_at AS "deletedAt",
 COALESCE((SELECT jsonb_agg(jsonb_build_object('input',c.value->>'originalInput','role',c.role,'label',c.label,'value',c.value) ORDER BY c.position) FROM resource_colors c WHERE c.resource_id=r.id),'[]') AS colors,
 COALESCE((SELECT original_url FROM website_details w WHERE w.resource_id=r.id),'') AS url,
 COALESCE((SELECT normalized_url FROM website_details w WHERE w.resource_id=r.id),'') AS "normalizedUrl",
 COALESCE((SELECT jsonb_agg(category_id ORDER BY is_primary DESC,category_id) FROM resource_categories WHERE resource_id=r.id),'[]') AS "categoryIds",
 COALESCE((SELECT jsonb_agg(t.name ORDER BY t.name) FROM tags t JOIN resource_tags rt ON rt.tag_id=t.id WHERE rt.resource_id=r.id),'[]') AS tags,
 COALESCE((SELECT is_favorite FROM user_resource_state WHERE resource_id=r.id AND user_id=atlas_actor()),false) AS favorite,
 (SELECT body FROM resource_private_notes WHERE resource_id=r.id) AS "privateNote",(SELECT rating FROM resource_private_notes WHERE resource_id=r.id) AS rating,
 COALESCE((SELECT jsonb_agg(collection_id) FROM collection_items WHERE resource_id=r.id),'[]') AS "collectionIds"`;
export function publicDto(r: Resource): Resource {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    aliases: r.aliases,
    description: r.description,
    sourceUrl: r.sourceUrl,
    sourceKind: r.sourceKind,
    sourceMetadata: {},
    status: r.status,
    visibility: r.visibility,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: null,
    colors: r.colors.map((c) => ({ ...c })),
    url: r.normalizedUrl,
    normalizedUrl: r.normalizedUrl,
    categoryIds: r.categoryIds,
    tags: r.tags,
    favorite: false,
  };
}
export async function readResource(tx: Tx, id: string, publicOnly = false) {
  const rows = await tx.unsafe<Resource[]>(
    `SELECT ${fields} FROM resources r WHERE r.id=$1 ${publicOnly ? "AND r.status='published' AND r.visibility='public' AND r.deleted_at IS NULL" : "AND r.owner_id=atlas_actor()"}`,
    [id],
  );
  requireCondition(rows[0], "NOT_FOUND", "资源不存在或不可访问", 404);
  return publicOnly ? publicDto(rows[0]) : rows[0];
}
export async function listResources(
  actor: string | null,
  params: URLSearchParams,
  publicOnly = false,
) {
  return asActor(actor, async (tx) => {
    const args: (string | number)[] = [];
    const arg = (v: string | number) => {
      args.push(v);
      return "$" + args.length;
    };
    const clauses = [
      publicOnly
        ? "r.status='published' AND r.visibility='public' AND r.deleted_at IS NULL"
        : "r.owner_id=atlas_actor()",
    ];
    if (!publicOnly)
      clauses.push(
        params.get("trash") === "true"
          ? "r.deleted_at IS NOT NULL"
          : "r.deleted_at IS NULL",
      );
    const type = params.get("type");
    if (type && ["color", "palette", "website"].includes(type))
      clauses.push(`r.type=${arg(type)}`);
    const visibility = params.get("visibility");
    if (visibility) clauses.push(`r.visibility=${arg(visibility)}`);
    const status = params.get("status");
    if (status) clauses.push(`r.status=${arg(status)}`);
    else if (!publicOnly && params.get("trash") !== "true")
      clauses.push("r.status<>'archived'");
    if (params.get("favorite") === "true")
      clauses.push(
        "EXISTS(SELECT 1 FROM user_resource_state s WHERE s.resource_id=r.id AND s.is_favorite AND s.user_id=atlas_actor())",
      );
    const category = params.get("category");
    if (category === "uncategorized")
      clauses.push(
        "NOT EXISTS(SELECT 1 FROM resource_categories rc WHERE rc.resource_id=r.id)",
      );
    else if (category)
      clauses.push(
        `EXISTS(SELECT 1 FROM resource_categories rc WHERE rc.resource_id=r.id AND rc.category_id IN (WITH RECURSIVE tree AS (SELECT id FROM categories WHERE id::text=${arg(category)} OR slug=${arg(category)} UNION ALL SELECT c.id FROM categories c JOIN tree ON c.parent_id=tree.id) SELECT id FROM tree))`,
      );
    const tag = params.get("tag");
    if (tag)
      clauses.push(
        `EXISTS(SELECT 1 FROM resource_tags rt JOIN tags t ON t.id=rt.tag_id WHERE rt.resource_id=r.id AND t.normalized_name=${arg(tag.toLowerCase())})`,
      );
    const collection = params.get("collection");
    if (collection)
      clauses.push(
        `EXISTS(SELECT 1 FROM collection_items ci WHERE ci.resource_id=r.id AND ci.collection_id::text=${arg(collection)})`,
      );
    const q = params.get("q")?.trim().slice(0, 200);
    if (q) {
      const p = parseColorInput(q);
      const like = arg("%" + q.replace(/[\\%_]/g, "\\$&") + "%");
      const color =
        p.state === "valid"
          ? ` OR EXISTS(SELECT 1 FROM resource_colors c WHERE c.resource_id=r.id AND c.match_key=${arg(exactColorKey(p.value))})`
          : "";
      clauses.push(
        `(r.title ILIKE ${like} OR array_to_string(r.aliases,' ') ILIKE ${like} OR r.description ILIKE ${like} OR EXISTS(SELECT 1 FROM website_details w WHERE w.resource_id=r.id AND w.normalized_url ILIKE ${like}) OR EXISTS(SELECT 1 FROM resource_tags rt JOIN tags t ON t.id=rt.tag_id WHERE rt.resource_id=r.id AND t.name ILIKE ${like}) OR EXISTS(SELECT 1 FROM resource_colors c WHERE c.resource_id=r.id AND c.value->'preview'->>'hex' ILIKE ${like}) ${color})`,
      );
    }
    const where = clauses.join(" AND ");
    const page = Math.max(1, Math.min(100000, Number(params.get("page")) || 1));
    const size = 48;
    const sort = params.get("sort");
    let order =
      sort === "name"
        ? "r.title ASC,r.id"
        : sort === "oldest"
          ? "r.created_at ASC,r.id"
          : "r.updated_at DESC,r.id";
    if (collection && sort === "manual")
      order = `(SELECT position FROM collection_items ci WHERE ci.resource_id=r.id AND ci.collection_id::text=${arg(collection)}) ASC,r.id`;
    const countArgs = [...args];
    const rows = await tx.unsafe<Resource[]>(
      `SELECT ${fields} FROM resources r WHERE ${where} ORDER BY ${order} LIMIT ${size} OFFSET ${(page - 1) * size}`,
      args,
    );
    const whereMax = [...where.matchAll(/\$(\d+)/g)].reduce(
      (n, m) => Math.max(n, +m[1]),
      0,
    );
    const [count] = await tx.unsafe<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM resources r WHERE ${where}`,
      countArgs.slice(0, whereMax),
    );
    return {
      resources: publicOnly ? rows.map(publicDto) : rows,
      total: Number(count.total),
      page,
      pageSize: size,
    };
  });
}
export function validatedInput(raw: unknown) {
  const data = resourceSchema.parse(raw);
  requireCondition(
    data.type === "website"
      ? data.colors.length === 0
      : data.type === "color"
        ? data.colors.length === 1
        : data.colors.length >= 2 && data.colors.length <= 24,
    "INVALID_COLOR",
    "单色需要 1 个颜色；色板需要 2–24 个颜色",
  );
  const colors = data.colors.map((c, i) => {
    const parsed = parseColorInput(c.input, c.scale);
    if (parsed.state !== "valid")
      throw new AppError(
        parsed.state === "ambiguous" ? "AMBIGUOUS_COLOR" : "INVALID_COLOR",
        `第 ${i + 1} 个颜色：${parsed.issues[0]}`,
      );
    return { ...c, value: parsed.value };
  });
  let url = "";
  try {
    url = data.type === "website" ? normalizeUrl(data.url) : "";
    if (data.sourceUrl) normalizeUrl(data.sourceUrl);
  } catch (error) {
    throw new AppError("INVALID_URL", (error as Error).message, 422);
  }
  return { data, colors, url };
}
export async function saveResource(
  tx: Tx,
  actor: string,
  raw: unknown,
  id?: string,
) {
  const { data, colors, url } = validatedInput(raw);
  if (id) {
    requireCondition(
      data.expectedVersion,
      "VERSION_CONFLICT",
      "缺少编辑版本",
      409,
    );
    const updated =
      await tx`UPDATE resources SET title=${data.title},aliases=${data.aliases},description=${data.description},source_url=${data.sourceUrl},source_kind=${data.sourceKind},source_metadata=${tx.json(data.sourceMetadata as never)},type=${data.type},version=version+1,updated_at=now() WHERE id=${id} AND owner_id=${actor} AND version=${data.expectedVersion} AND deleted_at IS NULL RETURNING id`;
    requireCondition(
      updated.length,
      "VERSION_CONFLICT",
      "此资源已在其他窗口更新。请重新载入后编辑。",
      409,
    );
  } else {
    const [r] =
      await tx`INSERT INTO resources(owner_id,type,title,aliases,description,source_url,source_kind,source_metadata) VALUES(${actor},${data.type},${data.title},${data.aliases},${data.description},${data.sourceUrl},${data.sourceKind},${tx.json(data.sourceMetadata as never)}) RETURNING id`;
    id = String(r.id);
  }
  await tx`DELETE FROM resource_colors WHERE resource_id=${id}`;
  await tx`DELETE FROM website_details WHERE resource_id=${id}`;
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    await tx`INSERT INTO resource_colors(resource_id,position,role,label,value,match_key) VALUES(${id},${i},${c.role},${c.label},${tx.json(c.value as never)},${exactColorKey(c.value)})`;
  }
  if (url)
    await tx`INSERT INTO website_details(resource_id,original_url,normalized_url) VALUES(${id},${data.url},${url})`;
  await tx`DELETE FROM resource_categories WHERE resource_id=${id}`;
  for (const [i, category] of [...new Set(data.categoryIds)].entries()) {
    const [owned] =
      await tx`SELECT id FROM categories WHERE id=${category} AND owner_id=${actor}`;
    requireCondition(owned, "FORBIDDEN", "分类不属于当前资源库", 403);
    await tx`INSERT INTO resource_categories(resource_id,category_id,is_primary) VALUES(${id},${category},${i === 0})`;
  }
  await tx`DELETE FROM resource_tags WHERE resource_id=${id}`;
  for (const name of [...new Set(data.tags.map((t) => t.trim()))]) {
    const [tag] =
      await tx`INSERT INTO tags(owner_id,name,normalized_name) VALUES(${actor},${name},${name.toLowerCase()}) ON CONFLICT(owner_id,normalized_name) DO UPDATE SET name=tags.name RETURNING id`;
    await tx`INSERT INTO resource_tags(resource_id,tag_id) VALUES(${id},${tag.id}) ON CONFLICT DO NOTHING`;
  }
  await tx`INSERT INTO resource_private_notes(resource_id,owner_id,body,rating) VALUES(${id},${actor},${data.privateNote},${data.rating ?? null}) ON CONFLICT(resource_id) DO UPDATE SET body=excluded.body,rating=excluded.rating`;
  return readResource(tx, id!);
}
export async function mutateResource(
  tx: Tx,
  actor: string,
  id: string,
  action: string,
  body: { expectedVersion?: number; favorite?: boolean },
) {
  const r = await readResource(tx, id);
  if (action === "favorite") {
    await tx`INSERT INTO user_resource_state(user_id,resource_id,is_favorite) VALUES(${actor},${id},${body.favorite ?? !r.favorite}) ON CONFLICT(user_id,resource_id) DO UPDATE SET is_favorite=excluded.is_favorite`;
    return readResource(tx, id);
  }
  requireCondition(
    body.expectedVersion === r.version,
    "VERSION_CONFLICT",
    "此资源已改变，请刷新后重试",
    409,
  );
  const status =
    action === "publish"
      ? "published"
      : action === "archive"
        ? "archived"
        : action === "unpublish"
          ? "draft"
          : r.status;
  const visibility =
    action === "publish"
      ? "public"
      : action === "unpublish"
        ? "private"
        : r.visibility;
  const rows =
    await tx`UPDATE resources SET status=${status},visibility=${visibility},deleted_at=${action === "delete" ? new Date() : action === "restore" ? null : r.deletedAt},published_at=${action === "publish" ? new Date() : null},updated_at=now(),version=version+1 WHERE id=${id} AND owner_id=${actor} AND version=${r.version} RETURNING id`;
  requireCondition(rows.length, "VERSION_CONFLICT", "保存冲突，请刷新", 409);
  await tx`INSERT INTO audit_events(actor_id,resource_id,action) VALUES(${actor},${id},${action})`;
  return readResource(tx, id);
}
export async function organization(
  tx: Tx,
  actor: string | null,
): Promise<Organization> {
  const categories =
    await tx`SELECT id,name,slug,parent_id AS "parentId" FROM categories ${actor ? tx`WHERE owner_id=${actor}` : tx``} ORDER BY name`;
  const tags =
    await tx`SELECT id,name FROM tags ${actor ? tx`WHERE owner_id=${actor}` : tx``} ORDER BY name`;
  const collections =
    await tx`SELECT c.id,c.name,c.description,c.visibility,COALESCE((SELECT jsonb_agg(ci.resource_id ORDER BY ci.position) FROM collection_items ci JOIN resources r ON r.id=ci.resource_id WHERE ci.collection_id=c.id AND r.deleted_at IS NULL ${actor ? tx`` : tx`AND r.status='published' AND r.visibility='public'`}), '[]') AS "resourceIds" FROM collections c ${actor ? tx`WHERE c.owner_id=${actor}` : tx`WHERE c.visibility='public'`} ORDER BY c.name`;
  return { categories, tags, collections } as unknown as Organization;
}
export function toInput(r: Resource): ResourceInput {
  return {
    type: r.type,
    title: r.title,
    aliases: r.aliases,
    description: r.description,
    sourceUrl: r.sourceUrl,
    sourceKind: r.sourceKind,
    sourceMetadata: r.sourceMetadata,
    colors: r.colors.map((c) => ({
      input: c.input,
      role: c.role,
      label: c.label,
      scale: c.value.inputScale,
    })),
    url: r.url,
    categoryIds: r.categoryIds,
    tags: r.tags,
    privateNote: r.privateNote || "",
    rating: r.rating,
  };
}
