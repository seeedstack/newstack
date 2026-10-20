import type { Pool } from "pg";

import { CATEGORIES, fetchCategories, replaceCategories, sourceExists, type Category } from "./repo.js";

export class SourceNotFoundError extends Error {}
export class ValidationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const CATEGORY_SET: ReadonlySet<string> = new Set(CATEGORIES);

export function getSourceCategories(pool: Pool, sourceId: string): Promise<Category[]> {
  return fetchCategories(pool, sourceId);
}

// PRODUCT §5.9: 0-6 categories, fixed list, curator judgment — dedup rather than reject
// duplicates, since the whole-set PUT shape makes an accidental repeat easy to send.
export function validateCategories(body: unknown): Category[] {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.categories)) throw new ValidationError("categories_must_be_array");
  const categories = new Set<Category>();
  for (const value of b.categories) {
    if (typeof value !== "string" || !CATEGORY_SET.has(value)) throw new ValidationError("invalid_category");
    categories.add(value as Category);
  }
  return [...categories];
}

export async function setSourceCategories(pool: Pool, sourceId: string, categories: Category[]): Promise<Category[]> {
  if (!(await sourceExists(pool, sourceId))) throw new SourceNotFoundError();
  await replaceCategories(pool, sourceId, categories);
  return categories;
}
