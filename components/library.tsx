"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Plus,
  SlidersHorizontal,
  LayoutGrid,
  CheckSquare,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { api, type Preferences } from "@/lib/client";
import type { Resource, Organization } from "@/lib/types";
import { parseColorInput } from "@/lib/color-core";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";
import { ResourceCard } from "./resource-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
export function Library({
  org,
  preferences,
  publicOnly,
  refresh,
  onRefresh,
}: {
  org: Organization;
  preferences: Preferences;
  publicOnly: boolean;
  refresh: number;
  onRefresh: () => void;
}) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const [resources, setResources] = useState<Resource[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [quick, setQuick] = useState(""),
    [filters, setFilters] = useState(false),
    [selecting, setSelecting] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [batch, setBatch] = useState(""),
    [batchValue, setBatchValue] = useState(""),
    [batchBusy, setBatchBusy] = useState(false);
  const query = params.toString(),
    collectionId = pathname.startsWith("/collections/")
      ? pathname.split("/")[2]
      : params.get("collection"),
    collection = org.collections.find((c) => c.id === collectionId),
    categorySlug = pathname.startsWith("/explore/categories/")
      ? pathname.split("/")[3]
      : null;
  const parsed = parseColorInput(quick);
  const currentType = params.get("type") || "";
  const page = Number(params.get("page")) || 1;
  const trash = params.get("trash") === "true";
  const archive = params.get("status") === "archived";
  function filter(key: string, value: string) {
    const p = new URLSearchParams(query);
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete("page");
    router.push(`${pathname}?${p}`);
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const p = new URLSearchParams(query);
    if (collectionId) {
      p.set("collection", collectionId);
      if (!p.has("sort")) p.set("sort", "manual");
    }
    if (categorySlug) p.set("category", categorySlug);
    api<{ resources: Resource[]; total: number }>(
      `${publicOnly ? "/public" : ""}/resources?${p}`,
    )
      .then((d) => {
        if (active) {
          setResources(d.resources);
          setTotal(d.total);
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [query, publicOnly, refresh, collectionId, categorySlug]);
  async function favorite(r: Resource) {
    try {
      await api(`/resources/${r.id}/favorite`, {
        method: "POST",
        body: { favorite: !r.favorite },
      });
      setResources(
        resources.map((x) =>
          x.id === r.id ? { ...x, favorite: !r.favorite } : x,
        ),
      );
      if (params.get("favorite")) onRefresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function runBatch(action: string) {
    if (
      ["delete", "archive"].includes(action) &&
      !window.confirm(
        `确定${action === "delete" ? "移入回收站" : "归档"}所选 ${selected.length} 项？`,
      )
    )
      return;
    setBatchBusy(true);
    try {
      await api("/resources/batch", {
        method: "POST",
        body: {
          ids: selected,
          action,
          categoryIds:
            action === "categorize"
              ? batchValue
                ? [batchValue]
                : []
              : undefined,
          tags:
            action === "tag"
              ? batchValue
                  .split(/[,，]/)
                  .map((t) => t.trim())
                  .filter(Boolean)
              : undefined,
          collectionId: action === "collect" ? batchValue : undefined,
        },
      });
      toast.success(`已更新 ${selected.length} 项资源`);
      setSelected([]);
      setBatch("");
      onRefresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBatchBusy(false);
    }
  }
  async function reorder(r: Resource, delta: number) {
    if (!collection) return;
    const ids = [...collection.resourceIds],
      i = ids.indexOf(r.id),
      j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await api(`/collections/${collection.id}`, {
        method: "PATCH",
        body: { resourceIds: ids },
      });
      onRefresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const title =
    collection?.name ||
    (trash
      ? "回收站"
      : archive
        ? "已归档"
        : publicOnly
          ? "发现好颜色"
          : params.get("favorite")
            ? "我的收藏"
            : currentType === "color"
              ? "单色收藏"
              : currentType === "palette"
                ? "色板收藏"
                : currentType === "website"
                  ? "网站收藏"
                  : "我的资源库");
  return (
    <>
      <div className="section-heading">
        <div>
          <h1>{title}</h1>
          <p>
            {trash
              ? "删除的资源保留在这里，可随时恢复。暂不自动清理。"
              : collection
                ? collection.description || "把服务于同一个项目的灵感放在一起。"
                : publicOnly
                  ? "探索主动公开的颜色与灵感，点击色块即可复制。"
                  : "收藏每一次灵感，让好颜色随手可用。"}
          </p>
        </div>
        {!publicOnly ? (
          <Button size="lg" onClick={() => router.push("/new")}>
            <Plus />
            新增资源
          </Button>
        ) : null}
      </div>
      {!publicOnly && !trash && !archive ? (
        <form
          className="quick-entry"
          onSubmit={(e) => {
            e.preventDefault();
            router.push("/new?input=" + encodeURIComponent(quick));
          }}
        >
          <span className="quick-preview checker">
            <span
              style={{
                backgroundColor:
                  parsed.state === "valid"
                    ? parsed.value.preview.css
                    : "#287F83",
              }}
            />
          </span>
          <Input
            aria-label="快速输入颜色"
            placeholder="输入颜色，如 #287F83 或 rgb(40,127,131)"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            添加
          </Button>
        </form>
      ) : null}
      <div className="library-toolbar">
        <div className="filter-tabs" aria-label="资源类型">
          {[
            ["", "所有资源"],
            ["palette", "色板"],
            ["color", "单色"],
            ["website", "网站"],
          ].map(([id, label]) => (
            <Button
              key={id}
              variant={currentType === id ? "secondary" : "ghost"}
              onClick={() => filter("type", id)}
              aria-pressed={currentType === id}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="toolbar-actions">
          <select
            aria-label="筛选分类"
            value={params.get("category") || ""}
            onChange={(e) => filter("category", e.target.value)}
          >
            <option value="">全部分类</option>
            <option value="uncategorized">未分类</option>
            {org.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="排序"
            value={params.get("sort") || (collection ? "manual" : "recent")}
            onChange={(e) => filter("sort", e.target.value)}
          >
            {collection ? <option value="manual">合集顺序</option> : null}
            <option value="recent">最近更新</option>
            <option value="oldest">最早添加</option>
            <option value="name">名称排序</option>
          </select>
          <Button
            variant="ghost"
            size="icon"
            aria-label="更多筛选"
            aria-expanded={filters}
            onClick={() => setFilters(!filters)}
          >
            <SlidersHorizontal />
          </Button>
          {!publicOnly ? (
            <Button
              variant={selecting ? "secondary" : "ghost"}
              size="icon"
              aria-label="批量选择"
              aria-pressed={selecting}
              onClick={() => {
                setSelecting(!selecting);
                setSelected([]);
              }}
            >
              <CheckSquare />
            </Button>
          ) : null}
        </div>
      </div>
      {filters ? (
        <div className="extra-filters">
          <select
            aria-label="筛选标签"
            value={params.get("tag") || ""}
            onChange={(e) => filter("tag", e.target.value)}
          >
            <option value="">全部标签</option>
            {org.tags.map((t) => (
              <option key={t.id}>{t.name}</option>
            ))}
          </select>
          {!publicOnly ? (
            <select
              aria-label="可见性"
              value={params.get("visibility") || ""}
              onChange={(e) => filter("visibility", e.target.value)}
            >
              <option value="">全部可见性</option>
              <option value="private">私有</option>
              <option value="public">公开</option>
            </select>
          ) : null}
          <Button variant="ghost" onClick={() => router.push(pathname)}>
            清除筛选
          </Button>
        </div>
      ) : null}
      {selecting ? (
        <div className="batch-toolbar">
          <label className="check-label">
            <input
              type="checkbox"
              checked={
                !!resources.length &&
                resources.every((r) => selected.includes(r.id))
              }
              onChange={(e) =>
                setSelected(e.target.checked ? resources.map((r) => r.id) : [])
              }
            />
            本页全选
          </label>
          <span>已选 {selected.length} 项</span>
          <Button
            size="sm"
            variant="outline"
            disabled={!selected.length || batchBusy}
            onClick={() => runBatch("favorite")}
          >
            收藏
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!selected.length}
            onClick={() => {
              setBatch("categorize");
              setBatchValue("");
            }}
          >
            分类
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!selected.length}
            onClick={() => {
              setBatch("tag");
              setBatchValue("");
            }}
          >
            标签
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!selected.length}
            onClick={() => {
              setBatch("collect");
              setBatchValue("");
            }}
          >
            加入合集
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!selected.length || batchBusy}
            onClick={() => runBatch(trash ? "restore" : "archive")}
          >
            {trash ? "恢复" : "归档"}
          </Button>
          {!trash ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={!selected.length || batchBusy}
              onClick={() => runBatch("delete")}
            >
              删除
            </Button>
          ) : null}
          <small>使用复选框选择；色块仍可复制</small>
        </div>
      ) : null}
      {error ? (
        <div className="empty-state" role="alert">
          <h2>暂时无法加载资源</h2>
          <p>{error}</p>
          <Button onClick={onRefresh}>重试</Button>
        </div>
      ) : loading ? (
        <div className="resource-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton className="skeleton-card" key={i} />
          ))}
        </div>
      ) : !resources.length ? (
        <div className="empty-state">
          <Search size={32} />
          <h2>{publicOnly ? "还没有公开的资源" : "这里还没有资源"}</h2>
          <p>
            {publicOnly
              ? "只有站长主动发布的内容会出现在这里。"
              : "试试其他筛选条件，或收藏你的第一个颜色。"}
          </p>
          {!publicOnly ? (
            <Button onClick={() => router.push("/new?input=%23287F83")}>
              从 #287F83 开始
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="resource-grid" data-density={preferences.density}>
          {resources.map((r) => (
            <ResourceCard
              key={r.id}
              resource={r}
              preferences={preferences}
              publicOnly={publicOnly}
              onFavorite={() => favorite(r)}
              selecting={selecting}
              selected={selected.includes(r.id)}
              onSelect={() =>
                setSelected(
                  selected.includes(r.id)
                    ? selected.filter((x) => x !== r.id)
                    : [...selected, r.id],
                )
              }
              onMove={
                collection && !publicOnly
                  ? (delta) => reorder(r, delta)
                  : undefined
              }
            />
          ))}
        </div>
      )}
      <div className="list-footer">
        <span>
          <LayoutGrid size={14} /> {total} 项资源
          {publicOnly ? " · 已公开" : " · 点击色块复制色值"}
        </span>
        {total > 48 ? (
          <div className="pagination">
            <Button
              variant="outline"
              size="icon"
              disabled={page === 1}
              aria-label="上一页"
              onClick={() => {
                const p = new URLSearchParams(query);
                p.set("page", String(page - 1));
                router.push(`${pathname}?${p}`);
              }}
            >
              <ChevronLeft />
            </Button>
            <span>
              {page} / {Math.ceil(total / 48)}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={page * 48 >= total}
              aria-label="下一页"
              onClick={() => {
                const p = new URLSearchParams(query);
                p.set("page", String(page + 1));
                router.push(`${pathname}?${p}`);
              }}
            >
              <ChevronRight />
            </Button>
          </div>
        ) : null}
      </div>
      <Dialog open={!!batch} onOpenChange={(o) => !o && setBatch("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              批量
              {batch === "categorize"
                ? "分类"
                : batch === "tag"
                  ? "添加标签"
                  : "加入合集"}
            </DialogTitle>
            <DialogDescription>
              应用于 {selected.length} 项已选资源。
            </DialogDescription>
          </DialogHeader>
          {batch === "tag" ? (
            <Input
              aria-label="批量标签"
              value={batchValue}
              onChange={(e) => setBatchValue(e.target.value)}
              placeholder="用逗号分隔标签"
            />
          ) : (
            <select
              aria-label="批量目标"
              value={batchValue}
              onChange={(e) => setBatchValue(e.target.value)}
            >
              <option value="">
                {batch === "categorize" ? "移入未分类" : "选择合集"}
              </option>
              {(batch === "categorize" ? org.categories : org.collections).map(
                (c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ),
              )}
            </select>
          )}
          <Button
            disabled={batchBusy || (batch === "collect" && !batchValue)}
            onClick={() => runBatch(batch)}
          >
            确认应用
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
