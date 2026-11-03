"use client";
import Link from "next/link";
import { ArrowUpRight, Pencil, Trash2 } from "lucide-react";
import type { Resource } from "@/lib/types";
import type { Preferences } from "@/lib/client";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Swatch } from "./swatch";
import { Button } from "./ui/button";
export function ResourceCard({
  resource: r,
  preferences,
  selecting = false,
  selected = false,
  onSelect,
  onDelete,
  deleting = false,
  deleteDisabled = false,
}: {
  resource: Resource;
  preferences: Preferences;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onDelete: () => void;
  deleting?: boolean;
  deleteDisabled?: boolean;
}) {
  return (
    <Card className="resource-card" data-selected={selected}>
      <CardContent className="resource-visual">
        {r.type === "website" ? (
          <a
            href={r.normalizedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="website-visual"
          >
            <div className="site-monogram">{r.title.slice(0, 1)}</div>
            <span>
              {new URL(r.normalizedUrl).hostname.replace(/^www\./, "")}
            </span>
            <ArrowUpRight size={20} />
          </a>
        ) : (
          <div className="swatch-strip">
            {r.colors.map((c, i) => (
              <Swatch key={i} value={c.value} preferences={preferences} />
            ))}
          </div>
        )}
      </CardContent>
      <CardHeader className="resource-heading">
        <CardTitle>
          {selecting ? (
            <input
              type="checkbox"
              aria-label={`选择 ${r.title}`}
              checked={selected}
              onChange={onSelect}
            />
          ) : null}
          <Link href={`/resources/${r.id}`}>{r.title}</Link>
        </CardTitle>
        <div className="resource-card-actions">
          {r.type !== "website" ? (
            <Button variant="ghost" size="sm" asChild>
              <Link
                href={`/resources/${r.id}/edit`}
                aria-label={`编辑 ${r.title}`}
              >
                <Pencil data-icon="inline-start" />
                编辑
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="resource-delete"
            aria-label={`删除 ${r.title}`}
            disabled={deleteDisabled}
            onClick={onDelete}
          >
            <Trash2 data-icon="inline-start" />
            {deleting ? "删除中…" : "删除"}
          </Button>
        </div>
      </CardHeader>
      {r.type === "website" ? (
        <p className="website-description">{r.description}</p>
      ) : null}
    </Card>
  );
}
