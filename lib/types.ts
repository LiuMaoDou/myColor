import type { ColorValue } from "./color-core";
export type ResourceType = "color" | "palette" | "website";
export interface Swatch {
  input: string;
  role: string;
  label: string;
  value: ColorValue;
}
export interface Resource {
  id: string;
  type: ResourceType;
  title: string;
  aliases: string[];
  description: string;
  sourceUrl: string;
  sourceKind: string;
  sourceMetadata: Record<string, unknown>;
  status: "draft" | "published" | "archived";
  visibility: "private" | "public";
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  colors: Swatch[];
  url: string;
  normalizedUrl: string;
  categoryIds: string[];
  tags: string[];
  favorite: boolean;
  privateNote?: string;
  rating?: number | null;
  collectionIds?: string[];
}
export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}
export interface Collection {
  id: string;
  name: string;
  description: string;
  visibility: "private" | "public";
  resourceIds: string[];
}
export interface Organization {
  categories: Category[];
  tags: { id: string; name: string }[];
  collections: Collection[];
}
export interface ResourceInput {
  type: ResourceType;
  title: string;
  aliases?: string[];
  description?: string;
  sourceUrl?: string;
  sourceKind?: string;
  sourceMetadata?: Record<string, unknown>;
  colors: {
    input: string;
    role?: string;
    label?: string;
    scale?: "unit" | "byte";
  }[];
  url?: string;
  categoryIds?: string[];
  tags?: string[];
  privateNote?: string;
  rating?: number | null;
  expectedVersion?: number;
}
