"use client";
import type { ColorValue } from "@/lib/color-core";
import { formatColor } from "@/lib/color-core";
import type { Preferences } from "@/lib/client";
import { useCopy } from "./clipboard";
export function Swatch({
  value,
  preferences,
  label,
  large = false,
}: {
  value: ColorValue;
  preferences: Preferences;
  label?: string;
  large?: boolean;
}) {
  const copy = useCopy(),
    text = formatColor(
      value,
      preferences.format,
      preferences.lowercase,
      preferences.hash,
    );
  return (
    <div className={large ? "swatch swatch-large" : "swatch"}>
      <button
        type="button"
        className="color-button checker"
        aria-label={`复制 ${text}`}
        title={`点击复制 ${text}`}
        onClick={() => copy(text)}
      >
        <span style={{ backgroundColor: value.preview.css }} />
      </button>
      <div className="color-value">
        <code>{text}</code>
        {label ? <small>{label}</small> : null}
      </div>
      {value.preview.approximate ? (
        <small className="muted">近似 sRGB</small>
      ) : null}
    </div>
  );
}
