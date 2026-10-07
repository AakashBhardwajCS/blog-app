import { Department } from './departments';
import { signOut } from './auth';
import { Post, PostPage, PostSearchResult, User } from './types';

const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/** An API failure with its HTTP status, so pages can tell "signed out" (401) from "not found" (404). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// Posts are members-only, so the server-rendered pages pass the session token from the cookie.
function authHeaders(token: string | null | undefined): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getPosts(token: string, department?: Department): Promise<PostPage> {
  const params = new URLSearchParams({ limit: '50', ...(department ? { department } : {}) });
  const response = await fetch(`${base}/posts?${params}`, { cache: 'no-store', headers: authHeaders(token) });

  if (!response.ok) throw new ApiError('Could not load posts', response.status);

  return response.json() as Promise<PostPage>;
}

/** Hybrid (keyword + semantic) search over the organization's published posts. */
export async function searchPosts(token: string, query: string, department?: Department): Promise<PostSearchResult> {
  const params = new URLSearchParams({ q: query, ...(department ? { department } : {}) });
  const response = await fetch(`${base}/posts/search?${params}`, { cache: 'no-store', headers: authHeaders(token) });

  if (!response.ok) throw new ApiError('Search failed', response.status);

  return response.json() as Promise<PostSearchResult>;
}

export async function getPost(token: string, slug: string): Promise<Post> {
  const response = await fetch(`${base}/posts/${encodeURIComponent(slug)}`, { cache: 'no-store', headers: authHeaders(token) });

  if (!response.ok) throw new ApiError('Post not found', response.status);

  return response.json() as Promise<Post>;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window === 'undefined' ? null : localStorage.getItem('blog_token');

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders(token),
      ...init.headers,
    },
  });

  if (!response.ok) {
    // The token expired or the member was removed from the organization: drop the stale session.
    if (response.status === 401 && token && !path.startsWith('/auth/')) signOut();
    const body = (await response.json().catch(() => ({ message: 'Request failed' }))) as {
      message?: string | string[];
    };
    throw new ApiError(
      Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? 'Request failed'),
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

export function uploadImage(file: File): Promise<{ url: string; key: string; mimeType: string; size: number }> {
  return uploadFile('/assets/upload', file);
}

/** Uploads a new profile picture and returns the updated user. */
export function uploadAvatar(file: File): Promise<User> {
  return uploadFile('/profile/avatar', file);
}

/** POSTs one file as multipart `file` with the session's auth header. */
async function uploadFile<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);

  const token = typeof window === 'undefined' ? null : localStorage.getItem('blog_token');

  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 413) throw new Error('That image is too large. Please choose one under 2 MB.');
    const body = (await response.json().catch(() => ({ message: 'Image upload failed' }))) as {
      message?: string | string[];
    };
    throw new Error(Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? 'Image upload failed'));
  }

  return response.json() as Promise<T>;
}
