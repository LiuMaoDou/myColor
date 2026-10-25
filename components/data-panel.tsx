"use client";
import { useState } from "react";
import { Download, Upload, FileJson, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api, downloadExport } from "@/lib/client";
import { Button } from "./ui/button";
import { Field, FieldLabel, FieldGroup } from "./ui/field";
type Preview = {
  hash: string;
  total: number;
  valid: number;
  invalid: number;
  rows: { index: number; title: string; valid: boolean; error: string }[];
};
export function DataPanel({ onRefresh }: { onRefresh: () => void }) {
  const [notes, setNotes] = useState(false),
    [format, setFormat] = useState("json"),
    [text, setText] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [indices, setIndices] = useState<number[]>([]),
    [duplicate, setDuplicate] = useState("skip"),
    [busy, setBusy] = useState(false),
    [report, setReport] = useState(""),
    [error, setError] = useState("");
  async function file(file: File | undefined) {
    if (!file) return;
    setError("");
    setReport("");
    setPreview(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("文件最多 5 MB");
      return;
    }
    setBusy(true);
    try {
      const value = await file.text(),
        f = file.name.toLowerCase().endsWith(".csv") ? "csv" : "json";
      setText(value);
      setFormat(f);
      const result = await api<Preview>("/imports/preview", {
        method: "POST",
        body: { text: value, format: f },
      });
      setPreview(result);
      setIndices(result.rows.filter((r) => r.valid).map((r) => r.index));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{
        imported: number;
        skipped: number;
        alreadyImported?: boolean;
        notSelected: number;
      }>("/imports/commit", {
        method: "POST",
        body: {
          text,
          format,
          hash: preview.hash,
          indices,
          duplicates: duplicate,
        },
      });
      setReport(
        r.alreadyImported
          ? "此文件和选择已导入，本次未重复写入。"
          : `成功导入 ${r.imported} 项，跳过重复 ${r.skipped} 项，未选择 ${r.notSelected} 项。所有导入内容默认私有。`,
      );
      setPreview(null);
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function template() {
    const csv =
      "group_key,type,title,color_input,color_position,color_role,url,categories,tags,description,source_url\nexample,palette,示例色板,#287F83,0,primary,,,蓝绿,教学配色,\nexample,palette,示例色板,#FFF9F0,1,background,,,,,\n";
    const a = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    );
    a.href = url;
    a.download = "color-atlas-template.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <h1>让灵感自由流动</h1>
          <p>导入已有收藏，或把你的颜色资产备份、带走。</p>
        </div>
      </div>
      <div className="data-panels">
        <section className="editor-panel">
          <div className="panel-title">
            <Download />
            <h2>导出与备份</h2>
          </div>
          <p className="muted">
            本站 JSON 包含源颜色、分类、标签、合集与来源，可用于迁移和恢复。
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={notes}
              onChange={(e) => setNotes(e.target.checked)}
            />
            同时导出私有笔记与评分
          </label>
          <div className="export-options">
            {[
              ["json", "完整 JSON 数据"],
              ["csv", "CSV 表格"],
              ["css", "CSS 变量"],
              ["text", "纯文本色值"],
            ].map(([id, label]) => (
              <Button
                key={id}
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await downloadExport(id, notes);
                    toast.success("已生成导出文件");
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <FileJson />
                {label}
                <Download />
              </Button>
            ))}
          </div>
          <p className="muted">
            CSV、CSS
            和文本是便捷复用格式，不能完整恢复元数据。完整迁移资源请使用 JSON。
          </p>
        </section>
        <section className="editor-panel">
          <div className="panel-title">
            <Upload />
            <h2>导入资源</h2>
          </div>
          <p className="muted">
            支持本站 JSON 与 CSV。最多 5 MB / 2,000 项，写入前先预览。
          </p>
          <label className="upload-zone">
            <Upload size={28} />
            <strong>选择 JSON 或 CSV 文件</strong>
            <span>导入后默认为私有草稿</span>
            <input
              aria-label="导入文件"
              type="file"
              accept=".json,.csv,application/json,text/csv"
              disabled={busy}
              onChange={(e) => file(e.target.files?.[0])}
            />
          </label>
          <Button variant="link" onClick={template}>
            下载 CSV 模板
          </Button>
          <p className="muted">
            CSV 色板使用相同 group_key，每个颜色一行；标签使用 | 分隔。JSON
            恢复保留分类关系。
          </p>
        </section>
      </div>
      {busy ? <p role="status">正在处理…</p> : null}
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      {report ? (
        <div className="notice" role="status">
          <CheckCircle2 />
          {report}
        </div>
      ) : null}
      {preview ? (
        <section className="editor-panel import-preview">
          <h2>导入预览</h2>
          <p>
            共 {preview.total} 项 · 合法 {preview.valid} 项 · 错误{" "}
            {preview.invalid} 项
          </p>
          <div className="import-rows">
            {preview.rows.map((row) => (
              <label className="import-row" key={row.index}>
                <input
                  type="checkbox"
                  disabled={!row.valid}
                  checked={indices.includes(row.index)}
                  onChange={(e) =>
                    setIndices(
                      e.target.checked
                        ? [...indices, row.index]
                        : indices.filter((i) => i !== row.index),
                    )
                  }
                />
                <span>{row.title}</span>
                <small className={row.valid ? "muted" : "error-text"}>
                  {row.valid ? "可导入" : row.error}
                </small>
              </label>
            ))}
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="duplicates">
                名称与颜色 / 网址重复时
              </FieldLabel>
              <select
                id="duplicates"
                value={duplicate}
                onChange={(e) => setDuplicate(e.target.value)}
              >
                <option value="skip">跳过重复，保留已有资源</option>
                <option value="copy">仍然另存为新资源</option>
              </select>
            </Field>
            <p className="muted">
              将导入 {indices.length} 项，跳过未勾选或无效的{" "}
              {preview.total - indices.length} 项。不会自动恢复公开状态。
            </p>
            <Button disabled={busy || !indices.length} onClick={commit}>
              确认导入所选资源
            </Button>
          </FieldGroup>
        </section>
      ) : null}
    </section>
  );
}
