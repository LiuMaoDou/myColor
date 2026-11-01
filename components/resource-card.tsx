"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Resource } from "@/lib/types";
import type { Preferences } from "@/lib/client";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Swatch } from "./swatch";
export function ResourceCard({
  resource: r,
  preferences,
  selecting = false,
  selected = false,
  onSelect,
}: {
  resource: Resource;
  preferences: Preferences;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: () => void;
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
      </CardHeader>
      {r.type === "website" ? (
        <p className="website-description">{r.description}</p>
      ) : null}
    </Card>
  );
}
