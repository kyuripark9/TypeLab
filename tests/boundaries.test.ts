import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/* The engine and the settings run in the browser and on the server alike: nothing under shared/ may reach
   into the client or the server, or touch the DOM. */
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);

describe('boundaries', () => {
  it('keeps shared/ free of client, server and DOM code', () => {
    for (const f of files('shared')) {
      const src = readFileSync(f, 'utf8');
      assert.doesNotMatch(src, /from '(\.\.\/)+(client|server)\//, `${f} imports from client/ or server/`);
      assert.doesNotMatch(src, /\b(document|window|localStorage|sessionStorage|navigator)\./, `${f} touches the DOM`);
    }
  });
});
