"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Copy, Check, Minus } from "lucide-react";
import {
  parseColorInput,
  formatColor,
  getContrast,
  type CopyFormat,
} from "@/lib/color-core";
import type { Preferences } from "@/lib/client";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Field, FieldLabel, FieldGroup } from "./ui/field";
import { Swatch } from "./swatch";
import { useCopy } from "./clipboard";
export function ToolsPanel({ preferences }: { preferences: Preferences }) {
  const [tab, setTab] = useState("convert"),
    [input, setInput] = useState("#287F83"),
    [fg, setFg] = useState("#14213D"),
    [bg, setBg] = useState("#F7FAFC"),
    [base, setBase] = useState("#FFFFFF");
  const p = parseColorInput(input),
    f = parseColorInput(fg),
    b = parseColorInput(bg),
    a = parseColorInput(base),
    copy = useCopy(),
    router = useRouter();
  let ratio: number | null = null;
  if (
    f.state === "valid" &&
    b.state === "valid" &&
    a.state === "valid" &&
    a.value.alpha === 1
  )
    ratio = getContrast(f.value, b.value, a.value);
  return (
    <section>
      <div className="section-heading">
        <div>
          <h1>颜色工具</h1>
          <p>准确转换，轻松复制，在具体场景下检查对比度。</p>
        </div>
      </div>
      <div className="filter-tabs tool-tabs">
        <Button
          variant={tab === "convert" ? "secondary" : "ghost"}
          onClick={() => setTab("convert")}
        >
          颜色转换
        </Button>
        <Button
          variant={tab === "contrast" ? "secondary" : "ghost"}
          onClick={() => setTab("contrast")}
        >
          对比度检测
        </Button>
      </div>
      {tab === "convert" ? (
        <div className="tool-layout">
          <div className="editor-panel">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="convert-input">
                  输入任意支持的颜色
                </FieldLabel>
                <Input
                  id="convert-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
              </Field>
              {p.state === "valid" ? (
                <>
                  <div className="format-list">
                    {(
                      ["auto", "hex", "rgb", "hsl", "original"] as CopyFormat[]
                    ).map((format) => (
                      <div className="format-row" key={format}>
                        <small>
                          {format === "auto"
                            ? "自动"
                            : format === "original"
                              ? "原始输入"
                              : format.toUpperCase()}
                        </small>
                        <code>{formatColor(p.value, format)}</code>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`复制 ${format} 格式`}
                          onClick={() => copy(formatColor(p.value, format))}
                        >
                          <Copy />
                        </Button>
                      </div>
                    ))}
                  </div>
                  {p.warnings.map((w) => (
                    <p className="notice" key={w}>
                      {w}
                    </p>
                  ))}
                  {p.value.alpha < 1 ? (
                    <p className="notice">
                      HEX8 的透明度会量化为 8 位。原始 alpha = {p.value.alpha}{" "}
                      保持不变。
                    </p>
                  ) : null}
                  <Button
                    onClick={() =>
                      router.push("/new?input=" + encodeURIComponent(input))
                    }
                  >
                    收藏这个颜色
                  </Button>
                </>
              ) : (
                <p className="error-text" role="status">
                  {p.issues[0]}
                </p>
              )}
            </FieldGroup>
          </div>
          <div>
            {p.state === "valid" ? (
              <Swatch value={p.value} preferences={preferences} large />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="tool-layout">
          <div className="editor-panel">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="contrast-fg">前景 / 文字颜色</FieldLabel>
                <Input
                  id="contrast-fg"
                  value={fg}
                  onChange={(e) => setFg(e.target.value)}
                />
              </Field>
              <Button
                variant="ghost"
                onClick={() => {
                  setFg(bg);
                  setBg(fg);
                }}
              >
                <ArrowRightLeft />
                交换前景与背景
              </Button>
              <Field>
                <FieldLabel htmlFor="contrast-bg">背景颜色</FieldLabel>
                <Input
                  id="contrast-bg"
                  value={bg}
                  onChange={(e) => setBg(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="contrast-base">
                  透明背景下的底色（不透明）
                </FieldLabel>
                <Input
                  id="contrast-base"
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                />
              </Field>
              <p className="muted">
                先将透明背景与底色合成，再将前景与背景合成；采用 sRGB
                相对亮度计算。
              </p>
              <a
                className="text-link"
                href="https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                WCAG 2.2 对比度标准 ↗
              </a>
            </FieldGroup>
          </div>
          <div>
            {ratio !== null &&
            f.state === "valid" &&
            b.state === "valid" &&
            a.state === "valid" ? (
              <>
                <div
                  className="contrast-base"
                  style={{ background: a.value.preview.css }}
                >
                  <div
                    className="contrast-preview"
                    style={{
                      background: b.value.preview.css,
                      color: f.value.preview.css,
                    }}
                  >
                    <span className="sample-large">让灵感清晰可见。</span>
                    <p>Good color makes room for every reader.</p>
                    <p>这是一段普通大小的示例文字。</p>
                  </div>
                </div>
                <div className="contrast-score">
                  <strong>
                    {ratio.toFixed(2)}
                    <small>:1</small>
                  </strong>
                  <span>当前前景 / 背景对比度</span>
                </div>
                <div className="contrast-checks">
                  {[
                    [4.5, "普通文字 AA"],
                    [3, "大号文字 AA"],
                    [7, "普通文字 AAA"],
                  ].map(([threshold, label]) => (
                    <p key={label}>
                      {ratio >= Number(threshold) ? <Check /> : <Minus />}
                      {label} · {ratio >= Number(threshold) ? "通过" : "未通过"}
                    </p>
                  ))}
                </div>
                <p className="muted">
                  大号文字指至少 18pt，或 14pt 粗体。结论只适用于当前组合。
                  {[f.value, b.value, a.value].some(
                    (c) => c.preview.approximate,
                  )
                    ? "当前使用近似 sRGB 映射。"
                    : ""}
                </p>
              </>
            ) : (
              <div className="notice">请提供有效颜色，并确保底色不透明。</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
