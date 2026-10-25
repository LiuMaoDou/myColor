"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Folder, Tags, Layers } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import type { Organization } from "@/lib/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Field, FieldLabel, FieldGroup } from "./ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
export function Manage({
  org,
  onRefresh,
  initialTab = "categories",
}: {
  org: Organization;
  onRefresh: () => void;
  initialTab?: string;
}) {
  const [tab, setTab] = useState(initialTab),
    [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(""),
    [parent, setParent] = useState(""),
    [description, setDescription] = useState(""),
    [visibility, setVisibility] = useState("private"),
    [merge, setMerge] = useState(""),
    [busy, setBusy] = useState(false),
    [deleteId, setDeleteId] = useState(""),
    [deleteTarget, setDeleteTarget] = useState("");
  const items =
    tab === "categories"
      ? org.categories
      : tab === "tags"
        ? org.tags
        : org.collections;
  const kind = tab === "categories" ? "分类" : tab === "tags" ? "标签" : "合集";
  async function save() {
    setBusy(true);
    try {
      await api(`/${tab}${editing && editing !== "new" ? "/" + editing : ""}`, {
        method: editing === "new" ? "POST" : "PATCH",
        body: {
          name,
          parentId: parent || null,
          description,
          visibility,
          targetId: merge || undefined,
        },
      });
      toast.success("已保存");
      setEditing(null);
      onRefresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api(`/${tab}/${deleteId}`, {
        method: "DELETE",
        body: { targetId: deleteTarget || null },
      });
      setDeleteId("");
      toast.success("已删除，资源已保留");
      onRefresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(id: string) {
    const c = org.categories.find((c) => c.id === id),
      t = org.tags.find((t) => t.id === id),
      l = org.collections.find((c) => c.id === id);
    setName(c?.name || t?.name || l?.name || "");
    setParent(c?.parentId || "");
    setDescription(l?.description || "");
    setVisibility(l?.visibility || "private");
    setMerge("");
    setEditing(id);
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <h1>整理你的灵感</h1>
          <p>分类回答用途，标签描述特点，合集连接一个项目。</p>
        </div>
        <Button onClick={() => edit("new")}>
          <Plus />
          新建{kind}
        </Button>
      </div>
      <div className="filter-tabs tool-tabs">
        {[
          ["categories", "分类", Folder],
          ["tags", "标签", Tags],
          ["collections", "合集", Layers],
        ].map(([id, label, Icon]) => {
          const I = Icon as typeof Folder;
          return (
            <Button
              key={String(id)}
              variant={tab === id ? "secondary" : "ghost"}
              onClick={() => setTab(String(id))}
            >
              <I />
              {String(label)}
            </Button>
          );
        })}
      </div>
      <div className="manage-list">
        {items.map((item) => (
          <div className="manage-row" key={item.id}>
            <div>
              <strong>
                {tab === "collections" ? (
                  <Link href={`/collections/${item.id}`}>{item.name}</Link>
                ) : (
                  item.name
                )}
              </strong>
              {tab === "categories" ? (
                <small>
                  {org.categories.find(
                    (c) =>
                      c.id ===
                      (item as (typeof org.categories)[number]).parentId,
                  )?.name || "顶级分类"}
                </small>
              ) : tab === "collections" ? (
                <small>
                  {
                    (item as (typeof org.collections)[number]).resourceIds
                      .length
                  }{" "}
                  项资源 ·{" "}
                  {(item as (typeof org.collections)[number]).visibility ===
                  "public"
                    ? "公开合集"
                    : "私有合集"}
                </small>
              ) : null}
            </div>
            <div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`编辑 ${item.name}`}
                onClick={() => edit(item.id)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`删除 ${item.name}`}
                onClick={() => {
                  setDeleteId(item.id);
                  setDeleteTarget("");
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
        {!items.length ? (
          <div className="empty-state">还没有{kind}。点击右上角新建。</div>
        ) : null}
      </div>
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "新建" : "编辑"}
              {kind}
            </DialogTitle>
            <DialogDescription>
              {tab === "categories"
                ? "最多支持三级分类，移动不会删除资源。"
                : tab === "collections"
                  ? "公开合集只展示已经公开发布的成员，私有成员不会自动公开。"
                  : "重命名或将此标签合并到另一个标签。"}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="org-name">名称</FieldLabel>
              <Input
                id="org-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            {tab === "categories" ? (
              <Field>
                <FieldLabel htmlFor="org-parent">父分类</FieldLabel>
                <select
                  id="org-parent"
                  value={parent}
                  onChange={(e) => setParent(e.target.value)}
                >
                  <option value="">无（顶级分类）</option>
                  {org.categories
                    .filter((c) => c.id !== editing)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>
            ) : tab === "tags" && editing !== "new" ? (
              <Field>
                <FieldLabel htmlFor="merge-tag">
                  合并到已有标签（可选）
                </FieldLabel>
                <select
                  id="merge-tag"
                  value={merge}
                  onChange={(e) => setMerge(e.target.value)}
                >
                  <option value="">不合并</option>
                  {org.tags
                    .filter((c) => c.id !== editing)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>
            ) : tab === "collections" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="collection-desc">项目简介</FieldLabel>
                  <Textarea
                    id="collection-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="collection-visibility">
                    合集可见性
                  </FieldLabel>
                  <select
                    id="collection-visibility"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                  >
                    <option value="private">私有</option>
                    <option value="public">公开（仅显示公开成员）</option>
                  </select>
                </Field>
              </>
            ) : null}
            <Button disabled={busy || !name} onClick={save}>
              {merge ? "确认合并" : "保存"}
            </Button>
          </FieldGroup>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除{kind}</DialogTitle>
            <DialogDescription>
              其中的资源会保留。
              {tab === "categories" ? "子分类会成为顶级分类。" : ""}
            </DialogDescription>
          </DialogHeader>
          {tab === "categories" ? (
            <select
              aria-label="删除分类后的归属"
              value={deleteTarget}
              onChange={(e) => setDeleteTarget(e.target.value)}
            >
              <option value="">移入未分类（保留其他分类）</option>
              {org.categories
                .filter((c) => c.id !== deleteId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    重新归类到 {c.name}
                  </option>
                ))}
            </select>
          ) : null}
          <Button variant="destructive" disabled={busy} onClick={remove}>
            确认删除{kind}
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
