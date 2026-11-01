"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Copy, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Preferences } from "@/lib/client";
import { formatColor, cssVariables } from "@/lib/color-core";
import type { Resource } from "@/lib/types";
import { Button } from "./ui/button";
import { Swatch } from "./swatch";
import { useCopy } from "./clipboard";
export function ResourceDetail({
  resource: r,
  preferences,
  onRefresh,
}: {
  resource: Resource;
  preferences: Preferences;
  onRefresh: () => void;
}) {
  const router = useRouter(),
    copy = useCopy();
  const [busy, setBusy] = useState(false);
  async function deleteResource() {
    setBusy(true);
    try {
      await api(`/resources/${r.id}`, {
        method: "DELETE",
        body: { expectedVersion: r.version },
      });
      toast.success("已删除资源");
      onRefresh();
      router.push("/library");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="detail-page">
      <Button variant="ghost" onClick={() => router.push("/library")}>
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
                : "网站书签"}
          </p>
        </div>
        <div className="detail-actions">
          <Button
            variant="outline"
            aria-label="编辑资源"
            onClick={() => router.push(`/resources/${r.id}/edit`)}
          >
            <Pencil />
            编辑
          </Button>
        </div>
      </div>
      {r.colors.length ? (
        <>
          <div className="detail-swatches">
            {r.colors.map((c, i) => (
              <Swatch key={i} value={c.value} preferences={preferences} large />
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
            <Button
              variant="outline"
              onClick={() => router.push("/new?duplicate=" + r.id)}
            >
              另存为副本
            </Button>
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
          {r.description ? (
            <p className="preserve-lines">{r.description}</p>
          ) : null}
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
          {r.privateNote ? (
            <div className="private-note">
              <h3>笔记</h3>
              <p className="preserve-lines">{r.privateNote}</p>
            </div>
          ) : null}
        </section>
        <aside>
          <h3>更新日期</h3>
          <p>{new Date(r.updatedAt).toLocaleDateString("zh-CN")}</p>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (window.confirm("确定删除这个资源？")) deleteResource();
            }}
          >
            <Trash2 />
            删除资源
          </Button>
        </aside>
      </div>
    </section>
  );
}
