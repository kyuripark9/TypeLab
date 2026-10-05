import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import * as opentypeNs from 'opentype.js';
import type { Design } from '../shared/design';
import { STYLES } from '../shared/content';
import { createApp } from '../server/app';
import { DesignStore } from '../server/db';

const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs) as typeof opentypeNs;

let server: Server, base = '', store: DesignStore;

before(async () => {
  store = new DesignStore(':memory:');
  server = createApp(store).listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(() => { server.close(); store.close(); });

/** A browser: it keeps the owner cookie the server hands it, as a real one would. */
function browser() {
  let cookie = '';
  return async (method: string, path: string, body?: unknown) => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  };
}
const call = browser();

const serif = STYLES.find(s => s.id === 'serif')!;

describe('designs API', () => {
  let created: Design;

  it('starts empty', async () => {
    const res = await call('GET', '/designs');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });

  it('rejects invalid designs', async () => {
    for (const body of [{}, { name: 'x', styleId: 'serif', params: { ...serif.params, weight: 3 } }, { name: 'x', styleId: 'nope', params: serif.params }]) {
      const res = await call('POST', '/designs', body);
      assert.equal(res.status, 400);
      assert.ok((await res.json()).error);
    }
    const bad = await call('POST', '/designs', '{not json');
    assert.equal(bad.status, 400);
  });

  it('creates a design and cleans its name', async () => {
    const res = await call('POST', '/designs', { name: '  My   Serif  ', styleId: 'serif', params: serif.params });
    assert.equal(res.status, 201);
    created = await res.json();
    assert.equal(created.name, 'My Serif');
    assert.equal(created.styleId, 'serif');
    assert.deepEqual(created.params, serif.params);
    assert.match(created.id, /^[\w-]{8,}$/);
  });

  it('lists and fetches it', async () => {
    const list: Design[] = await (await call('GET', '/designs')).json();
    assert.equal(list.length, 1);
    const one: Design = await (await call('GET', `/designs/${created.id}`)).json();
    assert.deepEqual(one, created);
  });

  it('updates it', async () => {
    const res = await call('PUT', `/designs/${created.id}`, { name: 'Heavier', styleId: 'serif', params: { ...serif.params, weight: 0.8 } });
    assert.equal(res.status, 200);
    const d: Design = await res.json();
    assert.equal(d.name, 'Heavier');
    assert.equal(d.params.weight, 0.8);
    assert.ok(d.updatedAt >= created.updatedAt);
  });

  it('renames it without touching its letters', async () => {
    const res = await call('PATCH', `/designs/${created.id}`, { name: '  Renamed  ' });
    assert.equal(res.status, 200);
    const d: Design = await res.json();
    assert.equal(d.name, 'Renamed');
    assert.equal(d.params.weight, 0.8);
    assert.equal((await call('PATCH', `/designs/${created.id}`, {})).status, 400);
  });

  it('keeps each browser\'s designs to itself', async () => {
    const other = browser();
    const first = await other('GET', '/designs');
    assert.match(first.headers.get('set-cookie') ?? '', /typelab_owner=[\w-]+;.*HttpOnly/);
    assert.deepEqual(await first.json(), []);
    assert.equal((await other('GET', `/designs/${created.id}`)).status, 404);
    assert.equal((await other('PATCH', `/designs/${created.id}`, { name: 'Mine now' })).status, 404);
    assert.equal((await other('DELETE', `/designs/${created.id}`)).status, 404);
    // the browser that made it still has it, unchanged
    assert.equal(((await (await call('GET', `/designs/${created.id}`)).json()) as Design).name, 'Renamed');
  });

  it('deletes it', async () => {
    assert.equal((await call('DELETE', `/designs/${created.id}`)).status, 204);
    assert.equal((await call('GET', `/designs/${created.id}`)).status, 404);
    assert.equal((await call('PUT', `/designs/${created.id}`, { name: 'x', styleId: 'serif', params: serif.params })).status, 404);
    assert.equal((await call('DELETE', `/designs/${created.id}`)).status, 404);
  });

  it('answers unknown API routes with JSON 404', async () => {
    const res = await call('GET', '/nope');
    assert.equal(res.status, 404);
    assert.ok((await res.json()).error);
  });
});

describe('export API', () => {
  it('builds an installable OpenType font', async () => {
    const res = await call('POST', '/export/otf', { name: 'Test Font', params: serif.params });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'font/otf');
    assert.match(res.headers.get('content-disposition') ?? '', /Test-Font\.otf/);
    const buf = await res.arrayBuffer();
    assert.equal(new TextDecoder().decode(buf.slice(0, 4)), 'OTTO');
    const font = opentype.parse(buf);
    assert.equal((font as unknown as { getEnglishName(k: string): string }).getEnglishName('fontFamily'), 'Test Font');
    assert.equal(font.glyphs.length, 2 + 80); // .notdef, space and every drawn character
    assert.ok(font.charToGlyph('A').advanceWidth! > 0);
  });

  it('builds an SVG specimen', async () => {
    const res = await call('POST', '/export/svg', { name: 'Test <Font>', params: serif.params });
    assert.equal(res.status, 200);
    const svg = await res.text();
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /Test &lt;Font&gt;/);
  });

  it('rejects invalid params', async () => {
    assert.equal((await call('POST', '/export/otf', { name: 'x', params: { weight: 1 } })).status, 400);
  });
});

describe('design storage', () => {
  it('gives designs saved before owners to the first browser that opens the library', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'typelab-')), 'old.db');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE designs (id TEXT PRIMARY KEY, name TEXT NOT NULL, style_id TEXT NOT NULL, params TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    old.prepare('INSERT INTO designs VALUES (?, ?, ?, ?, ?, ?)').run('old1', 'Old Serif', 'serif', JSON.stringify(serif.params), '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    old.close();
    const s = new DesignStore(file);
    assert.deepEqual(s.list('first').map(d => d.name), ['Old Serif']);
    assert.deepEqual(s.list('second'), []);
    assert.equal(s.get('old1', 'second'), null);
    s.close();
  });
});
