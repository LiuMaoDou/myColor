"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, ArrowDown, Trash2, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import {
  parseColorBatch,
  parseColorInput,
  formatColor,
  MAX_COLORS,
} from "@/lib/color-core";
import type {
  Resource,
  ResourceType,
  Organization,
  ResourceInput,
} from "@/lib/types";
import { api, type Preferences } from "@/lib/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Field, FieldLabel, FieldGroup, FieldDescription } from "./ui/field";
import { Swatch } from "./swatch";
type Entry = {
  input: string;
  role: string;
  label: string;
  scale?: "unit" | "byte";
};
export function ResourceEditor({
  initial,
  quick = "",
  duplicateId,
  org,
  preferences,
  onSaved,
}: {
  initial?: Resource;
  quick?: string;
  duplicateId?: string;
  org: Organization;
  preferences: Preferences;
  onSaved: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedType = searchParams.get("type");
  const [type, setType] = useState<ResourceType>(
    initial?.type ||
      (requestedType === "palette" || requestedType === "website"
        ? requestedType
        : "color"),
  );
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [url, setUrl] = useState(initial?.url || "");
  const [source, setSource] = useState(initial?.sourceUrl || "");
  const [note, setNote] = useState(initial?.privateNote || "");
  const [aliases, setAliases] = useState(initial?.aliases.join(", ") || "");
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [tags, setTags] = useState(initial?.tags.join(", ") || "");
  const [categories, setCategories] = useState(initial?.categoryIds || []);
  const [entries, setEntries] = useState<Entry[]>(
    initial?.colors.map((c) => ({
      input: c.input,
      role: c.role,
      label: c.label,
      scale: c.value.inputScale,
    })) || [],
  );
  const [text, setText] = useState(quick);
  const [scale, setScale] = useState<"unit" | "byte" | undefined>();
  const [saveMode, setSaveMode] = useState<"palette" | "separate">("palette");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [draft, setDraft] = useState(false);
  const [libraryColors, setLibraryColors] = useState<Resource[]>([]);
  const [duplicates, setDuplicates] = useState<{ id: string; title: string }[]>(
    [],
  );
  useEffect(() => {
    let active = true;
    const input =
      type === "website"
        ? url
        : text || (entries.length === 1 ? entries[0].input : "");
    const timer = setTimeout(() => {
      if (!input) {
        setDuplicates([]);
        return;
      }
      const params = new URLSearchParams({
        input,
        type,
        scale: scale || entries[0]?.scale || "",
      });
      api<{ id: string; title: string }[]>(`/duplicates?${params}`)
        .then((rows) => {
          if (active) setDuplicates(rows.filter((r) => r.id !== initial?.id));
        })
        .catch(() => {
          if (active) setDuplicates([]);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [type, url, text, entries, scale, initial?.id]);
  useEffect(() => {
    if (duplicateId)
      api<Resource>(`/resources/${duplicateId}`)
        .then((r) => {
          setType(r.type);
          setTitle(r.title + " · 副本");
          setDescription(r.description);
          setAliases(r.aliases.join(", "));
          setUrl(r.url);
          setSource(r.sourceUrl);
          setTags(r.tags.join(", "));
          setCategories(r.categoryIds);
          setEntries(
            r.colors.map((c) => ({
              input: c.input,
              role: c.role,
              label: c.label,
              scale: c.value.inputScale,
            })),
          );
        })
        .catch((e) => setError(e.message));
  }, [duplicateId]);
  const parsed = useMemo(
    () => (text ? parseColorBatch(text, scale) : []),
    [text, scale],
  );
  const valid = parsed.filter((x) => x.result.state === "valid"),
    invalid = parsed.length - valid.length;
  useEffect(() => {
    if (!initial && !quick) {
      const saved = sessionStorage.getItem("atlas-new-draft");
      if (saved) setDraft(true);
    }
  }, [initial, quick]);
  useEffect(() => {
    if (!initial && (text || title || entries.length || url))
      sessionStorage.setItem(
        "atlas-new-draft",
        JSON.stringify({
          type,
          title,
          text,
          entries,
          url,
          description,
          tags,
          categories,
          source,
          note,
          aliases,
          rating,
        }),
      );
  }, [
    initial,
    type,
    title,
    text,
    entries,
    url,
    description,
    tags,
    categories,
    source,
    note,
    aliases,
    rating,
  ]);
  function restore() {
    try {
      const d = JSON.parse(sessionStorage.getItem("atlas-new-draft") || "{}");
      setType(d.type || "color");
      setTitle(d.title || "");
      setText(d.text || "");
      setEntries(d.entries || []);
      setUrl(d.url || "");
      setDescription(d.description || "");
      setTags(d.tags || "");
      setCategories(d.categories || []);
      setSource(d.source || "");
      setNote(d.note || "");
      setAliases(d.aliases || "");
      setRating(d.rating ?? null);
    } catch {
      toast.error("无法恢复本地草稿");
    }
    setDraft(false);
  }
  function move(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= entries.length) return;
    setEntries((old) => {
      const a = [...old];
      [a[index], a[next]] = [a[next], a[index]];
      return a;
    });
  }
  function addParsed() {
    if (invalid && !skipInvalid) {
      setError("请确认跳过无效项，或修正颜色输入");
      return;
    }
    const additions = valid.map((c) => ({
      input: c.input,
      role: "",
      label: "",
      scale,
    }));
    if (entries.length + additions.length > MAX_COLORS) {
      setError("每个色板最多 24 个颜色");
      return;
    }
    setEntries([...entries, ...additions]);
    if (entries.length + additions.length > 1) setType("palette");
    setText("");
    setError("");
    setSkipInvalid(false);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (invalid && !skipInvalid)
        throw new Error("请修正输入或确认跳过无效项");
      const colors =
        type === "website"
          ? []
          : [
              ...entries,
              ...valid.map((c) => ({
                input: c.input,
                role: "",
                label: "",
                scale,
              })),
            ];
      const actualType =
        type === "website"
          ? "website"
          : colors.length > 1
            ? "palette"
            : "color";
      if (type !== "website" && !colors.length)
        throw new Error("请至少输入一个颜色");
      for (const c of colors) {
        const p = parseColorInput(c.input, c.scale);
        if (p.state !== "valid") throw new Error(p.issues[0]);
      }
      const base = {
        title:
          title.trim() ||
          (type === "website"
            ? new URL(url.includes("://") ? url : "https://" + url).hostname
            : colors.length === 1
              ? formatColor(
                  (
                    parseColorInput(colors[0].input, colors[0].scale) as {
                      state: "valid";
                      value: import("@/lib/color-core").ColorValue;
                    }
                  ).value,
                )
              : "未命名色板"),
        description,
        url,
        sourceUrl: source,
        privateNote: note,
        rating,
        tags: tags
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
        categoryIds: categories,
        aliases: aliases
          .split(/[,，]/)
          .map((v) => v.trim())
          .filter(Boolean),
        sourceKind: initial?.sourceKind || "manual",
        sourceMetadata: initial?.sourceMetadata || {},
      };
      let result: Resource | undefined;
      if (!initial && colors.length > 1 && saveMode === "separate") {
        const payloads = colors.map((c, i) => ({
          ...base,
          type: "color" as const,
          title: title ? `${title} ${i + 1}` : c.input,
          colors: [c],
        }));
        const text = JSON.stringify({
          schemaVersion: 1,
          product: "color-atlas",
          resources: payloads,
        });
        const preview = await api<{ hash: string; rows: { index: number }[] }>(
          "/imports/preview",
          { method: "POST", body: { text, format: "json" } },
        );
        await api("/imports/commit", {
          method: "POST",
          body: {
            text,
            format: "json",
            hash: preview.hash,
            indices: preview.rows.map((x) => x.index),
            duplicates: "copy",
          },
        });
      } else {
        result = await api<Resource>(
          initial ? `/resources/${initial.id}` : "/resources",
          {
            method: initial ? "PATCH" : "POST",
            body: {
              ...base,
              type: actualType,
              colors,
              expectedVersion: initial?.version,
            } satisfies ResourceInput,
          },
        );
      }
      sessionStorage.removeItem("atlas-new-draft");
      toast.success(
        initial?.status === "published"
          ? "已保存并更新公开内容"
          : "已保存到私人资源库",
      );
      onSaved();
      router.push(result ? `/resources/${result.id}` : "/library");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="editor-layout">
      <div className="section-heading">
        <div>
          <h1>{initial ? "编辑资源" : "收藏新的灵感"}</h1>
          <p>先保存为私有草稿，准备好后再公开分享。</p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          取消
        </Button>
      </div>
      {draft ? (
        <div className="notice">
          发现未保存的本地草稿。
          <Button variant="link" onClick={restore}>
            恢复草稿
          </Button>
        </div>
      ) : null}
      <div className="editor-panel">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="resource-type">资源类型</FieldLabel>
            <select
              id="resource-type"
              value={type}
              onChange={(e) => setType(e.target.value as ResourceType)}
            >
              <option value="color">单色</option>
              <option value="palette">色板</option>
              <option value="website">网站书签</option>
            </select>
          </Field>
          {type !== "website" ? (
            <>
              <Field>
                <FieldLabel htmlFor="color-input">输入颜色</FieldLabel>
                <Textarea
                  id="color-input"
                  autoFocus
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setSkipInvalid(false);
                  }}
                  placeholder="#287F83; rgb(255 0 0 / 50%); hsl(210 60% 50%)"
                />
                <FieldDescription>
                  支持 HEX、RGB、HSL、HSV/HSB、CSS
                  色名。多个颜色可用换行或分号分隔。
                </FieldDescription>
              </Field>
              {parsed.some((c) => c.result.state === "ambiguous") ? (
                <Field>
                  <FieldLabel htmlFor="scale">请选择 RGB 数字量纲</FieldLabel>
                  <select
                    id="scale"
                    value={scale || ""}
                    onChange={(e) =>
                      setScale(e.target.value as "unit" | "byte")
                    }
                  >
                    <option value="">请选择</option>
                    <option value="unit">RGB 0–1</option>
                    <option value="byte">RGB 0–255</option>
                  </select>
                </Field>
              ) : null}
              {parsed.length ? (
                <div className="input-previews">
                  {parsed.map((c, i) => (
                    <div key={i} className="parsed-row">
                      {c.result.state === "valid" ? (
                        <>
                          <span className="mini-color checker">
                            <span
                              style={{
                                backgroundColor: c.result.value.preview.css,
                              }}
                            />
                          </span>
                          <code>
                            {formatColor(c.result.value, preferences.format)}
                          </code>
                          <small>{c.result.warnings.join(" · ")}</small>
                        </>
                      ) : (
                        <>
                          <code>{c.input}</code>
                          <span className="error-text">
                            {c.result.issues[0]}
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                  {invalid ? (
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={skipInvalid}
                        onChange={(e) => setSkipInvalid(e.target.checked)}
                      />
                      仅使用 {valid.length} 个合法项，跳过 {invalid} 项
                    </label>
                  ) : null}
                  {valid.length ? (
                    <Button variant="outline" onClick={addParsed}>
                      <Plus />
                      加入颜色列表
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <div className="editable-colors">
                {entries.map((c, i) => {
                  const p = parseColorInput(c.input, c.scale);
                  return (
                    <div
                      className="edit-color"
                      key={i}
                      draggable
                      onDragStart={() => setDrag(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (drag !== null) {
                          setEntries((old) => {
                            const next = [...old];
                            const [item] = next.splice(drag, 1);
                            next.splice(i, 0, item);
                            return next;
                          });
                          setDrag(null);
                        }
                      }}
                    >
                      <span className="mini-color checker">
                        <span
                          style={{
                            backgroundColor:
                              p.state === "valid"
                                ? p.value.preview.css
                                : "transparent",
                          }}
                        />
                      </span>
                      <Input
                        aria-label={`颜色 ${i + 1}`}
                        value={c.input}
                        onChange={(e) =>
                          setEntries(
                            entries.map((v, n) =>
                              n === i ? { ...v, input: e.target.value } : v,
                            ),
                          )
                        }
                      />
                      <Input
                        aria-label={`颜色 ${i + 1} 的角色`}
                        list="color-roles"
                        value={c.role}
                        placeholder="角色（可选）"
                        onChange={(e) =>
                          setEntries(
                            entries.map((v, n) =>
                              n === i ? { ...v, role: e.target.value } : v,
                            ),
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={i === 0}
                        aria-label={`前移颜色 ${i + 1}`}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={i === entries.length - 1}
                        aria-label={`后移颜色 ${i + 1}`}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`删除颜色 ${i + 1}`}
                        onClick={() =>
                          setEntries(entries.filter((_, n) => n !== i))
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  );
                })}
              </div>
              <datalist id="color-roles">
                {[
                  "background",
                  "text",
                  "primary",
                  "secondary",
                  "accent",
                  "border",
                  "muted",
                ].map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      const data = await api<{ resources: Resource[] }>(
                        "/resources?type=color",
                      );
                      setLibraryColors(data.resources);
                      if (!data.resources.length)
                        toast.info("资源库中还没有单色");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  从已有单色选择
                </Button>
                {libraryColors.length ? (
                  <select
                    aria-label="选择已有单色"
                    defaultValue=""
                    onChange={(e) => {
                      const r = libraryColors.find(
                        (x) => x.id === e.target.value,
                      );
                      if (r && entries.length < 24) {
                        setEntries([
                          ...entries,
                          {
                            input: r.colors[0].input,
                            scale: r.colors[0].value.inputScale,
                            role: "",
                            label: r.title,
                          },
                        ]);
                        setType("palette");
                      }
                      setLibraryColors([]);
                    }}
                  >
                    <option value="">选择单色（保存快照）</option>
                    {libraryColors.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
              {!initial && entries.length + valid.length > 1 ? (
                <Field>
                  <FieldLabel htmlFor="save-mode">保存方式</FieldLabel>
                  <select
                    id="save-mode"
                    value={saveMode}
                    onChange={(e) =>
                      setSaveMode(e.target.value as "palette" | "separate")
                    }
                  >
                    <option value="palette">保存为一个色板</option>
                    <option value="separate">分别保存为多个单色</option>
                  </select>
                </Field>
              ) : null}
            </>
          ) : (
            <Field>
              <FieldLabel htmlFor="website-url">网站地址</FieldLabel>
              <Input
                id="website-url"
                autoFocus
                placeholder="https://colorhunt.co/"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <FieldDescription>
                {url && !url.includes("://")
                  ? `保存地址：https://${url}`
                  : "手动保存，无需抓取网页。"}
              </FieldDescription>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="resource-title">名称</FieldLabel>
            <Input
              id="resource-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                type === "website"
                  ? "如 Color Hunt"
                  : "给这份灵感起个名字（可选）"
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="resource-aliases">英文名 / 别名</FieldLabel>
            <Input
              id="resource-aliases"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="多个别名用逗号分隔（可选）"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="resource-description">用途与简介</FieldLabel>
            <Textarea
              id="resource-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="适合什么场景？"
            />
          </Field>
          <Field>
            <FieldLabel>分类</FieldLabel>
            <div className="category-checks">
              {org.categories.map((c) => (
                <label className="check-label" key={c.id}>
                  <input
                    type="checkbox"
                    checked={categories.includes(c.id)}
                    onChange={(e) =>
                      setCategories(
                        e.target.checked
                          ? [...categories, c.id]
                          : categories.filter((x) => x !== c.id),
                      )
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="resource-tags">标签</FieldLabel>
            <Input
              id="resource-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="蓝绿, 低饱和, 教育"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="resource-source">来源网址</FieldLabel>
            <Input
              id="resource-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="https://…（可选）"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="private-note">私有笔记</FieldLabel>
            <Textarea
              id="private-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="只有你能看到，不会出现在公开页面"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="private-rating">个人评分（私有）</FieldLabel>
            <select
              id="private-rating"
              value={rating ?? ""}
              onChange={(e) =>
                setRating(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">暂不评分</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </select>
          </Field>
          {duplicates.length ? (
            <div className="notice">
              <div>
                资源库中已有相同颜色或网址：
                {duplicates.map((r) => (
                  <a
                    key={r.id}
                    className="text-link"
                    href={`/resources/${r.id}`}
                  >
                    {r.title} ↗{" "}
                  </a>
                ))}
                。你仍可以保存为新的资源。
              </div>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="error-text">
              {error}
            </p>
          ) : null}
          <div className="form-actions">
            <span className="muted">
              {initial?.status === "published"
                ? "保存后更新公开页面"
                : "未保存内容仅是本地草稿"}
            </span>
            <Button onClick={save} disabled={busy}>
              <Save />
              {busy
                ? "正在保存…"
                : initial?.status === "published"
                  ? "保存并更新公开内容"
                  : "保存到资源库"}
            </Button>
          </div>
        </FieldGroup>
      </div>
    </section>
  );
}
