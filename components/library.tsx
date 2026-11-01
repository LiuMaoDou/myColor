"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  LayoutGrid,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { api, type Preferences } from "@/lib/client";
import type { Resource } from "@/lib/types";
import { parseColorBatch, MAX_COLORS } from "@/lib/color-core";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";
import { ResourceCard } from "./resource-card";
import { libraryQuery } from "@/lib/library-query";
export function Library({
  preferences,
  refresh,
  onRefresh,
}: {
  preferences: Preferences;
  refresh: number;
  onRefresh: () => void;
}) {
  const router = useRouter(),
    params = useSearchParams();
  const [resources, setResources] = useState<Resource[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [quick, setQuick] = useState(""),
    [quickName, setQuickName] = useState(""),
    [quickError, setQuickError] = useState(""),
    [adding, setAdding] = useState(false),
    [ready, setReady] = useState(false),
    [selecting, setSelecting] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [batchBusy, setBatchBusy] = useState(false);
  const query = libraryQuery(params).toString(),
    pathname = "/library";
  const quickInput = useRef<HTMLInputElement>(null);
  const addingRef = useRef(false);
  const parsed = quick.trim() ? parseColorBatch(quick.trim()) : [];
  useEffect(() => setReady(true), []);
  const currentType = params.get("type") || "";
  const page = Number(params.get("page")) || 1;
  function filter(key: string, value: string) {
    const p = new URLSearchParams(query);
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete("page");
    router.push(`${pathname}?${p}`);
  }
  async function addColor() {
    if (!ready || addingRef.current) return;
    const input = quick.trim();
    const name = quickName.trim() || input;
    if (!input) {
      setQuickError("请输入颜色数据");
      quickInput.current?.focus();
      return;
    }
    const invalid = parsed.find((c) => c.result.state !== "valid");
    if (invalid && invalid.result.state !== "valid") {
      setQuickError(
        invalid.result.state === "ambiguous"
          ? "请使用 rgb(...) 明确 RGB 数值，例如 rgb(40, 127, 131)"
          : invalid.result.issues[0],
      );
      return;
    }
    if (parsed.length > MAX_COLORS) {
      setQuickError(`每个色板最多 ${MAX_COLORS} 个颜色`);
      return;
    }
    if (name.length > 200) {
      setQuickError("名字最多 200 个字符；颜色数据较长时，请填写一个简短名字");
      return;
    }
    addingRef.current = true;
    setAdding(true);
    setQuickError("");
    try {
      const resource = await api<Resource>("/resources", {
        method: "POST",
        body: {
          type: parsed.length > 1 ? "palette" : "color",
          title: name,
          colors: parsed.map((c) => ({ input: c.input.trim() })),
        },
      });
      setQuick("");
      setQuickName("");
      // Keep the new card visible when adding from a searched or filtered list.
      const p = libraryQuery(params);
      for (const key of ["q", "favorite", "page"]) p.delete(key);
      if (p.has("sort")) p.set("sort", "recent");
      if (currentType && currentType !== resource.type)
        p.set("type", resource.type);
      if (p.toString() !== query)
        router.replace(`/library${p.size ? "?" + p : ""}`);
      onRefresh();
      toast.success("已添加颜色");
    } catch (e) {
      setQuickError((e as Error).message);
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const p = new URLSearchParams(query);
    api<{ resources: Resource[]; total: number }>(`/resources?${p}`)
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
  }, [query, refresh]);
  async function runBatch(action: string) {
    if (
      action === "delete" &&
      !window.confirm(`确定删除所选 ${selected.length} 项资源？`)
    )
      return;
    setBatchBusy(true);
    try {
      await api("/resources/batch", {
        method: "POST",
        body: {
          ids: selected,
          action,
        },
      });
      toast.success(`已更新 ${selected.length} 项资源`);
      setSelected([]);
      onRefresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBatchBusy(false);
    }
  }
  const title =
    currentType === "color"
      ? "单色收藏"
      : currentType === "palette"
        ? "色板收藏"
        : currentType === "website"
          ? "网站收藏"
          : "我的资源库";
  return (
    <>
      <div className="section-heading">
        <div>
          <h1>{title}</h1>
          <p>收藏每一次灵感，让好颜色随手可用。</p>
        </div>
        {currentType === "website" ? (
          <Button size="lg" onClick={() => router.push("/new?type=website")}>
            <Plus />
            添加网站
          </Button>
        ) : null}
      </div>
      {currentType !== "website" ? (
        <form
          className="quick-entry"
          onSubmit={(e) => {
            e.preventDefault();
            void addColor();
          }}
        >
          <span className="quick-preview checker" aria-hidden="true">
            {parsed.some((c) => c.result.state === "valid") ? (
              parsed.map((c, i) =>
                c.result.state === "valid" ? (
                  <span
                    key={i}
                    style={{
                      backgroundColor: c.result.value.preview.css,
                    }}
                  />
                ) : null,
              )
            ) : (
              <span />
            )}
          </span>
          <Input
            ref={quickInput}
            className="quick-color-input"
            aria-label="快速输入颜色"
            aria-invalid={!!quickError}
            aria-describedby={quickError ? "quick-color-error" : undefined}
            disabled={!ready || adding}
            placeholder="输入颜色，如 #287F83 或 rgb(40,127,131)"
            value={quick}
            onChange={(e) => {
              setQuick(e.target.value);
              setQuickError("");
            }}
          />
          <Input
            className="quick-name-input"
            aria-label="名字（可选）"
            placeholder="名字（可选）"
            maxLength={200}
            disabled={!ready || adding}
            value={quickName}
            onChange={(e) => {
              setQuickName(e.target.value);
              setQuickError("");
            }}
          />
          <Button type="submit" variant="secondary" disabled={!ready || adding}>
            {adding ? "添加中…" : "添加"}
          </Button>
        </form>
      ) : null}
      {quickError && currentType !== "website" ? (
        <p
          id="quick-color-error"
          role="alert"
          className="error-text mb-5 -mt-4"
        >
          {quickError}
        </p>
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
            aria-label="排序"
            value={params.get("sort") || "recent"}
            onChange={(e) => filter("sort", e.target.value)}
          >
            <option value="recent">最近更新</option>
            <option value="oldest">最早添加</option>
            <option value="name">名称排序</option>
          </select>
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
        </div>
      </div>
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
            variant="destructive"
            disabled={!selected.length || batchBusy}
            onClick={() => runBatch("delete")}
          >
            删除
          </Button>
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
          <h2>这里还没有资源</h2>
          <p>试试其他筛选条件，或添加你的第一个颜色。</p>
          <Button
            onClick={() =>
              currentType === "website"
                ? router.push("/new?type=website")
                : quickInput.current?.focus()
            }
          >
            {currentType === "website" ? "添加网站" : "添加颜色"}
          </Button>
        </div>
      ) : (
        <div className="resource-grid" data-density={preferences.density}>
          {resources.map((r) => (
            <ResourceCard
              key={r.id}
              resource={r}
              preferences={preferences}
              selecting={selecting}
              selected={selected.includes(r.id)}
              onSelect={() =>
                setSelected(
                  selected.includes(r.id)
                    ? selected.filter((x) => x !== r.id)
                    : [...selected, r.id],
                )
              }
            />
          ))}
        </div>
      )}
      <div className="list-footer">
        <span>
          <LayoutGrid size={14} /> {total} 项资源 · 点击色块复制色值
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
    </>
  );
}
