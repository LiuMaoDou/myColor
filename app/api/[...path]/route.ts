import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { asActor } from "@/lib/database";
import { workspaceOwner } from "@/server/workspace";
import {
  listResources,
  saveResource,
  readResource,
  mutateResource,
  organization,
  toInput,
} from "@/server/resources";
import { changeOrganization } from "@/server/organization";
import { exportData, importPreview, commitImport } from "@/server/imports";
import { AppError, requireCondition } from "@/server/errors";
import {
  cssVariables,
  formatColor,
  parseColorInput,
  exactColorKey,
} from "@/lib/color-core";
import { normalizeUrl } from "@/lib/validation";
import Papa from "papaparse";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const rate = new Map<string, { count: number; until: number }>();
function limit(key: string, max: number) {
  const now = Date.now();
  const old = rate.get(key);
  if (!old || old.until < now) {
    rate.set(key, { count: 1, until: now + 60000 });
  } else {
    old.count++;
    requireCondition(
      old.count <= max,
      "RATE_LIMIT",
      "请求过于频繁，请稍后再试",
      429,
    );
  }
  if (rate.size > 10000)
    for (const [k, v] of rate) if (v.until < now) rate.delete(k);
}
const respond = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
async function bodyOf(req: Request) {
  const text = await req.text();
  requireCondition(
    Buffer.byteLength(text) <= 6 * 1024 * 1024,
    "IMPORT_LIMIT_EXCEEDED",
    "请求过大",
    413,
  );
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new AppError("INVALID_JSON", "JSON 格式无效");
  }
}
async function handler(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { path } = await context.params;
    const method = req.method;
    const url = new URL(req.url);
    const write = !["GET", "HEAD"].includes(method);
    if (write) {
      const allowed = new Set([
        process.env.APP_ORIGIN || "http://localhost:3017",
        "http://127.0.0.1:3017",
      ]);
      requireCondition(
        allowed.has(req.headers.get("origin") || ""),
        "FORBIDDEN",
        "请求来源不受信任",
        403,
      );
      limit("workspace-write", 120);
    }
    if (path[0] === "health") return respond({ ok: true });
    if (path[0] === "auth") throw new AppError("NOT_FOUND", "接口不存在", 404);
    const publicOnly = path[0] === "public";
    const p = publicOnly ? path.slice(1) : path;
    if (publicOnly) {
      requireCondition(method === "GET", "FORBIDDEN", "公开接口为只读", 403);
      if (p[0] === "resources")
        return respond(
          p[1]
            ? await asActor(null, (tx) =>
                readResource(tx, z.uuid().parse(p[1]), true),
              )
            : await listResources(null, url.searchParams, true),
        );
      if (p[0] === "organization")
        return respond(await asActor(null, (tx) => organization(tx, null)));
      throw new AppError("NOT_FOUND", "接口不存在", 404);
    }
    const actor = await workspaceOwner();
    if (p[0] === "duplicates" && method === "GET") {
      const input = (url.searchParams.get("input") || "").slice(0, 2048);
      if (url.searchParams.get("type") === "website") {
        let normalized: string;
        try {
          normalized = normalizeUrl(input);
        } catch {
          return respond([]);
        }
        return respond(
          await asActor(
            actor,
            (tx) =>
              tx`SELECT r.id,r.title FROM resources r JOIN website_details w ON w.resource_id=r.id WHERE r.owner_id=${actor} AND r.deleted_at IS NULL AND w.normalized_url=${normalized} LIMIT 8`,
          ),
        );
      }
      const parsed = parseColorInput(
        input,
        url.searchParams.get("scale") === "unit" ? "unit" : undefined,
      );
      if (parsed.state !== "valid") return respond([]);
      return respond(
        await asActor(
          actor,
          (tx) =>
            tx`SELECT DISTINCT r.id,r.title FROM resources r JOIN resource_colors c ON c.resource_id=r.id WHERE r.owner_id=${actor} AND r.deleted_at IS NULL AND c.match_key=${exactColorKey(parsed.value)} LIMIT 8`,
        ),
      );
    }
    if (p[0] === "organization" && method === "GET")
      return respond(await asActor(actor, (tx) => organization(tx, actor)));
    if (["categories", "tags", "collections"].includes(p[0])) {
      if (method === "GET")
        return respond(
          (await asActor(actor, (tx) => organization(tx, actor)))[
            p[0] as "categories" | "tags" | "collections"
          ],
        );
      requireCondition(
        ["POST", "PATCH", "DELETE"].includes(method),
        "METHOD_NOT_ALLOWED",
        "不支持的方法",
        405,
      );
      const body = await bodyOf(req);
      await asActor(actor, (tx) =>
        changeOrganization(tx, actor, p[0], method, body, p[1]),
      );
      return respond(await asActor(actor, (tx) => organization(tx, actor)));
    }
    if (p[0] === "resources") {
      if (p[1] === "batch" && method === "POST") {
        const b = z
          .object({
            ids: z.array(z.uuid()).min(1).max(200),
            action: z.enum([
              "favorite",
              "delete",
              "archive",
              "restore",
              "categorize",
              "tag",
              "collect",
            ]),
            categoryIds: z.array(z.uuid()).optional(),
            tags: z.array(z.string().max(60)).optional(),
            collectionId: z.uuid().optional(),
          })
          .parse(await bodyOf(req));
        return respond(
          await asActor(actor, async (tx) => {
            for (const id of [...new Set(b.ids)]) {
              const r = await readResource(tx, id);
              if (b.action === "categorize" || b.action === "tag")
                await saveResource(
                  tx,
                  actor,
                  {
                    ...toInput(r),
                    expectedVersion: r.version,
                    categoryIds: b.categoryIds || r.categoryIds,
                    tags: b.tags
                      ? [...new Set([...r.tags, ...b.tags])]
                      : r.tags,
                  },
                  id,
                );
              else if (b.action === "collect") {
                requireCondition(
                  b.collectionId,
                  "INVALID_COLLECTION",
                  "请选择合集",
                );
                const [c] =
                  await tx`SELECT id FROM collections WHERE id=${b.collectionId} AND owner_id=${actor} FOR UPDATE`;
                requireCondition(c, "NOT_FOUND", "合集不存在", 404);
                await tx`INSERT INTO collection_items(collection_id,resource_id,position) SELECT ${b.collectionId},${id},COALESCE(max(position),-1)+1 FROM collection_items WHERE collection_id=${b.collectionId} ON CONFLICT(collection_id,resource_id) DO NOTHING`;
              } else
                await mutateResource(tx, actor, id, b.action, {
                  expectedVersion: r.version,
                  favorite: true,
                });
            }
            return { updated: new Set(b.ids).size };
          }),
        );
      }
      if (!p[1] && method === "GET")
        return respond(await listResources(actor, url.searchParams));
      if (!p[1] && method === "POST")
        return respond(
          await asActor(actor, async (tx) =>
            saveResource(tx, actor, await bodyOf(req)),
          ),
          201,
        );
      const id = z.uuid().parse(p[1]);
      if (method === "GET")
        return respond(await asActor(actor, (tx) => readResource(tx, id)));
      if (method === "PATCH" && !p[2]) {
        const body = await bodyOf(req);
        return respond(
          await asActor(actor, (tx) => saveResource(tx, actor, body, id)),
        );
      }
      const action = method === "DELETE" ? "delete" : p[2];
      requireCondition(
        ["publish", "unpublish", "favorite", "restore", "archive"].includes(
          action,
        ) || method === "DELETE",
        "NOT_FOUND",
        "接口不存在",
        404,
      );
      requireCondition(
        ["POST", "DELETE"].includes(method),
        "METHOD_NOT_ALLOWED",
        "不支持的方法",
        405,
      );
      const body = z
        .object({
          expectedVersion: z.number().int().optional(),
          favorite: z.boolean().optional(),
        })
        .parse(await bodyOf(req));
      return respond(
        await asActor(actor, (tx) =>
          mutateResource(tx, actor, id, action, body),
        ),
      );
    }
    if (p[0] === "imports" && method === "POST") {
      const body = await bodyOf(req);
      if (p[1] === "preview") {
        const b = z
          .object({ text: z.string(), format: z.enum(["json", "csv"]) })
          .parse(body);
        const preview = importPreview(b.text, b.format);
        return respond({
          hash: preview.hash,
          total: preview.total,
          valid: preview.valid,
          invalid: preview.invalid,
          rows: preview.rows.map(({ index, title, valid, error }) => ({
            index,
            title,
            valid,
            error,
          })),
        });
      }
      if (p[1] === "commit")
        return respond(
          await asActor(actor, (tx) => commitImport(tx, actor, body)),
        );
    }
    if (p[0] === "exports" && method === "POST") {
      limit("export:" + actor, 20);
      const b = z
        .object({
          format: z.enum(["json", "css", "text", "csv"]).default("json"),
          includeNotes: z.boolean().default(false),
          ids: z.array(z.uuid()).optional(),
        })
        .parse(await bodyOf(req));
      const data = await exportData(actor, b.includeNotes);
      if (b.ids)
        data.resources = data.resources.filter((r) => b.ids!.includes(r.id));
      const colors = data.resources.flatMap((r) => r.colors);
      let text = "",
        mime = "text/plain",
        extension = "txt";
      if (b.format === "json") {
        text = JSON.stringify(data, null, 2);
        mime = "application/json";
        extension = "json";
      } else if (b.format === "css") {
        text = cssVariables(colors);
        mime = "text/css";
        extension = "css";
      } else if (b.format === "csv") {
        const rows = data.resources.flatMap((r) =>
          (r.colors.length ? r.colors : [null]).map((c, i) => ({
            group_key: r.id,
            type: r.type,
            title: r.title,
            color_input: c?.input || "",
            color_position: i,
            color_role: c?.role || "",
            url: r.url,
            categories: r.categoryIds
              .map((id) => data.categories.find((x) => x.id === id)?.name || "")
              .join("|"),
            tags: r.tags.join("|"),
            description: r.description,
            source_url: r.sourceUrl,
          })),
        );
        text = Papa.unparse(rows, { escapeFormulae: true });
        mime = "text/csv";
        extension = "csv";
      } else text = colors.map((c) => formatColor(c.value)).join("\n");
      return new Response(text, {
        headers: {
          "Content-Type": `${mime}; charset=utf-8`,
          "Content-Disposition": `attachment; filename="color-atlas.${extension}"`,
          "Cache-Control": "no-store, private",
        },
      });
    }
    throw new AppError("NOT_FOUND", "接口不存在", 404);
  } catch (e) {
    if (e instanceof AppError)
      return respond(
        { error: { code: e.code, message: e.message }, requestId },
        e.status,
      );
    if (e instanceof ZodError)
      return respond(
        {
          error: {
            code: "INVALID_INPUT",
            message: e.issues
              .map((x) => x.message)
              .slice(0, 3)
              .join("；"),
          },
          requestId,
        },
        422,
      );
    if (e instanceof Error && "code" in e && e.code === "23505")
      return respond(
        {
          error: {
            code: "DUPLICATE_CANDIDATE",
            message: "名称已存在，请使用不同名称或合并标签",
          },
          requestId,
        },
        409,
      );
    console.error(
      "API error",
      requestId,
      e instanceof Error ? e.message : "unknown",
    );
    return respond(
      {
        error: {
          code: "SERVER_ERROR",
          message: "操作失败，请稍后重试；未确认保存的更改仍为本地草稿。",
        },
        requestId,
      },
      500,
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
