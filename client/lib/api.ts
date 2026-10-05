/* Typed client for the TypeLab API. */
import type { User } from '../../shared/account';
import type { Design, DesignInput } from '../../shared/design';
import type { FamilyRequest } from '../../shared/family';
import type { Params } from '../../shared/params';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function send(method: string, url: string, body?: unknown, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the TypeLab server');
  }
  if (!res.ok) {
    let msg = res.statusText || `Request failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* not JSON */ }
    throw new ApiError(res.status, msg);
  }
  return res;
}

const json = async <T>(method: string, url: string, body?: unknown): Promise<T> => (await send(method, url, body)).json();

/** A sign-in, with how many fonts saved in this browser while signed out went into the account. */
export interface SignedIn { user: User; moved: number }

export const api = {
  me: async () => (await json<{ user: User | null }>('GET', '/api/auth/me')).user,
  signUp: (b: { email: string; password: string; name: string }) => json<SignedIn>('POST', '/api/auth/signup', b),
  signIn: (b: { email: string; password: string }) => json<SignedIn>('POST', '/api/auth/login', b),
  signOut: async () => { await send('POST', '/api/auth/logout'); },
  renameAccount: async (name: string) => (await json<{ user: User }>('PATCH', '/api/auth/me', { name })).user,
  changePassword: async (current: string, next: string) => { await send('POST', '/api/auth/password', { current, next }); },
  deleteAccount: async (password: string) => { await send('DELETE', '/api/auth/me', { password }); },
  listDesigns: () => json<Design[]>('GET', '/api/designs'),
  getDesign: (id: string) => json<Design>('GET', `/api/designs/${encodeURIComponent(id)}`),
  createDesign: (d: DesignInput) => json<Design>('POST', '/api/designs', d),
  updateDesign: (id: string, d: DesignInput) => json<Design>('PUT', `/api/designs/${encodeURIComponent(id)}`, d),
  /** Change only the name, leaving the saved letters as they are. */
  renameDesign: (id: string, name: string) => json<Design>('PATCH', `/api/designs/${encodeURIComponent(id)}`, { name }),
  /** keepalive, so a delete still goes through when the page is left while it waits out its Undo */
  deleteDesign: async (id: string) => { await send('DELETE', `/api/designs/${encodeURIComponent(id)}`, undefined, { keepalive: true }); },
  /** Build a font file or specimen on the server. */
  exportFile: async (kind: 'otf' | 'svg', body: { name: string; params: Params }) => (await send('POST', `/api/export/${kind}`, body)).blob(),
  /** Build every member of a family on the server, as one .zip of fonts. */
  exportFamily: async (body: { name: string; params: Params; family: FamilyRequest }) => (await send('POST', '/api/export/family', body)).blob()
};

export function download(fileName: string, data: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
