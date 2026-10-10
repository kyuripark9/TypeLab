/* An account as exchanged between client and server, and the rules both check sign-ups against. */

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  /** false for an account made with Google that hasn't set a password */
  hasPassword: boolean;
  /** the Google account it signs in with, by its email, or null */
  google: string | null;
}

/** What signing in with an email will ask for: a password, Google, or a new account. */
export interface EmailCheck { exists: boolean; password: boolean; google: boolean }

/** How a Google sign-in or connect ended, as the popup (or the page it returns to) reports it. */
export type GoogleResult =
  | { ok: true; intent: 'signin'; user: User; isNew: boolean; moved: number; passwordRemoved: boolean }
  | { ok: true; intent: 'link'; user: User }
  | { ok: false; cancelled?: boolean; error: string };

export const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const EMAIL_MAX = 254;
export const USER_NAME_MAX = 60;

/** Trimmed and lower-cased, so Ana@Example.com and ana@example.com are one account. */
export const cleanEmail = (email: unknown) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

export const isEmail = (email: string) => email.length <= EMAIL_MAX && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/** What's wrong with a new password, or null when it will do. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters for the password`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters for the password`;
  return null;
}

/** A display name, or the part of the email before the @ when none is given. */
export function cleanUserName(name: unknown, email: string): string {
  const s = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, USER_NAME_MAX) : '';
  return s || email.split('@')[0].slice(0, USER_NAME_MAX);
}
