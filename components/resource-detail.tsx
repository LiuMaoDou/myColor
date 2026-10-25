"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Copy,
  Globe,
  Lock,
  Heart,
  Pencil,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { api, downloadExport, type Preferences } from "@/lib/client";
import { formatColor, cssVariables } from "@/lib/color-core";
import type { Resource, Organization } from "@/lib/types";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Swatch } from "./swatch";
import { useCopy } from "./clipboard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
export function ResourceDetail({
  resource: r,
  org,
  preferences,
  publicOnly,
  onRefresh,
}: {
  resource: Resource;
  org: Organization;
  preferences: Preferences;
  publicOnly: boolean;
  onRefresh: () => void;
}) {
  const router = useRouter(),
    copy = useCopy(),
    [publish, setPublish] = useState(false),
    [busy, setBusy] = useState(false),
    [collection, setCollection] = useState("");
  async function action(name: string) {
    setBusy(true);
    try {
      await api(`/resources/${r.id}${name === "delete" ? "" : "/" + name}`, {
        method: name === "delete" ? "DELETE" : "POST",
        body: { expectedVersion: r.version, favorite: !r.favorite },
      });
      toast.success(
        name === "publish"
          ? "已公开发布"
          : name === "unpublish"
            ? "已撤回为私有草稿"
            : "已更新资源",
      );
      setPublish(false);
      onRefresh();
      if (name === "delete") router.push("/library?trash=true");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="detail-page">
      <Button
        variant="ghost"
        onClick={() => router.push(publicOnly ? "/explore" : "/library")}
      >
        <ArrowLeft />
        返回资源库
      </Button>
      <div className="section-heading">
        <div>
          <h1>{r.title}</h1>
          <p>
            {r.type === "palette"
              ? `${r.colors.length} 色色板`
              : r.type === "color"
                ? "单色"
                : "网站书签"}{" "}
            ·{" "}
            {r.status === "published" && r.visibility === "public"
              ? "公开发布"
              : "私有草稿"}
          </p>
        </div>
        {!publicOnly ? (
          <div className="detail-actions">
            <Button
              variant="outline"
              aria-label="编辑资源"
              onClick={() => router.push(`/resources/${r.id}/edit`)}
              disabled={!!r.deletedAt}
            >
              <Pencil />
              编辑
            </Button>
            <Button
              variant="outline"
              onClick={() => action("favorite")}
              disabled={busy}
            >
              <Heart fill={r.favorite ? "currentColor" : "none"} />
              {r.favorite ? "已收藏" : "收藏"}
            </Button>
            {r.deletedAt ? (
              <Button onClick={() => action("restore")} disabled={busy}>
                <RotateCcw />
                恢复资源
              </Button>
            ) : r.status === "published" ? (
              <Button onClick={() => action("unpublish")} disabled={busy}>
                <Lock />
                撤回发布
              </Button>
            ) : (
              <Button onClick={() => setPublish(true)}>
                <Globe />
                预览并发布
              </Button>
            )}
          </div>
        ) : null}
      </div>
      {r.colors.length ? (
        <>
          <div className="detail-swatches">
            {r.colors.map((c, i) => (
              <Swatch
                key={i}
                value={c.value}
                preferences={preferences}
                label={c.role}
                large
              />
            ))}
          </div>
          <div className="export-actions">
            <Button
              variant="outline"
              onClick={() =>
                copy(
                  r.colors
                    .map((c) =>
                      formatColor(
                        c.value,
                        preferences.format,
                        preferences.lowercase,
                        preferences.hash,
                      ),
                    )
                    .join("\n"),
                )
              }
            >
              <Copy />
              复制整个{r.type === "palette" ? "色板" : "颜色"}
            </Button>
            <Button
              variant="outline"
              onClick={() => copy(cssVariables(r.colors))}
            >
              复制 CSS 变量
            </Button>
            {!publicOnly ? (
              <Button
                variant="outline"
                onClick={() => router.push("/new?duplicate=" + r.id)}
              >
                另存为副本
              </Button>
            ) : null}
            {!publicOnly ? (
              <Button
                variant="ghost"
                onClick={() =>
                  downloadExport("json", false, [r.id]).catch((e) =>
                    toast.error(e.message),
                  )
                }
              >
                导出 JSON
              </Button>
            ) : null}
          </div>
          {r.colors.some((c) => c.value.alpha < 1) &&
          preferences.format === "hex" ? (
            <p className="notice">
              HEX8 将透明度量化为 8 位；原始 alpha 与源坐标保持不变。
            </p>
          ) : null}
        </>
      ) : (
        <a
          className="website-detail-link"
          href={r.normalizedUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="site-monogram">{r.title.slice(0, 1)}</span>
          <div>
            <h2>访问 {r.title}</h2>
            <p>{r.normalizedUrl}</p>
          </div>
          <ExternalLink />
        </a>
      )}
      <div className="detail-info">
        <section>
          <h2>关于这份灵感</h2>
          <p className="preserve-lines">
            {r.description || "还没有添加简介。"}
          </p>
          <div className="tags">
            {r.tags.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
          {r.sourceUrl ? (
            <a
              href={
                r.sourceUrl.includes("://")
                  ? r.sourceUrl
                  : "https://" + r.sourceUrl
              }
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              查看来源 <ExternalLink size={14} />
            </a>
          ) : null}
          {r.sourceKind === "plan-seed" ? (
            <p className="muted">
              来自初始整理资料；配色为场景化建议，不是第三方网站的官方方案。
            </p>
          ) : null}
          {!publicOnly && r.privateNote ? (
            <div className="private-note">
              <h3>
                <Lock size={15} />
                私有笔记
              </h3>
              <p className="preserve-lines">{r.privateNote}</p>
            </div>
          ) : null}
        </section>
        <aside>
          <h3>分类</h3>
          <p>
            {r.categoryIds
              .map((id) => org.categories.find((c) => c.id === id)?.name)
              .filter(Boolean)
              .join(" / ") || "未分类"}
          </p>
          <h3>更新日期</h3>
          <p>{new Date(r.updatedAt).toLocaleDateString("zh-CN")}</p>
          {!publicOnly ? (
            <>
              <h3>添加到合集</h3>
              <div className="inline-form">
                <select
                  aria-label="添加到合集"
                  value={collection}
                  onChange={(e) => setCollection(e.target.value)}
                >
                  <option value="">选择合集</option>
                  {org.collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  disabled={!collection}
                  onClick={async () => {
                    try {
                      await api("/resources/batch", {
                        method: "POST",
                        body: {
                          ids: [r.id],
                          action: "collect",
                          collectionId: collection,
                        },
                      });
                      toast.success("已加入合集");
                      onRefresh();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  添加
                </Button>
              </div>
              {!r.deletedAt ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm("移入回收站？之后可以恢复。"))
                      action("delete");
                  }}
                >
                  <Trash2 />
                  移入回收站
                </Button>
              ) : null}
            </>
          ) : null}
        </aside>
      </div>
      <Dialog open={publish} onOpenChange={setPublish}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>公开预览</DialogTitle>
            <DialogDescription>
              发布后，任何访客都可以查看以下内容。私有笔记与个人收藏状态不会公开。
            </DialogDescription>
          </DialogHeader>
          <h2>{r.title}</h2>
          <div className="mini-palette">
            {r.colors.map((c, i) => (
              <span key={i} style={{ background: c.value.preview.css }} />
            ))}
          </div>
          <p>{r.description}</p>
          {r.type === "website" ? <p>{r.normalizedUrl}</p> : null}
          <p className="muted">
            分类：
            {r.categoryIds
              .map((id) => org.categories.find((c) => c.id === id)?.name)
              .join(" / ") || "未分类"}
          </p>
          {r.sourceUrl ? <p className="muted">来源：{r.sourceUrl}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublish(false)}>
              继续保持私有
            </Button>
            <Button disabled={busy} onClick={() => action("publish")}>
              确认发布
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
