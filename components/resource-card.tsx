"use client";
import Link from "next/link";
import {
  Heart,
  Lock,
  Globe,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import type { Resource } from "@/lib/types";
import type { Preferences } from "@/lib/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Swatch } from "./swatch";
export function ResourceCard({
  resource: r,
  preferences,
  onFavorite,
  publicOnly = false,
  selecting = false,
  selected = false,
  onSelect,
  onMove,
}: {
  resource: Resource;
  preferences: Preferences;
  onFavorite: () => void;
  publicOnly?: boolean;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onMove?: (delta: number) => void;
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
          <Link href={`${publicOnly ? "/explore" : ""}/resources/${r.id}`}>
            {r.title}
          </Link>
        </CardTitle>
        {!publicOnly ? (
          <Button
            variant="ghost"
            size="icon"
            title={r.favorite ? "取消收藏" : "收藏"}
            aria-label={`${r.favorite ? "取消收藏" : "收藏"} ${r.title}`}
            onClick={onFavorite}
          >
            <Heart
              fill={r.favorite ? "currentColor" : "none"}
              data-favorite={r.favorite}
            />
          </Button>
        ) : null}
      </CardHeader>
      {r.type === "website" ? (
        <p className="website-description">{r.description}</p>
      ) : null}
      <CardFooter className="resource-footer">
        <div className="tags">
          {r.tags.slice(0, 3).map((t) => (
            <Badge variant="secondary" key={t}>
              {t}
            </Badge>
          ))}
        </div>
        <span className="visibility">
          {r.visibility === "public" && r.status === "published" ? (
            <>
              <Globe />
              公开
            </>
          ) : (
            <>
              <Lock />
              私有
            </>
          )}
        </span>
      </CardFooter>
      {onMove ? (
        <div className="card-reorder">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`前移 ${r.title}`}
            onClick={() => onMove(-1)}
          >
            <ArrowLeft />
            前移
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`后移 ${r.title}`}
            onClick={() => onMove(1)}
          >
            后移
            <ArrowRight />
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
