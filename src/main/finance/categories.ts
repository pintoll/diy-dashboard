import { getFinanceDb } from "./db";
import type { Category, CategoryInput, CategoryRow } from "./types";

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    groupName: row.group_name,
    kind: row.kind,
    isFixed: row.is_fixed === 1,
    sortOrder: row.sort_order,
  };
}

export function listCategories(): Category[] {
  const rows = getFinanceDb()
    .prepare(
      `SELECT id, name, group_name, kind, is_fixed, sort_order
       FROM categories
       ORDER BY sort_order, id`
    )
    .all() as CategoryRow[];
  return rows.map(toCategory);
}

export function createCategory(input: CategoryInput): number {
  if (!input.name.trim()) throw new Error("Category name is required");
  if (!input.groupName.trim()) throw new Error("Category group is required");

  const db = getFinanceDb();
  const { maxOrder } = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM categories")
    .get() as { maxOrder: number };

  const info = db
    .prepare(
      `INSERT INTO categories (name, group_name, kind, is_fixed, sort_order)
       VALUES (@name, @groupName, @kind, @isFixed, @sortOrder)`
    )
    .run({
      name: input.name.trim(),
      groupName: input.groupName.trim(),
      kind: input.kind,
      isFixed: input.isFixed ? 1 : 0,
      sortOrder: maxOrder + 1,
    });

  return Number(info.lastInsertRowid);
}
