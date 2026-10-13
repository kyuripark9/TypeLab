/* The HTTP API (server/app.ts) on an in-memory store, called through a stand-in browser that keeps its cookies:
   designs, accounts, Google sign-in (against a stand-in Google) and which account it joins (joinGoogle), the
   development stand-in for Google (googleStandIn) and its account picker, export,
   and reading a database saved before designs had owners or letters' records of their edits (server/db.ts) or accounts
   had Google (server/accounts.ts).
   The tests in each describe run in order and build on the designs and accounts the earlier ones made. */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import type { Design } from '../shared/design';
import { cleanVersions, packVersions } from '../shared/font-log';
import { STYLES } from '../shared/content';
import { ALL_CHARS } from '../shared/engine';
import { createHash } from 'node:crypto';
import { AccountStore } from '../server/accounts';
import { createApp, joinGoogle } from '../server/app';
import { DesignStore } from '../server/db';
import { STAND_IN_PATH, googleStandIn, type GoogleAuth, type GoogleProfile } from '../server/google';
import { opentype } from '../server/opentype';

let server: Server, base = '', store: DesignStore;

before(async () => {
  store = new DesignStore(':memory:');
  server = createApp(store).listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(() => { server.close(); store.close(); });

/** A browser: it keeps the cookies the server hands it (owner and session), as a real one would. */
function browser(at = () => base) {
  const jar = new Map<string, string>();
  return async (method: string, path: string, body?: unknown) => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(at() + path, { method, headers, redirect: 'manual', body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    for (const set of res.headers.getSetCookie()) {
      const [k, v] = set.split(';')[0].split('=');
      if (/Max-Age=0/.test(set)) jar.delete(k); else jar.set(k, v);
    }
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

  it('keeps the letters\' record of their edits, cleaned, out of the list, and when a save sends none', async () => {
    const params = { ...serif.params, weight: 0.8 }, log = { a: [{ t: 1, keys: ['weight'], own: { weight: 0.8 } }, { t: 2, keys: ['weight', 'nope'], own: { weight: 3 } }] };
    const res = await call('PUT', `/designs/${created.id}`, { name: 'Renamed', styleId: 'serif', params, log });
    assert.equal(res.status, 200);
    const clean = { a: [log.a[0], { t: 2, keys: ['weight'], own: { weight: 1 } }] };
    assert.deepEqual(((await res.json()) as Design).log, clean);
    const list: Design[] = await (await call('GET', '/designs')).json();
    assert.ok(!('log' in list[0]));
    assert.equal((await call('PUT', `/designs/${created.id}`, { name: 'Renamed', styleId: 'serif', params })).status, 200);
    assert.deepEqual(((await (await call('GET', `/designs/${created.id}`)).json()) as Design).log, clean);
  });

  it('keeps the font\'s History, cleaned, out of the list, and when a save sends none', async () => {
    const params = { ...serif.params, weight: 0.8 };
    const versions = [{ t: 1, keys: [], letters: [], base: true, styleId: 'serif', set: serif.params, glyphs: {}, outlines: {} }, { t: 2, keys: ['weight', 'nope'], letters: [], set: { weight: 0.8 } }];
    const res = await call('PUT', `/designs/${created.id}`, { name: 'Renamed', styleId: 'serif', params, versions });
    assert.equal(res.status, 200);
    const clean = packVersions(cleanVersions(versions)), got = ((await res.json()) as Design).versions;
    assert.deepEqual(got, JSON.parse(JSON.stringify(clean)));
    assert.deepEqual(got!.map(v => [v.t, v.keys, v.set?.weight]), [[1, [], serif.params.weight], [2, ['weight'], 0.8]]);
    const list: Design[] = await (await call('GET', '/designs')).json();
    assert.ok(!('versions' in list[0]));
    assert.equal((await call('PUT', `/designs/${created.id}`, { name: 'Renamed', styleId: 'serif', params })).status, 200);
    assert.deepEqual(((await (await call('GET', `/designs/${created.id}`)).json()) as Design).versions, got);
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

describe('accounts API', () => {
  const email = 'Ana@Example.com', password = 'correct horse';
  const make = (b: ReturnType<typeof browser>, name: string) => b('POST', '/designs', { name, styleId: 'serif', params: serif.params });

  it('signs up, bringing along the fonts saved in that browser', async () => {
    const ana = browser();
    await make(ana, 'Before signing up');
    assert.deepEqual(await (await ana('GET', '/auth/me')).json(), { user: null, google: false });
    for (const bad of [{ email: 'nope', password }, { email, password: 'short' }, {}]) {
      assert.equal((await ana('POST', '/auth/signup', bad)).status, 400);
    }
    const res = await ana('POST', '/auth/signup', { email, password, name: '  Ana  ' });
    assert.equal(res.status, 201);
    const { user, moved } = await res.json();
    assert.equal(user.email, 'ana@example.com');
    assert.equal(user.name, 'Ana');
    assert.equal(moved, 1);
    assert.equal(user.password, undefined);
    assert.match(res.headers.getSetCookie().join('\n'), /typelab_session=[\w-]+;.*HttpOnly/);
    assert.deepEqual(((await (await ana('GET', '/designs')).json()) as Design[]).map(d => d.name), ['Before signing up']);
    assert.equal((await (await ana('GET', '/auth/me')).json()).user.email, 'ana@example.com');
    // the same email, however it's typed, is one account
    assert.equal((await browser()('POST', '/auth/signup', { email: ' ANA@example.com ', password })).status, 409);
  });

  it('keeps an account\'s fonts out of the browser once signed out, and back on any browser signed in', async () => {
    const laptop = browser();
    assert.equal((await laptop('POST', '/auth/login', { email, password: 'wrong password' })).status, 401);
    assert.equal((await laptop('POST', '/auth/login', { email: 'nobody@example.com', password })).status, 401);
    await make(laptop, 'Made on the laptop');
    const res = await laptop('POST', '/auth/login', { email: 'ana@EXAMPLE.com', password });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).moved, 1);
    const names = ((await (await laptop('GET', '/designs')).json()) as Design[]).map(d => d.name).sort();
    assert.deepEqual(names, ['Before signing up', 'Made on the laptop']);
    assert.equal((await laptop('POST', '/auth/logout')).status, 204);
    assert.deepEqual(await (await laptop('GET', '/auth/me')).json(), { user: null, google: false });
    assert.deepEqual(await (await laptop('GET', '/designs')).json(), []);
  });

  it('renames the account, changes its password and signs other browsers out', async () => {
    const a = browser(), b = browser();
    await a('POST', '/auth/login', { email, password });
    await b('POST', '/auth/login', { email, password });
    assert.equal((await (await a('PATCH', '/auth/me', { name: 'Ana P' })).json()).user.name, 'Ana P');
    assert.equal((await a('POST', '/auth/password', { current: 'wrong', next: 'a new password' })).status, 403);
    assert.equal((await a('POST', '/auth/password', { current: password, next: 'short' })).status, 400);
    assert.equal((await a('POST', '/auth/password', { current: password, next: 'a new password' })).status, 200);
    assert.equal((await (await a('GET', '/auth/me')).json()).user.name, 'Ana P');
    assert.deepEqual(await (await b('GET', '/auth/me')).json(), { user: null, google: false });
    assert.equal((await b('POST', '/auth/login', { email, password })).status, 401);
    assert.equal((await b('POST', '/auth/login', { email, password: 'a new password' })).status, 200);
    assert.equal((await browser()('PATCH', '/auth/me', { name: 'x' })).status, 401);
  });

  it('slows down guessing', async () => {
    const guesser = browser(), victim = 'guess@example.com';
    await guesser('POST', '/auth/signup', { email: victim, password });
    // 10 wrong passwords is the most server/app.ts's Throttle allows before it makes an address wait
    for (let i = 0; i < 10; i++) assert.equal((await guesser('POST', '/auth/login', { email: victim, password: `guess ${i}` })).status, 401);
    assert.equal((await guesser('POST', '/auth/login', { email: victim, password })).status, 429);
  });

  it('closes the account and deletes its fonts', async () => {
    const a = browser();
    await a('POST', '/auth/login', { email, password: 'a new password' });
    assert.equal((await a('DELETE', '/auth/me', { password: 'wrong' })).status, 403);
    assert.equal((await a('DELETE', '/auth/me', { password: 'a new password' })).status, 204);
    assert.deepEqual(await (await a('GET', '/auth/me')).json(), { user: null, google: false });
    assert.equal((await a('POST', '/auth/login', { email, password: 'a new password' })).status, 401);
    assert.equal((store.db.prepare('SELECT COUNT(*) AS n FROM designs WHERE owner LIKE \'user:%\' AND name = ?').get('Before signing up') as { n: number }).n, 0);
  });
});

describe('Google sign-in', () => {
  // a stand-in for Google: each code names a person, and the PKCE verifier has to match its challenge
  const people = new Map<string, GoogleProfile>(), challenges = new Map<string, string>();
  const fake: GoogleAuth = {
    authUrl: ({ redirectUri, state, challenge }) => {
      challenges.set(state, challenge);
      return `https://google.test/auth?${new URLSearchParams({ redirect_uri: redirectUri, state })}`;
    },
    exchange: async ({ code, verifier }) => {
      const p = people.get(code.split('@')[0]);
      if (!p || ![...challenges.values()].includes(createHash('sha256').update(verifier).digest('base64url'))) throw new Error('bad code');
      return p;
    }
  };
  let gServer: Server, gBase = '', gStore: DesignStore;
  const at = () => gBase;
  before(async () => {
    gStore = new DesignStore(':memory:');
    gServer = createApp(gStore, { google: fake }).listen(0);
    await new Promise(r => gServer.once('listening', r));
    gBase = `http://127.0.0.1:${(gServer.address() as AddressInfo).port}/api`;
  });
  after(() => { gServer.close(); gStore.close(); });

  /** Go to Google and come back as `who`, the way a browser follows the redirects. */
  async function viaGoogle(b: ReturnType<typeof browser>, who: string, query = 'back=/designs') {
    const start = await b('GET', `/auth/google?${query}`);
    assert.equal(start.status, 303);
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const back = await b('GET', `/auth/google/callback?${new URLSearchParams({ code: `${who}@x`, state })}`);
    if (back.status !== 303) return { page: await back.text(), result: null };
    const to = new URL(back.headers.get('location')!, 'http://x');
    return { to, result: JSON.parse(to.searchParams.get('google')!) };
  }
  const me = async (b: ReturnType<typeof browser>) => (await (await b('GET', '/auth/me')).json()).user;

  it('says whether it offers Google, and what an email signs in with', async () => {
    const b = browser(at);
    assert.equal((await (await b('GET', '/auth/me')).json()).google, true);
    assert.equal((await (await call('GET', '/auth/me')).json()).google, false);
    assert.deepEqual(await (await b('POST', '/auth/check', { email: 'Nobody@example.com' })).json(), { exists: false, password: false, google: false });
    assert.equal((await b('POST', '/auth/check', { email: 'nope' })).status, 400);
    await b('POST', '/auth/signup', { email: 'pat@example.com', password: 'pat password' });
    assert.deepEqual(await (await browser(at)('POST', '/auth/check', { email: 'PAT@example.com' })).json(), { exists: true, password: true, google: false });
  });

  it('makes a new account with Google, bringing along the browser\'s fonts', async () => {
    people.set('gina', { sub: 'g-gina', email: 'Gina@Gmail.com', emailVerified: true, name: 'Gina G' });
    const b = browser(at);
    await b('POST', '/designs', { name: 'Gina’s first', styleId: 'serif', params: serif.params });
    const { to, result } = await viaGoogle(b, 'gina');
    assert.equal(to!.pathname, '/designs');
    assert.deepEqual(result, { ok: true, intent: 'signin', isNew: true, passwordRemoved: false, moved: 1 });
    const user = await me(b);
    assert.equal(user.email, 'gina@gmail.com');
    assert.equal(user.name, 'Gina G');
    assert.equal(user.hasPassword, false);
    assert.equal(user.google, 'gina@gmail.com');
    assert.equal(((await (await b('GET', '/designs')).json()) as Design[]).length, 1);
    // no password to sign in with, and the sign-in says to use Google
    const login = await browser(at)('POST', '/auth/login', { email: 'gina@gmail.com', password: 'anything at all' });
    assert.equal(login.status, 401);
    assert.match((await login.json()).error, /Google/);
    // signing in with Google again, on another browser, finds the same account
    const other = browser(at);
    assert.equal((await viaGoogle(other, 'gina')).result.isNew, false);
    assert.equal((await me(other)).id, user.id);
  });

  it('sets a first password without a current one, then lets Google be disconnected', async () => {
    const b = browser(at);
    await viaGoogle(b, 'gina');
    assert.equal((await b('DELETE', '/auth/google')).status, 400);
    const res = await b('POST', '/auth/password', { next: 'gina password' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).user.hasPassword, true);
    assert.equal((await browser(at)('POST', '/auth/login', { email: 'gina@gmail.com', password: 'gina password' })).status, 200);
    // now a change does need the current one
    assert.equal((await b('POST', '/auth/password', { next: 'another password' })).status, 403);
    const off = await b('DELETE', '/auth/google');
    assert.equal(off.status, 200);
    assert.equal((await off.json()).user.google, null);
  });

  it('connects Google to the account signed in, but not one already connected elsewhere', async () => {
    people.set('pat', { sub: 'g-pat', email: 'pat.work@gmail.com', emailVerified: true, name: 'Pat' });
    const pat = browser(at);
    await pat('POST', '/auth/login', { email: 'pat@example.com', password: 'pat password' });
    const { result } = await viaGoogle(pat, 'pat', 'intent=link&back=/account');
    assert.equal(result.ok, true);
    assert.equal(result.intent, 'link');
    assert.equal((await me(pat)).google, 'pat.work@gmail.com');
    // Google now signs in to Pat's account, though its email is another
    const elsewhere = browser(at);
    await viaGoogle(elsewhere, 'pat');
    assert.equal((await me(elsewhere)).email, 'pat@example.com');
    // Gina can't take Pat's Google account
    const gina = browser(at);
    await gina('POST', '/auth/login', { email: 'gina@gmail.com', password: 'gina password' });
    const taken = await viaGoogle(gina, 'pat', 'intent=link');
    assert.equal(taken.result.ok, false);
    assert.match(taken.result.error, /another TypeLab account/);
    // and connecting needs someone signed in
    const start = await browser(at)('GET', '/auth/google?intent=link&back=/account');
    assert.equal(JSON.parse(new URL(start.headers.get('location')!, 'http://x').searchParams.get('google')!).ok, false);
  });

  it('moves into an account someone else set up with the same email, switching its password off', async () => {
    const squatter = browser(at);
    await squatter('POST', '/auth/signup', { email: 'sam@gmail.com', password: 'not sams password' });
    people.set('sam', { sub: 'g-sam', email: 'sam@gmail.com', emailVerified: true, name: 'Sam' });
    const sam = browser(at);
    const { result } = await viaGoogle(sam, 'sam');
    assert.equal(result.passwordRemoved, true);
    assert.equal(result.isNew, false);
    assert.equal((await me(sam)).hasPassword, false);
    assert.equal(await me(squatter), null);
    assert.equal((await browser(at)('POST', '/auth/login', { email: 'sam@gmail.com', password: 'not sams password' })).status, 401);
    // an email Google hasn't confirmed doesn't sign in at all
    people.set('una', { sub: 'g-una', email: 'una@example.com', emailVerified: false, name: 'Una' });
    assert.equal((await viaGoogle(browser(at), 'una')).result.ok, false);
  });

  it('turns away a callback that doesn\'t match the sign-in it started, and an outside back address', async () => {
    const b = browser(at);
    const start = await b('GET', '/auth/google?back=//evil.example/x');
    assert.equal(start.status, 303);
    const res = await b('GET', '/auth/google/callback?code=gina@x&state=forged');
    const to = new URL(res.headers.get('location')!, 'http://x');
    assert.equal(to.host, 'x');
    assert.equal(to.pathname, '/');
    assert.equal(JSON.parse(to.searchParams.get('google')!).ok, false);
    assert.equal(await me(b), null);
    // Google's Cancel comes back as cancelled
    const again = await b('GET', '/auth/google');
    const state = new URL(again.headers.get('location')!).searchParams.get('state')!;
    const cancelled = await b('GET', `/auth/google/callback?error=access_denied&state=${state}`);
    assert.equal(JSON.parse(new URL(cancelled.headers.get('location')!, 'http://x').searchParams.get('google')!).cancelled, true);
  });

  it('reports to the other tabs from a popup', async () => {
    const { page } = await viaGoogle(browser(at), 'gina', 'popup=1&back=/d/abc');
    assert.match(page!, /BroadcastChannel\('typelab-auth'\)/);
    assert.match(page!, /"intent":"signin"/);
    assert.match(page!, /href="\/d\/abc"/);
  });

  it('counts the other browsers signed in and signs them out', async () => {
    const a = browser(at), b = browser(at);
    await a('POST', '/auth/login', { email: 'pat@example.com', password: 'pat password' });
    await b('POST', '/auth/login', { email: 'pat@example.com', password: 'pat password' });
    const others = (await (await a('GET', '/auth/sessions')).json()).others;
    assert.ok(others >= 1);
    assert.equal((await a('DELETE', '/auth/sessions')).status, 204);
    assert.equal((await (await a('GET', '/auth/sessions')).json()).others, 0);
    assert.equal(await me(b), null);
    assert.ok(await me(a));
  });

  it('deletes an account without a password when its email is typed out', async () => {
    const b = browser(at);
    await viaGoogle(b, 'sam');
    assert.equal((await b('DELETE', '/auth/me', { confirm: 'someone@else.com' })).status, 403);
    assert.equal((await b('DELETE', '/auth/me', { confirm: ' SAM@gmail.com ' })).status, 204);
    assert.equal(await me(b), null);
    assert.equal((await viaGoogle(browser(at), 'sam')).result.isNew, true);
  });
});

describe('the stand-in for Google', () => {
  // mounted as server/index.ts mounts it in development without Google's keys
  const standIn = googleStandIn(), sStore = new DesignStore(':memory:');
  let sServer: Server, root = '';
  before(async () => {
    const app = createApp(sStore, { google: standIn });
    app.get(STAND_IN_PATH, (req, res) => { res.type('html').send(standIn.chooser(req.query.state)); });
    sServer = app.listen(0);
    await new Promise(r => sServer.once('listening', r));
    root = `http://127.0.0.1:${(sServer.address() as AddressInfo).port}`;
  });
  after(() => { sServer.close(); sStore.close(); });

  /** The picker's links, as paths on this server: one per made-up account, then Cancel. */
  const links = (page: string) => [...page.matchAll(/href="([^"]+)"/g)].map(m => { const u = new URL(m[1].replace(/&amp;/g, '&')); return u.pathname + u.search; });

  it('signs in with a made-up account picked on its page, and cancels', async () => {
    const b = browser(() => root);
    const start = await b('GET', '/api/auth/google?back=/designs');
    assert.equal(start.status, 303);
    const picker = await (await b('GET', start.headers.get('location')!)).text();
    const [mina, jun, cancel] = links(picker);
    assert.match(mina, /^\/api\/auth\/google\/callback\?code=mina\./);
    assert.match(jun, /code=jun\./);
    assert.match(cancel, /error=access_denied/);
    const back = await b('GET', mina);
    const result = JSON.parse(new URL(back.headers.get('location')!, root).searchParams.get('google')!);
    assert.deepEqual(result, { ok: true, intent: 'signin', isNew: true, passwordRemoved: false, moved: 0 });
    const user = (await (await b('GET', '/api/auth/me')).json()).user;
    assert.equal(user.email, 'mina@stand-in.test');
    assert.equal(user.google, 'mina@stand-in.test');
    // Cancel comes back as cancelled
    const again = await b('GET', '/api/auth/google');
    const cancelled = await b('GET', links(await (await b('GET', again.headers.get('location')!)).text()).at(-1)!);
    assert.equal(JSON.parse(new URL(cancelled.headers.get('location')!, root).searchParams.get('google')!).cancelled, true);
  });

  it('turns away a code made up outside its page, and a sign-in it never started', async () => {
    const b = browser(() => root);
    const start = await b('GET', '/api/auth/google');
    const state = new URL(start.headers.get('location')!, root).searchParams.get('state')!;
    const forged = await b('GET', `/api/auth/google/callback?${new URLSearchParams({ code: `nobody.${state}`, state })}`);
    assert.equal(JSON.parse(new URL(forged.headers.get('location')!, root).searchParams.get('google')!).ok, false);
    assert.equal((await (await b('GET', '/api/auth/me')).json()).user, null);
    const unknown = await (await b('GET', `${STAND_IN_PATH}?state=forged`)).text();
    assert.match(unknown, /expired/);
    assert.deepEqual(links(unknown), []);
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
    assert.equal(font.glyphs.length, 3 + ALL_CHARS.length); // .notdef, space, no-break space and every drawn character
    assert.ok(font.charToGlyph('A').advanceWidth! > 0);
    // the special characters text needs are in it, not left to a fallback font
    for (const ch of '…‘’“”–—€£©®™°×÷±<>[]{}|\\_*\u00a0') assert.notEqual(font.charToGlyph(ch).index, 0, `${ch} has a glyph`);
  });

  it('builds one font of the family, named and installed as that style', async () => {
    const member = { anchor: 'regular', weight: 'bold', italic: true };
    const res = await call('POST', '/export/otf', { name: 'Test Font', params: serif.params, member });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition') ?? '', /Test-Font-BoldItalic\.otf/);
    const font = opentype.parse(await res.arrayBuffer()) as unknown as {
      getEnglishName(k: string): string; tables: { os2: { usWeightClass: number }; post: { italicAngle: number } };
    };
    assert.equal(font.getEnglishName('fontFamily'), 'Test Font');
    assert.equal(font.getEnglishName('fontSubfamily'), 'Bold Italic');
    assert.equal(font.tables.os2.usWeightClass, 700);
    assert.ok(font.tables.post.italicAngle < 0);
    for (const bad of [{ ...member, weight: 'heavy' }, { ...member, anchor: undefined }, { ...member, italic: 'yes' }, null, 'bold']) {
      assert.equal((await call('POST', '/export/otf', { name: 'x', params: serif.params, member: bad })).status, 400);
    }
  });

  it('builds an SVG specimen', async () => {
    const res = await call('POST', '/export/svg', { name: 'Test <Font>', params: serif.params });
    assert.equal(res.status, 200);
    const svg = await res.text();
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /Test &lt;Font&gt;/);
  });

  it('builds a font family of any styles picked as a .zip', async () => {
    const styles = [{ weight: 'regular', italic: false }, { weight: 'bold', italic: true }];
    const res = await call('POST', '/export/family', { name: 'Test Font', params: serif.params, family: { anchor: 'regular', styles } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/zip');
    for (const bad of [[], [{ weight: 'heavy', italic: false }], [{ weight: 'bold' }], ['bold']]) {
      assert.equal((await call('POST', '/export/family', { name: 'x', params: serif.params, family: { anchor: 'regular', styles: bad } })).status, 400);
    }
  });

  it('builds a font family asked for in the older shape, whole weights upright and italic', async () => {
    const family = { anchor: 'regular', weights: ['regular', 'bold'], upright: true, italic: true };
    const res = await call('POST', '/export/family', { name: 'Test Font', params: serif.params, family });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/zip');
    assert.match(res.headers.get('content-disposition') ?? '', /Test-Font-family\.zip/);
    assert.equal(new TextDecoder().decode((await res.arrayBuffer()).slice(0, 2)), 'PK');
    for (const bad of [{ ...family, weights: [] }, { ...family, weights: ['heavy'] }, { ...family, anchor: 'x' }, { ...family, upright: false, italic: false }, undefined]) {
      assert.equal((await call('POST', '/export/family', { name: 'x', params: serif.params, family: bad })).status, 400);
    }
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
    // a design saved before the letters' records and the History has neither, and takes them
    assert.deepEqual([s.get('old1', 'first')!.log, s.get('old1', 'first')!.versions], [{}, []]);
    const log = { a: [{ t: 1, keys: ['weight'], own: { weight: 0.8 } }] };
    assert.deepEqual(s.update('old1', { name: 'Old Serif', styleId: 'serif', params: serif.params, log }, 'first')!.log, log);
    s.close();
  });

  it('adds the Google columns to an accounts table made before Google sign-in, keeping its accounts', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'typelab-')), 'old.db');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL,
      created_at TEXT NOT NULL)`);
    old.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run('old1', 'old@example.com', 'Old', 'scrypt$c2FsdA$aGFzaA', '2026-01-01T00:00:00Z');
    old.close();
    const s = new DesignStore(file), accounts = new AccountStore(s.db);
    assert.deepEqual(accounts.check('old@example.com'), { exists: true, password: true, google: false });
    assert.deepEqual(accounts.withEmail('old@example.com'), { user: { id: 'old1', email: 'old@example.com', name: 'Old', createdAt: '2026-01-01T00:00:00Z', hasPassword: true, google: null }, verified: false });
    const made = await accounts.create('new@example.com', 'New', null, { sub: 'g-new', email: 'new@example.com' });
    assert.equal(accounts.byGoogle('g-new')?.id, made!.id);
    assert.deepEqual(accounts.check('new@example.com'), { exists: true, password: false, google: true });
    assert.equal(accounts.linkGoogle('old1', { sub: 'g-old', email: 'old@example.com' })!.google, 'old@example.com');
    assert.equal(accounts.withEmail('old@example.com')!.verified, true);
    s.close();
    // opened again, the columns are there already
    const again = new DesignStore(file);
    assert.equal(new AccountStore(again.db).byGoogle('g-old')?.id, 'old1');
    again.close();
  });
});

describe('joining a Google sign-in to an account (joinGoogle)', () => {
  const accounts = new AccountStore(new DatabaseSync(':memory:'));

  it('goes to the account that Google account is connected to', async () => {
    const user = (await accounts.create('linked@example.com', 'Linked', 'a password!', { sub: 'g1', email: 'linked@example.com' }))!;
    assert.deepEqual(joinGoogle(accounts, accounts.byGoogle('g1'), { sub: 'g1', email: 'linked@example.com' }), { user: accounts.get(user.id), passwordRemoved: false });
  });

  it('else to the account with its email, switching off a password nothing proved was theirs and signing its browsers out', async () => {
    const user = (await accounts.create('typed@example.com', 'Typed', 'a password!'))!, token = accounts.startSession(user.id);
    const joined = joinGoogle(accounts, null, { sub: 'g2', email: 'typed@example.com' })!;
    assert.equal(joined.passwordRemoved, true);
    assert.equal(joined.user.id, user.id);
    assert.equal(joined.user.hasPassword, false);
    assert.equal(joined.user.google, 'typed@example.com');
    assert.equal(accounts.userFor(token), null);
  });

  it('keeps the password of an account whose email Google has confirmed already', async () => {
    const user = (await accounts.create('known@example.com', 'Known', 'a password!'))!;
    accounts.linkGoogle(user.id, { sub: 'g3', email: 'known@example.com' });
    accounts.unlinkGoogle(user.id);
    const joined = joinGoogle(accounts, null, { sub: 'g4', email: 'known@example.com' })!;
    assert.equal(joined.passwordRemoved, false);
    assert.equal(joined.user.hasPassword, true);
  });

  it('finds none for an email with no account, so a new one is made', () => {
    assert.equal(joinGoogle(accounts, null, { sub: 'g5', email: 'nobody@example.com' }), null);
  });
});
