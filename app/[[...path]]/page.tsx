import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
export default function Page() {
  return (
    <Suspense fallback={<div className="initial-loading">正在打开色集…</div>}>
      <AppShell />
    </Suspense>
  );
}
