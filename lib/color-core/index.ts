import {
  parse,
  converter,
  formatHex,
  formatHex8,
  clampRgb,
  displayable,
  type Color,
} from "culori";
export type CopyFormat = "auto" | "hex" | "rgb" | "hsl" | "original";
export interface ColorValue {
  schemaVersion: 1;
  originalInput: string;
  inputScale?: "unit" | "byte";
  source: Color;
  alpha: number;
  xyzD65: [number, number, number];
  oklab: [number, number, number];
  preview: {
    css: string;
    hex: string;
    inSrgbGamut: boolean;
    approximate: boolean;
  };
  engineVersion: string;
  mappingVersion: string;
}
export type ParseResult =
  | { state: "valid"; value: ColorValue; warnings: string[] }
  | { state: "invalid" | "incomplete" | "ambiguous"; issues: string[] };
export const MAX_COLORS = 24;
const rgb = converter("rgb"),
  xyz = converter("xyz65"),
  lab = converter("oklab"),
  hsl = converter("hsl");
const round = (v: number, n = 6) => Number(v.toFixed(n));
const clamp = (v: number) => Math.min(1, Math.max(0, v));
export function parseColorInput(
  raw: string,
  scale?: "unit" | "byte",
): ParseResult {
  const input = raw
    .trim()
    .replaceAll("，", ",")
    .replaceAll("（", "(")
    .replaceAll("）", ")");
  const fail = (
    state: "invalid" | "incomplete" | "ambiguous",
    message: string,
  ): ParseResult => ({ state, issues: [message] });
  if (
    !input ||
    /^#?[\da-f]{0,2}$/i.test(input) ||
    /^#[\da-f]{5}$/i.test(input) ||
    /^(rgb|rgba|hsl|hsla|hsv|hsb)\([^)]*$/i.test(input)
  )
    return fail("incomplete", "继续输入一个完整颜色");
  if (input.length > 512 || /[\x00-\x1f\x7f]/.test(input))
    return fail("invalid", "颜色输入过长或含控制字符");
  if (
    /\b(var|currentcolor|inherit|unset|light-dark|color-mix|initial|none)\b/i.test(
      input,
    )
  )
    return fail("invalid", "此输入依赖上下文或缺失通道，请提供具体颜色值");
  let source: Color | undefined;
  const warnings: string[] = [];
  const hsv = input.match(
    /^hs[vb]\(\s*([-+]?\d*\.?\d+)\s*[, ]\s*([-+]?\d*\.?\d+)%\s*[, ]\s*([-+]?\d*\.?\d+)%\s*(?:\/\s*([-+]?\d*\.?\d+)(%)?)?\s*\)$/i,
  );
  const triple = input.match(
    /^\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*$/,
  );
  if (hsv) {
    const h = +hsv[1],
      s = +hsv[2] / 100,
      v = +hsv[3] / 100,
      a = hsv[4] === undefined ? 1 : +hsv[4] / (hsv[5] ? 100 : 1);
    if (s < 0 || s > 1 || v < 0 || v > 1 || a < 0 || a > 1)
      return fail("invalid", "HSV 的 S/V 为 0–100%，透明度为 0–1");
    source = { mode: "hsv", h: ((h % 360) + 360) % 360, s, v, alpha: a };
    warnings.push("HSV/HSB 为本站扩展格式，不是原生 CSS 函数");
  } else if (triple) {
    const c = triple.slice(1).map(Number);
    if (
      !scale &&
      c.some((x) => !Number.isInteger(x)) &&
      c.every((x) => x >= 0 && x <= 1)
    )
      return fail("ambiguous", "请选择数字量纲：RGB 0–1 或 RGB 0–255");
    const max = scale === "unit" ? 1 : 255;
    if (c.some((x) => x < 0 || x > max))
      return fail("invalid", `RGB 数字需在 0–${max} 之间`);
    source = { mode: "rgb", r: c[0] / max, g: c[1] / max, b: c[2] / max };
    warnings.push(`按 RGB 0–${max} 识别`);
  } else {
    source = parse(input.toLowerCase());
    if (source && /^[\da-f]{3,4}$|^[\da-f]{6}$|^[\da-f]{8}$/i.test(input))
      warnings.push(`按 HEX 识别为 ${formatHex(source)?.toUpperCase()}`);
    if (!source && /^[\da-f]{3,4}$|^[\da-f]{6}$|^[\da-f]{8}$/i.test(input)) {
      source = parse("#" + input);
      warnings.push(`按 HEX 识别为 ${formatHex(source)?.toUpperCase()}`);
    }
  }
  if (!source) return fail("invalid", "无法识别此颜色，请检查格式与完整输入");
  if (
    Object.values(source).some(
      (v) => typeof v === "number" && !Number.isFinite(v),
    )
  )
    return fail("invalid", "颜色通道必须是有限数");
  const alpha = clamp(source.alpha ?? 1);
  source = { ...source, alpha };
  // CSS rgb/hsl channels normalize before conversion; non-sRGB source spaces retain their gamut.
  if (source.mode === "rgb") {
    const normalized = {
      ...source,
      r: clamp(source.r),
      g: clamp(source.g),
      b: clamp(source.b),
    };
    if (
      source.r !== normalized.r ||
      source.g !== normalized.g ||
      source.b !== normalized.b
    )
      warnings.push("超范围 RGB 通道已按 CSS 规则截断");
    source = normalized;
  }
  if (source.mode === "hsl") {
    source = { ...source, s: clamp(source.s), l: clamp(source.l) };
  }
  const x = xyz(source),
    o = lab(source),
    p = clampRgb(source),
    inside = displayable(source);
  if (!x || !o || !p) return fail("invalid", "颜色转换失败");
  const css = rgbExpression(p, alpha);
  return {
    state: "valid",
    value: {
      schemaVersion: 1,
      originalInput: raw,
      inputScale: triple ? scale || "byte" : undefined,
      source,
      alpha,
      xyzD65: [x.x, x.y, x.z],
      oklab: [o.l, o.a, o.b],
      preview: {
        css,
        hex: formatHex(p)!.toUpperCase(),
        inSrgbGamut: inside,
        approximate: !inside,
      },
      engineVersion: "culori-4.0.2/atlas-1",
      mappingVersion: "srgb-channel-clip-v1",
    },
    warnings: !inside
      ? [...warnings, "超出 sRGB，预览与 HEX 是近似映射"]
      : warnings,
  };
}
function rgbExpression(c: Color, alpha: number) {
  const p = rgb(c)!;
  return `rgb(${round(p.r * 255, 12)} ${round(p.g * 255, 12)} ${round(p.b * 255, 12)}${alpha < 1 ? ` / ${alpha}` : ""})`;
}
export function formatColor(
  c: ColorValue,
  format: CopyFormat = "auto",
  lowercase = false,
  hash = true,
): string {
  if (format === "original") return c.originalInput;
  if (format === "auto" && c.preview.approximate) return c.originalInput;
  if (format === "auto") {
    const channels = rgb(c.source)!;
    const byteExact = [channels.r, channels.g, channels.b].every(
      (v) => Math.abs(v * 255 - Math.round(v * 255)) < 1e-8,
    );
    if (
      !byteExact &&
      /^\s*(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*[（(]/i.test(
        c.originalInput,
      )
    ) {
      return c.originalInput
        .trim()
        .replaceAll("，", ",")
        .replaceAll("（", "(")
        .replaceAll("）", ")");
    }
    format = c.alpha < 1 || !byteExact ? "rgb" : "hex";
  }
  if (format === "hex") {
    let v = (
      c.alpha < 1
        ? formatHex8(clampRgb(c.source))
        : formatHex(clampRgb(c.source))
    )!;
    v = lowercase ? v.toLowerCase() : v.toUpperCase();
    return hash ? v : v.slice(1);
  }
  if (format === "rgb") return rgbExpression(clampRgb(c.source), c.alpha);
  const h = hsl(clampRgb(c.source))!;
  return `hsl(${round(h.h ?? 0, 4)} ${round(h.s * 100, 4)}% ${round(h.l * 100, 4)}%${c.alpha < 1 ? ` / ${c.alpha}` : ""})`;
}
export function parseColorBatch(input: string, scale?: "unit" | "byte") {
  const one = parseColorInput(input, scale);
  if (one.state === "valid" || one.state === "ambiguous")
    return [{ input, result: one }];
  let depth = 0,
    quote = "",
    start = 0;
  const items: string[] = [];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote && input[i - 1] !== "\\") quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && /[;\n,\t ]/.test(ch)) {
      const part = input.slice(start, i).trim();
      if (part) items.push(part);
      start = i + 1;
    }
  }
  const tail = input.slice(start).trim();
  if (tail) items.push(tail);
  if (items.length > 200)
    return [
      {
        input,
        result: {
          state: "invalid",
          issues: ["每次最多解析 200 个颜色"],
        } as ParseResult,
      },
    ];
  return (items.length ? items : [input]).map((input) => ({
    input,
    result: parseColorInput(input, scale),
  }));
}
export function exactColorKey(c: ColorValue) {
  return [...c.xyzD65.map((v) => round(v, 9)), round(c.alpha, 9)].join(":");
}
export function getContrast(
  foreground: ColorValue,
  background: ColorValue,
  base: ColorValue,
) {
  if (base.alpha !== 1) throw new Error("底色必须不透明");
  const f = rgb(clampRgb(foreground.source))!,
    b = rgb(clampRgb(background.source))!,
    s = rgb(clampRgb(base.source))!;
  const composite = (a: number[], back: number[], alpha: number) =>
    a.map((v, i) => v * alpha + back[i] * (1 - alpha));
  const bg = composite([b.r, b.g, b.b], [s.r, s.g, s.b], background.alpha);
  const fg = composite([f.r, f.g, f.b], bg, foreground.alpha);
  const lum = (c: number[]) =>
    c
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  const l1 = lum(fg),
    l2 = lum(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
export function cssVariables(colors: { value: ColorValue; role?: string }[]) {
  const used = new Map<string, number>();
  return (
    ":root {\n" +
    colors
      .map((c, i) => {
        const root =
          (c.role || `swatch-${i + 1}`)
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "-")
            .replace(/^-+/, "") || `swatch-${i + 1}`;
        const n = (used.get(root) || 0) + 1;
        used.set(root, n);
        return `  --color-${root}${n > 1 ? `-${n}` : ""}: ${formatColor(c.value)};`;
      })
      .join("\n") +
    "\n}"
  );
}
