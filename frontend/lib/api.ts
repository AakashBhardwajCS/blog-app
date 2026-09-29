import { Post, PostPage } from './types';

const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

function getTenantIdFromStorage(): string | undefined {
  const token = typeof window === 'undefined' ? null : localStorage.getItem('blog_token');
  const rawUser = typeof window === 'undefined' ? null : localStorage.getItem('blog_user');

  if (rawUser) {
    const parsed = JSON.parse(rawUser) as { tenantId?: string };
    if (parsed.tenantId) return parsed.tenantId;
  }

  if (!token) return undefined;

  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as { tenantId?: string };
    return payload.tenantId;
  } catch {
    return undefined;
  }
}

export async function getPosts(): Promise<PostPage> {
  const response = await fetch(`${base}/posts`, { cache: 'no-store' });

  if (!response.ok) throw new Error('Could not load posts');

  return response.json() as Promise<PostPage>;
}

export async function getPost(slug: string): Promise<Post> {
  const response = await fetch(`${base}/posts/${encodeURIComponent(slug)}`, { cache: 'no-store' });

  if (!response.ok) throw new Error('Post not found');

  return response.json() as Promise<Post>;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window === 'undefined' ? null : localStorage.getItem('blog_token');
  const tenantId = getTenantIdFromStorage();
  const isAuthRoute = path.startsWith('/auth/');

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(!isAuthRoute && tenantId ? { 'x-tenant-id': tenantId } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ message: 'Request failed' }))) as {
      message?: string | string[];
    };
    throw new Error(
      Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? 'Request failed'),
    );
  }

  return response.json() as Promise<T>;
}

export async function uploadImage(file: File): Promise<{ url: string; key: string; mimeType: string; size: number }> {
  const formData = new FormData();
  formData.append('file', file);

  const token = typeof window === 'undefined' ? null : localStorage.getItem('blog_token');
  const tenantId = getTenantIdFromStorage();

  const response = await fetch(`${base}/assets/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ message: 'Image upload failed' }))) as {
      message?: string | string[];
    };
    throw new Error(Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? 'Image upload failed'));
  }

  return response.json() as Promise<{ url: string; key: string; mimeType: string; size: number }>;
}
