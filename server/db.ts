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
    // each design belongs to the browser that made it; databases from before owners get the column,
    // and their designs are adopted by the first browser to open the library (see adopt)
    const cols = this.db.prepare('PRAGMA table_info(designs)').all() as unknown as { name: string }[];
    if (!cols.some(c => c.name === 'owner')) this.db.exec('ALTER TABLE designs ADD COLUMN owner TEXT');
    this.db.exec('CREATE INDEX IF NOT EXISTS designs_owner ON designs (owner, updated_at DESC)');
  }

  /** Designs saved before there were owners go to the first browser that asks for them. */
  private adopt(owner: string) {
    this.db.prepare('UPDATE designs SET owner = ? WHERE owner IS NULL').run(owner);
  }

  /** `owner`'s designs, newest first. */
  list(owner: string): Design[] {
    this.adopt(owner);
    const rows = this.db.prepare('SELECT * FROM designs WHERE owner = ? ORDER BY updated_at DESC, rowid DESC').all(owner) as unknown as Row[];
    return rows.map(toDesign);
  }

  /** One of `owner`'s designs; another browser's design is as good as missing. */
  get(id: string, owner: string): Design | null {
    this.adopt(owner);
    const row = this.db.prepare('SELECT * FROM designs WHERE id = ? AND owner = ?').get(id, owner) as unknown as Row | undefined;
    return row ? toDesign(row) : null;
  }

  create(input: DesignInput, owner: string): Design {
    const now = new Date().toISOString(), id = newId();
    this.db.prepare('INSERT INTO designs (id, name, style_id, params, created_at, updated_at, owner) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, input.name, input.styleId, JSON.stringify(input.params), now, now, owner);
    return this.get(id, owner)!;
  }

  update(id: string, input: DesignInput, owner: string): Design | null {
    const res = this.db.prepare('UPDATE designs SET name = ?, style_id = ?, params = ?, updated_at = ? WHERE id = ? AND owner = ?')
      .run(input.name, input.styleId, JSON.stringify(input.params), new Date().toISOString(), id, owner);
    return res.changes ? this.get(id, owner) : null;
  }

  /** Change only the name, leaving the saved letters as they were. */
  rename(id: string, name: string, owner: string): Design | null {
    const res = this.db.prepare('UPDATE designs SET name = ?, updated_at = ? WHERE id = ? AND owner = ?')
      .run(name, new Date().toISOString(), id, owner);
    return res.changes ? this.get(id, owner) : null;
  }

  delete(id: string, owner: string): boolean {
    return this.db.prepare('DELETE FROM designs WHERE id = ? AND owner = ?').run(id, owner).changes > 0;
  }

  close() { this.db.close(); }
}
