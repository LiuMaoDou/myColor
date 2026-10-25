import { z } from "zod";
export const resourceSchema = z.object({
  type: z.enum(["color", "palette", "website"]),
  title: z.string().trim().min(1, "请输入名称").max(200),
  aliases: z.array(z.string().max(200)).max(20).default([]),
  description: z.string().max(5000).default(""),
  sourceUrl: z.string().max(2048).default(""),
  sourceKind: z.string().max(100).default("manual"),
  sourceMetadata: z.record(z.string(), z.unknown()).default({}),
  colors: z
    .array(
      z.object({
        input: z.string().min(1).max(512),
        role: z.string().max(80).default(""),
        label: z.string().max(100).default(""),
        scale: z.enum(["unit", "byte"]).optional(),
      }),
    )
    .max(24),
  url: z.string().max(2048).default(""),
  categoryIds: z.array(z.uuid()).max(20).default([]),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  privateNote: z.string().max(10000).default(""),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  expectedVersion: z.number().int().positive().optional(),
});
export function normalizeUrl(raw: string) {
  if (/[\x00-\x20\x7f]/.test(raw))
    throw new Error("网址不能包含空白或控制字符");
  let u: URL;
  try {
    u = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    throw new Error("请输入有效网址");
  }
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    !u.hostname.includes(".")
  )
    throw new Error("只接受无嵌入凭据的 HTTP/HTTPS 网址");
  for (const key of [...u.searchParams.keys()])
    if (/^utm_|^(fbclid|gclid|msclkid)$/i.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  return u.toString();
}
