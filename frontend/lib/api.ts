import { Post, PostPage } from './types';

const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

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

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
