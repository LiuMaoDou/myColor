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
  Heart,
  Layers,
  Palette,
  Download,
  Settings,
  Trash2,
  Globe,
  Search,
  Menu,
  ChevronRight,
  Archive,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { api, defaultPreferences, type Preferences } from "@/lib/client";
import type { Organization, Resource } from "@/lib/types";
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
import { ClipboardProvider } from "./clipboard";
import { Toaster } from "./ui/sonner";
const ResourceEditor = dynamic(() =>
  import("./resource-editor").then((m) => m.ResourceEditor),
);
const ResourceDetail = dynamic(() =>
  import("./resource-detail").then((m) => m.ResourceDetail),
);
const Manage = dynamic(() => import("./manage").then((m) => m.Manage));
const DataPanel = dynamic(() =>
  import("./data-panel").then((m) => m.DataPanel),
);
const ToolsPanel = dynamic(() =>
  import("./tools-panel").then((m) => m.ToolsPanel),
);
const PreferencesPanel = dynamic(() =>
  import("./preferences").then((m) => m.PreferencesPanel),
);
const emptyOrg: Organization = { categories: [], tags: [], collections: [] };
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
function Sidebar({
  org,
  publicOnly,
  close,
}: {
  org: Organization;
  publicOnly: boolean;
  close?: () => void;
}) {
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
          {publicOnly ? (
            nav("/explore", "公开资源", Globe)
          ) : (
            <>
              {nav("/library", "我的资源库", Folder)}
              {nav("/library?type=color", "单色", SwatchBook)}
              {nav("/library?type=palette", "色板", Grid2X2)}
              {nav("/library?type=website", "网站", PanelTop)}
              {nav("/library?favorite=true", "我的收藏", Heart)}
            </>
          )}
        </div>
        <div className="nav-group">
          <div className="nav-label">
            <span>分类</span>
            {!publicOnly ? (
              <Link
                href="/manage/categories"
                aria-label="管理分类"
                onClick={close}
              >
                <Plus size={14} />
              </Link>
            ) : null}
          </div>
          {org.categories
            .filter((c) => !c.parentId || publicOnly)
            .slice(0, 8)
            .map((c) =>
              nav(
                publicOnly
                  ? `/explore/categories/${c.slug}`
                  : `/library?category=${c.id}`,
                c.name,
                Folder,
              ),
            )}
        </div>
        <div className="nav-group">
          <div className="nav-label">
            <span>合集</span>
            {!publicOnly ? (
              <Link
                href="/manage/collections"
                aria-label="管理合集"
                onClick={close}
              >
                <Plus size={14} />
              </Link>
            ) : null}
          </div>
          {org.collections
            .slice(0, 6)
            .map((c) =>
              nav(
                publicOnly
                  ? `/explore?collection=${c.id}`
                  : `/collections/${c.id}`,
                c.name,
                Layers,
              ),
            )}
        </div>
        <div className="nav-group nav-bottom">
          {nav("/tools", "颜色工具", Palette)}
          {!publicOnly ? (
            <>
              {nav("/settings/data", "导入与导出", Download)}
              {nav("/manage/categories", "分类与标签", Folder)}
              {nav("/settings/preferences", "偏好设置", Settings)}
              {nav("/library?trash=true", "回收站", Trash2)}
              {nav("/library?status=archived", "已归档", Archive)}
              {nav("/explore", "公开资源", Globe)}
            </>
          ) : (
            nav("/library", "我的资源库", Folder)
          )}
        </div>
      </nav>
      <div className="sidebar-footer">
        <span className="status-dot" />
        每一种颜色，都有归处。
      </div>
    </>
  );
}
export function AppShell() {
  const path = usePathname(),
    params = useSearchParams(),
    router = useRouter();
  const publicOnly = path.startsWith("/explore");
  const [org, setOrg] = useState<Organization>(emptyOrg),
    [refresh, setRefresh] = useState(0),
    [preferences, setPreferences] = useState(defaultPreferences),
    [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(params.get("q") || ""),
    [resource, setResource] = useState<Resource | null>(null),
    [detailError, setDetailError] = useState("");
  const onRefresh = useCallback(() => setRefresh((n) => n + 1), []);
  const detailMatch = path.match(
      /^\/(?:explore\/)?resources\/([^/]+)(\/edit)?$/,
    ),
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
    let active = true;
    api<Organization>(`${publicOnly ? "/public" : ""}/organization`)
      .then((d) => active && setOrg(d))
      .catch((e) => toast.error(e.message));
    return () => {
      active = false;
    };
  }, [publicOnly, refresh]);
  useEffect(() => {
    setResource(null);
    setDetailError("");
    if (!resourceId) return;
    let active = true;
    api<Resource>(`${publicOnly ? "/public" : ""}/resources/${resourceId}`)
      .then((r) => active && setResource(r))
      .catch((e) => active && setDetailError(e.message));
    return () => {
      active = false;
    };
  }, [resourceId, publicOnly, refresh]);
  function updatePreferences(p: Preferences) {
    setPreferences(p);
    localStorage.setItem("atlas-preferences-v1", JSON.stringify(p));
  }
  const tools = path.startsWith("/tools");
  let content;
  if (resourceId)
    content = detailError ? (
      <div className="empty-state" role="alert">
        <h2>无法打开资源</h2>
        <p>{detailError}</p>
        <Link href={publicOnly ? "/explore" : "/library"}>返回资源库</Link>
      </div>
    ) : !resource ? (
      <Skeleton className="skeleton-detail" />
    ) : detailMatch?.[2] ? (
      <ResourceEditor
        key={resource.id}
        initial={resource}
        org={org}
        preferences={preferences}
        onSaved={onRefresh}
      />
    ) : (
      <ResourceDetail
        resource={resource}
        org={org}
        preferences={preferences}
        publicOnly={publicOnly}
        onRefresh={onRefresh}
      />
    );
  else if (path === "/new")
    content = (
      <ResourceEditor
        key={params.get("input") || "new"}
        quick={params.get("input") || ""}
        duplicateId={params.get("duplicate") || undefined}
        org={org}
        preferences={preferences}
        onSaved={onRefresh}
      />
    );
  else if (path.startsWith("/manage"))
    content = (
      <Manage
        org={org}
        onRefresh={onRefresh}
        initialTab={path.split("/")[2] || "categories"}
        key={path}
      />
    );
  else if (path === "/settings/data")
    content = <DataPanel onRefresh={onRefresh} />;
  else if (path === "/settings/preferences")
    content = (
      <PreferencesPanel value={preferences} onChange={updatePreferences} />
    );
  else if (tools) content = <ToolsPanel preferences={preferences} />;
  else
    content = (
      <Library
        org={org}
        preferences={preferences}
        publicOnly={publicOnly}
        refresh={refresh}
        onRefresh={onRefresh}
      />
    );
  return (
    <ClipboardProvider>
      <Toaster position="bottom-right" richColors />
      <div className="app-shell">
        <aside className="sidebar">
          <Sidebar org={org} publicOnly={publicOnly} />
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
              <span>{publicOnly ? "灵感广场" : "工作台"}</span>
              <ChevronRight size={14} />
              <strong>
                {path === "/library" || path === "/"
                  ? "我的资源库"
                  : path === "/new"
                    ? "新增资源"
                    : tools
                      ? "颜色工具"
                      : resourceId
                        ? "资源详情"
                        : path.startsWith("/settings")
                          ? "设置"
                          : "颜色收藏"}
              </strong>
            </div>
            <div className="header-actions">
              <form
                className="search-field"
                onSubmit={(e) => {
                  e.preventDefault();
                  const p = new URLSearchParams(params);
                  p.set("q", search);
                  p.delete("page");
                  router.push(`${publicOnly ? "/explore" : "/library"}?${p}`);
                }}
              >
                <Search size={17} />
                <input
                  aria-label="搜索资源"
                  placeholder="搜索名称、标签或色值…"
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
              <DialogDescription>浏览资源库与颜色工具</DialogDescription>
            </DialogHeader>
            <Sidebar
              org={org}
              publicOnly={publicOnly}
              close={() => setMobile(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </ClipboardProvider>
  );
}
