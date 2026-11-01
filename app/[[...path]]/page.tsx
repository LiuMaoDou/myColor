import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { redirect } from "next/navigation";
import { libraryQuery } from "@/lib/library-query";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path = [] } = await params;
  if (
    ["manage", "collections", "explore", "tools", "settings"].includes(path[0])
  )
    redirect("/library");
  if (!path.length || path[0] === "library") {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
      for (const entry of Array.isArray(value)
        ? value
        : value === undefined
          ? []
          : [value])
        query.append(key, entry);
    }
    const clean = libraryQuery(query).toString();
    if (clean !== query.toString())
      redirect(`/library${clean ? "?" + clean : ""}`);
  }
  return (
    <Suspense fallback={<div className="initial-loading">正在打开色集…</div>}>
      <AppShell />
    </Suspense>
  );
}
