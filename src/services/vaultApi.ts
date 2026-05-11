import { EncryptedVaultObject, VaultMeta } from '../types';

const jsonHeaders = { 'Content-Type': 'application/json' };

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? jsonHeaders : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = typeof body.error === 'string' ? body.error : response.statusText;
    const error = new Error(message) as Error & { status?: number; details?: unknown };
    error.status = response.status;
    error.details = body;
    throw error;
  }

  return response.json() as Promise<T>;
}

export const vaultApi = {
  login: (token: string) =>
    requestJson<{ ok: true }>('/api/session', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  logout: () =>
    requestJson<{ ok: true }>('/api/session/logout', {
      method: 'POST',
    }),

  getMeta: () => requestJson<{ meta: VaultMeta | null }>('/api/vault/meta'),

  putMeta: (meta: VaultMeta) =>
    requestJson<{ ok: true }>('/api/vault/meta', {
      method: 'PUT',
      body: JSON.stringify(meta),
    }),

  getObjects: (keys?: string[]) => {
    const suffix = keys?.length ? `?keys=${encodeURIComponent(keys.join(','))}` : '';
    return requestJson<{ objects: EncryptedVaultObject[] }>(`/api/vault/objects${suffix}`);
  },

  putObjects: (objects: EncryptedVaultObject[], expectedRevisions: Record<string, number>) =>
    requestJson<{ ok: true }>('/api/vault/objects', {
      method: 'PUT',
      body: JSON.stringify({ objects, expectedRevisions }),
    }),

  exportEncryptedBackup: async () => {
    const [meta, objects] = await Promise.all([vaultApi.getMeta(), vaultApi.getObjects()]);
    return {
      exportedAt: new Date().toISOString(),
      meta: meta.meta,
      objects: objects.objects,
    };
  },
};
