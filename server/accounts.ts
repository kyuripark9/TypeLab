/* Accounts: people sign up with an email and a password, or with Google, and their designs follow
   them to any browser they sign in on. Passwords are kept only as scrypt hashes (an account made
   with Google has none until it sets one); a signed-in browser holds a random session token whose
   SHA-256 is all the database stores. */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { EmailCheck, User } from '../shared/account';

interface UserRow {
  id: string; email: string; name: string; password: string; created_at: string;
  google_sub: string | null; google_email: string | null; email_verified: number;
}

const toUser = (r: UserRow): User => ({
  id: r.id, email: r.email, name: r.name, createdAt: r.created_at,
  hasPassword: !!r.password, google: r.google_sub ? r.google_email ?? '' : null
});

/** How long a sign-in lasts before the browser has to sign in again. */
export const SESSION_DAYS = 90;

const KEY_LEN = 64, SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password.normalize('NFKC'), salt, KEY_LEN, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))));
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${(await derive(password, salt)).toString('base64')}`;
}

/** Whether `password` is the one `stored` (a hashPassword result) was made from. */
async function matchesHash(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64'), got = await derive(password, Buffer.from(salt, 'base64'));
  return want.length === got.length && timingSafeEqual(want, got);
}

const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

export class AccountStore {
  constructor(private db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id         TEXT PRIMARY KEY,
        email      TEXT NOT NULL UNIQUE,
        name       TEXT NOT NULL,
        password   TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
    `);
    // databases older than Google sign-in lack these columns: the Google account a user signs in with,
    // and whether the email is known to be theirs (Google said so). An empty password means the account has none
    const cols = new Set((db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(c => c.name));
    if (!cols.has('google_sub')) db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT');
    if (!cols.has('google_email')) db.exec('ALTER TABLE users ADD COLUMN google_email TEXT');
    if (!cols.has('email_verified')) db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google ON users (google_sub)');
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  }

  /** null when the email is already taken. Made with Google, it has no password and its email is
      known to be the person's. */
  async create(email: string, name: string, password: string | null, google?: { sub: string; email: string }): Promise<User | null> {
    if (this.byEmail(email)) return null;
    const id = randomBytes(9).toString('base64url'), hash = password === null ? '' : await hashPassword(password);
    try {
      this.db.prepare('INSERT INTO users (id, email, name, password, created_at, google_sub, google_email, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, email, name, hash, new Date().toISOString(), google?.sub ?? null, google?.email ?? null, google ? 1 : 0);
    } catch {
      return null; // the same email signed up in the meantime
    }
    return this.get(id);
  }

  get(id: string): User | null {
    const r = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined;
    return r ? toUser(r) : null;
  }

  private byEmail(email: string) {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as unknown as UserRow | undefined;
  }

  /** What signing in with this email will take, for the sign-in dialog's first step. */
  check(email: string): EmailCheck {
    const r = this.byEmail(email);
    return { exists: !!r, password: !!r?.password, google: !!r?.google_sub };
  }

  /** The account a Google account signs in to, if it's been connected to one. */
  byGoogle(sub: string): User | null {
    const r = this.db.prepare('SELECT * FROM users WHERE google_sub = ?').get(sub) as unknown as UserRow | undefined;
    return r ? toUser(r) : null;
  }

  /** The account with this email, and whether Google (or anyone) has confirmed the email is theirs. */
  withEmail(email: string): { user: User; verified: boolean } | null {
    const r = this.byEmail(email);
    return r ? { user: toUser(r), verified: !!r.email_verified } : null;
  }

  /** Connect a Google account; its email confirms the account's own when they're the same. */
  linkGoogle(id: string, google: { sub: string; email: string }): User | null {
    this.db.prepare('UPDATE users SET google_sub = ?, google_email = ?, email_verified = email_verified OR email = ? WHERE id = ?')
      .run(google.sub, google.email, google.email, id);
    return this.get(id);
  }

  unlinkGoogle(id: string): User | null {
    this.db.prepare('UPDATE users SET google_sub = NULL, google_email = NULL WHERE id = ?').run(id);
    return this.get(id);
  }

  /** Turn password sign-in off, as when Google proves the email belongs to someone other than
      whoever may have typed it in at sign-up. */
  clearPassword(id: string) {
    this.db.prepare('UPDATE users SET password = \'\' WHERE id = ?').run(id);
  }

  /** The account for this email and password, or null for either being wrong. */
  async verify(email: string, password: string): Promise<User | null> {
    const r = this.byEmail(email);
    // hash anyway when there's no such account, so the time taken doesn't tell which emails exist
    if (!r?.password) { await hashPassword(password); return null; }
    return (await matchesHash(password, r.password)) ? toUser(r) : null;
  }

  async checkPassword(id: string, password: string): Promise<boolean> {
    const r = this.db.prepare('SELECT password FROM users WHERE id = ?').get(id) as unknown as { password: string } | undefined;
    return !!r && matchesHash(password, r.password);
  }

  async setPassword(id: string, password: string) {
    this.db.prepare('UPDATE users SET password = ? WHERE id = ?').run(await hashPassword(password), id);
  }

  rename(id: string, name: string): User | null {
    this.db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id);
    return this.get(id);
  }

  delete(id: string) {
    this.endAllSessions(id);
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  /** A new sign-in; the token goes to the browser and is never stored as is. It is 43 base64url
      characters, which the session cookie's pattern in app.ts (SESSION_TOKEN) must admit. */
  startSession(userId: string): string {
    const token = randomBytes(32).toString('base64url'), now = Date.now();
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(sha256(token), userId, new Date(now).toISOString(), new Date(now + SESSION_DAYS * 86400e3).toISOString());
    return token;
  }

  /** Who a session token belongs to, while it hasn't expired. */
  userFor(token: string): User | null {
    const r = this.db.prepare(`SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(sha256(token), new Date().toISOString()) as unknown as UserRow | undefined;
    return r ? toUser(r) : null;
  }

  endSession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  }

  /** How many other browsers are signed in to this account. */
  otherSessions(userId: string, keep: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND token_hash != ? AND expires_at > ?')
      .get(userId, sha256(keep), new Date().toISOString()) as { n: number }).n;
  }

  /** Sign out every other browser, as after a password change. */
  endOtherSessions(userId: string, keep: string) {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, sha256(keep));
  }

  endAllSessions(userId: string) {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}
