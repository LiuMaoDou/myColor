"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Textarea } from "./ui/textarea";
const Context = createContext<(text: string) => Promise<void>>(async () => {});
export function ClipboardProvider({ children }: { children: ReactNode }) {
  const [manual, setManual] = useState("");
  const copy = async (text: string) => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      toast.success(`已复制 ${text.length > 80 ? "颜色内容" : text}`);
    } catch {
      setManual(text);
    }
  };
  return (
    <Context.Provider value={copy}>
      {children}
      <Dialog open={!!manual} onOpenChange={(o) => !o && setManual("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>手动复制</DialogTitle>
            <DialogDescription>
              浏览器未允许写入剪贴板。请选中文字，按 ⌘C / Ctrl+C 复制。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="待复制内容"
            readOnly
            value={manual}
            onFocus={(e) => e.currentTarget.select()}
            autoFocus
          />
        </DialogContent>
      </Dialog>
    </Context.Provider>
  );
}
export const useCopy = () => useContext(Context);
