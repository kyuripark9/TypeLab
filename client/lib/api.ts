/* Typed client for the TypeLab API. */
import type { Design, DesignInput } from '../../shared/design';
import type { Params } from '../../shared/params';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function send(method: string, url: string, body?: unknown): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
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

export const api = {
  listDesigns: () => json<Design[]>('GET', '/api/designs'),
  getDesign: (id: string) => json<Design>('GET', `/api/designs/${encodeURIComponent(id)}`),
  createDesign: (d: DesignInput) => json<Design>('POST', '/api/designs', d),
  updateDesign: (id: string, d: DesignInput) => json<Design>('PUT', `/api/designs/${encodeURIComponent(id)}`, d),
  deleteDesign: async (id: string) => { await send('DELETE', `/api/designs/${encodeURIComponent(id)}`); },
  /** Build a font file or specimen on the server. */
  exportFile: async (kind: 'otf' | 'svg', body: { name: string; params: Params }) => (await send('POST', `/api/export/${kind}`, body)).blob()
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
