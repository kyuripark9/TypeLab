/* Design storage on SQLite, via Node's built-in node:sqlite (no native modules to compile). */
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Design, DesignInput } from '../shared/design';
import { sanitizeParams } from '../shared/params';

interface Row {
  id: string;
  name: string;
  style_id: string;
  params: string;
  created_at: string;
  updated_at: string;
}

const toDesign = (r: Row): Design => ({
  id: r.id,
  name: r.name,
  styleId: r.style_id,
  // re-validate on the way out so an old or hand-edited row can never crash the engine
  params: sanitizeParams(JSON.parse(r.params)),
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

const newId = () => randomBytes(8).toString('base64url');

export class DesignStore {
  private db: DatabaseSync;

  /** `file` is a path on disk, or ':memory:' for tests. */
  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS designs (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        style_id   TEXT NOT NULL,
        params     TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS designs_updated ON designs (updated_at DESC);
    `);
  }

  list(): Design[] {
    const rows = this.db.prepare('SELECT * FROM designs ORDER BY updated_at DESC, rowid DESC').all() as unknown as Row[];
    return rows.map(toDesign);
  }

  get(id: string): Design | null {
    const row = this.db.prepare('SELECT * FROM designs WHERE id = ?').get(id) as unknown as Row | undefined;
    return row ? toDesign(row) : null;
  }

  create(input: DesignInput): Design {
    const now = new Date().toISOString(), id = newId();
    this.db.prepare('INSERT INTO designs (id, name, style_id, params, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, input.name, input.styleId, JSON.stringify(input.params), now, now);
    return this.get(id)!;
  }

  update(id: string, input: DesignInput): Design | null {
    const res = this.db.prepare('UPDATE designs SET name = ?, style_id = ?, params = ?, updated_at = ? WHERE id = ?')
      .run(input.name, input.styleId, JSON.stringify(input.params), new Date().toISOString(), id);
    return res.changes ? this.get(id) : null;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM designs WHERE id = ?').run(id).changes > 0;
  }

  close() { this.db.close(); }
}
