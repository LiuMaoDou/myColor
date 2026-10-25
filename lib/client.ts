import type { CopyFormat } from "./color-core";
export interface Preferences {
  format: CopyFormat;
  lowercase: boolean;
  hash: boolean;
  theme: "light" | "dark";
  density: "comfortable" | "compact";
}
export const defaultPreferences: Preferences = {
  format: "auto",
  lowercase: false,
  hash: true,
  theme: "light",
  density: "comfortable",
};
export async function api<T>(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch("/api" + path, {
    method: options?.method || "GET",
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error?.message || "请求失败");
  }
  return response.json();
}
export async function downloadExport(
  format: string,
  includeNotes = false,
  ids?: string[],
) {
  const res = await fetch("/api/exports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, includeNotes, ids }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error?.message || "导出失败");
  }
  const blob = await res.blob(),
    url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `color-atlas-${new Date().toISOString().slice(0, 10)}.${format === "text" ? "txt" : format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
