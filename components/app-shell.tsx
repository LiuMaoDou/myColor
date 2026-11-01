"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Folder,
  SwatchBook,
  Grid2X2,
  PanelTop,
  Search,
  Menu,
  ChevronRight,
} from "lucide-react";
import { api, defaultPreferences, type Preferences } from "@/lib/client";
import type { Resource } from "@/lib/types";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Library } from "./library";
import { libraryQuery } from "@/lib/library-query";
import { ClipboardProvider } from "./clipboard";
import { Toaster } from "./ui/sonner";
const ResourceEditor = dynamic(() =>
  import("./resource-editor").then((m) => m.ResourceEditor),
);
const ResourceDetail = dynamic(() =>
  import("./resource-detail").then((m) => m.ResourceDetail),
);
function Brand() {
  return (
    <Link href="/library" className="brand">
      <span className="brand-mark">
        <i />
        <i />
      </span>
      <span>
        Color Atlas<small>色集</small>
      </span>
    </Link>
  );
}
function Sidebar({ close }: { close?: () => void }) {
  const path = usePathname(),
    params = useSearchParams();
  const active = (href: string) => {
    if (href === "/library")
      return (path === "/library" || path === "/") && !params.toString();
    const [target, query] = href.split("?");
    return (
      path === target &&
      (!query ||
        [...new URLSearchParams(query)].every(
          ([key, value]) => params.get(key) === value,
        ))
    );
  };
  const nav = (href: string, label: string, Icon: typeof Folder) => (
    <Link
      key={href}
      href={href}
      onClick={close}
      data-active={active(href)}
      className="nav-link"
    >
      <Icon />
      <span>{label}</span>
    </Link>
  );
  return (
    <>
      <Brand />
      <nav className="sidebar-nav" aria-label="主导航">
        <div className="nav-group">
          {nav("/library", "我的资源库", Folder)}
          {nav("/library?type=color", "单色", SwatchBook)}
          {nav("/library?type=palette", "色板", Grid2X2)}
          {nav("/library?type=website", "网站", PanelTop)}
        </div>
      </nav>
    </>
  );
}
export function AppShell() {
  const path = usePathname(),
    params = useSearchParams(),
    router = useRouter();
  const [refresh, setRefresh] = useState(0),
    [preferences, setPreferences] = useState(defaultPreferences),
    [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(params.get("q") || ""),
    [resource, setResource] = useState<Resource | null>(null),
    [detailError, setDetailError] = useState("");
  const onRefresh = useCallback(() => setRefresh((n) => n + 1), []);
  const detailMatch = path.match(/^\/resources\/([^/]+)(\/edit)?$/),
    resourceId = detailMatch?.[1];
  useEffect(() => {
    try {
      const p = JSON.parse(
        localStorage.getItem("atlas-preferences-v1") || "{}",
      );
      setPreferences({ ...defaultPreferences, ...p });
    } catch {
      /* Invalid preference storage falls back to defaults. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.classList.toggle(
      "dark",
      preferences.theme === "dark",
    );
  }, [preferences.theme]);
  useEffect(() => {
    setSearch(params.get("q") || "");
  }, [params]);
  useEffect(() => {
    setResource(null);
    setDetailError("");
    if (!resourceId) return;
    let active = true;
    api<Resource>(`/resources/${resourceId}`)
      .then((r) => active && setResource(r))
      .catch((e) => active && setDetailError(e.message));
    return () => {
      active = false;
    };
  }, [resourceId, refresh]);
  function updatePreferences(p: Preferences) {
    setPreferences(p);
    localStorage.setItem("atlas-preferences-v1", JSON.stringify(p));
  }
  let content;
  if (resourceId)
    content = detailError ? (
      <div className="empty-state" role="alert">
        <h2>无法打开资源</h2>
        <p>{detailError}</p>
        <Link href="/library">返回资源库</Link>
      </div>
    ) : !resource ? (
      <Skeleton className="skeleton-detail" />
    ) : detailMatch?.[2] ? (
      <ResourceEditor
        key={resource.id}
        initial={resource}
        onSaved={onRefresh}
      />
    ) : (
      <ResourceDetail
        resource={resource}
        preferences={preferences}
        onRefresh={onRefresh}
      />
    );
  else if (path === "/new")
    content = (
      <ResourceEditor
        key={[
          params.get("type"),
          params.get("input"),
          params.get("duplicate"),
        ].join(":")}
        quick={params.get("input") || ""}
        duplicateId={params.get("duplicate") || undefined}
        onSaved={onRefresh}
      />
    );
  else
    content = (
      <Library
        preferences={preferences}
        refresh={refresh}
        onRefresh={onRefresh}
      />
    );
  return (
    <ClipboardProvider>
      <Toaster position="bottom-right" richColors />
      <div className="app-shell">
        <aside className="sidebar">
          <Sidebar />
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <Button
                className="mobile-menu"
                variant="ghost"
                size="icon"
                aria-label="打开导航"
                onClick={() => setMobile(true)}
              >
                <Menu />
              </Button>
              <span>工作台</span>
              <ChevronRight size={14} />
              <strong>
                {path === "/library" || path === "/"
                  ? "我的资源库"
                  : path === "/new"
                    ? "新增资源"
                    : resourceId
                      ? "资源详情"
                      : "颜色收藏"}
              </strong>
            </div>
            <div className="header-actions">
              <form
                className="search-field"
                onSubmit={(e) => {
                  e.preventDefault();
                  const p = libraryQuery(params);
                  p.set("q", search);
                  p.delete("page");
                  router.push(`/library?${p}`);
                }}
              >
                <Search size={17} />
                <input
                  aria-label="搜索资源"
                  placeholder="搜索名称或色值…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <kbd>↵</kbd>
              </form>
              <select
                className="format-select"
                aria-label="全局复制格式"
                value={preferences.format}
                onChange={(e) =>
                  updatePreferences({
                    ...preferences,
                    format: e.target.value as Preferences["format"],
                  })
                }
              >
                <option value="auto">Auto</option>
                <option value="hex">HEX</option>
                <option value="rgb">RGB</option>
                <option value="hsl">HSL</option>
                <option value="original">原始</option>
              </select>
            </div>
          </header>
          <main id="main-content">{content}</main>
        </div>
        <Dialog open={mobile} onOpenChange={setMobile}>
          <DialogContent className="mobile-drawer" side="left">
            <DialogHeader className="sr-only">
              <DialogTitle>导航菜单</DialogTitle>
              <DialogDescription>
                浏览资源库、单色、色板与网站
              </DialogDescription>
            </DialogHeader>
            <Sidebar close={() => setMobile(false)} />
          </DialogContent>
        </Dialog>
      </div>
    </ClipboardProvider>
  );
}
