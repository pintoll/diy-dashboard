import type Database from "better-sqlite3";
import { NotFoundError, type ProjectRow } from "./types";

// Resolving a project id, in one place. Three layers need it — projects.ts
// reads the row, project-docs.ts and crud.ts only need to know the project
// exists — and each had hand-rolled its own copy, so a change to the rule
// (excluding archived projects from filing, say, or the 404 wording) would have
// had to be found three times or the surfaces would drift.
//
// Takes the caller's connection rather than opening one, so it joins whatever
// transaction is already open.

export function getProjectRow(db: Database.Database, id: string): ProjectRow {
  const row = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(id) as ProjectRow | undefined;
  if (!row) throw new NotFoundError(`No project with id "${id}"`);
  return row;
}

/** The existence half, for callers that only reference a project. */
export function assertProjectExists(db: Database.Database, id: string): void {
  getProjectRow(db, id);
}
