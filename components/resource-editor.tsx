"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Save } from "lucide-react";
import { toast } from "sonner";
import {
  parseColorBatch,
  parseColorInput,
  formatColor,
  MAX_COLORS,
} from "@/lib/color-core";
import type { Resource, ResourceType, ResourceInput } from "@/lib/types";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Field, FieldLabel, FieldGroup, FieldDescription } from "./ui/field";
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
  onSaved,
}: {
  initial?: Resource;
  quick?: string;
  duplicateId?: string;
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
  const [text, setText] = useState(
    initial?.colors.map((c) => c.input).join("\n") || quick,
  );
  const [scale, setScale] = useState<"unit" | "byte" | undefined>();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(false);
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
          setText(r.colors.map((c) => c.input).join("\n"));
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
    () =>
      text.trim()
        ? text
            .split(/[;\n]+/)
            .filter((line) => line.trim())
            .flatMap((line) => parseColorBatch(line, scale))
            .map((c, i) => {
              const original =
                entries[i]?.input.trim() === c.input.trim()
                  ? entries[i]
                  : entries.find(
                      (entry) => entry.input.trim() === c.input.trim(),
                    );
              const metadata = original || entries[i];
              const inputScale = scale ?? original?.scale;
              return {
                ...c,
                result: inputScale
                  ? parseColorInput(c.input, inputScale)
                  : c.result,
                scale: inputScale,
                role: metadata?.role || "",
                label: metadata?.label || "",
              };
            })
        : [],
    [text, scale, entries],
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
          version: 2,
          scale,
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
    scale,
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
      setText(
        d.version === 2
          ? d.text || ""
          : [...(d.entries || []).map((c: Entry) => c.input), d.text || ""]
              .filter(Boolean)
              .join("\n"),
      );
      setScale(d.scale);
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
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (type !== "website" && invalid)
        throw new Error("请修正颜色数据后再保存");
      const colors =
        type === "website"
          ? []
          : valid.map((c) => ({
              input: c.input,
              role: c.role,
              label: c.label,
              scale: c.scale,
            }));
      if (colors.length > MAX_COLORS)
        throw new Error(`每个色板最多 ${MAX_COLORS} 个颜色`);
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
        tags:
          type !== "website" && initial
            ? initial.tags
            : tags
                .split(/[,，]/)
                .map((t) => t.trim())
                .filter(Boolean),
        categoryIds: categories,
        aliases:
          type !== "website" && initial
            ? initial.aliases
            : aliases
                .split(/[,，]/)
                .map((v) => v.trim())
                .filter(Boolean),
        sourceKind: initial?.sourceKind || "manual",
        sourceMetadata: initial?.sourceMetadata || {},
      };
      const result = await api<Resource>(
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
      sessionStorage.removeItem("atlas-new-draft");
      toast.success("已保存到资源库");
      onSaved();
      router.push(`/resources/${result.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="editor-layout" data-color-editor={type !== "website"}>
      <div className="section-heading">
        <div>
          <h1>
            {initial
              ? "编辑资源"
              : type === "website"
                ? "添加网站书签"
                : "添加颜色"}
          </h1>
          <p>
            {type === "website"
              ? "保存喜欢的网站。"
              : "输入颜色，即刻生成色卡。"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            取消
          </Button>
        </div>
      </div>
      {draft ? (
        <div className="notice">
          发现未保存的本地草稿。
          <Button variant="link" onClick={restore}>
            恢复草稿
          </Button>
        </div>
      ) : null}
      <form
        className="editor-panel"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={!ready || busy} className="min-w-0">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="resource-title">名字</FieldLabel>
              <Input
                id="resource-title"
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  type === "website"
                    ? "如 Color Hunt（可选）"
                    : "可选，留空使用颜色值"
                }
              />
            </Field>
            {type !== "website" ? (
              <>
                <FieldGroup className="color-entry-row">
                  <Field
                    data-invalid={invalid > 0 || parsed.length > MAX_COLORS}
                  >
                    <FieldLabel htmlFor="color-input">颜色数据</FieldLabel>
                    <Textarea
                      id="color-input"
                      autoFocus
                      required
                      rows={1}
                      className="color-data-input"
                      spellCheck={false}
                      value={text}
                      aria-invalid={invalid > 0 || parsed.length > MAX_COLORS}
                      aria-describedby="color-input-help color-input-feedback"
                      onChange={(e) => {
                        setText(e.target.value);
                        setError("");
                      }}
                      placeholder="#287F83"
                    />
                    <FieldDescription id="color-input-help">
                      支持 HEX、RGB、HSL
                      等格式；多个颜色用换行或分号分隔，自动保存为色板。
                    </FieldDescription>
                    <div id="color-input-feedback" aria-live="polite">
                      {parsed
                        .filter(
                          (c) =>
                            c.result.state !== "valid" &&
                            c.result.state !== "ambiguous",
                        )
                        .map((c, i) => (
                          <p className="error-text" key={i}>
                            {c.result.state !== "valid"
                              ? c.result.issues[0]
                              : ""}
                            ：{c.input}
                          </p>
                        ))}
                      {parsed.length > MAX_COLORS ? (
                        <p className="error-text">
                          每个色板最多 {MAX_COLORS} 个颜色
                        </p>
                      ) : null}
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel id="color-card-label">颜色卡片</FieldLabel>
                    <div
                      className="color-preview-card checker"
                      role="img"
                      aria-labelledby="color-card-label"
                    >
                      {valid.map((c, i) =>
                        c.result.state === "valid" ? (
                          <span
                            key={i}
                            style={{
                              backgroundColor: c.result.value.preview.css,
                            }}
                          />
                        ) : null,
                      )}
                    </div>
                  </Field>
                </FieldGroup>
                {parsed.some((c) => c.result.state === "ambiguous") || scale ? (
                  <Field>
                    <FieldLabel htmlFor="scale">RGB 数字范围</FieldLabel>
                    <select
                      id="scale"
                      value={scale || ""}
                      onChange={(e) =>
                        setScale(
                          e.target.value
                            ? (e.target.value as "unit" | "byte")
                            : undefined,
                        )
                      }
                    >
                      <option value="">请选择</option>
                      <option value="unit">0–1</option>
                      <option value="byte">0–255</option>
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
                  required
                  placeholder="https://colorhunt.co/"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </Field>
            )}
            {type === "website" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="resource-aliases">
                    英文名 / 别名
                  </FieldLabel>
                  <Input
                    id="resource-aliases"
                    value={aliases}
                    onChange={(e) => setAliases(e.target.value)}
                    placeholder="多个别名用逗号分隔（可选）"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="resource-description">
                    用途与简介
                  </FieldLabel>
                  <Textarea
                    id="resource-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="适合什么场景？"
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
                    placeholder="记录你的想法（可选）"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="private-rating">
                    个人评分（私有）
                  </FieldLabel>
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
              </>
            ) : null}
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
              <Button
                type="submit"
                disabled={
                  busy ||
                  (type !== "website" &&
                    (!valid.length ||
                      invalid > 0 ||
                      parsed.length > MAX_COLORS))
                }
              >
                <Save data-icon="inline-start" />
                {busy ? "正在保存…" : "保存到资源库"}
              </Button>
            </div>
          </FieldGroup>
        </fieldset>
      </form>
    </section>
  );
}
